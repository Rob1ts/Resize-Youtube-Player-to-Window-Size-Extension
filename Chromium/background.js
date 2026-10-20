/*
 * YouTube Window Player - background service worker / event page
 * Based on "Resize YT To Window Size" by Chris H (Zren / Shade), MIT licensed.
 */
(function () {
  'use strict';

  const api = globalThis.browser || globalThis.chrome;
  if (!api || !api.runtime || !api.storage) return;

  const STORAGE_KEY = 'enabled';
  const DEFAULT_ENABLED = true;
  const YOUTUBE_PATTERNS = ['https://youtube.com/*', 'https://*.youtube.com/*'];
  const MESSAGE = Object.freeze({
    GET_STATE: 'ytw:get-state',
    SET_ENABLED: 'ytw:set-enabled',
    RELOAD_TAB: 'ytw:reload-tab',
    STATE: 'ytw:state'
  });

  const ALLOWED_REASONS = new Set([
    'active',
    'disabled',
    'fullscreen',
    'misapplied',
    'not-watch',
    'starting',
    'unavailable'
  ]);

  const BADGE = Object.freeze({
    active: { text: 'ON', color: '#1a7f37' },
    fullscreen: { text: 'ON', color: '#1a7f37' },
    starting: { text: 'ON', color: '#9a6700' },
    misapplied: { text: '!', color: '#9a6700' },
    unavailable: { text: '!', color: '#6e7781' },
    disabled: { text: 'OFF', color: '#6e7781' },
    'not-watch': { text: '', color: '#6e7781' }
  });

  function isYouTubeUrl(rawUrl) {
    if (typeof rawUrl !== 'string') return false;
    let url;
    try {
      url = new URL(rawUrl);
    } catch (_) {
      return false;
    }
    return (
      url.protocol === 'https:' &&
      (url.hostname === 'youtube.com' || url.hostname.endsWith('.youtube.com'))
    );
  }

  function isOurSender(sender) {
    try {
      return !!sender && sender.id === api.runtime.id;
    } catch (_) {
      return false;
    }
  }

  function normalizeState(rawState) {
    if (!rawState || typeof rawState !== 'object') return null;
    return {
      enabled: rawState.enabled === true,
      watch: rawState.watch === true,
      player: rawState.player === true,
      applied: rawState.applied === true,
      active: rawState.active === true,
      unavailable: rawState.unavailable === true,
      fullscreen: rawState.fullscreen === true,
      reason: ALLOWED_REASONS.has(rawState.reason) ? rawState.reason : 'starting'
    };
  }

  async function readEnabled() {
    try {
      const values = await api.storage.local.get({ [STORAGE_KEY]: DEFAULT_ENABLED });
      return values && values[STORAGE_KEY] !== false;
    } catch (_) {
      return DEFAULT_ENABLED;
    }
  }

  async function writeEnabled(enabled) {
    await api.storage.local.set({ [STORAGE_KEY]: enabled });
  }

  async function ensureDefaultSetting() {
    try {
      const values = await api.storage.local.get(STORAGE_KEY);
      if (typeof values[STORAGE_KEY] !== 'boolean') await writeEnabled(DEFAULT_ENABLED);
    } catch (_) {
      // Keep the built-in default if storage is unavailable.
    }
  }

  async function sendToTab(tabId, message) {
    if (typeof tabId !== 'number') return null;
    try {
      return await api.tabs.sendMessage(tabId, message);
    } catch (_) {
      return null;
    }
  }

  async function updateBadge(tabId, state) {
    if (typeof tabId !== 'number') return;
    if (!state) {
      await clearBadge(tabId);
      return;
    }
    const badge = BADGE[state.reason] || BADGE.starting;
    let title = 'YouTube Window Player';
    if (state.reason === 'active') title += ' - Active';
    else if (state.reason === 'fullscreen') title += ' - Fullscreen';
    else if (state.reason === 'starting') title += ' - Starting';
    else if (state.reason === 'misapplied') title += ' - Layout not applied';
    else if (state.reason === 'unavailable') title += ' - Video unavailable';
    else if (state.reason === 'disabled') title += ' - Disabled';
    else if (state.reason === 'not-watch') title += ' - Ready';

    try {
      await api.action.setBadgeText({ tabId, text: badge.text });
      await api.action.setBadgeBackgroundColor({ tabId, color: badge.color });
      await api.action.setTitle({ tabId, title });
    } catch (_) {
      // The tab may have been closed while the state was being applied.
    }
  }

  async function clearBadge(tabId) {
    try {
      await api.action.setBadgeText({ tabId, text: '' });
      await api.action.setTitle({ tabId, title: 'YouTube Window Player' });
    } catch (_) {
      // Ignore a tab that no longer exists.
    }
  }

  async function getActiveTab() {
    try {
      const tabs = await api.tabs.query({ active: true, lastFocusedWindow: true });
      return tabs && tabs[0] ? tabs[0] : null;
    } catch (_) {
      return null;
    }
  }

  async function getTrackedTabs() {
    try {
      return await api.tabs.query({ url: YOUTUBE_PATTERNS });
    } catch (_) {
      return [];
    }
  }

  async function setEnabledEverywhere(enabled) {
    await writeEnabled(enabled);
    const tabs = await getTrackedTabs();
    await Promise.all(
      tabs.map(async function (tab) {
        const response = await sendToTab(tab.id, {
          type: MESSAGE.SET_ENABLED,
          enabled
        });
        if (response && response.ok) {
          await updateBadge(tab.id, normalizeState(response.state));
        }
      })
    );
    return enabled;
  }

  async function buildPopupState() {
    const enabled = await readEnabled();
    const tab = await getActiveTab();

    if (!tab) {
      return { ok: true, supported: false, enabled, state: null, needsReload: false };
    }
    if (!isYouTubeUrl(tab.url)) {
      return { ok: true, supported: false, enabled, state: null, needsReload: false };
    }

    const response = await sendToTab(tab.id, { type: MESSAGE.GET_STATE });
    const state = normalizeState(response && response.state);
    if (!state) {
      return { ok: true, supported: true, enabled, state: null, needsReload: true };
    }
    return { ok: true, supported: true, enabled, state, needsReload: false };
  }

  async function handleControlMessage(message, sender) {
    // Messages from content scripts carry sender.tab. Only extension pages
    // (the popup) may change settings or reload tabs.
    if (sender.tab) return { ok: false, error: 'not-allowed' };
    if (!message || typeof message !== 'object') return { ok: false, error: 'invalid-message' };

    if (message.type === MESSAGE.GET_STATE) {
      return buildPopupState();
    }

    if (message.type === MESSAGE.SET_ENABLED) {
      if (typeof message.enabled !== 'boolean') {
        return { ok: false, error: 'invalid-enabled' };
      }
      const enabled = await setEnabledEverywhere(message.enabled);
      return { ok: true, enabled };
    }

    if (message.type === MESSAGE.RELOAD_TAB) {
      const tab = await getActiveTab();
      if (!tab || typeof tab.id !== 'number' || !isYouTubeUrl(tab.url)) {
        return { ok: false, error: 'not-youtube' };
      }
      await api.tabs.reload(tab.id);
      return { ok: true };
    }

    return { ok: false, error: 'unknown-message' };
  }

  api.runtime.onMessage.addListener(function (message, sender, sendResponse) {
    if (!isOurSender(sender)) {
      sendResponse({ ok: false, error: 'unauthorized' });
      return false;
    }

    if (message && message.type === MESSAGE.STATE) {
      const tabId = sender.tab && sender.tab.id;
      const senderUrl = sender.tab && (sender.tab.url || sender.url);
      if (!sender.tab || !isYouTubeUrl(senderUrl)) return false;
      const state = normalizeState(message.state);
      if (state) updateBadge(tabId, state);
      return false;
    }

    handleControlMessage(message, sender).then(
      function (response) {
        sendResponse(response);
      },
      function () {
        sendResponse({ ok: false, error: 'internal-error' });
      }
    );
    return true;
  });

  api.commands.onCommand.addListener(function (command) {
    if (command !== 'toggle-player') return;
    (async function () {
      const tab = await getActiveTab();
      if (!tab || !isYouTubeUrl(tab.url)) return;
      const enabled = !(await readEnabled());
      await setEnabledEverywhere(enabled);
    })().catch(function () {
      // A command must never produce an unhandled rejection.
    });
  });

  api.tabs.onActivated.addListener(function (activeInfo) {
    (async function () {
      const response = await sendToTab(activeInfo.tabId, { type: MESSAGE.GET_STATE });
      const state = normalizeState(response && response.state);
      if (state) await updateBadge(activeInfo.tabId, state);
      else await clearBadge(activeInfo.tabId);
    })().catch(function () {});
  });

  api.tabs.onUpdated.addListener(function (tabId, changeInfo) {
    if (!changeInfo || !changeInfo.url) return;
    // The content script reports the new state after navigation; remove stale
    // status immediately so the toolbar never shows an old ON badge.
    clearBadge(tabId);
  });

  async function refreshAllBadges() {
    const tabs = await getTrackedTabs();
    await Promise.all(
      tabs.map(async function (tab) {
        const response = await sendToTab(tab.id, { type: MESSAGE.GET_STATE });
        const state = normalizeState(response && response.state);
        if (state) await updateBadge(tab.id, state);
        else await clearBadge(tab.id);
      })
    );
  }

  api.runtime.onInstalled.addListener(function () {
    ensureDefaultSetting()
      .then(refreshAllBadges)
      .catch(function () {});
  });

  api.runtime.onStartup.addListener(function () {
    refreshAllBadges().catch(function () {});
  });

  ensureDefaultSetting().catch(function () {});
})();
