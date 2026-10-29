'use strict';

const path = require('node:path');
const express = require('express');
const db = require('./db');
const studentsRouter = require('./routes/students');
const attendanceRouter = require('./routes/attendance');
const reportsRouter = require('./routes/reports');
const settingsRouter = require('./routes/settings');

const app = express();
const FRONTEND_DIR = path.join(__dirname, '..', 'frontend');

app.disable('x-powered-by');
app.set('trust proxy', 1);
app.use((req, res, next) => {
  res.setHeader('X-Content-Type-Options', 'nosniff');
  res.setHeader('X-Frame-Options', 'SAMEORIGIN');
  res.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
  res.setHeader('Permissions-Policy', 'geolocation=(), microphone=(), camera=()');
  next();
});
app.use(express.json({ limit: '1mb' }));

app.get('/api/health', (req, res) => {
  let database = false;
  try {
    database = db.healthCheck();
  } catch {
    database = false;
  }
  const healthy = database;
  res.status(healthy ? 200 : 503).json({
    status: healthy ? 'ok' : 'unhealthy',
    service: 'student-attendance-api',
    version: require('../package.json').version,
    environment: process.env.NODE_ENV || 'development',
    database,
    uptimeSeconds: Math.round(process.uptime()),
    timestamp: new Date().toISOString(),
  });
});

app.get('/api/dashboard', (req, res) => {
  res.json(db.getDashboard());
});

app.use('/api/students', studentsRouter);
app.use('/api/attendance', attendanceRouter);
app.use('/api/reports', reportsRouter);
app.use('/api/settings', settingsRouter);

app.use('/api', (req, res) => {
  res.status(404).json({
    error: { code: 'NOT_FOUND', message: `API route ${req.method} ${req.originalUrl} does not exist.` },
  });
});

app.use(express.static(FRONTEND_DIR, {
  extensions: ['html'],
  etag: true,
  maxAge: 0,
  setHeaders(res, filePath) {
    if (filePath.endsWith('.html')) {
      res.setHeader('Cache-Control', 'no-cache');
    }
  },
}));

app.get('/', (req, res) => {
  res.sendFile(path.join(FRONTEND_DIR, 'index.html'));
});

app.use((req, res) => {
  res.status(404).sendFile(path.join(FRONTEND_DIR, '404.html'));
});

// Express 5 forwards rejected async handlers here automatically.
app.use((error, req, res, next) => {
  if (res.headersSent) return next(error);
  if (error instanceof db.AppError) {
    return res.status(error.statusCode).json({
      error: { code: error.code, message: error.message, details: error.details },
    });
  }
  if (error instanceof SyntaxError && error.status === 400 && 'body' in error) {
    return res.status(400).json({
      error: { code: 'INVALID_JSON', message: 'Request body contains invalid JSON.' },
    });
  }
  console.error('[error]', error);
  return res.status(500).json({
    error: { code: 'INTERNAL_ERROR', message: 'An unexpected server error occurred.' },
  });
});

module.exports = app;
