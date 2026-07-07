const ffmpeg = require('fluent-ffmpeg');
const ffmpegInstaller = require('@ffmpeg-installer/ffmpeg');
const path = require('path');
const fs = require('fs');
const os = require('os');
const { PrismaClient } = require('@prisma/client');

ffmpeg.setFfmpegPath(ffmpegInstaller.path);
const prisma = new PrismaClient();

const resolutions = [
    { name: '2160p', size: '3840x2160', bitrate: '16000k' },
    { name: '1440p', size: '2560x1440', bitrate: '9000k' },
    { name: '1080p', size: '1920x1080', bitrate: '5000k' },
    { name: '720p', size: '1280x720', bitrate: '2500k' },
    { name: '480p', size: '854x480', bitrate: '1000k' },
    { name: '360p', size: '640x360', bitrate: '600k' },
    { name: '240p', size: '426x240', bitrate: '350k' }
];

const updateProcessingStatus = async ({ sessionId, videoId, hlsUrl, status }) => {
    if (sessionId) {
        await prisma.liveSession.update({
            where: { id: sessionId },
            data: {
                is_processing: false,
                ...(hlsUrl ? { recording_url: hlsUrl } : {})
            }
        }).catch(() => {});
    }

    if (videoId) {
        await prisma.video.update({
            where: { id: videoId },
            data: {
                processing_status: status,
                ...(hlsUrl ? { hls_master_url: hlsUrl } : {})
            }
        }).catch(() => {});
    }
};

const createVideoFiles = async ({ videoId, baseUrl, jobId }) => {
    if (!videoId) return;

    await prisma.videoFile.deleteMany({ where: { video_id: videoId } }).catch(() => {});
    await prisma.videoFile.createMany({
        data: resolutions.map((resolution, index) => {
            const [width, height] = resolution.size.split('x').map(Number);
            const playlistUrl = `${baseUrl}/hls_${jobId}/${index}.m3u8`;
            return {
                video_id: videoId,
                quality: resolution.name,
                url: playlistUrl,
                playlist_url: playlistUrl,
                width,
                height,
                bitrate: parseInt(resolution.bitrate, 10),
                container: 'hls'
            };
        }),
        skipDuplicates: true
    }).catch(() => {});
};

exports.processHLS = async (sessionId, inputPath, baseUrl, videoId = null) => {
    return new Promise(async (resolve, reject) => {
        const jobId = videoId || sessionId;

        try {
            console.log(`[HLS Engine] Started HLS processing for job: ${jobId}`);

            if (!jobId) {
                throw new Error('sessionId or videoId is required for HLS processing');
            }

            if (videoId) {
                await prisma.video.update({
                    where: { id: videoId },
                    data: { processing_status: 'processing' }
                }).catch(() => {});
            }

            const outputDir = path.join(os.tmpdir(), `hls_${jobId}`);
            fs.mkdirSync(outputDir, { recursive: true });

            let masterContent = '#EXTM3U\n#EXT-X-VERSION:3\n';
            const outputOptions = ['-preset', 'fast', '-g', '48', '-sc_threshold', '0'];

            for (let i = 0; i < resolutions.length; i++) {
                const resolution = resolutions[i];
                const [width, height] = resolution.size.split('x');

                outputOptions.push(
                    '-map', '0:v:0',
                    '-map', '0:a:0',
                    `-filter:v:${i}`, `scale=${width}:${height}:force_original_aspect_ratio=decrease,pad=ceil(iw/2)*2:ceil(ih/2)*2`,
                    `-b:v:${i}`, resolution.bitrate,
                    `-maxrate:v:${i}`, `${Math.round(parseInt(resolution.bitrate, 10) * 1.2)}k`,
                    `-bufsize:v:${i}`, `${parseInt(resolution.bitrate, 10) * 2}k`,
                    `-profile:v:${i}`, 'main',
                    '-c:a', 'aac',
                    '-b:a', '128k',
                    '-ar', '44100'
                );

                masterContent += `#EXT-X-STREAM-INF:BANDWIDTH=${parseInt(resolution.bitrate, 10) * 1000},RESOLUTION=${resolution.size}\n${i}.m3u8\n`;
            }

            fs.writeFileSync(path.join(outputDir, 'master.m3u8'), masterContent);

            let streamMap = '';
            for (let i = 0; i < resolutions.length; i++) {
                streamMap += `v:${i},a:${i} `;
            }

            outputOptions.push('-var_stream_map', streamMap.trim());
            outputOptions.push('-master_pl_name', 'master.m3u8');
            outputOptions.push('-f', 'hls');
            outputOptions.push('-hls_time', process.env.HLS_SEGMENT_SECONDS || '10');
            outputOptions.push('-hls_list_size', '0');
            outputOptions.push('-hls_segment_filename', path.join(outputDir, '%v_%03d.ts'));

            ffmpeg(inputPath)
                .outputOptions(outputOptions)
                .output(path.join(outputDir, '%v.m3u8'))
                .on('stderr', (stderrLine) => {
                    console.log(`[FFmpeg STDERR]: ${stderrLine}`);
                })
                .on('end', async () => {
                    console.log(`[HLS Engine] Finished HLS processing for job: ${jobId}. Starting R2 upload...`);

                    try {
                        const s3Service = require('./s3.service');
                        const files = fs.readdirSync(outputDir);
                        await Promise.all(files.map((file) => {
                            const filePath = path.join(outputDir, file);
                            const contentType = file.endsWith('.m3u8') ? 'application/vnd.apple.mpegurl' : 'video/MP2T';
                            return s3Service.uploadFileToS3(filePath, `hls_${jobId}/${file}`, contentType);
                        }));

                        const publicBaseUrl = process.env.S3_PUBLIC_URL;
                        const hlsUrl = `${publicBaseUrl}/hls_${jobId}/master.m3u8`;
                        await updateProcessingStatus({ sessionId, videoId, hlsUrl, status: 'ready' });
                        await createVideoFiles({ videoId, baseUrl: publicBaseUrl, jobId });

                        fs.rmSync(outputDir, { recursive: true, force: true });
                        try { fs.unlinkSync(inputPath); } catch (e) {}
                        resolve(hlsUrl);
                    } catch (s3Error) {
                        console.error('[HLS Engine] R2 upload failed:', s3Error.message);
                        try {
                            const localBaseDir = path.join(os.tmpdir(), 'podlive-uploads');
                            const localHlsDir = path.join(localBaseDir, `hls_${jobId}`);
                            fs.mkdirSync(localHlsDir, { recursive: true });

                            fs.readdirSync(outputDir).forEach((file) => {
                                fs.copyFileSync(path.join(outputDir, file), path.join(localHlsDir, file));
                            });

                            const hlsUrl = `${baseUrl}/uploads/hls_${jobId}/master.m3u8`;
                            await updateProcessingStatus({ sessionId, videoId, hlsUrl, status: 'ready' });
                            await createVideoFiles({ videoId, baseUrl: `${baseUrl}/uploads`, jobId });

                            fs.rmSync(outputDir, { recursive: true, force: true });
                            try { fs.unlinkSync(inputPath); } catch (e) {}
                            resolve(hlsUrl);
                        } catch (fallbackError) {
                            console.error('[HLS Engine] Local HLS fallback failed:', fallbackError.message);
                            await updateProcessingStatus({ sessionId, videoId, status: 'failed' });
                            reject(s3Error);
                        }
                    }
                })
                .on('error', async (err) => {
                    console.error('[HLS Engine] FFmpeg error:', err.message);
                    await updateProcessingStatus({ sessionId, videoId, status: 'failed' });
                    reject(err);
                })
                .run();
        } catch (error) {
            console.error('[HLS Engine] Setup error:', error.message);
            await updateProcessingStatus({ sessionId, videoId, status: 'failed' });
            reject(error);
        }
    });
};
