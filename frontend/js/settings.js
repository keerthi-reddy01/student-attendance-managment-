'use strict';

(function initSettings() {
  const $ = (id) => document.getElementById(id);

  function paintThreshold(value) {
    $('thresholdValue').textContent = value;
    $('thresholdRange').style.setProperty('--range', `${value}%`);
  }

  function formatUptime(seconds) {
    const value = Number(seconds) || 0;
    if (value < 60) return `${value}s`;
    if (value < 3600) return `${Math.floor(value / 60)}m ${value % 60}s`;
    if (value < 86400) return `${Math.floor(value / 3600)}h ${Math.floor((value % 3600) / 60)}m`;
    return `${Math.floor(value / 86400)}d ${Math.floor((value % 86400) / 3600)}h`;
  }

  async function refreshHealth() {
    $('healthStatus').textContent = 'Checking…';
    try {
      const health = await App.api('/api/health');
      $('healthStatus').textContent = health.status === 'ok' ? 'Online' : 'Degraded';
      $('healthStatus').style.color = health.status === 'ok' ? 'var(--green)' : 'var(--amber)';
      $('healthDb').textContent = health.database ? 'Connected (SQLite)' : 'Unavailable';
      $('healthDb').style.color = health.database ? 'var(--green)' : 'var(--red)';
      $('healthVersion').textContent = `v${health.version}`;
      $('healthEnv').textContent = health.environment;
      $('healthUptime').textContent = formatUptime(health.uptimeSeconds);
      $('healthTime').textContent = new Date(health.timestamp).toLocaleTimeString('en-IN');
    } catch (error) {
      $('healthStatus').textContent = 'Offline';
      $('healthStatus').style.color = 'var(--red)';
      $('healthDb').textContent = 'Unknown';
      $('healthTime').textContent = new Date().toLocaleTimeString('en-IN');
      App.toast(error.message, 'error');
    }
  }

  async function loadSettings() {
    try {
      const settings = await App.api('/api/settings');
      $('thresholdRange').value = settings.threshold;
      paintThreshold(settings.threshold);
      $('institutionInput').value = settings.institution;
      $('settingsUpdated').textContent = 'Changes apply immediately after saving.';
    } catch (error) {
      App.toast(error.message, 'error');
    }
  }

  $('thresholdRange').addEventListener('input', (event) => {
    paintThreshold(Number(event.target.value));
    $('settingsUpdated').textContent = 'Unsaved changes.';
  });

  $('institutionInput').addEventListener('input', () => {
    $('settingsUpdated').textContent = 'Unsaved changes.';
  });

  $('settingsForm').addEventListener('submit', async (event) => {
    event.preventDefault();
    const threshold = Number($('thresholdRange').value);
    const institution = $('institutionInput').value.trim();
    if (!institution) {
      App.toast('Institution name is required.', 'warning');
      $('institutionInput').focus();
      return;
    }
    const button = $('saveSettingsBtn');
    App.setBusy(button, true, 'Saving…');
    try {
      const result = await App.api('/api/settings', {
        method: 'PUT',
        body: { threshold, institution },
      });
      paintThreshold(result.settings.threshold);
      $('settingsUpdated').textContent = `Saved at ${new Date().toLocaleTimeString('en-IN')}.`;
      App.toast('Settings saved.');
    } catch (error) {
      App.toast(error.message, 'error');
    } finally {
      App.setBusy(button, false);
    }
  });

  $('refreshHealthBtn').addEventListener('click', refreshHealth);

  loadSettings();
  refreshHealth();
  setInterval(refreshHealth, 60_000);
})();
