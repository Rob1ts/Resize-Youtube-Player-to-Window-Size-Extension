/*
 * YouTube Window Player - content script
 * Based on "Resize YT To Window Size" by Chris H (Zren / Shade), MIT licensed.
 */
(function () {
  'use strict';

  // Content scripts run in the top frame only (see the manifests). This guard
  // also makes the script harmless if it is ever injected twice.
  if (window.top !== window.self || window.__ytwWindowPlayerLoaded) return;
  window.__ytwWindowPlayerLoaded = true;

  const api = globalThis.browser || globalThis.chrome;
  if (!api || !api.runtime || !api.storage || !api.storage.local) return;

  const ACTIVE_CLASS = 'ytw-active';
  const STORAGE_KEY = 'enabled';
  const DEFAULT_ENABLED = true;
  const MESSAGE = Object.freeze({
    GET_STATE: 'ytw:get-state',
    SET_ENABLED: 'ytw:set-enabled',
    STATE: 'ytw:state'
  });

  const root = document.documentElement;
  let enabled = DEFAULT_ENABLED;
  let started = false;
  let stopped = false;
  let lastReport = '';
  let scheduleTimer = 0;
  let pollTimer = 0;

  function isYouTubeHost(hostname) {
    return hostname === 'youtube.com' || hostname.endsWith('.youtube.com');
  }

  function isWatchUrl(rawUrl) {
    let url;
    try {
      url = new URL(rawUrl);
    } catch (_) {
      return false;
    }
    if (url.protocol !== 'https:' || !isYouTubeHost(url.hostname)) return false;
    if (url.pathname === '/watch') return url.searchParams.has('v');
    if (/^\/live\/[^/]+\/?$/.test(url.pathname)) return true;
    if (/^\/(?:channel|c|user)\/[^/]+\/live\/?$/.test(url.pathname)) return true;
    return false;
  }

  function getPlayer() {
    return document.getElementById('movie_player');
  }

  function isUnavailable() {
    // YouTube exposes player-unavailable on the watch element when the video
    // cannot be played. Wait for the player element as well so the temporary
    // skeleton on navigation is not mistaken for an error page.
    const watch = document.querySelector(
      'ytd-watch-flexy[player-unavailable], ytd-watch-grid[player-unavailable]'
    );
    return !!watch && !!getPlayer();
  }

  function isFullscreen() {
    if (document.fullscreenElement) return true;
    if (root.hasAttribute('fullscreen')) return true;
    return !!document.querySelector('ytd-watch-flexy[fullscreen], ytd-watch-grid[fullscreen]');
  }

  function playerFillsViewport() {
    const player = getPlayer();
    if (!player) return false;
    const rect = player.getBoundingClientRect();
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    return (
      rect.width > 0 &&
      rect.height > 0 &&
      Math.abs(rect.width - viewportWidth) <= 2 &&
      Math.abs(rect.height - viewportHeight) <= 2
    );
  }

  function getState() {
    const watch = isWatchUrl(window.location.href);
    const unavailable = watch && isUnavailable();
    const fullscreen = isFullscreen();
    const player = !!getPlayer();
    const applied = root.classList.contains(ACTIVE_CLASS);
    const active = applied && playerFillsViewport();

    let reason;
    if (!enabled) reason = 'disabled';
    else if (!watch) reason = 'not-watch';
    else if (unavailable) reason = 'unavailable';
    else if (fullscreen) reason = 'fullscreen';
    else if (!player) reason = 'starting';
    else if (active) reason = 'active';
    else reason = 'misapplied';

    return {
      enabled,
      watch,
      player,
      applied,
      active,
      unavailable,
      fullscreen,
      reason
    };
  }

  function applyMode() {
    const watch = isWatchUrl(window.location.href);
    const unavailable = watch && isUnavailable();
    const shouldApply = enabled && watch && !unavailable;
    if (shouldApply) {
      if (!root.classList.contains(ACTIVE_CLASS)) root.classList.add(ACTIVE_CLASS);
    } else if (root.classList.contains(ACTIVE_CLASS)) {
      root.classList.remove(ACTIVE_CLASS);
    }
  }

  function extensionIsAlive() {
    try {
      return !!(api && api.runtime && api.runtime.id);
    } catch (_) {
      return false;
    }
  }

  function stop() {
    if (stopped) return;
    stopped = true;
    started = false;
    if (scheduleTimer) {
      window.clearTimeout(scheduleTimer);
      scheduleTimer = 0;
    }
    if (pollTimer) {
      window.clearInterval(pollTimer);
      pollTimer = 0;
    }
    root.classList.remove(ACTIVE_CLASS);
  }

  function reportState(force) {
    if (stopped) return;
    const state = getState();
    const signature = JSON.stringify(state);
    if (!force && signature === lastReport) return;
    lastReport = signature;
    if (!extensionIsAlive()) {
      stop();
      return;
    }
    try {
      const result = api.runtime.sendMessage({ type: MESSAGE.STATE, state });
      if (result && typeof result.catch === 'function') result.catch(function () {});
    } catch (_) {
      if (!extensionIsAlive()) stop();
    }
  }

  function syncState(forceReport) {
    if (stopped) return;
    applyMode();
    reportState(forceReport === true);
  }

  function scheduleSync() {
    if (stopped || scheduleTimer) return;
    scheduleTimer = window.setTimeout(function () {
      scheduleTimer = 0;
      syncState(false);
    }, 50);
  }

  function readEnabled() {
    return new Promise(function (resolve) {
      let settled = false;
      const timeout = window.setTimeout(function () {
        finish(DEFAULT_ENABLED);
      }, 1500);

      function finish(value) {
        if (settled) return;
        settled = true;
        window.clearTimeout(timeout);
        resolve(value !== false);
      }

      try {
        const result = api.storage.local.get({ [STORAGE_KEY]: DEFAULT_ENABLED });
        if (result && typeof result.then === 'function') {
          result.then(
            function (values) {
              finish(values && values[STORAGE_KEY]);
            },
            function () {
              finish(DEFAULT_ENABLED);
            }
          );
          return;
        }
        // Callback form, for older Chromium-based browsers.
        api.storage.local.get({ [STORAGE_KEY]: DEFAULT_ENABLED }, function (values) {
          if (api.runtime.lastError) {
            finish(DEFAULT_ENABLED);
            return;
          }
          finish(values && values[STORAGE_KEY]);
        });
      } catch (_) {
        finish(DEFAULT_ENABLED);
      }
    });
  }

  function onMessage(message, sender, sendResponse) {
    // Only extension pages and the background worker may control this script.
    if (!sender || sender.id !== api.runtime.id) return false;
    if (!message || typeof message !== 'object') return false;

    if (message.type === MESSAGE.GET_STATE) {
      sendResponse({ ok: true, state: getState() });
      return false;
    }

    if (message.type === MESSAGE.SET_ENABLED) {
      if (typeof message.enabled !== 'boolean') {
        sendResponse({ ok: false, error: 'invalid-enabled' });
        return false;
      }
      enabled = message.enabled;
      syncState(true);
      sendResponse({ ok: true, state: getState() });
      return false;
    }

    return false;
  }

  function start() {
    if (started || stopped) return;
    started = true;

    try {
      api.runtime.onMessage.addListener(onMessage);
    } catch (_) {
      return;
    }

    try {
      api.storage.onChanged.addListener(function (changes, areaName) {
        if (areaName !== 'local') return;
        const change = changes && changes[STORAGE_KEY];
        if (change && typeof change.newValue === 'boolean') {
          enabled = change.newValue;
          syncState(true);
        }
      });
    } catch (_) {
      // Storage events are an optimization; messages still keep this in sync.
    }

    readEnabled().then(function (storedEnabled) {
      if (stopped) return;
      enabled = storedEnabled;
      syncState(true);
    });

    pollTimer = window.setInterval(function () {
      if (!extensionIsAlive()) {
        stop();
        return;
      }
      syncState(false);
    }, 1000);

    window.addEventListener('resize', scheduleSync, { passive: true });
    window.addEventListener('popstate', scheduleSync);
    window.addEventListener('hashchange', scheduleSync);
    window.addEventListener('pageshow', scheduleSync);
    document.addEventListener('yt-navigate-start', scheduleSync);
    document.addEventListener('yt-navigate-finish', scheduleSync);
    document.addEventListener('yt-page-data-updated', scheduleSync);
    document.addEventListener('fullscreenchange', scheduleSync);
    document.addEventListener('visibilitychange', scheduleSync);
  }

  start();
})();
