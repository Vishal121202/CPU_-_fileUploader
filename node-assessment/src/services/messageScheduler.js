const { ScheduledMessage, Message } = require('../models');

let timer = null;
let running = false;
let stopped = false;

// Claims due jobs one at a time (atomic status flip), so two app instances
// never insert the same message twice.
async function processDue() {
  if (running) return;
  running = true;
  try {
    for (;;) {
      const job = await ScheduledMessage.findOneAndUpdate(
        { status: 'pending', runAt: { $lte: new Date() } },
        { $set: { status: 'processing' } },
        { sort: { runAt: 1 }, new: true }
      );
      if (!job) break;
      try {
        // Upsert keyed by scheduleId keeps this idempotent if we crash mid-way.
        const msg = await Message.findOneAndUpdate(
          { scheduleId: job._id },
          { $setOnInsert: { message: job.message, scheduledFor: job.runAt, scheduleId: job._id } },
          { upsert: true, new: true }
        );
        job.status = 'done';
        job.insertedMessageId = msg._id;
      } catch (err) {
        job.status = 'failed';
        job.error = err.message;
      }
      await job.save();
    }
  } catch (err) {
    if (!stopped) console.error('[scheduler]', err.message);
  } finally {
    running = false;
  }
}

async function start(intervalMs) {
  // Jobs left "processing" by a crash or a CPU restart go back in the queue.
  await ScheduledMessage.updateMany({ status: 'processing' }, { $set: { status: 'pending' } });
  await processDue();
  timer = setInterval(processDue, intervalMs);
  timer.unref();
}

function stop() {
  stopped = true;
  clearInterval(timer);
}

module.exports = { start, stop, processDue };
