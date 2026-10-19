const { Schema, model } = require('mongoose');

// A message waiting to be inserted into the Message collection at runAt.
// Persisted (not just a setTimeout) so pending jobs survive a CPU-triggered restart.
const scheduledMessageSchema = new Schema(
  {
    message: { type: String, required: true },
    day: { type: String, required: true },
    time: { type: String, required: true },
    runAt: { type: Date, required: true },
    status: { type: String, enum: ['pending', 'processing', 'done', 'failed'], default: 'pending' },
    insertedMessageId: { type: Schema.Types.ObjectId, ref: 'Message' },
    error: String,
  },
  { timestamps: true }
);

scheduledMessageSchema.index({ status: 1, runAt: 1 });

module.exports = model('ScheduledMessage', scheduledMessageSchema);
