'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  const students = db.listStudents({
    search: req.query.search || '',
    department: req.query.department || '',
  });
  res.json({
    students,
    count: students.length,
    departments: db.getDepartments(),
  });
});

router.get('/departments', (req, res) => {
  res.json({ departments: db.getDepartments() });
});

router.get('/:id', (req, res) => {
  const student = db.getStudent(req.params.id);
  if (!student) {
    return res.status(404).json({
      error: { code: 'STUDENT_NOT_FOUND', message: 'Student not found.' },
    });
  }
  return res.json({ student });
});

router.post('/', (req, res) => {
  const student = db.createStudent(req.body || {});
  res.status(201).json({ student, message: 'Student added successfully.' });
});

router.put('/:id', (req, res) => {
  const student = db.updateStudent(req.params.id, req.body || {});
  res.json({ student, message: 'Student updated successfully.' });
});

router.delete('/:id', (req, res) => {
  const student = db.deleteStudent(req.params.id);
  res.json({ student, message: `Student ${student.rollNo} was deleted.` });
});

module.exports = router;
