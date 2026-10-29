'use strict';
const fs = require('node:fs');
const file = process.argv[2];
const buffer = fs.readFileSync(file);
console.log(file);
console.log('first bytes:', [...buffer.subarray(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join(' '));
