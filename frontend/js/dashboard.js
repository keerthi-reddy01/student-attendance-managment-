'use strict';

(async function initDashboard() {
  const $ = (id) => document.getElementById(id);

  try {
    const data = await App.api('/api/dashboard');
    const { todayStats, monthStats, totalStudents, threshold } = data;

    $('statStudents').textContent = App.formatNumber(totalStudents, 0);
    $('statStudentsSub').innerHTML = totalStudents
      ? `Across <strong>${data.departments}</strong> department${data.departments === 1 ? '' : 's'}`
      : 'No students registered yet';

    $('statToday').textContent = todayStats.marked ? todayStats.percentage.toFixed(1) : '0';
    $('statTodaySub').innerHTML = todayStats.marked
      ? `<strong>${todayStats.marked}</strong> of ${totalStudents * 7} periods marked`
      : 'No periods marked today';

    $('statMonth').textContent = monthStats.classPercentage.toFixed(1);
    $('statMonthSub').innerHTML = `<strong>${monthStats.workingDays}</strong> working day${monthStats.workingDays === 1 ? '' : 's'} this month`;

    $('statLow').textContent = App.formatNumber(monthStats.lowAttendanceCount, 0);
    $('statLowSub').textContent = `Below ${threshold}% attendance threshold`;
    $('thresholdLabel').textContent = `${threshold}%`;

    const marked = todayStats.marked || 0;
    const present = todayStats.present || 0;
    const absent = todayStats.absent || 0;
    const unmarked = Math.max(totalStudents * 7 - marked, 0);
    const todayPercentage = todayStats.percentage || 0;
    const donutColor = !marked ? '#cbd5e1' : todayPercentage >= threshold ? '#059669' : todayPercentage >= threshold - 10 ? '#d97706' : '#e11d48';

    $('todaySnapshotDate').textContent = App.formatDate(data.today);
    $('todayDonut').style.setProperty('--value', todayPercentage);
    $('todayDonut').style.setProperty('--color', donutColor);
    $('todayDonutValue').textContent = marked ? `${todayPercentage.toFixed(1)}%` : '—';
    $('legendPresent').textContent = App.formatNumber(present, 0);
    $('legendAbsent').textContent = App.formatNumber(absent, 0);
    $('legendUnmarked').textContent = App.formatNumber(unmarked, 0);
    $('legendStudents').textContent = `${todayStats.studentsMarked || 0} / ${totalStudents}`;

    const hint = $('todayHint');
    if (!totalStudents) {
      hint.className = 'alert alert-info';
      hint.innerHTML = `${App.icon('info')}<span>No students yet. <a href="students.html">Add your first student</a> to begin marking attendance.</span>`;
    } else if (!marked) {
      hint.className = 'alert alert-warning';
      hint.innerHTML = `${App.icon('clock')}<span>No attendance saved for today. <a href="attendance.html">Open the sheet</a> and mark the seven periods.</span>`;
    } else if (todayStats.complete) {
      hint.className = 'alert alert-success';
      hint.innerHTML = `${App.icon('check')}<span>Complete — all ${totalStudents} students have been marked for all seven periods today.</span>`;
    } else {
      hint.className = 'alert alert-info';
      hint.innerHTML = `${App.icon('info')}<span>${todayStats.studentsMarked} of ${totalStudents} students have saved attendance today. ${App.formatNumber(unmarked, 0)} period cells are still unmarked.</span>`;
    }

    $('monthWorkingDays').textContent = App.formatNumber(monthStats.workingDays, 0);
    $('monthWorkingPeriods').textContent = App.formatNumber(monthStats.workingPeriods, 0);

    const trend = $('trendChart');
    trend.innerHTML = data.trend.map((day) => {
      const date = new Date(`${day.date}T00:00:00`);
      const label = new Intl.DateTimeFormat('en-IN', { weekday: 'short' }).format(date);
      const value = day.percentage;
      const height = value === null ? 0 : Math.max(value, 3);
      const low = value !== null && value < threshold;
      return `
        <div class="trend-col" title="${App.escapeHtml(App.formatDate(day.date))}: ${value === null ? 'no records' : `${value.toFixed(1)}% (${day.present}/${day.marked})`}">
          <span class="trend-value">${value === null ? '—' : `${Math.round(value)}%`}</span>
          <div class="trend-bar-wrap">
            <div class="trend-bar ${low ? 'low' : ''} ${value === null ? 'none' : ''}" style="height:${height}%"></div>
          </div>
          <span class="trend-label">${label}</span>
        </div>`;
    }).join('');

    const body = $('lowTableBody');
    if (data.lowAttendance.length === 0) {
      body.innerHTML = `
        <tr>
          <td colspan="8">
            <div class="empty-state" style="padding:30px 20px">
              <div class="empty-icon">${App.icon('shield')}</div>
              <h3>${totalStudents ? 'Everyone is above the threshold' : 'No attendance data yet'}</h3>
              <p style="margin-bottom:0">${totalStudents ? `All students currently meet the ${threshold}% attendance requirement.` : 'Add students and start marking attendance to see insights here.'}</p>
            </div>
          </td>
        </tr>`;
    } else {
      body.innerHTML = data.lowAttendance.map((student) => `
        <tr>
          <td>
            <div class="student-cell">
              <span class="avatar">${App.escapeHtml(App.initials(student.name))}</span>
              <div>
                <div class="student-name">${App.escapeHtml(student.name)}</div>
                <div class="student-meta">${student.total} periods recorded</div>
              </div>
            </div>
          </td>
          <td><span class="roll-pill">${App.escapeHtml(student.rollNo)}</span></td>
          <td>${App.escapeHtml(student.department)}</td>
          <td class="mono">${student.present}</td>
          <td class="mono">${student.total}</td>
          <td>
            <div class="percent-cell">
              <div class="progress red"><span style="width:${student.percentage}%"></span></div>
              <strong>${student.percentage.toFixed(1)}%</strong>
            </div>
          </td>
          <td><span class="badge badge-danger">Below threshold</span></td>
          <td style="text-align:right"><a class="btn btn-ghost btn-xs" href="reports.html?month=${data.month}&student=${student.id}">View ${App.icon('arrow')}</a></td>
        </tr>`).join('');
    }

    $('lowSubtitle').textContent = `Below the ${threshold}% attendance threshold this month`;
    $('lowFooter').textContent = data.lowAttendance.length
      ? `Showing ${data.lowAttendance.length} of ${monthStats.lowAttendanceCount} students below threshold`
      : 'No students below threshold';
  } catch (error) {
    console.error(error);
    App.toast(error.message, 'error');
    $('statStudents').textContent = '—';
    $('statStudentsSub').textContent = 'Unable to load data';
    $('statToday').textContent = '—';
    $('statMonth').textContent = '—';
    $('statLow').textContent = '—';
    $('lowTableBody').innerHTML = `
      <tr><td colspan="8">
        <div class="empty-state" style="padding:30px 20px">
          <div class="empty-icon">${App.icon('alert')}</div>
          <h3>Could not load the dashboard</h3>
          <p>${App.escapeHtml(error.message)}</p>
          <button class="btn btn-secondary" onclick="location.reload()">Try again</button>
        </div>
      </td></tr>`;
  }
})();
