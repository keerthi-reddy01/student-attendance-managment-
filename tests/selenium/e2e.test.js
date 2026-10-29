'use strict';

const { test, before, after } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { Builder, By, until } = require('selenium-webdriver');
const chrome = require('selenium-webdriver/chrome');

const BASE_URL = (process.env.SELENIUM_BASE_URL || 'http://127.0.0.1:3000').replace(/\/$/, '');
const SHOT_DIR = path.join(__dirname, '..', '..', 'reports', 'screenshots');
const STAMP = String(Date.now()).slice(-7);
const ROLL = `E2E${STAMP}`;
const NAME = `E2E Student ${STAMP}`;
const ATTENDANCE_DATE = '2026-12-15';
const REPORT_MONTH = '2026-12';
const CHROME_PATH = 'C:\\Program Files\\Google\\Chrome\\Application\\chrome.exe';

let driver;
const consoleErrors = [];

async function screenshot(name) {
  fs.mkdirSync(SHOT_DIR, { recursive: true });
  const image = await driver.takeScreenshot();
  fs.writeFileSync(path.join(SHOT_DIR, `${name}.png`), image, 'base64');
}

async function waitForText(selector, text, timeout = 15_000) {
  const element = await driver.wait(until.elementLocated(By.css(selector)), timeout);
  await driver.wait(async () => (await element.getText()).includes(text), timeout, `Timed out waiting for "${text}" in ${selector}`);
  return element;
}

async function dismissToasts() {
  await driver.executeScript('document.querySelectorAll(".toast").forEach((toast) => toast.remove());');
}

async function click(element) {
  await driver.executeScript('arguments[0].scrollIntoView({ block: "center", inline: "center" });', element);
  await new Promise((resolve) => setTimeout(resolve, 150));
  try {
    await element.click();
  } catch {
    await driver.executeScript('arguments[0].click();', element);
  }
}

before(async () => {
  const options = new chrome.Options();
  if (fs.existsSync(CHROME_PATH)) options.setChromeBinaryPath(CHROME_PATH);
  options.addArguments(
    '--headless=new',
    '--window-size=1440,1000',
    '--disable-gpu',
    '--no-sandbox',
    '--disable-dev-shm-usage',
    '--disable-features=PasswordLeakDetection,AutofillServerCommunication',
    '--disable-save-password-bubble',
    '--log-level=3'
  );
  driver = await new Builder().forBrowser('chrome').setChromeOptions(options).build();
  await driver.manage().setTimeouts({ implicit: 0, pageLoad: 30_000, script: 30_000 });
  await driver.manage().window().setRect({ width: 1440, height: 1000 });
});

after(async () => {
  if (driver) {
    try {
      await screenshot('99-final-state');
    } catch {
      // Ignore screenshot failures while closing.
    }
    await driver.quit();
  }
});

test('dashboard loads live metrics and navigation', async () => {
  await driver.get(`${BASE_URL}/index.html`);
  await driver.wait(until.elementLocated(By.id('statStudents')), 15_000);
  await driver.wait(async () => (await driver.findElement(By.id('statStudents')).getText()) !== '—', 15_000);
  assert.match(await driver.getTitle(), /Dashboard/);
  const active = await driver.findElement(By.css('.nav-link.active')).getText();
  assert.match(active, /Dashboard/);
  const students = Number(await driver.findElement(By.id('statStudents')).getText());
  assert.ok(students >= 0);
  await screenshot('01-dashboard');
});

test('student can be added through the management modal', async () => {
  await driver.get(`${BASE_URL}/students.html`);
  await driver.wait(until.elementLocated(By.id('addStudentBtn')), 15_000);
  await driver.findElement(By.id('addStudentBtn')).click();
  await driver.wait(until.elementIsVisible(await driver.findElement(By.id('studentModal'))), 10_000);

  await driver.findElement(By.id('rollNo')).sendKeys(ROLL);
  await driver.findElement(By.id('studentName')).sendKeys(NAME);
  const department = await driver.findElement(By.id('department'));
  await department.clear();
  await department.sendKeys('Computer Science');
  await screenshot('02-student-modal');
  await driver.findElement(By.id('saveStudentBtn')).click();

  await driver.wait(async () => {
    const className = await driver.findElement(By.id('studentModal')).getAttribute('class');
    return !className.includes('open');
  }, 10_000, 'Student modal should close after saving');

  const search = await driver.findElement(By.id('searchInput'));
  await search.sendKeys(ROLL);
  await driver.wait(async () => {
    const rows = await driver.findElements(By.css('#studentsBody tr'));
    if (rows.length !== 1) return false;
    const text = await rows[0].getText();
    return text.includes(ROLL);
  }, 15_000, 'Search should narrow the class list to the new student');
  const rowText = await driver.findElement(By.xpath(`//tbody[@id='studentsBody']/tr[contains(., '${ROLL}')]`)).getText();
  assert.match(rowText, new RegExp(NAME.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')));
  await screenshot('03-students');
});

test('seven-period attendance can be marked, corrected and survives reload', async () => {
  await driver.get(`${BASE_URL}/attendance.html?date=${ATTENDANCE_DATE}`);
  await driver.wait(until.elementLocated(By.css('#attendanceBody .att-cell')), 20_000);
  await driver.wait(async () => !(await driver.findElement(By.id('saveStatusText')).getText()).includes('Loading'), 20_000);

  await driver.findElement(By.css('.page-head-actions .js-mark-all[data-status="present"]')).click();
  const row = await driver.findElement(By.xpath(`//tbody[@id='attendanceBody']/tr[contains(., '${ROLL}')]`));
  const firstCell = await row.findElement(By.css('button[data-period="1"]'));
  assert.equal(await firstCell.getAttribute('data-status'), 'present', 'Mark all present should set Period 1');
  await click(firstCell);
  assert.equal(await firstCell.getAttribute('data-status'), 'absent', 'Clicking should cycle Present to Absent');
  await driver.executeScript('window.scrollTo(0, 0);');
  await screenshot('04-attendance');

  await click(await driver.findElement(By.css('.attendance-footer .js-save')));
  await waitForText('.toast', 'Attendance saved', 20_000);
  await driver.wait(async () => (await driver.findElement(By.id('saveStatusText')).getText()).startsWith('Saved for'), 20_000);

  await driver.get(`${BASE_URL}/attendance.html?date=${ATTENDANCE_DATE}`);
  await driver.wait(until.elementLocated(By.css('#attendanceBody .att-cell')), 20_000);
  await driver.wait(async () => (await driver.findElement(By.id('saveStatusText')).getText()).startsWith('Saved for'), 20_000, 'Saved register should reload from SQLite');
  const reloadedRow = await driver.findElement(By.xpath(`//tbody[@id='attendanceBody']/tr[contains(., '${ROLL}')]`));
  assert.equal(await (await reloadedRow.findElement(By.css('button[data-period="1"]'))).getAttribute('data-status'), 'absent');
  assert.equal(await (await reloadedRow.findElement(By.css('button[data-period="2"]'))).getAttribute('data-status'), 'present');
});

test('monthly report shows the saved student and opens day-wise details', async () => {
  await driver.get(`${BASE_URL}/reports.html?month=${REPORT_MONTH}&threshold=75`);
  await dismissToasts();
  await driver.wait(until.elementLocated(By.css('#reportBody tr')), 20_000);
  await driver.wait(async () => !(await driver.findElement(By.id('reportBody')).getText()).includes('Loading'), 20_000);
  const row = await driver.wait(
    until.elementLocated(By.xpath(`//tbody[@id='reportBody']/tr[contains(., '${ROLL}')]`)),
    20_000,
    'The monthly report should include the student created by the E2E test'
  );
  const text = await row.getText();
  assert.match(text, /%/);
  await screenshot('05-reports');

  await click(await row.findElement(By.css('[data-detail]')));
  await driver.wait(until.elementIsVisible(await driver.findElement(By.id('studentDetailModal'))), 10_000);
  await driver.wait(async () => (await driver.findElement(By.id('detailTitle')).getText()).includes(NAME), 15_000);
  const detail = await driver.findElement(By.id('detailBody')).getText();
  assert.match(detail, /Daily register/);
  assert.match(detail, /15 Dec/);
  assert.match(detail, /85\.7%/);
  await screenshot('06-student-report-detail');
  await driver.findElement(By.css('#studentDetailModal [data-close-modal]')).click();

  const response = await fetch(`${BASE_URL}/api/reports/monthly.csv?month=${REPORT_MONTH}&threshold=75`);
  assert.equal(response.status, 200);
  assert.match(response.headers.get('content-type'), /text\/csv/);
  const csv = await response.text();
  assert.match(csv, new RegExp(ROLL));
  assert.match(csv, /Class Attendance %/);
});

test('daily history filters a date range and opens the saved register', async () => {
  await driver.get(`${BASE_URL}/history.html`);
  await driver.wait(until.elementLocated(By.id('fromDate')), 15_000);
  await driver.executeScript(`
    const from = document.getElementById('fromDate');
    const to = document.getElementById('toDate');
    from.value = '2026-12-01';
    to.value = '2026-12-31';
    document.getElementById('applyHistoryBtn').click();
  `);
  await driver.wait(async () => {
    const text = await driver.findElement(By.id('historyBody')).getText();
    return text.includes('2026-12-15');
  }, 20_000, 'History should show the saved date');
  await screenshot('07-history');
});

test('settings persist the attendance threshold', async () => {
  await driver.get(`${BASE_URL}/settings.html`);
  await driver.wait(async () => (await driver.findElement(By.id('thresholdValue')).getText()) !== '', 15_000);
  const original = await driver.findElement(By.id('thresholdValue')).getText();
  await driver.executeScript(`
    const range = document.getElementById('thresholdRange');
    range.value = 80;
    range.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('settingsForm').requestSubmit();
  `);
  await waitForText('.toast', 'Settings saved', 20_000);
  await driver.navigate().refresh();
  await driver.wait(async () => (await driver.findElement(By.id('thresholdValue')).getText()) === '80', 20_000);
  await screenshot('08-settings');
  assert.notEqual(original, '');

  await driver.executeScript(`
    const range = document.getElementById('thresholdRange');
    range.value = 75;
    range.dispatchEvent(new Event('input', { bubbles: true }));
    document.getElementById('settingsForm').requestSubmit();
  `);
  await driver.wait(async () => (await driver.findElement(By.id('thresholdValue')).getText()) === '75', 20_000);
});

test('mobile navigation and layout remain usable', async () => {
  await driver.manage().window().setRect({ width: 390, height: 844 });
  await driver.get(`${BASE_URL}/index.html`);
  await driver.wait(until.elementLocated(By.id('menuBtn')), 15_000);
  await driver.findElement(By.id('menuBtn')).click();
  await driver.wait(async () => (await driver.findElement(By.id('sidebar')).getAttribute('class')).includes('open'), 10_000);
  await new Promise((resolve) => setTimeout(resolve, 450));
  await screenshot('09-mobile-navigation');
  await driver.manage().window().setRect({ width: 1440, height: 1000 });
});
