const { Schema, model } = require('mongoose');

// User's Account
const accountSchema = new Schema(
  {
    accountName: { type: String, required: true, trim: true },
    accountType: { type: String, trim: true }, // e.g. "Commercial", "Personal"
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
  },
  { timestamps: true }
);

accountSchema.index({ accountName: 1, userId: 1 }, { unique: true });

module.exports = model('Account', accountSchema);
