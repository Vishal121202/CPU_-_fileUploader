const { Worker } = require('worker_threads');

// Runs a worker script and resolves with the result it posts back.
function runWorker(script, workerData) {
  return new Promise((resolve, reject) => {
    const worker = new Worker(script, { workerData });
    let settled = false;
    worker.once('message', (msg) => {
      settled = true;
      if (msg.ok) resolve(msg.result);
      else reject(new Error(msg.error));
    });
    worker.once('error', (err) => {
      settled = true;
      reject(err);
    });
    worker.once('exit', (code) => {
      if (!settled) reject(new Error(`Worker stopped with exit code ${code}`));
    });
  });
}

module.exports = runWorker;
