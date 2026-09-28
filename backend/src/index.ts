import 'express-async-errors';
import path from 'path';
import express from 'express';
import cors from 'cors';
import { createServer } from 'http';
import { Server } from 'socket.io';
import { env } from './config/env';
import prisma from './config/prisma';
import { connectRedis, disconnectRedis, redisStatus } from './config/redis';
import routes from './routes';
import { authenticate } from './middlewares/auth';
import { errorHandler, notFoundHandler } from './middlewares/errorHandler';
import { setupSocket } from './socket';
import { startEngine, stopEngine } from './jobs/engine';

const app = express();
const httpServer = createServer(app);
const corsOrigin = env.corsOrigins.includes('*') ? '*' : env.corsOrigins;
const io = new Server(httpServer, { cors: { origin: corsOrigin } });

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use(cors({ origin: corsOrigin }));
app.use(express.json({ limit: '100kb' }));
app.use((_req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  next();
});

app.get('/health', async (_req, res) => {
  const db = await prisma.$queryRaw`SELECT 1`.then(() => 'up').catch(() => 'down');
  res.status(db === 'up' ? 200 : 503).json({ status: db === 'up' ? 'OK' : 'DEGRADED', db, redis: redisStatus() });
});

app.use('/api', authenticate, routes);
app.use('/api', notFoundHandler);

// serves the vanilla-js prototype so front and api share one origin.
// root-level .html/.js only: a plain static mount would also expose backend/ and uploaded letters.
const PROTOTYPE_ROOT = path.resolve(__dirname, '../..');
app.get(/^\/([\w-]+\.(?:html|js))?$/, (req, res, next) => {
  const file = req.params[0] || 'index.html';
  res.sendFile(file, { root: PROTOTYPE_ROOT }, err => err && next());
});

app.use(errorHandler);

setupSocket(io);

async function start() {
  await connectRedis();
  await prisma.$connect();
  httpServer.listen(env.port, () => console.log(`[server] BloodSync API berjalan di http://localhost:${env.port}`));
  startEngine();
}

start().catch(err => {
  console.error('[server] gagal start', err);
  process.exit(1);
});

async function shutdown() {
  console.log('\n[server] mematikan server...');
  stopEngine();
  io.close();
  httpServer.close(async () => {
    await prisma.$disconnect();
    await disconnectRedis();
    process.exit(0);
  });
}

process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
