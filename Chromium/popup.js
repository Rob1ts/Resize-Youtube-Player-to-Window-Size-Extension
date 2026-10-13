(function () {
    "use strict";

    // Firefox exposes the promise-based `browser` namespace; Chromium exposes
    // `chrome`. Both are used through the callback style below so the very same
    // file works in both browsers.
    var ext = (typeof browser !== "undefined") ? browser : chrome;

    var toggleBtn = document.getElementById("toggle");
    var toggleLabel = document.getElementById("toggleLabel");
    var contextLabel = document.getElementById("context");

    //--- Wrappers that work with both the promise and callback flavours
    function call(fn) {
        return new Promise(function (resolve, reject) {
            try {
                var maybePromise = fn(function (result) {
                    var err = ext.runtime.lastError;
                    if (err) reject(new Error(err.message));
                    else resolve(result);
                });
                if (maybePromise && typeof maybePromise.then === "function") {
                    maybePromise.then(resolve, reject);
                }
            } catch (e) {
                reject(e);
            }
        });
    }

    function getActiveTab() {
        return call(function (done) {
            return ext.tabs.query({ active: true, currentWindow: true }, done);
        }).then(function (tabs) {
            return (tabs && tabs[0]) || null;
        });
    }

    function sendToTab(tabId, message) {
        return call(function (done) {
            return ext.tabs.sendMessage(tabId, message, done);
        });
    }

    //--- UI states
    function showEnabled(enabled) {
        toggleBtn.disabled = false;
        toggleBtn.setAttribute("aria-checked", enabled ? "true" : "false");
        toggleLabel.textContent = enabled ? "Window player is ON" : "Window player is OFF";
        contextLabel.textContent = "Active on this tab";
    }

    function showUnsupported() {
        toggleBtn.disabled = true;
        toggleBtn.setAttribute("aria-checked", "false");
        toggleLabel.textContent = "Window player";
        contextLabel.textContent = "Open a YouTube watch page";
    }

    //--- Actions
    function refresh() {
        return getActiveTab()
            .then(function (tab) {
                if (!tab || tab.id == null) throw new Error("No active tab");
                return sendToTab(tab.id, { id: "state" });
            })
            .then(function (response) {
                showEnabled(!!(response && response.enabled));
            })
            .catch(function () {
                // No content script reachable => not a page we support.
                showUnsupported();
            });
    }

    function toggle() {
        getActiveTab()
            .then(function (tab) {
                if (!tab || tab.id == null) throw new Error("No active tab");
                return sendToTab(tab.id, { id: "toggle" });
            })
            .then(function (response) {
                showEnabled(!!(response && response.enabled));
            })
            .catch(function () {
                showUnsupported();
            });
    }

    toggleBtn.addEventListener("click", toggle);
    refresh();
})();