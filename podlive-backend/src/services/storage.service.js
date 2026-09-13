const fs = require('fs');
const path = require('path');
const os = require('os');
const crypto = require('crypto');
const bunnyService = require('./bunny.service');
const telegramService = require('./telegram.service');

/**
 * Storage Strategy Provider Engine
 * Supports 'telegram' (Free Telegram Channel Storage) and 'bunny' (Bunny.net Stream CDN).
 */

const getProvider = () => {
    const configuredProvider = (process.env.STORAGE_PROVIDER || '').toLowerCase().trim();
    if (configuredProvider === 'bunny') return 'bunny';
    if (configuredProvider === 'telegram') return 'telegram';

    // Auto-detect based on env variables
    const { token: tgToken, chatId: tgChatId } = telegramService.getTelegramConfig();
    if (tgToken && tgChatId) return 'telegram';

    try {
        bunnyService.assertConfigured();
        return 'bunny';
    } catch {
        return 'telegram';
    }
};

const assembleChunksToTempFile = async (chunkPaths, destPath) => {
    const writeStream = fs.createWriteStream(destPath);
    for (const chunkPath of chunkPaths) {
        await new Promise((resolve, reject) => {
            const readStream = fs.createReadStream(chunkPath);
            readStream.on('error', reject);
            writeStream.on('error', reject);
            readStream.on('end', resolve);
            readStream.pipe(writeStream, { end: false });
        });
    }
    writeStream.end();
};

/**
 * Upload video file or assembled chunks using the active strategy with automatic fallback to Telegram if Bunny fails
 */
const uploadVideo = async ({ filePath, chunkPaths, fileName, title, description, contentType }) => {
    const preferredProvider = getProvider();
    let tempAssembledPath = null;

    try {
        if (preferredProvider === 'bunny') {
            try {
                bunnyService.assertConfigured();

                let bunnyResult;
                if (chunkPaths && chunkPaths.length > 0) {
                    bunnyResult = await bunnyService.uploadVideoChunks({
                        chunkPaths,
                        totalSize: chunkPaths.reduce((acc, p) => acc + fs.statSync(p).size, 0),
                        title: String(title || fileName).trim(),
                        contentType
                    });
                } else if (filePath) {
                    bunnyResult = await bunnyService.uploadVideoFile({
                        filePath,
                        title: String(title || fileName).trim(),
                        contentType
                    });
                } else {
                    throw new Error('Neither filePath nor chunkPaths was provided for video upload');
                }

                return {
                    provider: 'bunny',
                    guid: bunnyResult.guid,
                    bunnyVideoId: bunnyResult.guid,
                    hlsUrl: bunnyResult.hlsUrl,
                    thumbnailUrl: bunnyResult.thumbnailUrl,
                    sourceUrl: bunnyResult.hlsUrl,
                    embedUrl: bunnyResult.embedUrl
                };
            } catch (bunnyErr) {
                console.warn(`[StorageService] Bunny upload failed (${bunnyErr.message}). Attempting fallback to Telegram storage...`);
                // Check if Telegram is available for fallback
                const { token, chatId } = telegramService.getTelegramConfig();
                if (!token || !chatId) {
                    throw new Error(`Bunny upload failed: ${bunnyErr.message}. Telegram fallback is not configured.`);
                }
            }
        }

        // Telegram Storage Upload
        let fileToUpload = filePath;
        if (!fileToUpload && chunkPaths && chunkPaths.length > 0) {
            tempAssembledPath = path.join(os.tmpdir(), `podlive-assembled-${Date.now()}-${crypto.randomBytes(4).toString('hex')}.mp4`);
            await assembleChunksToTempFile(chunkPaths, tempAssembledPath);
            fileToUpload = tempAssembledPath;
        }

        if (!fileToUpload || !fs.existsSync(fileToUpload)) {
            throw new Error('Valid file or chunks required for Telegram video upload');
        }

        const tgResult = await telegramService.uploadVideo({
            filePath: fileToUpload,
            fileName: fileName || path.basename(fileToUpload),
            title
        });
        const streamUrl = `/api/videos/stream-telegram/${tgResult.fileId}`;

        return {
            provider: 'telegram',
            guid: tgResult.fileId,
            telegramFileId: tgResult.fileId,
            telegramMessageId: tgResult.telegramMessageId,
            hlsUrl: streamUrl,
            sourceUrl: streamUrl,
            thumbnailUrl: null,
            embedUrl: streamUrl,
            fileSize: tgResult.fileSize
        };
    } finally {
        if (tempAssembledPath && fs.existsSync(tempAssembledPath)) {
            try { fs.unlinkSync(tempAssembledPath); } catch {}
        }
    }
};

module.exports = {
    getProvider,
    uploadVideo
};
