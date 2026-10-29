'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/monthly', (req, res) => {
  const month = req.query.month || db.todayLocal().slice(0, 7);
  const threshold = req.query.threshold === undefined ? undefined : req.query.threshold;
  res.json(db.getMonthlyReport(month, threshold));
});

router.get('/monthly.csv', (req, res) => {
  const month = req.query.month || db.todayLocal().slice(0, 7);
  const threshold = req.query.threshold === undefined ? undefined : req.query.threshold;
  const report = db.getMonthlyReport(month, threshold);
  const settings = db.getSettings();
  const escape = (value) => {
    const text = value === null || value === undefined ? '' : String(value);
    return /[",\r\n]/.test(text) ? `"${text.replaceAll('"', '""')}"` : text;
  };
  const rows = [
    ['Student Attendance Monthly Report'],
    ['Institution', settings.institution],
    ['Month', report.month],
    ['Threshold (%)', report.threshold],
    ['Working Days', report.workingDays],
    ['Working Periods', report.workingPeriods],
    ['Generated At', new Date().toISOString()],
    [],
    ['Roll No', 'Student Name', 'Department', 'Periods Attended', 'Periods Absent', 'Total Periods', 'Attendance %', 'Below Threshold', 'Status'],
    ...report.students.map((student) => [
      student.rollNo,
      student.name,
      student.department,
      student.present,
      student.absent,
      student.total,
      student.percentage.toFixed(1),
      student.belowThreshold ? 'YES' : 'NO',
      student.status,
    ]),
    [],
    ['Class Attendance %', report.summary.classPercentage.toFixed(1)],
    ['Average Student %', report.summary.averageStudentPercentage.toFixed(1)],
    ['Students Below Threshold', report.summary.lowAttendanceCount],
  ];
  const csv = `\uFEFF${rows.map((row) => row.map(escape).join(',')).join('\r\n')}\r\n`;
  res.setHeader('Content-Type', 'text/csv; charset=utf-8');
  res.setHeader('Content-Disposition', `attachment; filename="attendance-${report.month}.csv"`);
  res.send(csv);
});

router.get('/student/:id', (req, res) => {
  const month = req.query.month || db.todayLocal().slice(0, 7);
  const threshold = req.query.threshold === undefined ? undefined : req.query.threshold;
  res.json(db.getStudentMonthlyDetail(req.params.id, month, threshold));
});

router.get('/history', (req, res) => {
  res.json(db.getHistory({
    from: req.query.from || db.todayLocal().slice(0, 7) + '-01',
    to: req.query.to || db.todayLocal(),
    studentId: req.query.studentId,
  }));
});

module.exports = router;
