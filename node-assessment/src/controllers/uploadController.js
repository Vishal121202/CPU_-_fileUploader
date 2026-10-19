const fs = require('fs/promises');
const path = require('path');
const runWorker = require('../services/workerRunner');
const config = require('../config');

const WORKER_SCRIPT = path.join(__dirname, '..', 'workers', 'uploadWorker.js');

// POST /api/upload  (multipart/form-data, field "file")
async function uploadFile(req, res, next) {
  if (!req.file) return res.status(400).json({ message: 'Attach a .csv or .xlsx file in the "file" field' });
  try {
    console.log("file data pass in worker threads")
    const result = await runWorker(WORKER_SCRIPT, { filePath: req.file.path, mongoUri: config.mongoUri });
    res.status(201).json({ message: 'File imported', file: req.file.originalname, ...result });
  } catch (err) {
    next(err);
  } finally {
    //if we didnot want to store the file for further processing
    // fs.unlink(req.file.path).catch(() => {});
  }
}

module.exports = { uploadFile };
