const fs = require('fs');
const https = require('https');

const apiHost = 'video.bunnycdn.com';

const requiredConfig = () => ({
    libraryId: process.env.BUNNY_STREAM_LIBRARY_ID,
    accessKey: process.env.BUNNY_STREAM_ACCESS_KEY,
    cdnHostname: normalizeHostname(process.env.BUNNY_STREAM_CDN_HOSTNAME)
});

const normalizeHostname = (hostname) => {
    if (!hostname) return null;
    return String(hostname).replace(/^https?:\/\//, '').replace(/\/+$/, '');
};

const assertConfigured = () => {
    const config = requiredConfig();
    const missing = Object.entries(config)
        .filter(([, value]) => !value)
        .map(([key]) => key);

    if (missing.length > 0) {
        throw new Error(`Bunny Stream is not configured. Missing: ${missing.join(', ')}`);
    }

    return config;
};

const readResponseBody = async (response) => {
    const text = await response.text();
    if (!text) return null;

    try {
        return JSON.parse(text);
    } catch (error) {
        return text;
    }
};

const bunnyFetch = async (path, options = {}) => {
    const config = assertConfigured();
    const response = await fetch(`https://${apiHost}${path}`, {
        ...options,
        headers: {
            AccessKey: config.accessKey,
            ...(options.headers || {})
        }
    });
    const body = await readResponseBody(response);

    if (!response.ok) {
        const message = typeof body === 'string'
            ? body
            : body?.message || JSON.stringify(body);
        throw new Error(`Bunny Stream API failed (${response.status}): ${message}`);
    }

    return body;
};

const streamFileRequest = ({ method, path, filePath, contentType }) => {
    const config = assertConfigured();
    const stat = fs.statSync(filePath);

    return new Promise((resolve, reject) => {
        const req = https.request({
            method,
            host: apiHost,
            path,
            headers: {
                AccessKey: config.accessKey,
                'Content-Type': contentType || 'application/octet-stream',
                'Content-Length': stat.size
            }
        }, (res) => {
            let body = '';
            res.setEncoding('utf8');
            res.on('data', (chunk) => {
                body += chunk;
            });
            res.on('end', () => {
                let parsed = body;
                try {
                    parsed = body ? JSON.parse(body) : null;
                } catch (error) {}

                if (res.statusCode < 200 || res.statusCode >= 300) {
                    const message = typeof parsed === 'string'
                        ? parsed
                        : parsed?.message || body || res.statusMessage;
                    reject(new Error(`Bunny Stream upload failed (${res.statusCode}): ${message}`));
                    return;
                }

                resolve(parsed);
            });
        });

        req.on('error', reject);
        fs.createReadStream(filePath).on('error', reject).pipe(req);
    });
};

const getPlaybackUrls = (videoId) => {
    const { libraryId, cdnHostname } = assertConfigured();

    return {
        hlsUrl: `https://${cdnHostname}/${videoId}/playlist.m3u8`,
        thumbnailUrl: `https://${cdnHostname}/${videoId}/thumbnail.jpg`,
        embedUrl: `https://iframe.mediadelivery.net/embed/${libraryId}/${videoId}`
    };
};

const createVideo = async ({ title, collectionId, thumbnailTime }) => {
    const { libraryId } = assertConfigured();
    return bunnyFetch(`/library/${libraryId}/videos`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
            title,
            ...(collectionId ? { collectionId } : {}),
            ...(thumbnailTime !== undefined ? { thumbnailTime } : {})
        })
    });
};

const uploadVideoBinary = async ({ videoId, filePath, contentType }) => {
    const { libraryId } = assertConfigured();
    const params = new URLSearchParams();

    if (process.env.BUNNY_STREAM_ENABLED_RESOLUTIONS) {
        params.set('enabledResolutions', process.env.BUNNY_STREAM_ENABLED_RESOLUTIONS);
    }
    if (process.env.BUNNY_STREAM_OUTPUT_CODECS) {
        params.set('enabledOutputCodecs', process.env.BUNNY_STREAM_OUTPUT_CODECS);
    }

    const query = params.toString() ? `?${params.toString()}` : '';
    return streamFileRequest({
        method: 'PUT',
        path: `/library/${libraryId}/videos/${videoId}${query}`,
        filePath,
        contentType: contentType || 'application/octet-stream'
    });
};

const setThumbnail = async ({ videoId, filePath, contentType }) => {
    const { libraryId } = assertConfigured();
    return streamFileRequest({
        method: 'POST',
        path: `/library/${libraryId}/videos/${videoId}/thumbnail`,
        filePath,
        contentType: contentType || 'application/octet-stream'
    });
};

const getVideo = async (videoId) => {
    const { libraryId } = assertConfigured();
    return bunnyFetch(`/library/${libraryId}/videos/${videoId}`, {
        method: 'GET'
    });
};

const uploadVideoFile = async ({ filePath, title, contentType, collectionId, thumbnailPath, thumbnailContentType }) => {
    const created = await createVideo({
        title,
        collectionId: collectionId || process.env.BUNNY_STREAM_COLLECTION_ID || null
    });
    const videoId = created.guid;

    if (!videoId) {
        throw new Error('Bunny Stream did not return a video guid');
    }

    await uploadVideoBinary({ videoId, filePath, contentType });

    if (thumbnailPath) {
        await setThumbnail({
            videoId,
            filePath: thumbnailPath,
            contentType: thumbnailContentType
        }).catch((error) => {
            console.warn(`[Bunny] Thumbnail upload skipped: ${error.message}`);
        });
    }

    return {
        bunnyVideo: created,
        guid: videoId,
        ...getPlaybackUrls(videoId)
    };
};

module.exports = {
    assertConfigured,
    createVideo,
    getVideo,
    getPlaybackUrls,
    setThumbnail,
    uploadVideoBinary,
    uploadVideoFile
};
