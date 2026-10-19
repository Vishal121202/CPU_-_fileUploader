const { Schema, model } = require('mongoose');

// Policy Carrier
const carrierSchema = new Schema(
  {
    companyName: { type: String, required: true, trim: true, unique: true },
  },
  { timestamps: true }
);

module.exports = model('Carrier', carrierSchema);
