const mongoose = require('mongoose');

async function connectDB(uri) {
  await mongoose.connect(uri);
  return mongoose.connection;
}

module.exports = connectDB;
