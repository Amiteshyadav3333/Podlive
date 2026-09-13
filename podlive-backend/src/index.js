const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
const multer = require('multer');
const helmet = require('helmet');
const compression = require('compression');
const rateLimit = require('express-rate-limit');
require('dotenv').config();

const requiredEnvVars = [
  'DATABASE_URL',
  'JWT_ACCESS_SECRET',
  'JWT_REFRESH_SECRET',
  'LIVEKIT_API_KEY',
  'LIVEKIT_API_SECRET'
];

const missingEnvVars = requiredEnvVars.filter((key) => !process.env[key]);
if (missingEnvVars.length > 0) {
  throw new Error(`Missing required environment variables: ${missingEnvVars.join(', ')}`);
}

const allowedOrigins = process.env.ALLOWED_ORIGINS
  ? process.env.ALLOWED_ORIGINS.split(',').map((s) => s.trim())
  : [process.env.FRONTEND_URL, 'https://indiapodlive.vercel.app', 'http://localhost:3000', 'http://localhost:3001'].filter(Boolean);

const isOriginAllowed = (origin) => {
  if (!origin) return true; // Server-to-server or mobile requests
  if (allowedOrigins.includes('*') || allowedOrigins.includes(origin)) return true;
  // Allow all vercel preview & production domains (*.vercel.app), render (*.onrender.com), and localhost
  if (/^https:\/\/(?:[a-zA-Z0-9-]+\.)*(vercel\.app|onrender\.com)$/i.test(origin)) return true;
  if (/^https?:\/\/(localhost|127\.0\.0\.1)(:\d+)?$/i.test(origin)) return true;
  return false;
};

const corsOriginHandler = (origin, callback) => {
  if (isOriginAllowed(origin)) {
    return callback(null, true);
  }
  return callback(null, false);
};

const app = express();

// Trust reverse proxy (required for express-rate-limit behind proxies like Render/Cloudflare)
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: (origin, callback) => callback(null, isOriginAllowed(origin)),
    methods: ['GET', 'POST'],
    credentials: true
  },
  transports: ['websocket', 'polling']
});

// Security & perf middleware
app.use(helmet({ crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: corsOriginHandler, credentials: true, methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH', 'OPTIONS'] }));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Rate limiting — general API
const apiLimiter = rateLimit({ windowMs: 60 * 1000, max: 200, standardHeaders: true, legacyHeaders: false });
app.use('/api/', apiLimiter);

// Stricter rate limit for auth endpoints
const authLimiter = rateLimit({ windowMs: 15 * 60 * 1000, max: 20, message: { error: 'Too many attempts, please try again later.' } });
app.use('/api/auth/', authLimiter);

// Attach Socket.io to request object for use in controllers
app.use((req, res, next) => {
  req.io = io;
  next();
});

const path = require('path');
const os = require('os');

// Serve local uploads (fallback when S3 is unavailable)
const uploadsDir = path.join(__dirname, '../uploads');
const tempUploadsDir = path.join(os.tmpdir(), 'podlive-uploads');

if (!require('fs').existsSync(uploadsDir)) {
  require('fs').mkdirSync(uploadsDir, { recursive: true });
}
if (!require('fs').existsSync(tempUploadsDir)) {
  require('fs').mkdirSync(tempUploadsDir, { recursive: true });
}

// Add CORS and Cross-Origin-Resource-Policy headers explicitly for static files in /uploads
app.use('/uploads', (req, res, next) => {
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.setHeader('Cross-Origin-Opener-Policy', 'unsafe-none');
  next();
});

app.use('/uploads', express.static(tempUploadsDir));
app.use('/uploads', express.static(uploadsDir));

// Fallback for non-existent upload files (serve custom SVG placeholder instead of raw 404 error)
app.use('/uploads', (req, res) => {
  res.setHeader('Content-Type', 'image/svg+xml');
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Cross-Origin-Resource-Policy', 'cross-origin');
  res.status(200).send(`
    <svg xmlns="http://www.w3.org/2000/svg" width="600" height="400" viewBox="0 0 600 400" fill="none">
      <rect width="600" height="400" fill="#18181b"/>
      <circle cx="300" cy="170" r="48" fill="#3f3f46"/>
      <path d="M260 250 L340 250 L300 200 Z" fill="#6366f1"/>
      <text x="300" y="310" font-family="system-ui, sans-serif" font-size="20" font-weight="600" fill="#a1a1aa" text-anchor="middle">PodLive Media</text>
    </svg>
  `);
});

app.get('/', (req, res) => {
  res.send({ message: 'PodLive Server is running' });
});

// Routes
const authRoutes = require('./routes/auth.routes');
const liveRoutes = require('./routes/live.routes');
const userRoutes = require('./routes/user.routes');
const stageRoutes = require('./routes/stage.routes');
const searchRoutes = require('./routes/search.routes');
const uploadRoutes = require('./routes/upload.routes');
const videoRoutes = require('./routes/video.routes');
const channelRoutes = require('./routes/channel.routes');
const courseRoutes = require('./routes/course.routes');
const planRoutes = require('./routes/plan.routes');

app.use('/api/auth', authRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/user', userRoutes);
app.use('/api/stage', stageRoutes);
app.use('/api/search', searchRoutes);
// User uploads are a separate on-demand media pipeline. Live rooms remain
// realtime-only and never start an egress/recording job.
app.use('/api/upload', uploadRoutes);
app.use('/api/videos', videoRoutes);
app.use('/api/channels', channelRoutes);
app.use('/api/courses', courseRoutes);
app.use('/api/plans', planRoutes);

// Public config endpoint — exposes only what the frontend needs (no secrets)
// API keys and secrets are NEVER sent here. Only the WebSocket URL.
app.get('/api/config', (req, res) => {
  const livekitUrl = process.env.LIVEKIT_URL;
  if (!livekitUrl) {
    return res.status(503).json({ error: 'LiveKit is not configured on this server.' });
  }
  res.json({
    livekitUrl, // e.g. wss://podlike-r0rwil4t.livekit.cloud
  });
});

// Real-time socket connection
const socketHandler = require('./sockets/socket');
socketHandler(io);

// Global Error Handler Middleware (Ensure all errors return JSON, not HTML)
app.use((err, req, res, next) => {
  console.error(err.stack);
  
  if (err instanceof multer.MulterError) {
    if (err.code === 'LIMIT_FILE_SIZE') {
      const configuredLimit = Number(process.env.MAX_UPLOAD_SIZE_BYTES);
      const maxUploadSizeBytes = Number.isFinite(configuredLimit) && configuredLimit > 0
        ? configuredLimit
        : 5 * 1024 * 1024 * 1024;
      return res.status(413).json({ error: 'File size exceeds the configured upload limit.', maxUploadSizeBytes });
    }
    return res.status(400).json({ error: `Upload error: ${err.message}` });
  }

  res.status(500).json({ 
    error: 'Internal Server Error', 
    message: err.message,
    stack: process.env.NODE_ENV === 'development' ? err.stack : undefined 
  });
});

const PORT = process.env.PORT || 5005;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
