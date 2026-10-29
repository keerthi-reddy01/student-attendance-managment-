'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const date = req.query.date || db.todayLocal();
  res.json(db.getDailyAttendance(date));
});

router.post('/bulk', (req, res) => {
  const { date, records } = req.body || {};
  const result = db.saveAttendance(date, records);
  res.json({ ...result, message: 'Attendance saved successfully.' });
});

router.delete('/:date', (req, res) => {
  const result = db.deleteAttendanceForDate(req.params.date);
  res.json({ ...result, message: 'Attendance for the selected date was cleared.' });
});

module.exports = router;
