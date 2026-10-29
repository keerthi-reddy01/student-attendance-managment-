'use strict';

const db = require('./db');

const force = process.argv.includes('--force');
const result = db.seedIfEmpty({ force });
if (result.seeded) {
  console.log(`Seeded ${result.students} students, ${result.days} working days and ${result.records} attendance records.`);
} else {
  console.log(result.reason || 'Nothing to seed.');
}
db.closeDatabase();
