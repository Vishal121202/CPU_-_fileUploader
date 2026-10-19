// Supervisor (Task 2.1). Runs the API in a child process and replaces it when the
// child reports that its CPU usage crossed the threshold. The replacement is started
// and listening before the old one is stopped, so the port never goes dark.
const cluster = require('cluster');
const path = require('path');
const config = require('./config');

cluster.setupPrimary({ exec: path.join(__dirname, 'server.js') });

let active = null;
let restarting = false;
let restarts = 0;

function fork() {
  const worker = cluster.fork();
  worker.on('message', (msg) => {
    if (msg?.type === 'cpu-restart' && worker === active) restart(worker, msg.cpu);
  });
  return worker;
}

function restart(old, cpu) {
  if (restarting) return;
  restarting = true;
  restarts += 1;
  console.log(`[supervisor] pid ${old.process.pid} hit ${cpu}% CPU, starting replacement (restart #${restarts})`);
  const next = fork();
  next.once('exit', () => {
    if (active !== next) restarting = false; // replacement died before listening; old one keeps serving
  });
  next.once('listening', () => {
    active = next;
    restarting = false;
    old.send({ type: 'shutdown' });
    // The old process finishes its in-flight requests, then exits. Kill it only if
    // it is still around well after the grace period (e.g. stuck in a busy loop).
    setTimeout(() => !old.isDead() && old.process.kill('SIGKILL'), config.shutdownGraceMs + 5000).unref();
  });
}

cluster.on('exit', (worker, code, signal) => {
  if (worker !== active) return; // a replaced process finishing up
  console.log(`[supervisor] server ${worker.process.pid} exited (${signal || code}), starting a new one`);
  active = null;
  setTimeout(() => {
    active = fork();
  }, 1000);
});

active = fork();
console.log(`[supervisor] ${process.pid} started`);

const stopAll = () => {
  active = null;
  for (const w of Object.values(cluster.workers)) w.process.kill('SIGTERM');
  setTimeout(() => process.exit(0), 2000).unref();
};
process.on('SIGINT', stopAll);
process.on('SIGTERM', stopAll);
