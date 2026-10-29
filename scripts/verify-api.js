'use strict';

const assert = require('node:assert/strict');

const BASE_URL = (process.env.BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');

async function getJson(path) {
  const response = await fetch(`${BASE_URL}${path}`);
  assert.equal(response.status, 200, `${path} returned HTTP ${response.status}`);
  return response.json();
}

async function main() {
  const health = await getJson('/api/health');
  assert.equal(health.status, 'ok');
  assert.equal(health.database, true);
  console.log('PASS  health endpoint and SQLite connection');

  const dashboard = await getJson('/api/dashboard');
  assert.ok(Number.isInteger(dashboard.totalStudents));
  assert.match(dashboard.month, /^\d{4}-\d{2}$/);
  assert.ok(Array.isArray(dashboard.lowAttendance));
  assert.ok(Array.isArray(dashboard.trend));
  console.log(`PASS  dashboard (${dashboard.totalStudents} students, ${dashboard.monthStats.workingPeriods} working periods)`);

  const settings = await getJson('/api/settings');
  assert.ok(Number.isFinite(settings.threshold));
  assert.ok(typeof settings.institution === 'string' && settings.institution.length > 1);
  console.log(`PASS  settings (threshold ${settings.threshold}%, ${settings.institution})`);

  const students = await getJson('/api/students');
  assert.ok(Array.isArray(students.students));
  assert.equal(students.count, students.students.length);
  console.log(`PASS  student list (${students.count} students)`);

  const report = await getJson(`/api/reports/monthly?month=${dashboard.month}&threshold=${settings.threshold}`);
  assert.equal(report.month, dashboard.month);
  assert.ok(Array.isArray(report.students));
  assert.ok(report.summary && Number.isFinite(report.summary.classPercentage));
  console.log(`PASS  monthly report (${report.students.length} rows, class ${report.summary.classPercentage}%)`);

  if (students.students.length > 0) {
    const first = students.students[0];
    const detail = await getJson(`/api/reports/student/${first.id}?month=${dashboard.month}`);
    assert.equal(detail.student.id, first.id);
    assert.ok(Array.isArray(detail.days));
    console.log(`PASS  student drill-down (${first.rollNo})`);
  }

  const history = await getJson(`/api/reports/history?from=${dashboard.month}-01&to=${dashboard.today}`);
  assert.ok(Array.isArray(history.days));
  console.log(`PASS  daily history (${history.days.length} days)`);

  const csvResponse = await fetch(`${BASE_URL}/api/reports/monthly.csv?month=${dashboard.month}&threshold=${settings.threshold}`);
  assert.equal(csvResponse.status, 200);
  assert.match(csvResponse.headers.get('content-type') || '', /text\/csv/);
  const csv = await csvResponse.text();
  assert.match(csv, /Class Attendance %/);
  assert.match(csv, /Student Name/);
  console.log('PASS  monthly CSV export');

  const page = await fetch(`${BASE_URL}/`);
  assert.equal(page.status, 200);
  const html = await page.text();
  assert.match(html, /AttendX/);
  console.log('PASS  frontend served by the same Express application');

  console.log('');
  console.log(`All live verification checks passed against ${BASE_URL}`);
}

main().catch((error) => {
  console.error('Verification failed:', error.message);
  process.exitCode = 1;
});
