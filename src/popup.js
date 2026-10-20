/*
 * YouTube Window Player - popup UI
 * Based on "Resize YT To Window Size" by Chris H (Zren / Shade), MIT licensed.
 */
(function () {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  const MESSAGE = Object.freeze({
    GET_STATE: 'ytw:get-state',
    SET_ENABLED: 'ytw:set-enabled',
    RELOAD_TAB: 'ytw:reload-tab'
  });

  const enabledInput = document.getElementById('enabled');
  const statusDot = document.getElementById('status-dot');
  const statusText = document.getElementById('status-text');
  const statusDetail = document.getElementById('status-detail');
  const reloadButton = document.getElementById('reload');
  const versionLabel = document.getElementById('version');

  let refreshInFlight = null;
  let toggleInFlight = false;

  function setStatus(tone, text, detail, showReload) {
    if (statusDot.dataset.status !== tone) statusDot.dataset.status = tone;
    if (statusText.textContent !== text) statusText.textContent = text;
    if (statusDetail.textContent !== detail) statusDetail.textContent = detail;
    if (reloadButton.hidden === showReload) reloadButton.hidden = !showReload;
  }

  function setToggle(value) {
    enabledInput.checked = value === true;
  }

  async function sendMessage(message) {
    return api.runtime.sendMessage(message);
  }

  function renderDisabled() {
    setStatus(
      'gray',
      'Disabled',
      'Turn it on to make YouTube videos fill the window.',
      false
    );
  }

  function renderResponse(response) {
    if (!response || response.ok !== true) {
      setStatus(
        'error',
        'Connection problem',
        'Close and reopen the popup. If it persists, reload the extension.',
        false
      );
      return;
    }

    setToggle(response.enabled);

    if (!response.enabled) {
      renderDisabled();
      return;
    }

    if (!response.supported) {
      setStatus(
        'gray',
        'Not on YouTube',
        'Open a YouTube video, then click the extension icon.',
        false
      );
      return;
    }

    if (response.needsReload || !response.state) {
      setStatus(
        'pending',
        'Reload needed',
        'Reload this YouTube tab so the extension can connect.',
        true
      );
      return;
    }

    const state = response.state;
    switch (state.reason) {
      case 'active':
        setStatus('active', 'Active', 'The video is filling this window.', false);
        break;
      case 'fullscreen':
        setStatus('fullscreen', 'Fullscreen', 'YouTube fullscreen is active.', false);
        break;
      case 'starting':
        setStatus('pending', 'Starting...', 'Waiting for the YouTube player.', false);
        break;
      case 'not-watch':
        setStatus('ready', 'Ready', 'Open a video to fill the window.', false);
        break;
      case 'unavailable':
        setStatus(
          'unavailable',
          'Video unavailable',
          'Full-window mode will apply to the next playable video.',
          false
        );
        break;
      case 'misapplied':
        setStatus(
          'misapplied',
          'Not applied',
          'YouTube did not accept the size change. Reload the tab and try again.',
          true
        );
        break;
      case 'disabled':
        renderDisabled();
        break;
      default:
        setStatus(
          'pending',
          'Checking...',
          'Waiting for the page to report its state.',
          false
        );
        break;
    }
  }

  function renderError() {
    setStatus(
      'error',
      'Connection problem',
      'The extension background service is not responding. Reopen the popup.',
      false
    );
  }

  function refresh() {
    if (refreshInFlight) return refreshInFlight;
    refreshInFlight = (async function () {
      try {
        const response = await sendMessage({ type: MESSAGE.GET_STATE });
        renderResponse(response);
      } catch (_) {
        renderError();
      } finally {
        refreshInFlight = null;
      }
    })();
    return refreshInFlight;
  }

  enabledInput.addEventListener('change', async function () {
    if (toggleInFlight) return;
    toggleInFlight = true;
    enabledInput.disabled = true;
    const desired = enabledInput.checked;

    try {
      const response = await sendMessage({
        type: MESSAGE.SET_ENABLED,
        enabled: desired
      });
      if (!response || response.ok !== true) throw new Error('save-failed');
      setToggle(response.enabled);
      // A second read is intentional: the first may already have been in
      // flight when the setting changed.
      await refresh();
      await refresh();
    } catch (_) {
      setToggle(!desired);
      setStatus(
        'error',
        'Could not save',
        'The setting was not changed. Try again.',
        false
      );
    } finally {
      enabledInput.disabled = false;
      toggleInFlight = false;
    }
  });

  reloadButton.addEventListener('click', async function () {
    reloadButton.disabled = true;
    reloadButton.textContent = 'Reloading...';
    try {
      const response = await sendMessage({ type: MESSAGE.RELOAD_TAB });
      if (!response || response.ok !== true) throw new Error('reload-failed');
      window.setTimeout(function () {
        window.close();
      }, 300);
    } catch (_) {
      reloadButton.disabled = false;
      reloadButton.textContent = 'Reload this tab';
      setStatus(
        'error',
        'Could not reload',
        'Reload the tab manually, then try again.',
        false
      );
    }
  });

  try {
    versionLabel.textContent = 'v' + api.runtime.getManifest().version;
  } catch (_) {
    versionLabel.textContent = '';
  }

  refresh();
  window.setInterval(refresh, 1000);
})();
