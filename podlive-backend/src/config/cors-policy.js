const DEFAULT_ORIGINS = [
  'https://indiapodlive.vercel.app',
  'https://chat.indiasearch.site',
  'https://indiasearch.site',
  'https://podlive.indiasearch.site',
  'http://localhost:3000',
  'http://localhost:3001',
  'http://localhost:5173'
];

function getAllowedOrigins(configuredOrigins, frontendUrl) {
  if (configuredOrigins) {
    return configuredOrigins.split(',').map((origin) => origin.trim()).filter(Boolean);
  }
  return [frontendUrl, ...DEFAULT_ORIGINS].filter(Boolean);
}

function isOriginAllowed(origin, allowedOrigins) {
  if (!origin) return true;
  return allowedOrigins.includes(origin);
}

module.exports = { getAllowedOrigins, isOriginAllowed };
