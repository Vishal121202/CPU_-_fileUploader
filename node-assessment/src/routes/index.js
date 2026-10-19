const express = require('express');
const multer = require('multer');
const path = require('path');
const os = require('os');
const { uploadFile } = require('../controllers/uploadController');
const { searchByUsername, aggregateByUser } = require('../controllers/policyController');
const { scheduleMessage, listScheduled, listMessages } = require('../controllers/messageController');
const { currentCpu } = require('../services/cpuMonitor');
const config = require('../config');

const router = express.Router();

const ALLOWED = ['.csv', '.xlsx', '.xls'];
const upload = multer({
  dest: path.join(__dirname, '..', '..', 'uploads'),
  limits: { fileSize: 50 * 1024 * 1024 }, //50 MB
  fileFilter: (req, file, cb) => {
    const ext = path.extname(file.originalname).toLowerCase();
    if (ALLOWED.includes(ext)) return cb(null, true);
    const err = new Error(`Only ${ALLOWED.join(', ')} files are accepted`);
    err.status = 400;
    cb(err);
  },
});

// multer's disk storage drops the extension; the worker needs it to tell CSV from XLSX.
const keepExtension = (req, res, next) => {
  if (!req.file) return next();
  console.log("request file data ",req.file)
  const target = `${req.file.path}${path.extname(req.file.originalname).toLowerCase()}`;
  console.log("complete file path",target)
  require('fs').rename(req.file.path, target, (err) => {
    if (err) return next(err);
    req.file.path = target;
    next();
  });
};

// Task 1
router.post('/upload', upload.single('file'), keepExtension, uploadFile);
router.get('/policies/search', searchByUsername);
router.get('/policies/aggregate', aggregateByUser);

// Task 2
router.post('/messages/schedule', scheduleMessage);
router.get('/messages/scheduled', listScheduled);
router.get('/messages', listMessages);

router.get('/health', (req, res) => {
  res.json({
    status: 'ok',
    pid: process.pid,
    uptimeSeconds: Math.round(process.uptime()),
    cpuPercent: currentCpu(),
    cpuThreshold: config.cpu.threshold,
    cpuScope: config.cpu.scope,
    cores: os.cpus().length,
  });
});

if (config.enableDebugRoutes) {
  // Keeps the event loop busy so CPU climbs past the threshold and the server restarts.
  router.get('/debug/cpu-burn', (req, res) => {
    const seconds = Math.min(60, Number(req.query.seconds) || 10);
    res.json({ message: `Burning CPU for ${seconds}s on pid ${process.pid}` });
    setImmediate(() => {
      const end = Date.now() + seconds * 1000;
      while (Date.now() < end); // eslint-disable-line no-empty
    });
  });
}

module.exports = router;
