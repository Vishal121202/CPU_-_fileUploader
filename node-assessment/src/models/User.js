const { Schema, model } = require('mongoose');

const userSchema = new Schema(
  {
    firstName: { type: String, required: true, trim: true, index: true },
    dob: { type: Date },
    address: { type: String, trim: true },
    phoneNumber: { type: String, trim: true },
    state: { type: String, trim: true },
    zipCode: { type: String, trim: true },
    city: { type: String, trim: true },
    email: { type: String, trim: true, lowercase: true, unique: true, sparse: true },
    gender: { type: String, trim: true },
    userType: { type: String, trim: true },
  },
  { timestamps: true }
);

module.exports = model('User', userSchema);
