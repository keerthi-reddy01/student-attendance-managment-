'use strict';

(function initStudents() {
  const $ = (id) => document.getElementById(id);
  const state = {
    search: '',
    department: '',
    students: [],
    departments: [],
    editingId: null,
    deleteId: null,
  };

  const body = $('studentsBody');
  const form = $('studentForm');

  function formatRegistered(value) {
    if (!value) return '—';
    const date = new Date(`${String(value).replace(' ', 'T')}Z`);
    if (Number.isNaN(date.getTime())) return '—';
    return new Intl.DateTimeFormat('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }).format(date);
  }

  function renderDepartments() {
    const select = $('departmentFilter');
    const selected = state.department;
    select.innerHTML = '<option value="">All departments</option>' + state.departments.map((department) =>
      `<option value="${App.escapeHtml(department)}">${App.escapeHtml(department)}</option>`
    ).join('');
    select.value = selected;
  }

  function emptyState(title, message, action = '') {
    return `
      <tr>
        <td colspan="5">
          <div class="empty-state">
            <div class="empty-icon">${App.icon('users')}</div>
            <h3>${App.escapeHtml(title)}</h3>
            <p>${App.escapeHtml(message)}</p>
            ${action}
          </div>
        </td>
      </tr>`;
  }

  function render() {
    const filtered = state.search || state.department;
    $('studentCount').textContent = `${state.students.length} student${state.students.length === 1 ? '' : 's'}${filtered ? ' found' : ''}`;
    $('classListBadge').textContent = `${state.students.length} total`;
    $('classListSubtitle').textContent = filtered
      ? `Filtered results${state.search ? ` for “${state.search}”` : ''}${state.department ? ` · ${state.department}` : ''}`
      : 'All registered students';

    if (state.students.length === 0) {
      body.innerHTML = filtered
        ? emptyState('No matching students', 'Try a different name, roll number or department.', '<button class="btn btn-secondary" id="clearFiltersBtn">Clear filters</button>')
        : emptyState('No students registered', 'Add your first student to start marking seven-period attendance.', '<button class="btn btn-primary" id="emptyAddBtn">Add your first student</button>');
      $('studentsFooter').textContent = filtered ? 'No results for the current filters.' : '0 students in the class.';
      const clear = $('clearFiltersBtn');
      if (clear) clear.addEventListener('click', () => {
        state.search = '';
        state.department = '';
        $('searchInput').value = '';
        $('departmentFilter').value = '';
        load();
      });
      const emptyAdd = $('emptyAddBtn');
      if (emptyAdd) emptyAdd.addEventListener('click', openAddModal);
      return;
    }

    body.innerHTML = state.students.map((student) => `
      <tr>
        <td>
          <div class="student-cell">
            <span class="avatar">${App.escapeHtml(App.initials(student.name))}</span>
            <div>
              <div class="student-name">${App.escapeHtml(student.name)}</div>
              <div class="student-meta">ID #${student.id}</div>
            </div>
          </div>
        </td>
        <td><span class="roll-pill">${App.escapeHtml(student.rollNo)}</span></td>
        <td>${App.escapeHtml(student.department)}</td>
        <td class="small muted">${formatRegistered(student.createdAt)}</td>
        <td>
          <div class="cell-actions">
            <button class="mini-btn" type="button" data-edit="${student.id}" aria-label="Edit ${App.escapeHtml(student.name)}" title="Edit student">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/></svg>
            </button>
            <button class="mini-btn danger" type="button" data-delete="${student.id}" aria-label="Delete ${App.escapeHtml(student.name)}" title="Delete student">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/></svg>
            </button>
          </div>
        </td>
      </tr>`).join('');
    $('studentsFooter').textContent = `Showing ${state.students.length} student${state.students.length === 1 ? '' : 's'}${filtered ? ' matching the current filters' : ' in the class'}.`;
  }

  async function load() {
    try {
      const query = new URLSearchParams();
      if (state.search) query.set('search', state.search);
      if (state.department) query.set('department', state.department);
      const data = await App.api(`/api/students?${query.toString()}`);
      state.students = data.students;
      state.departments = data.departments;
      renderDepartments();
      render();
    } catch (error) {
      App.toast(error.message, 'error');
      body.innerHTML = emptyState('Could not load students', error.message, '<button class="btn btn-secondary" onclick="location.reload()">Try again</button>');
    }
  }

  function clearValidation() {
    form.querySelectorAll('[aria-invalid]').forEach((element) => element.removeAttribute('aria-invalid'));
  }

  function openAddModal() {
    state.editingId = null;
    form.reset();
    clearValidation();
    $('studentModalTitle').textContent = 'Add student';
    $('saveStudentBtn').textContent = 'Add student';
    $('formAlert').className = 'alert alert-info';
    $('formAlert').innerHTML = `${App.icon('info')}<span>Adding a student does not create attendance records until you mark their periods.</span>`;
    App.openModal('studentModal');
  }

  function openEditModal(id) {
    const student = state.students.find((item) => item.id === id);
    if (!student) return;
    state.editingId = id;
    clearValidation();
    $('studentId').value = student.id;
    $('rollNo').value = student.rollNo;
    $('studentName').value = student.name;
    $('department').value = student.department;
    $('studentModalTitle').textContent = 'Edit student';
    $('saveStudentBtn').textContent = 'Save changes';
    $('formAlert').className = 'alert alert-info';
    $('formAlert').innerHTML = `${App.icon('info')}<span>Changes apply to all existing attendance records for this student.</span>`;
    App.openModal('studentModal');
  }

  $('addStudentBtn').addEventListener('click', openAddModal);

  form.addEventListener('submit', async (event) => {
    event.preventDefault();
    clearValidation();

    const payload = {
      rollNo: $('rollNo').value.trim(),
      name: $('studentName').value.trim(),
      department: $('department').value.trim(),
    };
    let invalid = false;
    if (!payload.rollNo) { $('rollNo').setAttribute('aria-invalid', 'true'); invalid = true; }
    if (!payload.name) { $('studentName').setAttribute('aria-invalid', 'true'); invalid = true; }
    if (!payload.department) { $('department').setAttribute('aria-invalid', 'true'); invalid = true; }
    if (invalid) {
      App.toast('Please complete all required fields.', 'warning');
      return;
    }

    const button = $('saveStudentBtn');
    App.setBusy(button, true, state.editingId ? 'Saving…' : 'Adding…');
    try {
      if (state.editingId) {
        await App.api(`/api/students/${state.editingId}`, { method: 'PUT', body: payload });
        App.toast('Student updated successfully.');
      } else {
        await App.api('/api/students', { method: 'POST', body: payload });
        App.toast('Student added successfully.');
      }
      App.closeModal('studentModal');
      await load();
    } catch (error) {
      if (error.code === 'DUPLICATE_ROLL_NO') {
        $('rollNo').setAttribute('aria-invalid', 'true');
        $('rollNo').focus();
      }
      App.toast(error.message, 'error');
    } finally {
      App.setBusy(button, false);
    }
  });

  body.addEventListener('click', (event) => {
    const edit = event.target.closest('[data-edit]');
    if (edit) {
      openEditModal(Number(edit.dataset.edit));
      return;
    }
    const remove = event.target.closest('[data-delete]');
    if (remove) {
      const student = state.students.find((item) => item.id === Number(remove.dataset.delete));
      if (!student) return;
      state.deleteId = student.id;
      $('deleteStudentName').textContent = `${student.name} (${student.rollNo})`;
      App.openModal('deleteModal');
    }
  });

  $('confirmDeleteBtn').addEventListener('click', async () => {
    if (!state.deleteId) return;
    const button = $('confirmDeleteBtn');
    App.setBusy(button, true, 'Deleting…');
    try {
      await App.api(`/api/students/${state.deleteId}`, { method: 'DELETE' });
      App.toast('Student deleted.');
      App.closeModal('deleteModal');
      state.deleteId = null;
      await load();
    } catch (error) {
      App.toast(error.message, 'error');
    } finally {
      App.setBusy(button, false);
    }
  });

  $('searchInput').addEventListener('input', App.debounce((event) => {
    state.search = event.target.value.trim();
    load();
  }, 250));

  $('departmentFilter').addEventListener('change', (event) => {
    state.department = event.target.value;
    load();
  });

  load();
})();
