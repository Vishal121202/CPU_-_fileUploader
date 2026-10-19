const { Schema, model } = require('mongoose');

const agentSchema = new Schema(
  {
    agentName: { type: String, required: true, trim: true, unique: true },
  },
  { timestamps: true }
);

module.exports = model('Agent', agentSchema);
