const fs = require('fs');
const path = require('path');
const https = require('https');

const getTelegramConfig = () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_STORAGE_CHAT_ID;
    return { token, chatId };
};

const assertTelegramConfigured = () => {
    const { token, chatId } = getTelegramConfig();
    if (!token || !chatId) {
        throw new Error('Telegram storage is not configured. Missing TELEGRAM_BOT_TOKEN or TELEGRAM_STORAGE_CHAT_ID');
    }
    return { token, chatId };
};

/**
 * Upload a local file to Telegram Channel via Telegram Bot API (sendDocument / sendVideo)
 */
const uploadVideo = async ({ filePath, fileName, title }) => {
    const { token, chatId } = assertTelegramConfigured();
    if (!fs.existsSync(filePath)) {
        throw new Error(`File not found at path: ${filePath}`);
    }

    const name = fileName || path.basename(filePath);
    const caption = (title || name).substring(0, 1024);
    const stat = fs.statSync(filePath);

    // Build multipart/form-data boundary
    const boundary = '----PodLiveTelegramBoundary' + Math.random().toString(36).substring(2);
    const crlf = '\r\n';

    const header = [
        `--${boundary}`,
        `Content-Disposition: form-data; name="chat_id"`,
        '',
        chatId,
        `--${boundary}`,
        `Content-Disposition: form-data; name="caption"`,
        '',
        caption,
        `--${boundary}`,
        `Content-Disposition: form-data; name="document"; filename="${name}"`,
        'Content-Type: application/octet-stream',
        '',
        ''
    ].join(crlf);

    const footer = `${crlf}--${boundary}--${crlf}`;
    const contentLength = Buffer.byteLength(header) + stat.size + Buffer.byteLength(footer);

    return new Promise((resolve, reject) => {
        const reqOptions = {
            hostname: 'api.telegram.org',
            port: 443,
            path: `/bot${token}/sendDocument`,
            method: 'POST',
            headers: {
                'Content-Type': `multipart/form-data; boundary=${boundary}`,
                'Content-Length': contentLength
            }
        };

        const req = https.request(reqOptions, (res) => {
            let data = '';
            res.on('data', (chunk) => { data += chunk; });
            res.on('end', () => {
                try {
                    const response = JSON.parse(data);
                    if (!res.statusCode || res.statusCode < 200 || res.statusCode >= 300 || !response.ok) {
                        return reject(new Error(`Telegram upload failed (${res.statusCode}): ${response.description || data}`));
                    }

                    const message = response.result;
                    const document = message.document || message.video || message.audio;
                    if (!document || !document.file_id) {
                        return reject(new Error('Telegram response did not include a valid file_id'));
                    }

                    resolve({
                        fileId: document.file_id,
                        fileUniqueId: document.file_unique_id,
                        fileSize: document.file_size || stat.size,
                        mimeType: document.mime_type || 'video/mp4',
                        fileName: document.file_name || name,
                        telegramMessageId: message.message_id
                    });
                } catch (parseErr) {
                    reject(new Error(`Failed to parse Telegram API response: ${parseErr.message}`));
                }
            });
        });

        req.on('error', (err) => reject(new Error(`Telegram network request error: ${err.message}`)));

        // Write header, stream file contents, write footer
        req.write(header);
        const fileStream = fs.createReadStream(filePath);
        fileStream.on('error', (streamErr) => {
            req.destroy(streamErr);
            reject(streamErr);
        });
        fileStream.pipe(req, { end: false });
        fileStream.on('end', () => {
            req.write(footer);
            req.end();
        });
    });
};

/**
 * Get direct file stream URL from Telegram fileId
 */
const getFileUrl = async (fileId) => {
    const { token } = assertTelegramConfigured();
    const res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
    const data = await res.json();
    if (!res.ok || !data.ok || !data.result?.file_path) {
        throw new Error(`Failed to retrieve file from Telegram: ${data.description || 'Unknown error'}`);
    }
    return `https://api.telegram.org/file/bot${token}/${data.result.file_path}`;
};

/**
 * Proxy stream Telegram video with HTTP 206 Partial Content (Range request) support
 */
const streamVideo = async (fileId, req, res) => {
    try {
        const directUrl = await getFileUrl(fileId);
        const range = req.headers.range;

        const fetchHeaders = {};
        if (range) {
            fetchHeaders['Range'] = range;
        }

        const tgRes = await fetch(directUrl, { headers: fetchHeaders });
        if (!tgRes.ok && tgRes.status !== 206) {
            return res.status(tgRes.status).send(`Failed to stream video from Telegram: ${tgRes.statusText}`);
        }

        const contentType = tgRes.headers.get('content-type') || 'video/mp4';
        const contentLength = tgRes.headers.get('content-length');
        const contentRange = tgRes.headers.get('content-range');
        const acceptRanges = tgRes.headers.get('accept-ranges') || 'bytes';

        res.setHeader('Content-Type', contentType);
        res.setHeader('Accept-Ranges', acceptRanges);
        res.setHeader('Access-Control-Allow-Origin', '*');
        res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');

        if (contentLength) res.setHeader('Content-Length', contentLength);
        if (contentRange) res.setHeader('Content-Range', contentRange);

        res.status(tgRes.status === 206 ? 206 : 200);

        if (tgRes.body && typeof tgRes.body.pipe === 'function') {
            tgRes.body.pipe(res);
        } else {
            const reader = tgRes.body.getReader();
            const pump = async () => {
                const { done, value } = await reader.read();
                if (done) {
                    res.end();
                    return;
                }
                res.write(Buffer.from(value));
                await pump();
            };
            await pump();
        }
    } catch (err) {
        console.error(`[TelegramService] Stream error: ${err.message}`);
        if (!res.headersSent) {
            res.status(500).json({ error: `Streaming failed: ${err.message}` });
        }
    }
};

module.exports = {
    getTelegramConfig,
    assertTelegramConfigured,
    uploadVideo,
    getFileUrl,
    streamVideo
};
