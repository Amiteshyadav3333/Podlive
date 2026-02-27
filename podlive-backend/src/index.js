const express = require('express');
const cors = require('cors');
const http = require('http');
const { Server } = require('socket.io');
require('dotenv').config();

const app = express();
const server = http.createServer(app);
const io = new Server(server, {
  cors: {
    origin: '*',
    methods: ['GET', 'POST']
  }
});

app.use(cors());
app.use(express.json());

const path = require('path');

app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

app.get('/', (req, res) => {
  res.send({ message: 'PodLive Server is running' });
});

// Routes
const authRoutes = require('./routes/auth.routes');
const liveRoutes = require('./routes/live.routes');
const userRoutes = require('./routes/user.routes');
const stageRoutes = require('./routes/stage.routes');
const uploadRoutes = require('./routes/upload.routes');
const searchRoutes = require('./routes/search.routes');

app.use('/api/auth', authRoutes);
app.use('/api/live', liveRoutes);
app.use('/api/user', userRoutes);
app.use('/api/stage', stageRoutes);
app.use('/api/upload', uploadRoutes);
app.use('/api/search', searchRoutes);

// Real-time socket connection
const socketHandler = require('./sockets/socket');
socketHandler(io);

const PORT = process.env.PORT || 5005;
server.listen(PORT, () => {
  console.log(`Server is running on port ${PORT}`);
});
