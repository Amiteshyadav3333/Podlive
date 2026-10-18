const crypto = require('crypto');

const signBunnyDirectoryUrl = (url, securityKey, { expiresInSeconds = 900, pathAllowed } = {}) => {
    if (!securityKey) throw new Error('Bunny CDN token authentication is not configured');
    const parsed = new URL(url);
    const allowedPath = pathAllowed || parsed.pathname.slice(0, parsed.pathname.lastIndexOf('/') + 1);
    if (!allowedPath.startsWith('/') || !allowedPath.endsWith('/')) throw new Error('Invalid Bunny token path scope');
    const expires = String(Math.floor(Date.now() / 1000) + expiresInSeconds);
    const parameters = Object.fromEntries(parsed.searchParams.entries());
    parameters.token_path = allowedPath;
    const sortedParameters = Object.entries(parameters).sort(([a], [b]) => a.localeCompare(b));
    const signingData = sortedParameters.map(([key, value]) => `${key}=${value}`).join('&');
    const urlData = sortedParameters.map(([key, value]) => `${key}=${encodeURIComponent(value)}`).join('&');
    const digest = crypto.createHmac('sha256', securityKey)
        .update(allowedPath)
        .update(expires)
        .update(Buffer.alloc(0))
        .update(signingData)
        .digest('base64')
        .replace(/\+/g, '-')
        .replace(/\//g, '_')
        .replace(/=+$/, '');
    const token = `HS256-${digest}`;
    return `${parsed.protocol}//${parsed.host}/bcdn_token=${token}&${urlData}&expires=${expires}${parsed.pathname}`;
};

module.exports = { signBunnyDirectoryUrl };
