'use strict';

const { test, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const os = require('node:os');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const tempDir = fs.mkdtempSync(path.join(os.tmpdir(), 'attendance-api-test-'));
process.env.DATA_DIR = tempDir;
process.env.NODE_ENV = 'test';
process.env.SEED_ON_EMPTY = 'false';

const request = require('supertest');
const app = require('../backend/app');
const db = require('../backend/db');

const DAY_ONE = '2026-01-05';
const DAY_TWO = '2026-01-06';
const MONTH = '2026-01';

function allPresent() {
  return { 1: 'present', 2: 'present', 3: 'present', 4: 'present', 5: 'present', 6: 'present', 7: 'present' };
}

function allAbsent() {
  return { 1: 'absent', 2: 'absent', 3: 'absent', 4: 'absent', 5: 'absent', 6: 'absent', 7: 'absent' };
}

const ids = {};

after(() => {
  db.closeDatabase();
  fs.rmSync(tempDir, { recursive: true, force: true });
});

test('health endpoint reports a healthy SQLite database', async () => {
  const response = await request(app).get('/api/health').expect(200);
  assert.equal(response.body.status, 'ok');
  assert.equal(response.body.database, true);
  assert.equal(response.body.service, 'student-attendance-api');
});

test('dashboard starts empty when seeding is disabled', async () => {
  const response = await request(app).get('/api/dashboard').expect(200);
  assert.equal(response.body.totalStudents, 0);
  assert.equal(response.body.todayStats.marked, 0);
  assert.equal(response.body.lowAttendance.length, 0);
});

test('student CRUD validates input, enforces unique roll numbers and supports search', async () => {
  const alice = await request(app).post('/api/students').send({ rollNo: 'cs001', name: 'Alice Johnson', department: 'Computer Science' }).expect(201);
  ids.alice = alice.body.student.id;
  assert.equal(alice.body.student.rollNo, 'CS001');
  assert.equal(alice.body.student.name, 'Alice Johnson');

  const bob = await request(app).post('/api/students').send({ rollNo: 'CS002', name: 'Bob Martin', department: 'Computer Science' }).expect(201);
  ids.bob = bob.body.student.id;

  const carla = await request(app).post('/api/students').send({ rollNo: 'CS003', name: 'Carla Mendes', department: 'Information Technology' }).expect(201);
  ids.carla = carla.body.student.id;

  const duplicate = await request(app).post('/api/students').send({ rollNo: 'Cs001', name: 'Duplicate', department: 'Computer Science' }).expect(409);
  assert.equal(duplicate.body.error.code, 'DUPLICATE_ROLL_NO');

  await request(app).post('/api/students').send({ rollNo: 'CS004', name: 'A', department: 'Computer Science' }).expect(400);
  await request(app).post('/api/students').send({ name: 'No Roll', department: 'Computer Science' }).expect(400);
  await request(app).post('/api/students').send({ rollNo: 'CS005', name: 'No Department', department: '' }).expect(400);
  await request(app).post('/api/students').send({ rollNo: 'BAD ROLL!', name: 'Bad Roll', department: 'CSE' }).expect(400);

  const search = await request(app).get('/api/students?search=ali').expect(200);
  assert.equal(search.body.count, 1);
  assert.equal(search.body.students[0].rollNo, 'CS001');

  const department = await request(app).get('/api/students?department=Information%20Technology').expect(200);
  assert.equal(department.body.count, 1);
  assert.equal(department.body.students[0].rollNo, 'CS003');

  const update = await request(app).put(`/api/students/${ids.carla}`).send({ name: 'Carla Mendes Silva', department: 'Information Technology' }).expect(200);
  assert.equal(update.body.student.name, 'Carla Mendes Silva');
  assert.equal(update.body.student.rollNo, 'CS003');

  const conflict = await request(app).put(`/api/students/${ids.carla}`).send({ rollNo: 'CS001' }).expect(409);
  assert.equal(conflict.body.error.code, 'DUPLICATE_ROLL_NO');

  await request(app).get('/api/students/99999').expect(404);
  await request(app).put('/api/students/99999').send({ name: 'Ghost Student' }).expect(404);
});

test('daily attendance returns all students and seven unmarked periods', async () => {
  const response = await request(app).get(`/api/attendance?date=${DAY_ONE}`).expect(200);
  assert.equal(response.body.date, DAY_ONE);
  assert.equal(response.body.hasSavedRecords, false);
  assert.equal(response.body.students.length, 3);
  assert.deepEqual(response.body.students[0].periods, {
    1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null,
  });
  assert.equal(response.body.summary.unmarked, 21);

  const invalid = await request(app).get('/api/attendance?date=2026-02-30').expect(400);
  assert.equal(invalid.body.error.code, 'INVALID_DATE');
});

test('bulk save stores seven periods, upserts corrections and never duplicates rows', async () => {
  const records = [
    { studentId: ids.alice, periods: allPresent() },
    { studentId: ids.bob, periods: allAbsent() },
    { studentId: ids.carla, periods: { 1: 'present', 2: 'present', 3: 'present', 4: 'present', 5: 'absent', 6: 'absent', 7: 'absent' } },
  ];
  const saved = await request(app).post('/api/attendance/bulk').send({ date: DAY_ONE, records }).expect(200);
  assert.equal(saved.body.saved, 21);
  assert.equal(saved.body.inserted, 21);
  assert.equal(saved.body.updated, 0);
  assert.equal(saved.body.students, 3);

  const check = await request(app).get(`/api/attendance?date=${DAY_ONE}`).expect(200);
  assert.equal(check.body.hasSavedRecords, true);
  assert.equal(check.body.summary.present, 11);
  assert.equal(check.body.summary.absent, 10);
  assert.equal(check.body.summary.unmarked, 0);
  assert.equal(check.body.summary.studentsMarked, 3);

  const correction = [
    { studentId: ids.alice, periods: { 1: 'absent' } },
    { studentId: ids.bob, periods: allAbsent() },
    { studentId: ids.carla, periods: { 1: 'present', 2: 'present', 3: 'present', 4: 'present', 5: 'absent', 6: 'absent', 7: 'absent' } },
  ];
  const updated = await request(app).post('/api/attendance/bulk').send({ date: DAY_ONE, records: correction }).expect(200);
  assert.equal(updated.body.inserted, 0);
  assert.equal(updated.body.updated, 15);

  const afterCorrection = await request(app).get(`/api/attendance?date=${DAY_ONE}`).expect(200);
  const alice = afterCorrection.body.students.find((student) => student.id === ids.alice);
  assert.equal(alice.periods[1], 'absent');
  assert.equal(alice.periods[2], 'present');

  const raw = new DatabaseSync(db.DB_FILE);
  const count = raw.prepare('SELECT COUNT(*) AS count FROM attendance WHERE date = ?').get(DAY_ONE);
  raw.close();
  assert.equal(count.count, 21, 'unique student/date/period rows must be preserved');
});

test('attendance validation rejects malformed payloads and unknown students', async () => {
  const base = [{ studentId: ids.alice, periods: allPresent() }];
  const badPeriod = await request(app).post('/api/attendance/bulk').send({ date: DAY_ONE, records: [{ studentId: ids.alice, periods: { 8: 'present' } }] }).expect(400);
  assert.equal(badPeriod.body.error.code, 'INVALID_PERIOD');

  const badStatus = await request(app).post('/api/attendance/bulk').send({ date: DAY_ONE, records: [{ studentId: ids.alice, periods: { 1: 'maybe' } }] }).expect(400);
  assert.equal(badStatus.body.error.code, 'INVALID_STATUS');

  const unknown = await request(app).post('/api/attendance/bulk').send({ date: DAY_ONE, records: [{ studentId: 99999, periods: allPresent() }] }).expect(400);
  assert.equal(unknown.body.error.code, 'UNKNOWN_STUDENT');

  const duplicate = await request(app).post('/api/attendance/bulk').send({ date: DAY_ONE, records: [{ studentId: ids.alice, periods: allPresent() }, { studentId: ids.alice, periods: allAbsent() }] }).expect(400);
  assert.equal(duplicate.body.error.code, 'DUPLICATE_STUDENT');

  await request(app).post('/api/attendance/bulk').send({ date: '2026-02-30', records: base }).expect(400);
  await request(app).post('/api/attendance/bulk').send({ date: DAY_ONE, records: [] }).expect(400);
  await request(app).post('/api/attendance/bulk').send({ date: DAY_ONE, records: [{ studentId: ids.alice, periods: {} }] }).expect(400);
});

test('monthly report calculates totals, percentages, threshold flags and working slots', async () => {
  const dayTwo = [
    { studentId: ids.alice, periods: allPresent() },
    { studentId: ids.bob, periods: allAbsent() },
    { studentId: ids.carla, periods: allPresent() },
  ];
  await request(app).post('/api/attendance/bulk').send({ date: DAY_TWO, records: dayTwo }).expect(200);

  const report = await request(app).get(`/api/reports/monthly?month=${MONTH}&threshold=75`).expect(200);
  assert.equal(report.body.month, MONTH);
  assert.equal(report.body.workingDays, 2);
  assert.equal(report.body.workingPeriods, 14);
  assert.equal(report.body.summary.totalStudents, 3);
  assert.equal(report.body.summary.totalRecords, 42);
  assert.equal(report.body.summary.classPercentage, 57.1);
  assert.equal(report.body.summary.lowAttendanceCount, 1);

  const alice = report.body.students.find((student) => student.rollNo === 'CS001');
  const bob = report.body.students.find((student) => student.rollNo === 'CS002');
  const carla = report.body.students.find((student) => student.rollNo === 'CS003');
  assert.equal(alice.present, 13);
  assert.equal(alice.absent, 1);
  assert.equal(alice.total, 14);
  assert.equal(alice.percentage, 92.9);
  assert.equal(alice.belowThreshold, false);
  assert.equal(bob.percentage, 0);
  assert.equal(bob.belowThreshold, true);
  assert.equal(carla.present, 11);
  assert.equal(carla.absent, 3);
  assert.equal(carla.percentage, 78.6);

  const strict = await request(app).get(`/api/reports/monthly?month=${MONTH}&threshold=80`).expect(200);
  assert.equal(strict.body.summary.lowAttendanceCount, 2, 'Carla falls below an 80% threshold');
  assert.equal(strict.body.students.find((s) => s.rollNo === 'CS003').belowThreshold, true);

  await request(app).get('/api/reports/monthly?month=2026-13').expect(400);
  await request(app).get(`/api/reports/monthly?month=${MONTH}&threshold=101`).expect(400);

  const detail = await request(app).get(`/api/reports/student/${ids.carla}?month=${MONTH}`).expect(200);
  assert.equal(detail.body.student.rollNo, 'CS003');
  assert.equal(detail.body.present, 11);
  assert.equal(detail.body.total, 14);
  assert.equal(detail.body.percentage, 78.6);
  assert.equal(detail.body.days.length, 2);
  assert.equal(detail.body.days[0].date, DAY_ONE);
});

test('CSV export contains report metadata and every student row', async () => {
  const response = await request(app).get(`/api/reports/monthly.csv?month=${MONTH}&threshold=75`).expect(200);
  assert.match(response.headers['content-type'], /text\/csv/);
  assert.match(response.headers['content-disposition'], /attendance-2026-01\.csv/);
  const csv = response.text;
  assert.match(csv, /Student Attendance Monthly Report/);
  assert.match(csv, /CS001/);
  assert.match(csv, /Alice Johnson/);
  assert.match(csv, /92\.9/);
  assert.match(csv, /Below Threshold/);
  assert.match(csv, /Class Attendance %/);
});

test('history returns daily aggregates and validates date ranges', async () => {
  const history = await request(app).get(`/api/reports/history?from=${MONTH}-01&to=${MONTH}-31`).expect(200);
  assert.equal(history.body.days.length, 2);
  assert.equal(history.body.summary.present, 24);
  assert.equal(history.body.summary.absent, 18);
  assert.equal(history.body.summary.total, 42);

  const bobHistory = await request(app).get(`/api/reports/history?from=${MONTH}-01&to=${MONTH}-31&studentId=${ids.bob}`).expect(200);
  assert.equal(bobHistory.body.student.rollNo, 'CS002');
  assert.equal(bobHistory.body.summary.present, 0);
  assert.equal(bobHistory.body.summary.absent, 14);

  await request(app).get(`/api/reports/history?from=${MONTH}-31&to=${MONTH}-01`).expect(400);
  await request(app).get('/api/reports/history?from=2020-01-01&to=2026-01-01').expect(400);
  await request(app).get(`/api/reports/history?from=${MONTH}-01&to=${MONTH}-31&studentId=99999`).expect(404);
});

test('settings persist the threshold and institution name', async () => {
  const initial = await request(app).get('/api/settings').expect(200);
  assert.equal(initial.body.threshold, 75);
  assert.match(initial.body.institution, /Computer Science/);

  const updated = await request(app).put('/api/settings').send({ threshold: 80.5, institution: 'DevOps Institute' }).expect(200);
  assert.equal(updated.body.settings.threshold, 80.5);
  assert.equal(updated.body.settings.institution, 'DevOps Institute');

  await request(app).put('/api/settings').send({ threshold: -1 }).expect(400);
  await request(app).put('/api/settings').send({ threshold: 101 }).expect(400);
  await request(app).put('/api/settings').send({}).expect(400);

  const report = await request(app).get(`/api/reports/monthly?month=${MONTH}`).expect(200);
  assert.equal(report.body.threshold, 80.5);
  assert.equal(report.body.summary.lowAttendanceCount, 2);
});

test('deleting a student cascades attendance and removes report rows', async () => {
  const deleted = await request(app).delete(`/api/students/${ids.carla}`).expect(200);
  assert.equal(deleted.body.student.rollNo, 'CS003');
  await request(app).delete('/api/students/99999').expect(404);

  const report = await request(app).get(`/api/reports/monthly?month=${MONTH}`).expect(200);
  assert.equal(report.body.summary.totalStudents, 2);
  assert.equal(report.body.students.some((student) => student.rollNo === 'CS003'), false);

  const raw = new DatabaseSync(db.DB_FILE);
  const orphans = raw.prepare('SELECT COUNT(*) AS count FROM attendance WHERE student_id = ?').get(ids.carla);
  raw.close();
  assert.equal(orphans.count, 0);
});

test('daily attendance can be cleared without affecting other dates', async () => {
  const cleared = await request(app).delete(`/api/attendance/${DAY_TWO}`).expect(200);
  assert.equal(cleared.body.deleted, 14);

  const dayTwo = await request(app).get(`/api/attendance?date=${DAY_TWO}`).expect(200);
  assert.equal(dayTwo.body.hasSavedRecords, false);
  const dayOne = await request(app).get(`/api/attendance?date=${DAY_ONE}`).expect(200);
  assert.equal(dayOne.body.hasSavedRecords, true);
});

test('data is persisted to the SQLite file on disk', async () => {
  assert.equal(fs.existsSync(db.DB_FILE), true);
  const raw = new DatabaseSync(db.DB_FILE, { readOnly: true });
  const students = raw.prepare('SELECT COUNT(*) AS count FROM students').get();
  const attendance = raw.prepare('SELECT COUNT(*) AS count FROM attendance').get();
  const settings = raw.prepare("SELECT value FROM settings WHERE key = 'threshold'").get();
  raw.close();
  assert.equal(students.count, 2);
  assert.ok(attendance.count >= 14);
  assert.equal(settings.value, '80.5');
});

test('unknown API routes and malformed JSON return structured errors', async () => {
  const missing = await request(app).get('/api/does-not-exist').expect(404);
  assert.equal(missing.body.error.code, 'NOT_FOUND');

  const malformed = await request(app)
    .post('/api/students')
    .set('Content-Type', 'application/json')
    .send('{"rollNo":')
    .expect(400);
  assert.equal(malformed.body.error.code, 'INVALID_JSON');
});
