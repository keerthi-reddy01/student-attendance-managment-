'use strict';

const fs = require('node:fs');
const path = require('node:path');
const { DatabaseSync } = require('node:sqlite');

const DATA_DIR = path.resolve(process.env.DATA_DIR || path.join(__dirname, '..', 'data'));
fs.mkdirSync(DATA_DIR, { recursive: true });
const DB_FILE = path.join(DATA_DIR, 'attendance.db');

const db = new DatabaseSync(DB_FILE);
db.exec('PRAGMA journal_mode = WAL;');
db.exec('PRAGMA foreign_keys = ON;');
db.exec('PRAGMA busy_timeout = 5000;');

db.exec(`
  CREATE TABLE IF NOT EXISTS students (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    roll_no TEXT NOT NULL COLLATE NOCASE UNIQUE,
    name TEXT NOT NULL,
    department TEXT NOT NULL,
    created_at TEXT NOT NULL DEFAULT (datetime('now')),
    updated_at TEXT NOT NULL DEFAULT (datetime('now'))
  );

  CREATE TABLE IF NOT EXISTS attendance (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    student_id INTEGER NOT NULL REFERENCES students(id) ON DELETE CASCADE,
    date TEXT NOT NULL,
    period INTEGER NOT NULL CHECK (period BETWEEN 1 AND 7),
    status TEXT NOT NULL CHECK (status IN ('present', 'absent')),
    marked_at TEXT NOT NULL DEFAULT (datetime('now')),
    UNIQUE (student_id, date, period)
  );

  CREATE INDEX IF NOT EXISTS idx_attendance_date ON attendance(date);
  CREATE INDEX IF NOT EXISTS idx_attendance_student_date ON attendance(student_id, date);
  CREATE INDEX IF NOT EXISTS idx_students_department ON students(department);

  CREATE TABLE IF NOT EXISTS settings (
    key TEXT PRIMARY KEY,
    value TEXT NOT NULL
  );

  INSERT OR IGNORE INTO settings (key, value) VALUES ('threshold', '75');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('institution', 'Department of Computer Science');
  INSERT OR IGNORE INTO settings (key, value) VALUES ('seed_completed', '0');
`);

class AppError extends Error {
  constructor(statusCode, code, message, details) {
    super(message);
    this.name = 'AppError';
    this.statusCode = statusCode;
    this.code = code;
    this.details = details;
  }
}

function fail(statusCode, code, message, details) {
  throw new AppError(statusCode, code, message, details);
}

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

function isValidDate(value) {
  if (typeof value !== 'string' || !DATE_RE.test(value)) return false;
  const date = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(date.getTime()) && date.toISOString().slice(0, 10) === value;
}

function isValidMonth(value) {
  if (typeof value !== 'string' || !MONTH_RE.test(value)) return false;
  const [year, month] = value.split('-').map(Number);
  return year >= 2000 && year <= 2100 && month >= 1 && month <= 12;
}

function todayLocal(now = new Date()) {
  const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
  return shifted.toISOString().slice(0, 10);
}

function monthBounds(month) {
  if (!isValidMonth(month)) fail(400, 'INVALID_MONTH', 'Month must use the YYYY-MM format.');
  const [year, number] = month.split('-').map(Number);
  const lastDay = new Date(Date.UTC(year, number, 0)).getUTCDate();
  return { start: `${month}-01`, end: `${month}-${String(lastDay).padStart(2, '0')}` };
}

function addDays(dateString, days) {
  const date = new Date(`${dateString}T00:00:00Z`);
  date.setUTCDate(date.getUTCDate() + days);
  return date.toISOString().slice(0, 10);
}

function diffDays(from, to) {
  const start = new Date(`${from}T00:00:00Z`).getTime();
  const end = new Date(`${to}T00:00:00Z`).getTime();
  return Math.round((end - start) / 86_400_000);
}

function normalizeRollNo(value) {
  if (typeof value !== 'string') fail(400, 'INVALID_ROLL_NO', 'Roll number is required.');
  const rollNo = value.trim().toUpperCase();
  if (!/^[A-Z0-9][A-Z0-9._/-]{0,29}$/.test(rollNo)) {
    fail(400, 'INVALID_ROLL_NO', 'Roll number must be 1-30 characters using letters, numbers, ., _, / or -.');
  }
  return rollNo;
}

function normalizeName(value) {
  if (typeof value !== 'string') fail(400, 'INVALID_NAME', 'Student name is required.');
  const name = value.trim().replace(/\s+/g, ' ');
  if (name.length < 2 || name.length > 80 || !/[\p{L}]/u.test(name)) {
    fail(400, 'INVALID_NAME', 'Student name must be 2-80 characters and contain a letter.');
  }
  return name;
}

function normalizeDepartment(value) {
  if (typeof value !== 'string') fail(400, 'INVALID_DEPARTMENT', 'Department is required.');
  const department = value.trim().replace(/\s+/g, ' ');
  if (department.length < 2 || department.length > 60) {
    fail(400, 'INVALID_DEPARTMENT', 'Department must be 2-60 characters.');
  }
  return department;
}

function normalizeId(value, label = 'id') {
  const id = Number(value);
  if (!Number.isInteger(id) || id < 1) fail(400, 'INVALID_ID', `${label} must be a positive integer.`);
  return id;
}

function toStudent(row) {
  return {
    id: row.id,
    rollNo: row.roll_no,
    name: row.name,
    department: row.department,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
  };
}

function getSetting(key, fallback = null) {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(key);
  return row ? row.value : fallback;
}

function setSetting(key, value) {
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(key, String(value));
}

function getThreshold(override) {
  const raw = override === undefined || override === null || override === ''
    ? getSetting('threshold', '75')
    : override;
  const threshold = Number(raw);
  if (!Number.isFinite(threshold) || threshold < 0 || threshold > 100) {
    fail(400, 'INVALID_THRESHOLD', 'Attendance threshold must be a number between 0 and 100.');
  }
  return Math.round(threshold * 10) / 10;
}

function listStudents({ search = '', department = '' } = {}) {
  const conditions = [];
  const params = [];
  if (search && String(search).trim()) {
    conditions.push('(roll_no LIKE ? OR name LIKE ?)');
    const term = `%${String(search).trim()}%`;
    params.push(term, term);
  }
  if (department && String(department).trim()) {
    conditions.push('department = ?');
    params.push(String(department).trim());
  }
  const where = conditions.length ? `WHERE ${conditions.join(' AND ')}` : '';
  const rows = db.prepare(`SELECT * FROM students ${where} ORDER BY roll_no COLLATE NOCASE`).all(...params);
  return rows.map(toStudent);
}

function getStudent(id) {
  const row = db.prepare('SELECT * FROM students WHERE id = ?').get(normalizeId(id));
  return row ? toStudent(row) : null;
}

function createStudent(input) {
  const rollNo = normalizeRollNo(input?.rollNo);
  const name = normalizeName(input?.name);
  const department = normalizeDepartment(input?.department);
  const existing = db.prepare('SELECT id FROM students WHERE roll_no = ?').get(rollNo);
  if (existing) {
    fail(409, 'DUPLICATE_ROLL_NO', `Roll number ${rollNo} is already registered.`);
  }
  const result = db.prepare(
    'INSERT INTO students (roll_no, name, department) VALUES (?, ?, ?)'
  ).run(rollNo, name, department);
  return getStudent(Number(result.lastInsertRowid));
}

function updateStudent(id, input) {
  const studentId = normalizeId(id);
  const current = getStudent(studentId);
  if (!current) fail(404, 'STUDENT_NOT_FOUND', 'Student not found.');
  const rollNo = input?.rollNo === undefined ? current.rollNo : normalizeRollNo(input.rollNo);
  const name = input?.name === undefined ? current.name : normalizeName(input.name);
  const department = input?.department === undefined
    ? current.department
    : normalizeDepartment(input.department);
  const duplicate = db.prepare('SELECT id FROM students WHERE roll_no = ? AND id <> ?').get(rollNo, studentId);
  if (duplicate) {
    fail(409, 'DUPLICATE_ROLL_NO', `Roll number ${rollNo} is already registered by another student.`);
  }
  db.prepare(`
    UPDATE students
    SET roll_no = ?, name = ?, department = ?, updated_at = datetime('now')
    WHERE id = ?
  `).run(rollNo, name, department, studentId);
  return getStudent(studentId);
}

function deleteStudent(id) {
  const studentId = normalizeId(id);
  const student = getStudent(studentId);
  if (!student) fail(404, 'STUDENT_NOT_FOUND', 'Student not found.');
  db.prepare('DELETE FROM students WHERE id = ?').run(studentId);
  return student;
}

function getDepartments() {
  return db.prepare('SELECT DISTINCT department FROM students ORDER BY department COLLATE NOCASE')
    .all()
    .map((row) => row.department);
}

function emptyPeriods() {
  return { 1: null, 2: null, 3: null, 4: null, 5: null, 6: null, 7: null };
}

function getDailyAttendance(date) {
  if (!isValidDate(date)) fail(400, 'INVALID_DATE', 'Date must be a valid date in YYYY-MM-DD format.');
  const students = listStudents();
  const rows = db.prepare(
    'SELECT student_id, period, status FROM attendance WHERE date = ? ORDER BY student_id, period'
  ).all(date);
  const byStudent = new Map();
  for (const row of rows) {
    if (!byStudent.has(row.student_id)) byStudent.set(row.student_id, emptyPeriods());
    byStudent.get(row.student_id)[row.period] = row.status;
  }
  const summary = { present: 0, absent: 0, unmarked: 0, markedCells: 0, studentsMarked: 0 };
  const result = students.map((student) => {
    const periods = byStudent.get(student.id) || emptyPeriods();
    let present = 0;
    let absent = 0;
    for (let period = 1; period <= 7; period += 1) {
      if (periods[period] === 'present') present += 1;
      else if (periods[period] === 'absent') absent += 1;
    }
    const marked = present + absent;
    summary.present += present;
    summary.absent += absent;
    summary.unmarked += 7 - marked;
    summary.markedCells += marked;
    if (marked > 0) summary.studentsMarked += 1;
    return { ...student, periods, present, absent, unmarked: 7 - marked };
  });
  return {
    date,
    hasSavedRecords: rows.length > 0,
    students: result,
    summary,
  };
}

function saveAttendance(date, records) {
  if (!isValidDate(date)) fail(400, 'INVALID_DATE', 'Date must be a valid date in YYYY-MM-DD format.');
  if (!Array.isArray(records) || records.length === 0) {
    fail(400, 'INVALID_RECORDS', 'Attendance records must be a non-empty array.');
  }
  if (records.length > 1000) fail(400, 'INVALID_RECORDS', 'Too many attendance records in one request.');

  const seen = new Set();
  const prepared = [];
  for (const record of records) {
    const studentId = normalizeId(record?.studentId, 'studentId');
    if (seen.has(studentId)) {
      fail(400, 'DUPLICATE_STUDENT', `Student ${studentId} appears more than once in the request.`);
    }
    seen.add(studentId);
    if (!record.periods || typeof record.periods !== 'object' || Array.isArray(record.periods)) {
      fail(400, 'INVALID_PERIODS', 'Each record must include a periods object.');
    }
    const entries = [];
    for (const [key, status] of Object.entries(record.periods)) {
      const period = Number(key);
      if (!Number.isInteger(period) || period < 1 || period > 7) {
        fail(400, 'INVALID_PERIOD', 'Period must be an integer between 1 and 7.');
      }
      if (status === null || status === undefined || status === '') continue;
      if (status !== 'present' && status !== 'absent') {
        fail(400, 'INVALID_STATUS', 'Attendance status must be present or absent.');
      }
      entries.push({ period, status });
    }
    if (entries.length === 0) {
      fail(400, 'INVALID_PERIODS', 'At least one period must be marked for each student.');
    }
    prepared.push({ studentId, entries });
  }

  const idList = prepared.map((record) => record.studentId);
  const placeholders = idList.map(() => '?').join(',');
  const found = db.prepare(`SELECT id FROM students WHERE id IN (${placeholders})`).all(...idList);
  if (found.length !== idList.length) {
    const foundIds = new Set(found.map((row) => row.id));
    fail(400, 'UNKNOWN_STUDENT', 'One or more students do not exist.', {
      studentIds: idList.filter((id) => !foundIds.has(id)),
    });
  }

  const exists = db.prepare(
    'SELECT COUNT(*) AS count FROM attendance WHERE date = ? AND student_id = ? AND period = ?'
  );
  let inserted = 0;
  let updated = 0;
  const upsert = db.prepare(`
    INSERT INTO attendance (student_id, date, period, status)
    VALUES (?, ?, ?, ?)
    ON CONFLICT(student_id, date, period)
    DO UPDATE SET status = excluded.status, marked_at = datetime('now')
  `);

  db.exec('BEGIN IMMEDIATE');
  try {
    for (const record of prepared) {
      for (const entry of record.entries) {
        if (exists.get(date, record.studentId, entry.period).count > 0) updated += 1;
        else inserted += 1;
        upsert.run(record.studentId, date, entry.period, entry.status);
      }
    }
    db.exec('COMMIT');
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }

  return {
    date,
    saved: inserted + updated,
    inserted,
    updated,
    students: prepared.length,
    summary: getDailyAttendance(date).summary,
  };
}

function deleteAttendanceForDate(date) {
  if (!isValidDate(date)) fail(400, 'INVALID_DATE', 'Date must be a valid date in YYYY-MM-DD format.');
  const result = db.prepare('DELETE FROM attendance WHERE date = ?').run(date);
  return { date, deleted: Number(result.changes) };
}

function calculatePercentage(present, total) {
  if (!total) return 0;
  return Math.round((present / total) * 1000) / 10;
}

function getMonthlyReport(month, thresholdOverride) {
  const { start, end } = monthBounds(month);
  const threshold = getThreshold(thresholdOverride);
  const rows = db.prepare(`
    SELECT s.id, s.roll_no, s.name, s.department,
           COALESCE(SUM(CASE WHEN a.status = 'present' THEN 1 ELSE 0 END), 0) AS present,
           COALESCE(SUM(CASE WHEN a.status = 'absent' THEN 1 ELSE 0 END), 0) AS absent,
           COUNT(a.id) AS total
    FROM students s
    LEFT JOIN attendance a
      ON a.student_id = s.id AND a.date >= ? AND a.date <= ?
    GROUP BY s.id
    ORDER BY s.roll_no COLLATE NOCASE
  `).all(start, end);

  const slotRow = db.prepare(`
    SELECT COUNT(*) AS slots, COUNT(DISTINCT date) AS days
    FROM (SELECT DISTINCT date, period FROM attendance WHERE date >= ? AND date <= ?)
  `).get(start, end);

  const students = rows.map((row) => {
    const percentage = calculatePercentage(row.present, row.total);
    return {
      id: row.id,
      rollNo: row.roll_no,
      name: row.name,
      department: row.department,
      present: row.present,
      absent: row.absent,
      total: row.total,
      percentage,
      belowThreshold: row.total > 0 && percentage < threshold,
      status: row.total === 0 ? 'no-data' : percentage < threshold ? 'critical' : percentage < threshold + 10 ? 'warning' : 'good',
    };
  });

  const totalPresent = students.reduce((sum, student) => sum + student.present, 0);
  const totalAbsent = students.reduce((sum, student) => sum + student.absent, 0);
  const totalRecords = totalPresent + totalAbsent;
  const withData = students.filter((student) => student.total > 0);
  const averageStudentPercentage = withData.length
    ? Math.round((withData.reduce((sum, student) => sum + student.percentage, 0) / withData.length) * 10) / 10
    : 0;

  return {
    month,
    threshold,
    start,
    end,
    workingDays: slotRow.days,
    workingPeriods: slotRow.slots,
    students,
    summary: {
      totalStudents: students.length,
      totalPresent,
      totalAbsent,
      totalRecords,
      classPercentage: calculatePercentage(totalPresent, totalRecords),
      averageStudentPercentage,
      lowAttendanceCount: students.filter((student) => student.belowThreshold).length,
      studentsWithData: withData.length,
    },
  };
}

function getStudentMonthlyDetail(studentId, month, thresholdOverride) {
  const id = normalizeId(studentId);
  const student = getStudent(id);
  if (!student) fail(404, 'STUDENT_NOT_FOUND', 'Student not found.');
  const { start, end } = monthBounds(month);
  const threshold = getThreshold(thresholdOverride);
  const rows = db.prepare(`
    SELECT date, period, status
    FROM attendance
    WHERE student_id = ? AND date >= ? AND date <= ?
    ORDER BY date, period
  `).all(id, start, end);

  const byDate = new Map();
  for (const row of rows) {
    if (!byDate.has(row.date)) byDate.set(row.date, emptyPeriods());
    byDate.get(row.date)[row.period] = row.status;
  }
  const days = [...byDate.entries()].map(([date, periods]) => {
    const values = Object.values(periods).filter(Boolean);
    const present = values.filter((status) => status === 'present').length;
    const absent = values.filter((status) => status === 'absent').length;
    return {
      date,
      periods,
      present,
      absent,
      total: present + absent,
      percentage: calculatePercentage(present, present + absent),
    };
  });

  const present = days.reduce((sum, day) => sum + day.present, 0);
  const absent = days.reduce((sum, day) => sum + day.absent, 0);
  const total = present + absent;
  const percentage = calculatePercentage(present, total);
  return {
    month,
    threshold,
    student,
    days,
    present,
    absent,
    total,
    percentage,
    belowThreshold: total > 0 && percentage < threshold,
  };
}

function getHistory({ from, to, studentId } = {}) {
  if (!isValidDate(from) || !isValidDate(to)) {
    fail(400, 'INVALID_DATE_RANGE', 'From and to dates must be valid YYYY-MM-DD dates.');
  }
  if (from > to) fail(400, 'INVALID_DATE_RANGE', 'From date must be on or before the to date.');
  if (diffDays(from, to) > 366) fail(400, 'INVALID_DATE_RANGE', 'Date range cannot exceed 366 days.');
  let student = null;
  let filter = '';
  const params = [from, to];
  if (studentId !== undefined && studentId !== null && studentId !== '') {
    const id = normalizeId(studentId);
    student = getStudent(id);
    if (!student) fail(404, 'STUDENT_NOT_FOUND', 'Student not found.');
    filter = ' AND student_id = ?';
    params.push(id);
  }
  const rows = db.prepare(`
    SELECT date,
           COUNT(*) AS total,
           SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present,
           SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent
    FROM attendance
    WHERE date >= ? AND date <= ?${filter}
    GROUP BY date
    ORDER BY date DESC
  `).all(...params);

  const days = rows.map((row) => ({
    date: row.date,
    total: row.total,
    present: row.present,
    absent: row.absent,
    percentage: calculatePercentage(row.present, row.total),
  }));
  return {
    from,
    to,
    student,
    days,
    summary: {
      days: days.length,
      present: days.reduce((sum, day) => sum + day.present, 0),
      absent: days.reduce((sum, day) => sum + day.absent, 0),
      total: days.reduce((sum, day) => sum + day.total, 0),
    },
  };
}

function getDashboard() {
  const today = todayLocal();
  const month = today.slice(0, 7);
  const totalStudents = db.prepare('SELECT COUNT(*) AS count FROM students').get().count;
  const departmentRow = db.prepare('SELECT COUNT(DISTINCT department) AS count FROM students').get();
  const todayRow = db.prepare(`
    SELECT COUNT(*) AS total,
           SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present,
           SUM(CASE WHEN status = 'absent' THEN 1 ELSE 0 END) AS absent,
           COUNT(DISTINCT student_id) AS students
    FROM attendance WHERE date = ?
  `).get(today);
  const monthReport = getMonthlyReport(month);
  const lowAttendance = monthReport.students
    .filter((student) => student.belowThreshold)
    .sort((a, b) => a.percentage - b.percentage)
    .slice(0, 6);

  const trendFrom = addDays(today, -6);
  const trendRows = db.prepare(`
    SELECT date,
           COUNT(*) AS marked,
           SUM(CASE WHEN status = 'present' THEN 1 ELSE 0 END) AS present
    FROM attendance
    WHERE date >= ? AND date <= ?
    GROUP BY date
    ORDER BY date
  `).all(trendFrom, today);
  const trendMap = new Map(trendRows.map((row) => [row.date, row]));
  const trend = [];
  for (let offset = -6; offset <= 0; offset += 1) {
    const date = addDays(today, offset);
    const row = trendMap.get(date);
    trend.push({
      date,
      marked: row ? row.marked : 0,
      present: row ? row.present : 0,
      percentage: row ? calculatePercentage(row.present, row.marked) : null,
    });
  }

  return {
    today,
    month,
    totalStudents,
    departments: departmentRow.count,
    threshold: monthReport.threshold,
    todayStats: {
      date: today,
      marked: todayRow.total || 0,
      present: todayRow.present || 0,
      absent: todayRow.absent || 0,
      studentsMarked: todayRow.students || 0,
      percentage: calculatePercentage(todayRow.present || 0, todayRow.total || 0),
      complete: totalStudents > 0 && todayRow.students === totalStudents && todayRow.total === totalStudents * 7,
    },
    monthStats: {
      workingDays: monthReport.workingDays,
      workingPeriods: monthReport.workingPeriods,
      classPercentage: monthReport.summary.classPercentage,
      lowAttendanceCount: monthReport.summary.lowAttendanceCount,
    },
    lowAttendance,
    trend,
  };
}

function getSettings() {
  return {
    threshold: getThreshold(),
    institution: getSetting('institution', 'Department of Computer Science'),
  };
}

function updateSettings(input) {
  const updated = {};
  if (input?.threshold !== undefined) {
    const threshold = getThreshold(input.threshold);
    setSetting('threshold', threshold);
    updated.threshold = threshold;
  }
  if (input?.institution !== undefined) {
    if (typeof input.institution !== 'string' || input.institution.trim().length < 2 || input.institution.trim().length > 120) {
      fail(400, 'INVALID_INSTITUTION', 'Institution name must be 2-120 characters.');
    }
    setSetting('institution', input.institution.trim());
    updated.institution = input.institution.trim();
  }
  if (Object.keys(updated).length === 0) {
    fail(400, 'NO_SETTINGS', 'Provide at least one setting to update.');
  }
  return getSettings();
}

function healthCheck() {
  const row = db.prepare('SELECT 1 AS ok').get();
  return row.ok === 1;
}

function hashIndex(seed, modulo) {
  let value = seed;
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value = Math.imul(value ^ (value >>> 16), 0x45d9f3b);
  value ^= value >>> 16;
  return Math.abs(value) % modulo;
}

function seedIfEmpty({ force = false } = {}) {
  const count = db.prepare('SELECT COUNT(*) AS count FROM students').get().count;
  const seeded = getSetting('seed_completed', '0') === '1';
  if (!force && (count > 0 || seeded)) return { seeded: false, reason: 'Database already contains data.' };

  const students = [
    ['CS001', 'Aarav Sharma', 'Computer Science'],
    ['CS002', 'Diya Patel', 'Computer Science'],
    ['CS003', 'Rohan Verma', 'Computer Science'],
    ['CS004', 'Ananya Iyer', 'Computer Science'],
    ['CS005', 'Kabir Singh', 'Computer Science'],
    ['CS006', 'Meera Nair', 'Computer Science'],
    ['CS007', 'Arjun Reddy', 'Computer Science'],
    ['CS008', 'Ishita Gupta', 'Computer Science'],
    ['CS009', 'Vivaan Joshi', 'Computer Science'],
    ['CS010', 'Saanvi Desai', 'Computer Science'],
    ['CS011', 'Aditya Kulkarni', 'Computer Science'],
    ['CS012', 'Nisha Rao', 'Computer Science'],
  ];
  const rates = [96, 93, 88, 71, 66, 91, 84, 58, 95, 77, 82, 69];

  const today = todayLocal();
  const currentMonthStart = `${today.slice(0, 7)}-01`;
  const previousMonthDate = new Date(`${currentMonthStart}T00:00:00Z`);
  previousMonthDate.setUTCMonth(previousMonthDate.getUTCMonth() - 1);
  const previousMonth = previousMonthDate.toISOString().slice(0, 7);
  const { start: previousStart, end: previousEnd } = monthBounds(previousMonth);

  const dates = [];
  for (let date = previousStart; date <= previousEnd; date = addDays(date, 1)) {
    if (![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())) dates.push(date);
  }
  for (let date = currentMonthStart; date <= today; date = addDays(date, 1)) {
    if (![0, 6].includes(new Date(`${date}T00:00:00Z`).getUTCDay())) dates.push(date);
  }

  const insertStudent = db.prepare('INSERT INTO students (roll_no, name, department) VALUES (?, ?, ?)');
  const insertAttendance = db.prepare(
    'INSERT INTO attendance (student_id, date, period, status) VALUES (?, ?, ?, ?)'
  );

  db.exec('BEGIN IMMEDIATE');
  try {
    if (force) {
      db.exec('DELETE FROM attendance; DELETE FROM students;');
    }
    const ids = students.map(([rollNo, name, department]) =>
      Number(insertStudent.run(rollNo, name, department).lastInsertRowid));
    let records = 0;
    dates.forEach((date, dayIndex) => {
      ids.forEach((studentId, studentIndex) => {
        for (let period = 1; period <= 7; period += 1) {
          const roll = hashIndex(studentIndex * 97 + dayIndex * 41 + period * 23 + date.replaceAll('-', '') * 1, 100);
          const status = roll < rates[studentIndex] ? 'present' : 'absent';
          insertAttendance.run(studentId, date, period, status);
          records += 1;
        }
      });
    });
    setSetting('seed_completed', '1');
    db.exec('COMMIT');
    return { seeded: true, students: ids.length, days: dates.length, records };
  } catch (error) {
    db.exec('ROLLBACK');
    throw error;
  }
}

function closeDatabase() {
  try {
    db.close();
  } catch {
    // Already closed.
  }
}

module.exports = {
  AppError,
  DB_FILE,
  DATA_DIR,
  addDays,
  closeDatabase,
  createStudent,
  deleteAttendanceForDate,
  deleteStudent,
  getDailyAttendance,
  getDashboard,
  getDepartments,
  getHistory,
  getMonthlyReport,
  getSettings,
  getStudent,
  getStudentMonthlyDetail,
  getThreshold,
  healthCheck,
  isValidDate,
  isValidMonth,
  listStudents,
  saveAttendance,
  seedIfEmpty,
  todayLocal,
  updateSettings,
  updateStudent,
  isTest: process.env.NODE_ENV === 'test',
};
