// The HTTP server process. Run via src/index.js (recommended) so a CPU breach
// gets a fresh process automatically, or directly with `npm run start:app`.
const cluster = require('cluster');
const mongoose = require('mongoose');
const config = require('./config');
const connectDB = require('./config/db');
const app = require('./app');
const scheduler = require('./services/messageScheduler');
const { startCpuMonitor } = require('./services/cpuMonitor');

const supervised = cluster.isWorker;
let server;

async function shutdown(reason, exitCode = 0) {
  console.log(`[server ${process.pid}] shutting down: ${reason}`);
  scheduler.stop();
  const force = setTimeout(() => process.exit(exitCode), config.shutdownGraceMs);
  force.unref();
  // Stops accepting connections and waits for in-flight requests to finish.
  if (server) {
    await new Promise((resolve) => {
      server.close(resolve);
      server.closeIdleConnections();
    });
  }
  await mongoose.disconnect().catch(() => {});
  process.exit(exitCode);
}

function onCpuBreach(cpu) {
  console.warn(`[server ${process.pid}] CPU at ${cpu}% (threshold ${config.cpu.threshold}%), restarting`);
  if (supervised) {
    // The supervisor starts a replacement first, then tells us to stop.
    process.send({ type: 'cpu-restart', pid: process.pid, cpu });
  } else {
    // Unsupervised: exit non-zero so pm2 / nodemon / docker restart policy brings us back.
    shutdown('cpu threshold exceeded', 1);
  }
}

async function start() {
  await connectDB(config.mongoUri);
  await scheduler.start(config.schedulerIntervalMs);

  server = app.listen(config.port, () => {
    console.log(`[server ${process.pid}] listening on http://localhost:${config.port}`);
  });

  startCpuMonitor({ ...config.cpu, onBreach: onCpuBreach });

  process.on('message', (msg) => {
    if (msg?.type === 'shutdown') shutdown('replaced by supervisor');
  });
  process.on('SIGTERM', () => shutdown('SIGTERM'));
  process.on('SIGINT', () => shutdown('SIGINT'));
}

start().catch((err) => {
  console.error(`[server ${process.pid}] failed to start:`, err.message);
  process.exit(1);
});
