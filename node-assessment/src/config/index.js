require('dotenv').config();

module.exports = {
  port: Number(process.env.PORT) || 3000,
  mongoUri: process.env.MONGO_URI || 'mongodb://127.0.0.1:27017/insurance_db',
  cpu: {
    threshold: Number(process.env.CPU_THRESHOLD) || 70,
    intervalMs: Number(process.env.CPU_CHECK_INTERVAL_MS) || 1000,
    breachCount: Number(process.env.CPU_BREACH_COUNT) || 3,
    scope: process.env.CPU_SCOPE === 'system' ? 'system' : 'process',
  },
  // How long a replaced server gets to finish in-flight requests (e.g. an upload) before it is killed
  shutdownGraceMs: Number(process.env.SHUTDOWN_GRACE_MS) || 60000,
  enableDebugRoutes: process.env.ENABLE_DEBUG_ROUTES === 'true',
  schedulerIntervalMs: Number(process.env.SCHEDULER_INTERVAL_MS) || 1000,
};
