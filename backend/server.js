require('dotenv').config();

const express = require('express');
const http = require('http');
const cors = require('cors');
const helmet = require('helmet');
const compression = require('compression');
const { Server: SocketIOServer } = require('socket.io');
const { createBullBoard } = require('@bull-board/api');
const { BullAdapter } = require('@bull-board/api/bullAdapter');
const { ExpressAdapter } = require('@bull-board/express');

const config = require('./config');
const logger = require('./utils/logger');
const fileManager = require('./services/fileManager');

const { compileQueue } = require('./queue/compileQueue');
const compileRoutes = require('./routes/compile');
const libraryRoutes = require('./routes/libraries');
const boardRoutes = require('./routes/boards');
const healthRoutes = require('./routes/health');
const rateLimiter = require('./middleware/rateLimiter');
const errorHandler = require('./middleware/errorHandler');

// Ensure temp dir exists at startup so the API never races the worker on it.
fileManager.ensureTempDir().catch((e) => logger.warn('ensureTempDir failed:', e.message));

const app = express();
const server = http.createServer(app);

// Socket.IO — used to push live progress + completion to the IDE.
const io = new SocketIOServer(server, {
  cors: {
    origin: config.CORS_ORIGIN,
    methods: ['GET', 'POST'],
    credentials: true,
  },
  transports: ['websocket', 'polling'],
});

io.on('connection', (socket) => {
  logger.debug(`Socket connected: ${socket.id}`);
  socket.on('subscribe:job', (jobId) => {
    if (typeof jobId === 'string' && jobId.length < 100) {
      socket.join(`job:${jobId}`);
    }
  });
  socket.on('unsubscribe:job', (jobId) => {
    if (typeof jobId === 'string') socket.leave(`job:${jobId}`);
  });
  socket.on('disconnect', () => logger.debug(`Socket disconnected: ${socket.id}`));
});

// Make queue + io available to route handlers via req.app.get(...).
app.set('compileQueue', compileQueue);
app.set('io', io);

// Express middleware
app.use(helmet({
  // Bull dashboard renders inline assets — relax CSP just for /admin/queues.
  contentSecurityPolicy: false,
}));
app.use(compression());
app.use(cors({
  origin: config.CORS_ORIGIN,
  credentials: true,
}));
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true, limit: '10mb' }));

// Trust proxy when behind nginx so rate limiter sees real client IPs.
app.set('trust proxy', 1);

// Bull-board admin UI (queue introspection)
const bullBoardAdapter = new ExpressAdapter();
bullBoardAdapter.setBasePath('/admin/queues');
createBullBoard({
  queues: [new BullAdapter(compileQueue)],
  serverAdapter: bullBoardAdapter,
});
app.use('/admin/queues', bullBoardAdapter.getRouter());

// API routes
app.use('/api/health', healthRoutes);
app.use('/api/compile', rateLimiter.compile, compileRoutes);
app.use('/api/libraries', rateLimiter.libraries, libraryRoutes);
app.use('/api/boards', boardRoutes);

// 404 + error handler
app.use((req, res) => res.status(404).json({ error: 'Not found' }));
app.use(errorHandler);

server.listen(config.PORT, () => {
  logger.info(`EmbedSim API listening on :${config.PORT} (env=${config.NODE_ENV})`);
  logger.info(`Health: http://localhost:${config.PORT}/api/health`);
  logger.info(`Queues: http://localhost:${config.PORT}/admin/queues`);
});

// Graceful shutdown
const shutdown = async (signal) => {
  logger.info(`${signal} received — shutting down gracefully`);
  server.close(() => logger.info('HTTP server closed'));
  try { await compileQueue.close(); } catch (e) {}
  process.exit(0);
};
process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

module.exports = { app, server, io };
