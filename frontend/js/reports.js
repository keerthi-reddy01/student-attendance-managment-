'use strict';

(function initReports() {
  const $ = (id) => document.getElementById(id);
  const params = new URLSearchParams(window.location.search);
  const state = {
    month: /^\d{4}-\d{2}$/.test(params.get('month') || '') ? params.get('month') : App.todayISO().slice(0, 7),
    threshold: null,
    settings: null,
    report: null,
    lowOnly: params.get('low') === '1',
    pendingStudent: params.get('student'),
  };

  $('reportMonth').value = state.month;
  $('lowOnly').checked = state.lowOnly;

  function updateUrl() {
    const next = new URLSearchParams();
    next.set('month', state.month);
    next.set('threshold', state.threshold);
    if (state.lowOnly) next.set('low', '1');
    if (state.pendingStudent) next.set('student', state.pendingStudent);
    window.history.replaceState(null, '', `${window.location.pathname}?${next.toString()}`);
  }

  function statusBadge(student) {
    const map = {
      good: ['badge-success', 'On track'],
      warning: ['badge-warning', 'Watch'],
      critical: ['badge-danger', 'Below threshold'],
      'no-data': ['badge-neutral', 'No data'],
    };
    const [className, label] = map[student.status] || map['no-data'];
    return `<span class="badge ${className}">${label}</span>`;
  }

  function render() {
    const report = state.report;
    if (!report) return;
    const { summary, threshold } = report;
    $('summaryClassPct').textContent = summary.classPercentage.toFixed(1);
    $('summaryClassSub').textContent = `Average student ${summary.averageStudentPercentage.toFixed(1)}%`;
    $('summaryDays').textContent = App.formatNumber(report.workingDays, 0);
    $('summaryDaysSub').textContent = `${App.formatMonth(report.month)} · Mon–Fri records`;
    $('summaryPeriods').textContent = App.formatNumber(report.workingPeriods, 0);
    $('summaryPeriodsSub').textContent = `Across ${report.workingDays} working day${report.workingDays === 1 ? '' : 's'}`;
    $('summaryLow').textContent = App.formatNumber(summary.lowAttendanceCount, 0);
    $('summaryLowSub').textContent = `Below the ${threshold}% threshold`;

    $('reportTitle').textContent = `${App.formatMonth(report.month)} attendance`;
    $('reportSubtitle').textContent = `${summary.totalStudents} students · ${summary.totalPresent} present periods · ${summary.totalAbsent} absent periods`;
    $('reportBadge').textContent = `${summary.totalStudents} students`;
    $('reportFooter').textContent = `Class ${summary.classPercentage.toFixed(1)}% · ${summary.totalPresent} present · ${summary.totalAbsent} absent · ${summary.totalRecords} total periods`;
    $('reportThresholdNote').textContent = `Threshold: ${threshold}%`;

    const students = state.lowOnly
      ? report.students.filter((student) => student.belowThreshold)
      : report.students;

    if (students.length === 0) {
      $('reportBody').innerHTML = `
        <tr>
          <td colspan="9">
            <div class="empty-state" style="padding:34px 20px">
              <div class="empty-icon">${App.icon(state.lowOnly ? 'shield' : 'chart')}</div>
              <h3>${state.lowOnly ? 'No students below the threshold' : 'No students to report'}</h3>
              <p style="margin-bottom:0">${state.lowOnly ? `All students meet the ${threshold}% attendance requirement for ${App.formatMonth(report.month)}.` : 'Add students and mark attendance to generate a monthly report.'}</p>
            </div>
          </td>
        </tr>`;
      return;
    }

    $('reportBody').innerHTML = students.map((student) => {
      const progressClass = student.percentage >= threshold ? 'green' : student.percentage >= threshold - 10 ? 'amber' : 'red';
      return `
        <tr>
          <td>
            <div class="student-cell">
              <span class="avatar">${App.escapeHtml(App.initials(student.name))}</span>
              <div>
                <div class="student-name">${App.escapeHtml(student.name)}</div>
                <div class="student-meta">${student.total ? `${student.total} periods recorded` : 'No attendance yet'}</div>
              </div>
            </div>
          </td>
          <td><span class="roll-pill">${App.escapeHtml(student.rollNo)}</span></td>
          <td>${App.escapeHtml(student.department)}</td>
          <td class="mono">${student.present}</td>
          <td class="mono">${student.absent}</td>
          <td class="mono">${student.total}</td>
          <td>
            <div class="percent-cell">
              <div class="progress ${progressClass}"><span style="width:${student.percentage}%"></span></div>
              <strong>${student.total ? `${student.percentage.toFixed(1)}%` : '—'}</strong>
            </div>
          </td>
          <td>${statusBadge(student)}</td>
          <td style="text-align:right">
            <button class="btn btn-ghost btn-xs" type="button" data-detail="${student.id}">View</button>
          </td>
        </tr>`;
    }).join('');
  }

  async function openStudent(studentId) {
    $('detailTitle').textContent = 'Loading student…';
    $('detailSubtitle').textContent = '—';
    $('detailBody').innerHTML = '<div class="skeleton" style="height:150px"></div>';
    App.openModal('studentDetailModal');
    try {
      const data = await App.api(`/api/reports/student/${studentId}?month=${encodeURIComponent(state.month)}&threshold=${encodeURIComponent(state.threshold)}`);
      const { student, days, percentage, belowThreshold, present, absent, total } = data;
      $('detailTitle').textContent = student.name;
      $('detailSubtitle').textContent = `${student.rollNo} · ${student.department} · ${App.formatMonth(data.month)}`;
      const dayRows = [...days].reverse().map((day) => {
        const keys = [1, 2, 3, 4, 5, 6, 7].map((period) => {
          const status = day.periods[period];
          const className = status === 'present' ? 'p' : status === 'absent' ? 'a' : 'u';
          const label = status === 'present' ? 'P' : status === 'absent' ? 'A' : '–';
          return `<span class="mini-key ${className}">${label}</span>`;
        }).join('');
        return `<div class="day-row"><span class="day-date">${App.formatDateShort(day.date)}</span>${keys}<span class="day-pct">${day.total ? `${day.percentage.toFixed(1)}%` : '—'}</span></div>`;
      }).join('');

      $('detailBody').innerHTML = `
        <div class="detail-grid">
          <div class="detail-item"><div class="label">Attended</div><div class="value">${present}</div></div>
          <div class="detail-item"><div class="label">Absent</div><div class="value">${absent}</div></div>
          <div class="detail-item"><div class="label">Total periods</div><div class="value">${total}</div></div>
          <div class="detail-item"><div class="label">Attendance</div><div class="value">${total ? `${percentage.toFixed(1)}%` : '—'}</div></div>
        </div>
        ${total && belowThreshold ? `<div class="alert alert-danger" style="margin-top:16px">${App.icon('alert')}<span>This student is below the ${state.threshold}% attendance threshold by ${(state.threshold - percentage).toFixed(1)} percentage points.</span></div>` : ''}
        ${total ? `<div class="row-between" style="margin:20px 0 10px"><h3 style="margin:0">Daily register</h3><span class="small muted">${days.length} day${days.length === 1 ? '' : 's'} saved</span></div>
        <div class="day-head"><span>Date</span><span>P1</span><span>P2</span><span>P3</span><span>P4</span><span>P5</span><span>P6</span><span>P7</span><span>%</span></div>
        <div class="day-list">${dayRows}</div>` : `<div class="empty-state" style="padding:24px 10px"><div class="empty-icon">${App.icon('calendar')}</div><h3>No attendance this month</h3><p style="margin-bottom:0">Save attendance for this student to populate the report.</p></div>`}
      `;
    } catch (error) {
      $('detailTitle').textContent = 'Could not load student';
      $('detailSubtitle').textContent = '';
      $('detailBody').innerHTML = `<div class="alert alert-danger">${App.icon('alert')}<span>${App.escapeHtml(error.message)}</span></div>`;
      App.toast(error.message, 'error');
    }
  }

  async function generate({ saveThreshold = false } = {}) {
    const month = $('reportMonth').value || App.todayISO().slice(0, 7);
    const requested = Number($('thresholdInput').value);
    if (!Number.isFinite(requested) || requested < 0 || requested > 100) {
      App.toast('Threshold must be a number between 0 and 100.', 'warning');
      $('thresholdInput').focus();
      return;
    }
    const threshold = Math.round(requested * 10) / 10;
    const button = $('applyBtn');
    App.setBusy(button, true, 'Generating…');
    try {
      if (saveThreshold) {
        await App.api('/api/settings', { method: 'PUT', body: { threshold } });
        state.settings = { ...state.settings, threshold };
      }
      const report = await App.api(`/api/reports/monthly?month=${encodeURIComponent(month)}&threshold=${encodeURIComponent(threshold)}`);
      state.month = month;
      state.threshold = threshold;
      state.report = report;
      state.lowOnly = $('lowOnly').checked;
      updateUrl();
      render();
      if (saveThreshold) App.toast(`Report generated and threshold saved as ${threshold}%.`);
      if (state.pendingStudent) {
        const id = state.pendingStudent;
        state.pendingStudent = null;
        updateUrl();
        openStudent(id);
      }
    } catch (error) {
      App.toast(error.message, 'error');
    } finally {
      App.setBusy(button, false);
    }
  }

  $('applyBtn').addEventListener('click', () => generate({ saveThreshold: true }));
  $('printBtn').addEventListener('click', () => window.print());
  $('lowOnly').addEventListener('change', () => {
    state.lowOnly = $('lowOnly').checked;
    updateUrl();
    render();
  });

  $('resetFiltersBtn').addEventListener('click', async () => {
    try {
      const settings = await App.api('/api/settings');
      state.settings = settings;
      state.month = App.todayISO().slice(0, 7);
      $('reportMonth').value = state.month;
      $('thresholdInput').value = settings.threshold;
      $('lowOnly').checked = false;
      state.lowOnly = false;
      state.pendingStudent = null;
      await generate();
    } catch (error) {
      App.toast(error.message, 'error');
    }
  });

  $('exportBtn').addEventListener('click', () => {
    const link = document.createElement('a');
    link.href = `/api/reports/monthly.csv?month=${encodeURIComponent(state.month)}&threshold=${encodeURIComponent(state.threshold)}`;
    link.download = `attendance-${state.month}.csv`;
    document.body.appendChild(link);
    link.click();
    link.remove();
    App.toast('Monthly CSV export started.', 'success');
  });

  $('reportBody').addEventListener('click', (event) => {
    const button = event.target.closest('[data-detail]');
    if (!button) return;
    openStudent(Number(button.dataset.detail));
  });

  (async function boot() {
    try {
      state.settings = await App.api('/api/settings');
      const queryThreshold = Number(params.get('threshold'));
      state.threshold = Number.isFinite(queryThreshold) && queryThreshold >= 0 && queryThreshold <= 100
        ? queryThreshold
        : state.settings.threshold;
      $('thresholdInput').value = state.threshold;
      await generate();
    } catch (error) {
      App.toast(error.message, 'error');
      $('reportBody').innerHTML = `<tr><td colspan="9"><div class="empty-state"><div class="empty-icon">${App.icon('alert')}</div><h3>Could not load the report</h3><p>${App.escapeHtml(error.message)}</p></div></td></tr>`;
    }
  })();
})();
