'use strict';

const app = require('./app');
const db = require('./db');

const PORT = Number(process.env.PORT || 3000);
const HOST = process.env.HOST || '0.0.0.0';

if (process.env.NODE_ENV !== 'test' && process.env.SEED_ON_EMPTY !== 'false') {
  try {
    const result = db.seedIfEmpty();
    if (result.seeded) {
      console.log(`[seed] Demo data ready: ${result.students} students, ${result.days} working days, ${result.records} attendance records.`);
    }
  } catch (error) {
    console.error('[seed] Failed to seed demo data:', error);
  }
}

const server = app.listen(PORT, HOST, () => {
  console.log('');
  console.log('  Student Attendance Management System');
  console.log('  ------------------------------------');
  console.log(`  URL      : http://localhost:${PORT}`);
  console.log(`  Health   : http://localhost:${PORT}/api/health`);
  console.log(`  Database : ${db.DB_FILE}`);
  console.log(`  Mode     : ${process.env.NODE_ENV || 'development'}`);
  console.log('');
  console.log('  Press Ctrl+C to stop the server.');
  console.log('');
});

server.on('error', (error) => {
  if (error.code === 'EADDRINUSE') {
    console.error(`[fatal] Port ${PORT} is already in use. Stop the other process or set a different PORT.`);
    process.exit(1);
  }
  throw error;
});

let shuttingDown = false;
function shutdown(signal) {
  if (shuttingDown) return;
  shuttingDown = true;
  console.log(`\n[shutdown] ${signal} received. Closing server...`);
  server.close(() => {
    db.closeDatabase();
    console.log('[shutdown] Server stopped cleanly.');
    process.exit(0);
  });
  setTimeout(() => {
    db.closeDatabase();
    process.exit(0);
  }, 5000).unref();
}

process.on('SIGINT', () => shutdown('SIGINT'));
process.on('SIGTERM', () => shutdown('SIGTERM'));
