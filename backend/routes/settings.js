'use strict';

const express = require('express');
const db = require('../db');

const router = express.Router();

router.get('/', (req, res) => {
  res.json(db.getSettings());
});

router.put('/', (req, res) => {
  const settings = db.updateSettings(req.body || {});
  res.json({ settings, message: 'Settings saved successfully.' });
});

module.exports = router;
