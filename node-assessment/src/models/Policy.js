const { Schema, model } = require('mongoose');

// Policy Info
const policySchema = new Schema(
  {
    policyNumber: { type: String, required: true, trim: true, unique: true },
    policyStartDate: { type: Date },
    policyEndDate: { type: Date },
    policyMode: { type: Number }, // term in months, e.g. 6 or 12
    policyType: { type: String, trim: true },
    premiumAmount: { type: Number },
    premiumAmountWritten: { type: Number },
    producer: { type: String, trim: true },
    csr: { type: String, trim: true },
    policyCategoryId: { type: Schema.Types.ObjectId, ref: 'LOB', index: true },
    companyId: { type: Schema.Types.ObjectId, ref: 'Carrier', index: true },
    userId: { type: Schema.Types.ObjectId, ref: 'User', required: true, index: true },
    agentId: { type: Schema.Types.ObjectId, ref: 'Agent' },
  },
  { timestamps: true }
);

module.exports = model('Policy', policySchema);
