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

const app = express();

// Trust Render's reverse proxy (required for express-rate-limit to work correctly)
app.set('trust proxy', 1);
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

// Security & perf middleware
app.use(helmet({ crossOriginEmbedderPolicy: false, crossOriginResourcePolicy: { policy: "cross-origin" }, contentSecurityPolicy: false }));
app.use(compression());
app.use(cors({ origin: '*', methods: ['GET', 'POST', 'PUT', 'DELETE', 'PATCH'] }));
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

// Alias for LiveKit token if called directly via /get-token
const { AccessToken } = require('livekit-server-sdk');
app.get('/get-token', async (req, res) => {
  try {
    const { room, participant } = req.query;
    if (!room || !participant) {
      return res.status(400).json({ error: 'room and participant are required' });
    }

    const apiKey = process.env.LIVEKIT_API_KEY;
    const apiSecret = process.env.LIVEKIT_API_SECRET;

    const at = new AccessToken(apiKey, apiSecret, {
      identity: participant,
    });
    at.addGrant({ roomJoin: true, room: room, canPublish: true, canSubscribe: true });

    const token = await at.toJwt();
    res.json({ token });
  } catch (error) {
    res.status(500).json({ error: error.message });
  }
});

// Routes
const authRoutes = require('./routes/auth.routes');
const liveRoutes = require('./routes/live.routes');
const userRoutes = require('./routes/user.routes');
const stageRoutes = require('./routes/stage.routes');
const uploadRoutes = require('./routes/upload.routes');
const searchRoutes = require('./routes/search.routes');
const videoRoutes = require('./routes/video.routes');

app.get('/api/admin/db-sync', async (req, res) => {
    try {
        const { exec } = require('child_process');
        exec('npx prisma db push --accept-data-loss', (error, stdout, stderr) => {
            if (error) {
                return res.status(500).json({ error: error.message, stderr });
            }
            res.json({ message: 'Database synced successfully', stdout });
        });
    } catch (err) {
        res.status(500).json({ error: err.message });
    }
});

app.use('/api/auth', authRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/user', userRoutes);
app.use('/api/stage', stageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/search', searchRoutes);
app.use('/api/videos', videoRoutes);

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
      return res.status(413).json({ error: 'File size too large. Professional plans allow up to 1GB.' });
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
