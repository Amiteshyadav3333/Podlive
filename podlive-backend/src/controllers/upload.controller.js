const { PrismaClient } = require('@prisma/client');
const prisma = new PrismaClient();
const path = require('path');
const subtitleService = require('../services/subtitle.service');
const hlsService = require('../services/hls.service');
const s3Service = require('../services/s3.service');

exports.uploadVideo = async (req, res) => {
    try {
        const { title, description, category, sessionId } = req.body;
        const host_user_id = req.user.id;

        if (!title) {
            return res.status(400).json({ error: 'Title is required' });
        }

        if (!req.files || !req.files.video) {
            return res.status(400).json({ error: 'Video file is required' });
        }

        const videoFile = req.files.video[0];
        const thumbnailFile = req.files.thumbnail ? req.files.thumbnail[0] : null;

        // Use S3
        const videoS3Key = `videos/${Date.now()}-${videoFile.filename}`;
        const s3VideoUrl = await s3Service.uploadFileToS3(videoFile.path, videoS3Key, videoFile.mimetype);

        let s3ThumbnailUrl = "https://images.unsplash.com/photo-1611162617474-5b21e879e113?auto=format&fit=crop&q=80&w=1200";
        if (thumbnailFile) {
            const thumbS3Key = `thumbnails/${Date.now()}-${thumbnailFile.filename}`;
            s3ThumbnailUrl = await s3Service.uploadFileToS3(thumbnailFile.path, thumbS3Key, thumbnailFile.mimetype);
            // safe to delete local thumbnail after s3 upload
            const fs = require('fs');
            try { fs.unlinkSync(thumbnailFile.path); } catch (e) { }
        }

        let newVOD;
        if (sessionId) {
            // Update existing session
            const existingSession = await prisma.liveSession.findUnique({ where: { id: sessionId } });
            if (!existingSession || existingSession.host_user_id !== host_user_id) {
                return res.status(403).json({ error: 'Unauthorized or session not found' });
            }
            newVOD = await prisma.liveSession.update({
                where: { id: sessionId },
                data: {
                    title,
                    description,
                    category,
                    recording_url: s3VideoUrl,
                    thumbnail_url: req.files.thumbnail ? s3ThumbnailUrl : existingSession.thumbnail_url, // keep old if not uploaded
                    is_processing: true
                }
            });
        } else {
            // Create a fake live session that represents a new standalone VOD
            newVOD = await prisma.liveSession.create({
                data: {
                    host_user_id,
                    title,
                    description,
                    category,
                    status: 'ended',
                    viewer_count_peak: 0,
                    recording_url: s3VideoUrl,
                    thumbnail_url: s3ThumbnailUrl,
                    started_at: new Date(),
                    ended_at: new Date(),
                    created_at: new Date(),
                    is_processing: true
                }
            });
        }

        const inputPath = path.join(__dirname, '../../uploads', videoFile.filename);

        const baseUrl = `http://${req.headers.host}`;
        // Trigger background AI task for subtitles
        subtitleService.processSubtitles(newVOD.id, inputPath, baseUrl);

        // Trigger background HLS Transcoding
        hlsService.processHLS(newVOD.id, inputPath, baseUrl).catch(err => {
            console.error("HLS Processing failed in background:", err);
        });

        res.status(201).json({
            message: 'Video published, and is now being processed to HLS multi-quality stream in background.',
            video: newVOD
        });

    } catch (error) {
        console.error('Upload Error:', error);
        res.status(500).json({ error: 'Failed to upload video' });
    }
};
