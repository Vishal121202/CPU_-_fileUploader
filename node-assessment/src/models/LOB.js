const { Schema, model } = require('mongoose');

// Policy Category (Line of Business)
const lobSchema = new Schema(
  {
    categoryName: { type: String, required: true, trim: true, unique: true },
  },
  { timestamps: true }
);

module.exports = model('LOB', lobSchema, 'lobs');
