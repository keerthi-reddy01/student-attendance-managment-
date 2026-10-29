'use strict';
const fs = require('node:fs');
const file = process.argv[2];
if (!file) {
  console.error('Usage: node scripts/strip-bom.js <file>');
  process.exit(2);
}
const buffer = fs.readFileSync(file);
let text = buffer.toString('utf8');
if (text.charCodeAt(0) === 0xfeff) text = text.slice(1);
fs.writeFileSync(file, text, 'utf8');
const after = fs.readFileSync(file);
console.log(file);
console.log('first bytes:', [...after.subarray(0, 8)].map((b) => b.toString(16).padStart(2, '0')).join(' '));
console.log('size:', after.length);
