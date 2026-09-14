const fs = require('fs');
const path = require('path');
const https = require('https');

const getTelegramConfig = () => {
    const token = process.env.TELEGRAM_BOT_TOKEN;
    const chatId = process.env.TELEGRAM_STORAGE_CHAT_ID;
    return { token, chatId };
};

/** Non-throwing check — use when you just need a boolean. */
const isTelegramConfigured = () => {
    const { token, chatId } = getTelegramConfig();
    return Boolean(token && chatId);
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
        req.write(header);
        const fileStream = fs.createReadStream(filePath);
        fileStream.on('error', (streamErr) => { req.destroy(streamErr); reject(streamErr); });
        fileStream.pipe(req, { end: false });
        fileStream.on('end', () => { req.write(footer); req.end(); });
    });
};

/**
 * Get direct file stream URL from Telegram fileId.
 * NOTE: Telegram Bot API only provides direct download URLs for files <= 20 MB.
 *
 * Returns a typed result object instead of throwing so callers can handle
 * large-file errors gracefully without a generic 500.
 *
 * @returns {{ url: string } | { tooLarge: true } | { error: string }}
 */
const getFileUrl = async (fileId) => {
    const { token } = assertTelegramConfigured();
    let res;
    try {
        res = await fetch(`https://api.telegram.org/bot${token}/getFile?file_id=${encodeURIComponent(fileId)}`);
    } catch (networkErr) {
        return { error: `Network error reaching Telegram API: ${networkErr.message}` };
    }

    let data;
    try {
        data = await res.json();
    } catch {
        return { error: 'Could not parse Telegram API response' };
    }

    if (!res.ok || !data.ok) {
        const desc = data.description || 'Unknown error';
        if (
            desc.toLowerCase().includes('file is too big') ||
            desc.toLowerCase().includes('too large') ||
            (desc.toLowerCase().includes('file_id') && desc.toLowerCase().includes('big'))
        ) {
            return { tooLarge: true };
        }
        return { error: `Failed to retrieve file from Telegram: ${desc}` };
    }

    if (!data.result?.file_path) {
        return { error: 'Telegram API did not return a file path' };
    }

    return { url: `https://api.telegram.org/file/bot${token}/${data.result.file_path}` };
};

/**
 * Proxy-stream a Telegram video with HTTP 206 Partial Content (Range request) support.
 *
 * Returns proper HTTP status codes instead of a generic 500:
 *  503 - Telegram is not configured on this server
 *  410 - File is too large for the Bot API (> 20 MB); must be re-uploaded via Bunny
 *  502 - Upstream Telegram fetch failed
 */
const streamVideo = async (fileId, req, res) => {
    if (!isTelegramConfigured()) {
        if (!res.headersSent) {
            return res.status(503).json({
                error: 'Telegram storage is not configured on this server.',
                hint: 'Set TELEGRAM_BOT_TOKEN and TELEGRAM_STORAGE_CHAT_ID, or re-upload this video — new uploads are stored on Bunny Stream CDN.',
                code: 'TELEGRAM_NOT_CONFIGURED'
            });
        }
        return;
    }

    try {
        const fileResult = await getFileUrl(fileId);

        if (fileResult.tooLarge) {
            if (!res.headersSent) {
                return res.status(410).json({
                    error: 'This video is too large to stream via Telegram Bot API (limit: 20 MB).',
                    hint: 'Please re-upload this video. New uploads go to Bunny Stream CDN which supports files up to 5 GB with full range-request streaming.',
                    code: 'TELEGRAM_FILE_TOO_LARGE'
                });
            }
            return;
        }

        if (fileResult.error) {
            if (!res.headersSent) {
                return res.status(502).json({
                    error: `Unable to retrieve video from Telegram: ${fileResult.error}`,
                    code: 'TELEGRAM_UPSTREAM_ERROR'
                });
            }
            return;
        }

        const { url: directUrl } = fileResult;
        const fetchHeaders = {};
        if (req.headers.range) fetchHeaders['Range'] = req.headers.range;

        let tgRes;
        try {
            tgRes = await fetch(directUrl, { headers: fetchHeaders });
        } catch (fetchErr) {
            if (!res.headersSent) {
                return res.status(502).json({
                    error: `Failed to fetch video from Telegram CDN: ${fetchErr.message}`,
                    code: 'TELEGRAM_FETCH_ERROR'
                });
            }
            return;
        }

        if (!tgRes.ok && tgRes.status !== 206) {
            if (!res.headersSent) {
                return res.status(502).json({
                    error: `Telegram CDN returned ${tgRes.status}: ${tgRes.statusText}`,
                    code: 'TELEGRAM_CDN_ERROR'
                });
            }
            return;
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
                if (done) { res.end(); return; }
                res.write(Buffer.from(value));
                await pump();
            };
            await pump();
        }
    } catch (err) {
        console.error(`[TelegramService] Unexpected stream error for fileId=${fileId}: ${err.message}`);
        if (!res.headersSent) {
            res.status(500).json({
                error: 'An unexpected error occurred while streaming the video.',
                code: 'STREAM_INTERNAL_ERROR'
            });
        }
    }
};

module.exports = {
    getTelegramConfig,
    isTelegramConfigured,
    assertTelegramConfigured,
    uploadVideo,
    getFileUrl,
    streamVideo
};
