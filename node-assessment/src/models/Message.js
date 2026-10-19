const { Schema, model } = require('mongoose');

// Where scheduled messages land once their day/time arrives.
const messageSchema = new Schema(
  {
    message: { type: String, required: true },
    scheduledFor: { type: Date, required: true },
    scheduleId: { type: Schema.Types.ObjectId, ref: 'ScheduledMessage', unique: true },
  },
  { timestamps: true }
);

module.exports = model('Message', messageSchema);
