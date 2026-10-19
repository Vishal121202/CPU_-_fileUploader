const os = require('os');

let lastUsage = process.cpuUsage();
let lastTime = process.hrtime.bigint();
let lastSystem = systemTimes();
let current = 0;

function systemTimes() {
  return os.cpus().reduce(
    (acc, c) => {
      const total = Object.values(c.times).reduce((a, b) => a + b, 0);
      return { idle: acc.idle + c.times.idle, total: acc.total + total };
    },
    { idle: 0, total: 0 }
  );
}

// CPU used by this Node process since the last sample, as a percent of one core
// (100% means the process kept a core fully busy; worker threads can push it higher).
function sampleProcess() {
  const usage = process.cpuUsage(lastUsage);
  const now = process.hrtime.bigint();
  const elapsedMicros = Number(now - lastTime) / 1000;
  lastUsage = process.cpuUsage();
  lastTime = now;
  return elapsedMicros > 0 ? ((usage.user + usage.system) / elapsedMicros) * 100 : 0;
}

// Whole-machine CPU usage across all cores since the last sample.
function sampleSystem() {
  const now = systemTimes();
  const idle = now.idle - lastSystem.idle;
  const total = now.total - lastSystem.total;
  lastSystem = now;
  return total > 0 ? (1 - idle / total) * 100 : 0;
}

/**
 * Samples CPU every intervalMs and calls onBreach once usage stays at or above
 * threshold for breachCount samples in a row (so a single spike doesn't restart us).
 * scope: "process" (default) measures this server; "system" measures the whole machine.
 */
function startCpuMonitor({ threshold, intervalMs, breachCount, scope = 'process', onBreach, onSample }) {
  const sample = scope === 'system' ? sampleSystem : sampleProcess;
  sample(); // reset the baseline
  let breaches = 0;
  let fired = false;
  let lastTick = Date.now();

  const timer = setInterval(() => {
    // If the event loop was blocked, this tick covers several intervals; count them all.
    const now = Date.now();
    const intervalsCovered = Math.max(1, Math.round((now - lastTick) / intervalMs));
    lastTick = now;

    current = Math.round(sample() * 10) / 10;
    onSample?.(current);
    breaches = current >= threshold ? breaches + intervalsCovered : 0;
    if (breaches >= breachCount && !fired) {
      fired = true;
      clearInterval(timer);
      onBreach(current);
    }
  }, intervalMs);
  timer.unref();
  return () => clearInterval(timer);
}

const currentCpu = () => current;

module.exports = { startCpuMonitor, currentCpu };
