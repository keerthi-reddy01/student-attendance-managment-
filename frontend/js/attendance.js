'use strict';

(function initAttendance() {
  const $ = (id) => document.getElementById(id);
  const requestedDate = new URLSearchParams(window.location.search).get('date');
  const state = {
    date: /^\d{4}-\d{2}-\d{2}$/.test(requestedDate || '') ? requestedDate : App.todayISO(),
    students: [],
    dirty: false,
    hasSavedRecords: false,
    prefilled: false,
    loading: false,
  };

  const body = $('attendanceBody');
  const dateInput = $('attendanceDate');
  const saveStatus = $('saveStatus');
  const saveStatusText = $('saveStatusText');

  $('attendanceDate').value = state.date;

  function cellLabel(student, period, status) {
    const statusText = status || 'unmarked';
    return `Period ${period} for ${student.name}: ${statusText}. Click to change.`;
  }

  function rowCounts(student) {
    let present = 0;
    let absent = 0;
    for (let period = 1; period <= 7; period += 1) {
      if (student.periods[period] === 'present') present += 1;
      if (student.periods[period] === 'absent') absent += 1;
    }
    return { present, absent, unmarked: 7 - present - absent };
  }

  function totals() {
    const result = { present: 0, absent: 0, unmarked: 0 };
    for (const student of state.students) {
      const counts = rowCounts(student);
      result.present += counts.present;
      result.absent += counts.absent;
      result.unmarked += counts.unmarked;
    }
    return result;
  }

  function updateStatus() {
    const result = totals();
    $('attendanceSummary').textContent = `Present ${result.present} · Absent ${result.absent} · Unmarked ${result.unmarked}`;
    saveStatus.classList.toggle('clean', state.hasSavedRecords && !state.dirty);
    if (!state.students.length) {
      saveStatusText.textContent = 'No students to mark';
    } else if (state.dirty) {
      saveStatusText.textContent = 'Unsaved changes';
    } else if (state.hasSavedRecords) {
      saveStatusText.textContent = `Saved for ${App.formatDate(state.date)}`;
    } else {
      saveStatusText.textContent = 'Draft — pre-filled as present';
    }
  }

  function updateSummaries() {
    for (const student of state.students) {
      const row = body.querySelector(`tr[data-student-id="${student.id}"]`);
      if (!row) continue;
      const counts = rowCounts(student);
      const summary = row.querySelector('.row-summary');
      if (summary) summary.textContent = `P ${counts.present} · A ${counts.absent}`;
    }
    updateStatus();
  }

  function renderRows() {
    if (state.students.length === 0) {
      body.innerHTML = `
        <tr>
          <td colspan="9">
            <div class="empty-state">
              <div class="empty-icon">${App.icon('users')}</div>
              <h3>No students to mark</h3>
              <p>Add students to the class before recording attendance for this date.</p>
              <a class="btn btn-primary" href="students.html">Add students</a>
            </div>
          </td>
        </tr>`;
      document.querySelectorAll('.js-save, .js-mark-all').forEach((button) => { button.disabled = true; });
      $('clearDayBtn').disabled = true;
      updateStatus();
      return;
    }

    document.querySelectorAll('.js-save, .js-mark-all').forEach((button) => { button.disabled = state.loading; });
    $('clearDayBtn').disabled = state.loading;

    const rows = state.students.map((student) => {
      const counts = rowCounts(student);
      const cells = [];
      for (let period = 1; period <= 7; period += 1) {
        const status = student.periods[period] || '';
        const label = status === 'present' ? 'P' : status === 'absent' ? 'A' : '–';
        cells.push(`<td><button class="att-cell" type="button" data-student-id="${student.id}" data-period="${period}" data-status="${status}" aria-label="${App.escapeHtml(cellLabel(student, period, status))}" title="${App.escapeHtml(cellLabel(student, period, status))}">${label}</button></td>`);
      }
      return `
        <tr data-student-id="${student.id}">
          <td class="sticky-col">
            <div class="student-cell">
              <span class="avatar">${App.escapeHtml(App.initials(student.name))}</span>
              <div>
                <div class="student-name">${App.escapeHtml(student.name)}</div>
                <div class="student-meta">${App.escapeHtml(student.rollNo)} · ${App.escapeHtml(student.department)}</div>
              </div>
            </div>
          </td>
          ${cells.join('')}
          <td><span class="row-summary">P ${counts.present} · A ${counts.absent}</span></td>
        </tr>`;
    });
    body.innerHTML = rows.join('');
    updateStatus();
  }

  function setHint(type, icon, html) {
    const hint = $('attendanceHint');
    hint.className = `alert alert-${type}`;
    hint.innerHTML = `${App.icon(icon)}<span>${html}</span>`;
    $('attendanceHintWrap').style.display = '';
  }

  function hideHint() {
    $('attendanceHintWrap').style.display = 'none';
  }

  async function load(date, options = {}) {
    state.loading = true;
    dateInput.value = date;
    body.innerHTML = '<tr><td colspan="9"><div class="skeleton" style="height:46px;margin:8px"></div></td></tr>';
    saveStatusText.textContent = 'Loading register…';
    document.querySelectorAll('.js-save, .js-mark-all').forEach((button) => { button.disabled = true; });
    try {
      const data = await App.api(`/api/attendance?date=${encodeURIComponent(date)}`);
      state.date = date;
      state.students = data.students;
      state.hasSavedRecords = data.hasSavedRecords;
      state.prefilled = false;
      state.dirty = false;

      if (!data.hasSavedRecords && data.students.length > 0) {
        state.students = data.students.map((student) => ({
          ...student,
          periods: { 1: 'present', 2: 'present', 3: 'present', 4: 'present', 5: 'present', 6: 'present', 7: 'present' },
        }));
        state.prefilled = true;
      }

      state.loading = false;
      renderRows();

      if (!state.students.length) {
        setHint('info', 'info', 'No students are registered. <a href="students.html">Add students</a> to begin marking attendance.');
      } else if (state.prefilled) {
        setHint('info', 'info', `New day — all seven periods are pre-filled as <strong>Present</strong> for ${state.students.length} students. Toggle absentees, then click <strong>Save attendance</strong>.`);
      } else {
        setHint('success', 'check', `Showing saved attendance for <strong>${App.formatDate(date)}</strong>. Changes are stored only after you save.`);
      }
      if (options.justSaved) {
        setHint('success', 'check', `Attendance for <strong>${App.formatDate(date)}</strong> is saved. You can still correct any period and save again.`);
      }
      updateStatus();
    } catch (error) {
      state.loading = false;
      body.innerHTML = `
        <tr><td colspan="9">
          <div class="empty-state">
            <div class="empty-icon">${App.icon('alert')}</div>
            <h3>Could not load attendance</h3>
            <p>${App.escapeHtml(error.message)}</p>
            <button class="btn btn-secondary" type="button" onclick="location.reload()">Try again</button>
          </div>
        </td></tr>`;
      setHint('danger', 'alert', App.escapeHtml(error.message));
      App.toast(error.message, 'error');
    }
  }

  function applyToAll(status) {
    for (const student of state.students) {
      for (let period = 1; period <= 7; period += 1) student.periods[period] = status;
    }
    state.dirty = true;
    renderRows();
  }

  function applyToColumn(period, status) {
    for (const student of state.students) student.periods[period] = status;
    state.dirty = true;
    renderRows();
  }

  body.addEventListener('click', (event) => {
    const button = event.target.closest('.att-cell');
    if (!button) return;
    const studentId = Number(button.dataset.studentId);
    const period = Number(button.dataset.period);
    const student = state.students.find((item) => item.id === studentId);
    if (!student) return;
    const current = student.periods[period];
    const next = current === 'present' ? 'absent' : current === 'absent' ? null : 'present';
    student.periods[period] = next;
    state.dirty = true;
    button.dataset.status = next || '';
    button.textContent = next === 'present' ? 'P' : next === 'absent' ? 'A' : '–';
    const label = cellLabel(student, period, next);
    button.setAttribute('aria-label', label);
    button.title = label;
    updateSummaries();
  });

  $('attendanceTable').addEventListener('click', (event) => {
    const button = event.target.closest('[data-column-period]');
    if (!button) return;
    applyToColumn(Number(button.dataset.columnPeriod), button.dataset.columnStatus);
  });

  document.querySelectorAll('.js-mark-all').forEach((button) => {
    button.addEventListener('click', () => applyToAll(button.dataset.status));
  });

  async function saveAttendance() {
    if (state.loading) return;
    const records = state.students.map((student) => {
      const periods = {};
      for (let period = 1; period <= 7; period += 1) {
        if (student.periods[period]) periods[period] = student.periods[period];
      }
      return { studentId: student.id, periods };
    }).filter((record) => Object.keys(record.periods).length > 0);

    if (records.length === 0) {
      App.toast('Mark at least one period before saving.', 'warning');
      return;
    }
    const counts = totals();
    if (counts.unmarked > 0 && !window.confirm(`${counts.unmarked} period cell${counts.unmarked === 1 ? ' is' : 's are'} unmarked and will not be saved. Continue?`)) {
      return;
    }

    const buttons = [...document.querySelectorAll('.js-save')];
    buttons.forEach((button) => App.setBusy(button, true, 'Saving…'));
    try {
      const result = await App.api('/api/attendance/bulk', {
        method: 'POST',
        body: { date: state.date, records },
      });
      state.dirty = false;
      state.hasSavedRecords = true;
      App.toast(`Attendance saved — ${result.saved} period record${result.saved === 1 ? '' : 's'} stored for ${App.formatDate(state.date)}.`);
      await load(state.date, { justSaved: true });
    } catch (error) {
      App.toast(error.message, 'error');
      updateStatus();
    } finally {
      buttons.forEach((button) => App.setBusy(button, false));
    }
  }

  document.querySelectorAll('.js-save').forEach((button) => button.addEventListener('click', saveAttendance));

  function navigate(date) {
    if (state.dirty && !window.confirm('You have unsaved attendance changes. Discard them?')) {
      dateInput.value = state.date;
      return;
    }
    if (!date) return;
    load(date);
  }

  dateInput.addEventListener('change', () => {
    const next = dateInput.value;
    if (!next) {
      dateInput.value = state.date;
      return;
    }
    navigate(next);
  });

  $('prevDateBtn').addEventListener('click', () => navigate(App.addDays(state.date, -1)));
  $('nextDateBtn').addEventListener('click', () => navigate(App.addDays(state.date, 1)));
  $('todayBtn').addEventListener('click', () => navigate(App.todayISO()));

  $('clearDayBtn').addEventListener('click', async () => {
    if (!state.hasSavedRecords) {
      App.toast('There is no saved attendance to clear for this date.', 'info');
      return;
    }
    if (!window.confirm(`Delete all saved attendance for ${App.formatDate(state.date)}? This cannot be undone.`)) return;
    const button = $('clearDayBtn');
    App.setBusy(button, true, 'Clearing…');
    try {
      const result = await App.api(`/api/attendance/${encodeURIComponent(state.date)}`, { method: 'DELETE' });
      App.toast(`Cleared ${result.deleted} saved period record${result.deleted === 1 ? '' : 's'}.`);
      await load(state.date);
    } catch (error) {
      App.toast(error.message, 'error');
    } finally {
      App.setBusy(button, false);
    }
  });

  window.addEventListener('beforeunload', (event) => {
    if (state.dirty) {
      event.preventDefault();
      event.returnValue = '';
    }
  });

  load(state.date);

  window.__attendanceState = state;
})();
