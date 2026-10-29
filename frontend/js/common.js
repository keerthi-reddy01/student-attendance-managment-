'use strict';

(function () {
  const App = {};

  App.escapeHtml = function (value) {
    return String(value ?? '')
      .replaceAll('&', '&amp;')
      .replaceAll('<', '&lt;')
      .replaceAll('>', '&gt;')
      .replaceAll('"', '&quot;')
      .replaceAll("'", '&#39;');
  };

  App.api = async function (path, options = {}) {
    const config = {
      headers: { Accept: 'application/json', ...(options.headers || {}) },
      ...options,
    };
    if (config.body && typeof config.body !== 'string') {
      config.headers['Content-Type'] = 'application/json';
      config.body = JSON.stringify(config.body);
    }
    let response;
    try {
      response = await fetch(path, config);
    } catch {
      const error = new Error('Cannot reach the server. Check that the application is running.');
      error.code = 'NETWORK_ERROR';
      throw error;
    }
    const contentType = response.headers.get('content-type') || '';
    const payload = contentType.includes('application/json') ? await response.json() : await response.text();
    if (!response.ok) {
      const message = payload && payload.error && payload.error.message
        ? payload.error.message
        : `Request failed with status ${response.status}.`;
      const error = new Error(message);
      error.status = response.status;
      error.code = payload && payload.error ? payload.error.code : 'REQUEST_FAILED';
      error.details = payload && payload.error ? payload.error.details : undefined;
      throw error;
    }
    return payload;
  };

  App.debounce = function (fn, delay = 250) {
    let timer;
    return function debounced(...args) {
      clearTimeout(timer);
      timer = setTimeout(() => fn.apply(this, args), delay);
    };
  };

  App.todayISO = function () {
    const now = new Date();
    const shifted = new Date(now.getTime() - now.getTimezoneOffset() * 60_000);
    return shifted.toISOString().slice(0, 10);
  };

  App.addDays = function (dateString, days) {
    const date = new Date(`${dateString}T00:00:00`);
    date.setDate(date.getDate() + days);
    const shifted = new Date(date.getTime() - date.getTimezoneOffset() * 60_000);
    return shifted.toISOString().slice(0, 10);
  };

  App.formatDate = function (value, options = {}) {
    if (!value) return '—';
    const date = new Date(`${value}T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-IN', {
      weekday: 'short',
      day: 'numeric',
      month: 'short',
      year: 'numeric',
      ...options,
    }).format(date);
  };

  App.formatDateShort = function (value) {
    return App.formatDate(value, { weekday: undefined, year: undefined });
  };

  App.formatMonth = function (value) {
    if (!value) return '—';
    const date = new Date(`${value}-01T00:00:00`);
    if (Number.isNaN(date.getTime())) return value;
    return new Intl.DateTimeFormat('en-IN', { month: 'long', year: 'numeric' }).format(date);
  };

  App.formatNumber = function (value, digits = 1) {
    const number = Number(value);
    if (!Number.isFinite(number)) return '0';
    return new Intl.NumberFormat('en-IN', { maximumFractionDigits: digits }).format(number);
  };

  App.initials = function (name) {
    return String(name || '?')
      .trim()
      .split(/\s+/)
      .slice(0, 2)
      .map((part) => part[0] || '')
      .join('')
      .toUpperCase();
  };

  App.percentageClass = function (value, threshold = 75) {
    if (value >= threshold + 10) return 'green';
    if (value >= threshold) return 'amber';
    return 'red';
  };

  App.icon = function (name, className = '') {
    const paths = {
      plus: '<path d="M12 5v14M5 12h14"/>',
      search: '<circle cx="11" cy="11" r="7"/><path d="m20 20-3.2-3.2"/>',
      calendar: '<rect x="3" y="5" width="18" height="16" rx="2"/><path d="M16 3v4M8 3v4M3 11h18"/>',
      check: '<path d="m5 12 4 4L19 6"/>',
      x: '<path d="M18 6 6 18M6 6l12 12"/>',
      edit: '<path d="M12 20h9"/><path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L8 18l-4 1 1-4Z"/>',
      trash: '<path d="M3 6h18M8 6V4h8v2M19 6l-1 14H6L5 6M10 11v5M14 11v5"/>',
      download: '<path d="M12 3v12M7 10l5 5 5-5"/><path d="M5 21h14"/>',
      users: '<path d="M16 21v-2a4 4 0 0 0-4-4H6a4 4 0 0 0-4 4v2"/><circle cx="9" cy="7" r="4"/><path d="M22 21v-2a4 4 0 0 0-3-3.87M16 3.13a4 4 0 0 1 0 7.75"/>',
      chart: '<path d="M3 3v18h18"/><path d="M7 15v3M12 10v8M17 6v12"/>',
      clock: '<circle cx="12" cy="12" r="9"/><path d="M12 7v5l3 2"/>',
      alert: '<path d="M10.3 3.9 1.8 18a2 2 0 0 0 1.7 3h17a2 2 0 0 0 1.7-3L13.7 3.9a2 2 0 0 0-3.4 0Z"/><path d="M12 9v4M12 17h.01"/>',
      refresh: '<path d="M21 12a9 9 0 1 1-3-6.7L21 8"/><path d="M21 3v5h-5"/>',
      left: '<path d="m15 18-6-6 6-6"/>',
      right: '<path d="m9 18 6-6-6-6"/>',
      arrow: '<path d="M5 12h14M13 6l6 6-6 6"/>',
      home: '<path d="m3 10 9-7 9 7v9a2 2 0 0 1-2 2h-4v-6H9v6H5a2 2 0 0 1-2-2Z"/>',
      settings: '<circle cx="12" cy="12" r="3"/><path d="M19.4 15a1.7 1.7 0 0 0 .3 1.9l.1.1a2 2 0 1 1-2.8 2.8l-.1-.1a1.7 1.7 0 0 0-1.9-.3 1.7 1.7 0 0 0-1 1.5V21a2 2 0 1 1-4 0v-.1a1.7 1.7 0 0 0-1.1-1.5 1.7 1.7 0 0 0-1.9.3l-.1.1a2 2 0 1 1-2.8-2.8l.1-.1a1.7 1.7 0 0 0 .3-1.9 1.7 1.7 0 0 0-1.5-1H3a2 2 0 1 1 0-4h.1a1.7 1.7 0 0 0 1.5-1.1 1.7 1.7 0 0 0-.3-1.9l-.1-.1a2 2 0 1 1 2.8-2.8l.1.1a1.7 1.7 0 0 0 1.9.3H9a1.7 1.7 0 0 0 1-1.5V3a2 2 0 1 1 4 0v.1a1.7 1.7 0 0 0 1 1.5 1.7 1.7 0 0 0 1.9-.3l.1-.1a2 2 0 1 1 2.8 2.8l-.1.1a1.7 1.7 0 0 0-.3 1.9V9a1.7 1.7 0 0 0 1.5 1H21a2 2 0 1 1 0 4h-.1a1.7 1.7 0 0 0-1.5 1Z"/>',
      menu: '<path d="M4 6h16M4 12h16M4 18h16"/>',
      info: '<circle cx="12" cy="12" r="9"/><path d="M12 11v5M12 8h.01"/>',
      history: '<path d="M3 12a9 9 0 1 0 3-6.7L3 8"/><path d="M3 3v5h5M12 7v5l3 2"/>',
      clipboard: '<rect x="5" y="4" width="14" height="17" rx="2"/><path d="M9 4V3h6v1M9 9h6M9 13h6M9 17h4"/>',
      save: '<path d="M19 21H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h11l5 5v11a2 2 0 0 1-2 2Z"/><path d="M7 3v6h10V3M7 21v-7h10v7"/>',
      eye: '<path d="M2 12s3.5-7 10-7 10 7 10 7-3.5 7-10 7-10-7-10-7Z"/><circle cx="12" cy="12" r="3"/>',
      external: '<path d="M15 3h6v6M10 14 21 3"/><path d="M21 14v5a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V5a2 2 0 0 1 2-2h5"/>',
      server: '<rect x="3" y="4" width="18" height="7" rx="2"/><rect x="3" y="13" width="18" height="7" rx="2"/><path d="M7 7.5h.01M7 16.5h.01"/>',
      shield: '<path d="M12 22s8-4 8-10V5l-8-3-8 3v7c0 6 8 10 8 10Z"/>',
      spark: '<path d="m12 3 1.9 5.8L20 11l-6.1 2.2L12 19l-1.9-5.8L4 11l6.1-2.2Z"/>',
    };
    return `<svg class="${className}" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">${paths[name] || paths.info}</svg>`;
  };

  const toastStack = document.createElement('div');
  toastStack.className = 'toast-stack';
  toastStack.setAttribute('role', 'status');
  toastStack.setAttribute('aria-live', 'polite');
  document.addEventListener('DOMContentLoaded', () => document.body.appendChild(toastStack));

  App.toast = function (message, type = 'success', duration = 4200) {
    const icons = { success: 'check', error: 'alert', warning: 'alert', info: 'info' };
    const toast = document.createElement('div');
    toast.className = `toast ${type}`;
    toast.innerHTML = `${App.icon(icons[type] || 'info')}<div>${App.escapeHtml(message)}</div>`;
    toastStack.appendChild(toast);
    const remove = () => {
      toast.classList.add('toast-out');
      setTimeout(() => toast.remove(), 200);
    };
    toast.addEventListener('click', remove);
    setTimeout(remove, duration);
  };

  App.openModal = function (id) {
    const modal = typeof id === 'string' ? document.getElementById(id) : id;
    if (!modal) return;
    modal.classList.add('open');
    modal.setAttribute('aria-hidden', 'false');
    document.body.style.overflow = 'hidden';
    const focusable = modal.querySelector('input, select, textarea, button');
    if (focusable) setTimeout(() => focusable.focus(), 30);
  };

  App.closeModal = function (id) {
    const modal = typeof id === 'string' ? document.getElementById(id) : id;
    if (!modal) return;
    modal.classList.remove('open');
    modal.setAttribute('aria-hidden', 'true');
    if (!document.querySelector('.modal.open')) document.body.style.overflow = '';
  };

  App.setBusy = function (button, busy, busyLabel = 'Please wait…') {
    if (!button) return;
    if (busy) {
      button.dataset.originalHtml = button.innerHTML;
      button.disabled = true;
      button.innerHTML = `<span class="spinner"></span>${App.escapeHtml(busyLabel)}`;
    } else {
      button.disabled = false;
      if (button.dataset.originalHtml) button.innerHTML = button.dataset.originalHtml;
    }
  };

  App.setActiveNav = function () {
    const page = document.body.dataset.page;
    document.querySelectorAll('.nav-link').forEach((link) => {
      link.classList.toggle('active', link.dataset.nav === page);
      if (link.dataset.nav === page) link.setAttribute('aria-current', 'page');
    });
  };

  App.initShell = function () {
    App.setActiveNav();

    const sidebar = document.getElementById('sidebar');
    const overlay = document.getElementById('sidebarOverlay');
    const menuButton = document.getElementById('menuBtn');
    const closeSidebar = () => {
      sidebar?.classList.remove('open');
      overlay?.classList.remove('open');
      document.body.style.overflow = '';
    };
    menuButton?.addEventListener('click', () => {
      sidebar?.classList.add('open');
      overlay?.classList.add('open');
      document.body.style.overflow = 'hidden';
    });
    overlay?.addEventListener('click', closeSidebar);
    sidebar?.querySelectorAll('.nav-link').forEach((link) => link.addEventListener('click', closeSidebar));

    document.querySelectorAll('[data-today]').forEach((element) => {
      element.textContent = App.formatDate(App.todayISO());
    });

    document.querySelectorAll('[data-year]').forEach((element) => {
      element.textContent = new Date().getFullYear();
    });

    document.addEventListener('click', (event) => {
      const closer = event.target.closest('[data-close-modal]');
      if (closer) {
        App.closeModal(closer.closest('.modal'));
      }
      if (event.target.classList.contains('modal')) {
        App.closeModal(event.target);
      }
    });

    document.addEventListener('keydown', (event) => {
      if (event.key === 'Escape') {
        const open = document.querySelector('.modal.open');
        if (open) App.closeModal(open);
        closeSidebar();
      }
    });

    const statusText = document.querySelector('[data-api-status]');
    const statusDot = document.querySelector('[data-api-dot]');
    const checkHealth = async () => {
      try {
        const health = await App.api('/api/health');
        if (statusText) statusText.textContent = `API online · v${health.version}`;
        if (statusDot) statusDot.className = 'status-dot ok';
      } catch {
        if (statusText) statusText.textContent = 'API offline';
        if (statusDot) statusDot.className = 'status-dot bad';
      }
    };
    if (statusText) {
      checkHealth();
      setInterval(checkHealth, 60_000);
    }
  };

  window.App = App;
  document.addEventListener('DOMContentLoaded', App.initShell);
})();
