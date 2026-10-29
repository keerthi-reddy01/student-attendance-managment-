'use strict';

(function initHistory() {
  const $ = (id) => document.getElementById(id);
  const state = { threshold: 75 };

  $('fromDate').value = `${App.todayISO().slice(0, 7)}-01`;
  $('toDate').value = App.todayISO();

  function statusFor(percentage) {
    if (percentage >= state.threshold + 10) return '<span class="badge badge-success">On track</span>';
    if (percentage >= state.threshold) return '<span class="badge badge-warning">Watch</span>';
    return '<span class="badge badge-danger">Below threshold</span>';
  }

  function render(data) {
    const { summary, days, student } = data;
    const pct = summary.total ? Math.round((summary.present / summary.total) * 1000) / 10 : 0;
    $('historyDays').textContent = App.formatNumber(summary.days, 0);
    $('historyDaysSub').textContent = `${App.formatDateShort(data.from)} – ${App.formatDateShort(data.to)}`;
    $('historyPresent').textContent = App.formatNumber(summary.present, 0);
    $('historyPresentSub').textContent = `${summary.total} saved period records`;
    $('historyAbsent').textContent = App.formatNumber(summary.absent, 0);
    $('historyAbsentSub').textContent = summary.total ? `${(100 - pct).toFixed(1)}% of saved periods` : 'No saved periods';
    $('historyPct').textContent = summary.total ? pct.toFixed(1) : '0';
    $('historyPctSub').textContent = summary.total ? 'Across the selected range' : 'No data in range';
    $('historyRange').textContent = `${App.formatDateShort(data.from)} – ${App.formatDateShort(data.to)}`;
    $('historySubtitle').textContent = student
      ? `Attendance history for ${student.name} (${student.rollNo}).`
      : 'Days with saved attendance, most recent first.';
    $('historyBadge').textContent = `${days.length} day${days.length === 1 ? '' : 's'}`;
    $('historyFooter').textContent = `Showing ${days.length} day${days.length === 1 ? '' : 's'} with saved records.`;

    if (days.length === 0) {
      $('historyBody').innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state" style="padding:36px 20px">
              <div class="empty-icon">${App.icon('history')}</div>
              <h3>No attendance in this range</h3>
              <p style="margin-bottom:0">Try a different date range or open the attendance sheet to add records.</p>
            </div>
          </td>
        </tr>`;
      return;
    }

    $('historyBody').innerHTML = days.map((day) => {
      const date = new Date(`${day.date}T00:00:00`);
      const weekday = new Intl.DateTimeFormat('en-IN', { weekday: 'long' }).format(date);
      const progressClass = day.percentage >= state.threshold ? 'green' : day.percentage >= state.threshold - 10 ? 'amber' : 'red';
      return `
        <tr>
          <td><span class="student-name">${App.formatDateShort(day.date)}</span><div class="student-meta">${day.date}</div></td>
          <td>${weekday}</td>
          <td class="mono">${day.total}</td>
          <td class="mono">${day.present}</td>
          <td class="mono">${day.absent}</td>
          <td>
            <div class="percent-cell">
              <div class="progress ${progressClass}"><span style="width:${day.percentage}%"></span></div>
              <strong>${day.percentage.toFixed(1)}%</strong>
            </div>
          </td>
          <td>${statusFor(day.percentage)}</td>
          <td style="text-align:right"><a class="btn btn-ghost btn-xs" href="attendance.html?date=${day.date}">Open ${App.icon('arrow')}</a></td>
        </tr>`;
    }).join('');
  }

  async function loadHistory() {
    const from = $('fromDate').value;
    const to = $('toDate').value;
    const studentId = $('studentFilter').value;
    if (!from || !to) {
      App.toast('Choose both a from and to date.', 'warning');
      return;
    }
    if (from > to) {
      App.toast('The from date must be before the to date.', 'warning');
      return;
    }
    const button = $('applyHistoryBtn');
    App.setBusy(button, true, 'Loading…');
    try {
      const query = new URLSearchParams({ from, to });
      if (studentId) query.set('studentId', studentId);
      const data = await App.api(`/api/reports/history?${query.toString()}`);
      render(data);
    } catch (error) {
      App.toast(error.message, 'error');
      $('historyBody').innerHTML = `<tr><td colspan="8"><div class="empty-state" style="padding:30px"><div class="empty-icon">${App.icon('alert')}</div><h3>Could not load history</h3><p>${App.escapeHtml(error.message)}</p></div></td></tr>`;
    } finally {
      App.setBusy(button, false);
    }
  }

  async function boot() {
    try {
      const [settings, students] = await Promise.all([
        App.api('/api/settings'),
        App.api('/api/students'),
      ]);
      state.threshold = settings.threshold;
      $('studentFilter').innerHTML = '<option value="">Entire class</option>' + students.students.map((student) =>
        `<option value="${student.id}">${App.escapeHtml(student.name)} · ${App.escapeHtml(student.rollNo)}</option>`
      ).join('');
      await loadHistory();
    } catch (error) {
      App.toast(error.message, 'error');
    }
  }

  $('applyHistoryBtn').addEventListener('click', loadHistory);
  $('studentFilter').addEventListener('change', loadHistory);
  boot();
})();
