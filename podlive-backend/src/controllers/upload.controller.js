const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const fs = require('fs');
const path = require('path');
const os = require('os');
const subtitleService = require('../services/subtitle.service');
const hlsService = require('../services/hls.service');
const s3Service = require('../services/s3.service');

const safeUnlink = (filePath) => {
    try { if (filePath && fs.existsSync(filePath)) fs.unlinkSync(filePath); } catch (e) { }
};

const maxUploadSizeBytes = Number(process.env.MAX_UPLOAD_SIZE_BYTES || 2 * 1024 * 1024 * 1024);
const chunkRoot = path.join(os.tmpdir(), 'podlive-chunk-uploads');

const ensureDir = (dir) => {
    if (!fs.existsSync(dir)) fs.mkdirSync(dir, { recursive: true });
};

const parseTags = (tags) => {
    if (!tags) return [];
    if (Array.isArray(tags)) return tags.map((tag) => String(tag).trim()).filter(Boolean);
    return String(tags).split(',').map((tag) => tag.trim()).filter(Boolean);
};

const serializeVideo = (video) => ({
    ...video,
    filesize: video.filesize?.toString?.() || video.filesize,
    views: video.views?.toString?.() || video.views,
    watch_time: video.watch_time?.toString?.() || video.watch_time
});

exports.uploadVideo = async (req, res) => {
    let videoFilePath = null;
    let thumbnailFilePath = null;

    try {
        const { title, description, category, visibility, language, location, tags } = req.body;
        const host_user_id = req.user.id;

        if (!title || !title.trim()) {
            return res.status(400).json({ error: 'Title is required' });
        }

        if (!req.files || !req.files.video || req.files.video.length === 0) {
            return res.status(400).json({ error: 'Video file is required' });
        }

        const videoFile = req.files.video[0];
        const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

        videoFilePath = videoFile.path;
        thumbnailFilePath = thumbnailFile ? thumbnailFile.path : null;

        console.log(`[Upload] Starting upload: title="${title}", file="${videoFile.originalname}", size=${(videoFile.size / 1024 / 1024).toFixed(1)}MB`);

        const baseUrlForLocal = `${req.protocol}://${req.get('host')}`;

        // ── Upload video to S3, fallback to local ──
        let videoUrl;
        try {
            const videoS3Key = `videos/${Date.now()}-${videoFile.filename}`;
            videoUrl = await s3Service.uploadFileToS3(videoFilePath, videoS3Key, videoFile.mimetype || 'video/mp4');
            console.log(`[Upload] Video uploaded to S3: ${videoUrl}`);
        } catch (s3Err) {
            console.warn(`[Upload] S3 video upload failed (${s3Err.message}), using local fallback`);
            videoUrl = `${baseUrlForLocal}/uploads/${videoFile.filename}`;
        }

        // ── Upload thumbnail to S3, fallback to default ──
        let thumbnailUrl = 'https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&q=80&w=1200';
        if (thumbnailFile) {
            try {
                const thumbS3Key = `thumbnails/${Date.now()}-${thumbnailFile.filename}`;
                thumbnailUrl = await s3Service.uploadFileToS3(thumbnailFilePath, thumbS3Key, thumbnailFile.mimetype || 'image/jpeg');
                safeUnlink(thumbnailFilePath);
                thumbnailFilePath = null;
                console.log(`[Upload] Thumbnail uploaded to S3: ${thumbnailUrl}`);
            } catch (s3Err) {
                console.warn(`[Upload] S3 thumbnail upload failed (${s3Err.message}), using local fallback`);
                thumbnailUrl = `${baseUrlForLocal}/uploads/${thumbnailFile.filename}`;
            }
        }

        // ── Save to DB ──
        const newVOD = await prisma.liveSession.create({
            data: {
                host_user_id,
                title: title.trim(),
                description: description?.trim() || null,
                category: category || 'General',
                status: 'ended',
                viewer_count_peak: 0,
                recording_url: videoUrl,
                thumbnail_url: thumbnailUrl,
                started_at: new Date(),
                ended_at: new Date(),
                is_processing: false
            }
        });

        const video = await prisma.video.create({
            data: {
                owner_id: host_user_id,
                live_session_id: newVOD.id,
                title: title.trim(),
                description: description?.trim() || null,
                tags: parseTags(tags),
                thumbnail: thumbnailUrl,
                filesize: BigInt(videoFile.size),
                category: category ? {
                    connectOrCreate: {
                        where: { slug: String(category).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general' },
                        create: {
                            name: category,
                            slug: String(category).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general'
                        }
                    }
                } : undefined,
                visibility: visibility || 'public',
                language: language || null,
                location: location || null,
                source_url: videoUrl,
                processing_status: 'processing'
            }
        });

        console.log(`[Upload] DB record created: ${newVOD.id}`);

        // ── Respond immediately (don't wait for HLS/subtitles) ──
        res.status(201).json({
            message: 'Video uploaded and published. Background optimization started.',
            session: newVOD,
            video: serializeVideo(video)
        });

        // ── Background processing ──
        // Subtitles
        subtitleService.processSubtitles(newVOD.id, videoFilePath, baseUrlForLocal).catch(err => {
            console.error('[Upload] Subtitle processing failed:', err.message);
        });

        // HLS transcoding
        hlsService.processHLS(newVOD.id, videoFilePath, baseUrlForLocal, video.id).catch(err => {
            console.error('[Upload] HLS processing failed:', err.message);
        });

    } catch (error) {
        console.error('[Upload] Controller error:', error.message, error.stack);
        // Cleanup temp files on error
        safeUnlink(videoFilePath);
        safeUnlink(thumbnailFilePath);

        if (!res.headersSent) {
            res.status(500).json({
                error: 'Failed to upload video',
                details: error.message
            });
        }
    }
};

exports.initChunkUpload = async (req, res) => {
    try {
        const { originalName, contentType, totalSize, chunkSize, title, description, tags, category, visibility, language, location } = req.body;
        const size = Number(totalSize);
        const chunk = Number(chunkSize || 8 * 1024 * 1024);

        if (!originalName || !contentType || !size) {
            return res.status(400).json({ error: 'originalName, contentType and totalSize are required' });
        }
        if (size > maxUploadSizeBytes) {
            return res.status(413).json({
                error: 'File too large',
                maxUploadSizeBytes
            });
        }

        const totalChunks = Math.ceil(size / chunk);
        ensureDir(chunkRoot);

        const session = await prisma.uploadSession.create({
            data: {
                owner_id: req.user.id,
                original_name: originalName,
                content_type: contentType,
                total_size: BigInt(size),
                chunk_size: chunk,
                total_chunks: totalChunks,
                metadata: {
                    title,
                    description,
                    tags: parseTags(tags),
                    category,
                    visibility: visibility || 'private',
                    language,
                    location
                }
            }
        });

        ensureDir(path.join(chunkRoot, session.id));

        res.status(201).json({
            uploadId: session.id,
            chunkSize: chunk,
            totalChunks,
            receivedChunks: [],
            maxUploadSizeBytes
        });
    } catch (error) {
        console.error('[ChunkUpload] init error:', error);
        res.status(500).json({ error: 'Failed to initialize upload', details: error.message });
    }
};

exports.uploadChunk = async (req, res) => {
    try {
        const { uploadId } = req.params;
        const chunkIndex = Number(req.body.chunkIndex ?? req.query.chunkIndex);

        if (!Number.isInteger(chunkIndex) || chunkIndex < 0) {
            safeUnlink(req.file?.path);
            return res.status(400).json({ error: 'Valid chunkIndex is required' });
        }
        if (!req.file) {
            return res.status(400).json({ error: 'Chunk file is required' });
        }

        const session = await prisma.uploadSession.findUnique({ where: { id: uploadId } });
        if (!session || session.owner_id !== req.user.id) {
            safeUnlink(req.file.path);
            return res.status(404).json({ error: 'Upload session not found' });
        }
        if (!['active', 'paused'].includes(session.status)) {
            safeUnlink(req.file.path);
            return res.status(409).json({ error: `Upload session is ${session.status}` });
        }
        if (chunkIndex >= session.total_chunks) {
            safeUnlink(req.file.path);
            return res.status(400).json({ error: 'chunkIndex exceeds total chunks' });
        }

        const dir = path.join(chunkRoot, uploadId);
        ensureDir(dir);
        const destination = path.join(dir, `${chunkIndex}.part`);
        fs.renameSync(req.file.path, destination);

        const received = Array.from(new Set([...(session.received_chunks || []), chunkIndex])).sort((a, b) => a - b);
        await prisma.uploadSession.update({
            where: { id: uploadId },
            data: {
                received_chunks: received,
                status: 'active'
            }
        });

        res.json({
            uploadId,
            chunkIndex,
            receivedChunks: received,
            progress: Math.round((received.length / session.total_chunks) * 100)
        });
    } catch (error) {
        safeUnlink(req.file?.path);
        console.error('[ChunkUpload] chunk error:', error);
        res.status(500).json({ error: 'Failed to upload chunk', details: error.message });
    }
};

exports.getChunkUploadStatus = async (req, res) => {
    try {
        const session = await prisma.uploadSession.findUnique({ where: { id: req.params.uploadId } });
        if (!session || session.owner_id !== req.user.id) {
            return res.status(404).json({ error: 'Upload session not found' });
        }

        res.json({
            uploadId: session.id,
            status: session.status,
            totalChunks: session.total_chunks,
            receivedChunks: session.received_chunks,
            progress: Math.round(((session.received_chunks || []).length / session.total_chunks) * 100),
            totalSize: session.total_size.toString(),
            updatedAt: session.updated_at
        });
    } catch (error) {
        res.status(500).json({ error: 'Failed to fetch upload status', details: error.message });
    }
};

exports.pauseChunkUpload = async (req, res) => {
    try {
        const existingSession = await prisma.uploadSession.findUnique({ where: { id: req.params.uploadId } });
        if (!existingSession || existingSession.owner_id !== req.user.id) {
            return res.status(404).json({ error: 'Upload session not found' });
        }
        if (!['active', 'paused'].includes(existingSession.status)) {
            return res.status(409).json({ error: `Upload session is ${existingSession.status}` });
        }

        const session = await prisma.uploadSession.update({
            where: { id: req.params.uploadId },
            data: { status: 'paused' }
        });
        res.json({ uploadId: session.id, status: session.status });
    } catch (error) {
        res.status(500).json({ error: 'Failed to pause upload', details: error.message });
    }
};

exports.cancelChunkUpload = async (req, res) => {
    try {
        const session = await prisma.uploadSession.findUnique({ where: { id: req.params.uploadId } });
        if (!session || session.owner_id !== req.user.id) {
            return res.status(404).json({ error: 'Upload session not found' });
        }

        fs.rmSync(path.join(chunkRoot, session.id), { recursive: true, force: true });
        await prisma.uploadSession.update({
            where: { id: session.id },
            data: { status: 'cancelled' }
        });

        res.json({ uploadId: session.id, status: 'cancelled' });
    } catch (error) {
        res.status(500).json({ error: 'Failed to cancel upload', details: error.message });
    }
};

exports.completeChunkUpload = async (req, res) => {
    let assembledPath = null;
    try {
        const session = await prisma.uploadSession.findUnique({ where: { id: req.params.uploadId } });
        if (!session || session.owner_id !== req.user.id) {
            return res.status(404).json({ error: 'Upload session not found' });
        }
        if (['cancelled', 'failed', 'completed'].includes(session.status)) {
            return res.status(409).json({ error: `Upload session is ${session.status}` });
        }

        const received = session.received_chunks || [];
        if (received.length !== session.total_chunks) {
            return res.status(409).json({
                error: 'Upload is incomplete',
                missingChunks: Array.from({ length: session.total_chunks }, (_, index) => index).filter((index) => !received.includes(index))
            });
        }

        const dir = path.join(chunkRoot, session.id);
        assembledPath = path.join(dir, session.original_name.replace(/[^a-zA-Z0-9._-]/g, '_'));
        const writeStream = fs.createWriteStream(assembledPath);

        for (let index = 0; index < session.total_chunks; index++) {
            const chunkPath = path.join(dir, `${index}.part`);
            if (!fs.existsSync(chunkPath)) {
                writeStream.destroy();
                return res.status(409).json({ error: `Missing chunk ${index}` });
            }
            await new Promise((resolve, reject) => {
                const readStream = fs.createReadStream(chunkPath);
                readStream.on('error', reject);
                readStream.on('end', resolve);
                readStream.pipe(writeStream, { end: false });
            });
        }

        await new Promise((resolve) => writeStream.end(resolve));

        const baseUrlForLocal = `${req.protocol}://${req.get('host')}`;
        const sourceKey = `videos/source/${session.id}-${path.basename(assembledPath)}`;
        let sourceUrl;
        try {
            sourceUrl = await s3Service.uploadFileToS3(assembledPath, sourceKey, session.content_type);
        } catch (error) {
            console.warn(`[ChunkUpload] R2 upload failed (${error.message}), using local assembled file`);
            const tempUploadsDir = path.join(os.tmpdir(), 'podlive-uploads');
            ensureDir(tempUploadsDir);
            const localName = `${session.id}-${path.basename(assembledPath)}`;
            fs.copyFileSync(assembledPath, path.join(tempUploadsDir, localName));
            sourceUrl = `${baseUrlForLocal}/uploads/${localName}`;
        }

        const metadata = session.metadata || {};
        const video = await prisma.video.create({
            data: {
                owner_id: req.user.id,
                title: metadata.title || path.parse(session.original_name).name,
                description: metadata.description || null,
                tags: metadata.tags || [],
                filesize: session.total_size,
                visibility: metadata.visibility || 'private',
                language: metadata.language || null,
                location: metadata.location || null,
                source_url: sourceUrl,
                processing_status: 'processing',
                category: metadata.category ? {
                    connectOrCreate: {
                        where: { slug: String(metadata.category).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general' },
                        create: {
                            name: metadata.category,
                            slug: String(metadata.category).toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '') || 'general'
                        }
                    }
                } : undefined
            }
        });

        await prisma.uploadSession.update({
            where: { id: session.id },
            data: {
                status: 'completed',
                completed_at: new Date(),
                assembled_path: assembledPath,
                r2_key: sourceKey
            }
        });

        res.status(201).json({
            message: 'Upload completed. Background HLS processing started.',
            video: serializeVideo(video)
        });

        hlsService.processHLS(null, assembledPath, baseUrlForLocal, video.id).catch(async (error) => {
            console.error('[ChunkUpload] HLS processing failed:', error.message);
            await prisma.video.update({ where: { id: video.id }, data: { processing_status: 'failed' } }).catch(() => {});
        });
    } catch (error) {
        console.error('[ChunkUpload] complete error:', error);
        res.status(500).json({ error: 'Failed to complete upload', details: error.message });
    }
};
