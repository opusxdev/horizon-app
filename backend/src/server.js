import express from 'express';
import { createServer } from 'http';
import { Server } from 'socket.io';
import cors from 'cors'
import helmet from 'helmet';
import compression from 'compression';
import rateLimit from 'express-rate-limit'
import dotenv from 'dotenv'


import database from './config/database.js';
import cacheManager from './config/cache.js';
import apiRoutes from './routes/api.js';
import SocketHandler from './sockets/socketHandler.js'
import roomService from './services/roomService.js'


dotenv.config();

const app = express();
const httpServer = createServer(app);

//configs
const PORT = process.env.PORT || 5000;
const CORS_ORIGIN = process.env.CORS_ORIGIN || 'http://localhost:3000';
const MONGODB_URI = process.env.MONGODB_URI;
const REDIS_URL = process.env.REDIS_URL || 'redis://localhost:6379';
const REDIS_ENABLED = process.env.REDIS_ENABLED === 'true';

if (!MONGODB_URI) {
  console.error('MONGODB_URI is required in environment variables');
  process.exit(1);
}

app.use(helmet({
  crossOriginResourcePolicy: { policy: 'cross-origin' },
  crossOriginOpenerPolicy: { policy: 'same-origin-allow-popups' }
}));

const corsOptions = {
  origin: CORS_ORIGIN.split(',').map(origin => origin.trim()),
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization']
};

app.use(cors(corsOptions));

app.use(compression());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));



const limiter = rateLimit({
  windowMs: parseInt(process.env.RATE_LIMIT_WINDOW_MS) || 60000,
  max: parseInt(process.env.RATE_LIMIT_MAX_REQUESTS) || 100,
  message: 'Too many requests from this IP, please try again later.',
  standardHeaders: true,
  legacyHeaders: false
});

app.use('/api/', limiter);

app.use('/api', apiRoutes);

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    name: 'horizon-app backend',
    version: '1.0.0',
    status: 'running',
    endpoints: {
      health: '/api/health',
      createRoom: 'POST /api/rooms',
      getRoom: 'GET /api/rooms/:roomId',
      roomStats: 'GET /api/rooms/:roomId/stats',
      serverStats: 'GET /api/stats'
    },
    websocket: {
      url: `ws://localhost:${PORT}`,
      events: {
        client: ['join-room', 'scene-update', 'incremental-update', 'pointer-update', 'idle-status', 'leave-room'],
        server: ['scene-init', 'scene-update', 'incremental-update', 'pointer-update', 'user-joined', 'user-left', 'error']
      }
    }
  });
});

// err handling middleware
app.use((err, req, res, next) => {
  console.error('Error:', err);
  res.status(err.status || 500).json({
    success: false,
    error: err.message || 'Internal server error'
  })
})

app.use((req, res) => {
  res.status(404).json({
    success: false,
    error: 'Endpoint not found'
  })
})

// socket config
const io = new Server(httpServer, {
  cors: corsOptions,
  pingTimeout: parseInt(process.env.WS_PING_TIMEOUT) || 30000,
  pingInterval: parseInt(process.env.WS_PING_INTERVAL) || 25000,
  maxHttpBufferSize: 1e7, // 10 MB
  transports: ['websocket', 'polling'],
  allowEIO3: true
});

// Initialize socket handler
const socketHandler = new SocketHandler(io);

// Handle socket connections
io.on('connection', (socket) => {
  socketHandler.handleConnection(socket);
});

// Cleanup job for inactive rooms
const CLEANUP_INTERVAL = parseInt(process.env.ROOM_CLEANUP_INTERVAL) || 3600000; // 1 hour
setInterval(() => {
  roomService.cleanupInactiveRooms();
}, CLEANUP_INTERVAL);

const gracefulShutdown = async (signal) => {
  console.log(`\n${signal} received. Starting graceful shutdown..`);
  
  // Stop accepting new connections
  httpServer.close(() => {
    console.log('HTTP server closed');
  });

  // Close all socket connections
  io.close(() => {
    console.log('Socket.IO server closed');
  });

  // Disconnect from databases
  try {
    await database.disconnect();
    await cacheManager.disconnect();
    console.log('graceful shutdown completed');
    process.exit(0);
  } catch (error) {
    console.error('error during shutdown:', error);
    process.exit(1);
  }
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Uncaught exception handler
process.on('uncaughtException', (error) => {
  console.error('Uncaught Exception:', error);
  gracefulShutdown('uncaughtException');
});

// Unhandled rejection handler
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
})

const startServer = async () => {
  try {
    await database.connect(MONGODB_URI);

    // Connect to Redis
    await cacheManager.connect(REDIS_URL, REDIS_ENABLED);

    httpServer.listen(PORT, () => {
      console.log('\n');
      console.log(' horizon-app backend started ');
      console.log('');
      console.log(`Server:http://localhost:${PORT.toString().padEnd(22)}`)
      console.log(`WebSocket: ws://localhost:${PORT.toString().padEnd(24)}`)


      console.log(`Database: MongoDB Atlas (Connected)`);
      console.log(`cache: ${(REDIS_ENABLED ? 'Redis Enabled' : 'In-Memory').padEnd(33)}`);
      console.log(`env: ${process.env.NODE_ENV || 'dev'.padEnd(33)}`);
      console.log('\n');


      console.log('APis Endpoints ');
      console.log(`GET  /api/health`);
      console.log(`POST /api/rooms`);
      console.log(`GET  /api/rooms/:roomId`);
      console.log(`GET  /api/rooms/:roomId/stats`);
      console.log(`DELETE /api/rooms/:roomId`);
      console.log(`GET  /api/stats\n`);
    });
  } catch (error) {
    console.error('Faile to start server:', error);
    process.exit(1);
  }
};

startServer()