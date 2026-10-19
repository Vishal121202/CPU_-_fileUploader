const { ScheduledMessage, Message } = require('../models');
const { resolveRunAt } = require('../utils/schedule');

// POST /api/messages/schedule  { message, day, time }
async function scheduleMessage(req, res, next) {
  const { message, day, time } = req.body || {};
  if (!message || !day || !time) {
    return res.status(400).json({ message: 'Body must include "message", "day" and "time"' });
  }
  let runAt;
  try {
    runAt = resolveRunAt(day, time);
  } catch (err) {
    return res.status(400).json({ message: err.message });
  }
  try {
    const job = await ScheduledMessage.create({ message, day, time, runAt });
    res.status(201).json({ message: 'Message scheduled', data: job });
  } catch (err) {
    next(err);
  }
}

// GET /api/messages/scheduled[?status=pending]
async function listScheduled(req, res, next) {
  try {
    const filter = req.query.status ? { status: req.query.status } : {};
    res.json({ data: await ScheduledMessage.find(filter).sort({ runAt: 1 }).lean() });
  } catch (err) {
    next(err);
  }
}

// GET /api/messages  (messages already inserted by the scheduler)
async function listMessages(req, res, next) {
  try {
    res.json({ data: await Message.find().sort({ scheduledFor: -1 }).lean() });
  } catch (err) {
    next(err);
  }
}

module.exports = { scheduleMessage, listScheduled, listMessages };
