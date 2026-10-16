<div align="center">

<img src="docs/icon.png" width="96" height="96" alt="Resize YT To Window Size icon">

# Resize YT To Window Size

**Move the YouTube player to the top of the page and expand it to fill your whole window — so the rest of the page scrolls underneath instead of sitting squeezed beside it.**

[![Firefox](https://img.shields.io/badge/Firefox-140%2B-E6602C?logo=firefox-browser&logoColor=white)](https://addons.mozilla.org)
[![Chrome](https://img.shields.io/badge/Chrome%2FEdge%2CBrave-MV3-4285F4?logo=googlechrome&logoColor=white)](https://developer.chrome.com/docs/webstore)
[![License](https://img.shields.io/badge/license-GPL--3.0%2BOr%20later-blue.svg)](LICENSE)
[![Version](https://img.shields.io/badge/version-140-informational)](https://github.com/Rob1ts/Resize-Youtube-Player-to-Window-Size-Extension/releases)

[Install](#installation) · [How it works](#what-it-does) · [Build it](#building-the-packages)

</div>

---

## What it does

YouTube normally caps the player to about half the window width, leaving the
sidebar beside it. This extension pins the player to the top and stretches it to
the full width and height of the window, so comments and recommendations scroll
past underneath instead of stealing half the screen.

Toggle it any of three ways:

- Press <kbd>W</kbd> while the video has focus
- Click the toolbar button
- Use the popup switch

## The popup

<img src="docs/popup.png" width="460" alt="The extension popup showing the Window player switch turned on">

The popup reflects the current tab. On a watch page the switch is live; anywhere
else it is disabled and says so, rather than pretending the add-on is doing
something.

## Features

- Fills the window in both directions — width *and* height
- Follows YouTube's single-page navigation, so it re-applies when you click through to another video
- Remembers nothing and sends nothing: no accounts, no telemetry, no storage
- Works alongside common companions such as Enhancer for YouTube and YouTube Center
- Handles theater mode, miniplayer and the current `ytd-watch-flexy` / `ytd-watch-grid` layouts
- Light and dark themes, following your system setting

## Installation

### Firefox (Manifest V2)

Grab `resize_yt_to_window_size.xpi` from the
[latest release](https://github.com/Rob1ts/Resize-Youtube-Player-to-Window-Size-Extension/releases).

> **The `.xpi` in this repository is unsigned.** Firefox release builds refuse
> unsigned add-ons, so it must be signed through
> [addons.mozilla.org](https://addons.mozilla.org/developers/addon/submission/distribution)
> before anyone can install it. A listing is not published yet.

To try it during development instead, load it temporarily:

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `Firefox/manifest.json`

Temporary add-ons disappear when Firefox closes. Use the **Reload** button after
editing files.

### Chrome / Edge / Brave (Manifest V3)

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `Chromium/` directory

## Repository layout

```
Firefox/     Manifest V2 build
Chromium/    Manifest V3 build
docs/        Images used by this README
build-crx.js Packs Chromium/ into a signed CRX3
verify-crx.js Independently validates a built CRX
```

The manifests differ only because the Chrome Web Store no longer accepts
Manifest V2 while Firefox still does. `Firefox/content.js` and
`Chromium/content.js` differ solely in their header comment; the executable code
below it is byte-identical.

## Security

- Host access is `https://` only. YouTube serves HTTPS exclusively, so plaintext
  access was dropped rather than left in place as unused privilege.
- The Chromium build requests **no API permissions**. The popup only ever reads
  `tab.id`, so an earlier `activeTab` grant — which would have exposed the
  active tab's URL on toolbar click — was removed.
- `runtime.onMessage` rejects any message whose `sender.id` is not this
  extension's own ID, so a web page cannot drive the player layout.
- No network requests, no storage, no `eval`, no HTML insertion. The content
  script's only page mutation is a stylesheet of static CSS rules.
- Debug logging is opt-in (`ytwp.debug = false`); DOM nodes and keyboard events
  are never written to the page console.
- The CRX signing key is kept **outside the repository** (per-user
  `~/.crx-keys/`, overridable with `CRX_KEY_PATH`), so it cannot be committed,
  zipped up with a checkout, or picked up by a cloud-sync client.

The add-on collects and transmits nothing, which is why it declares
`data_collection_permissions: { "required": ["none"] }`.

## Credits and provenance

This project is a **derivative work** of
[ResizeYoutubePlayerToWindowSize](https://github.com/Zren/ResizeYoutubePlayerToWindowSize/)
by **Chris H (Zren / Shade)**.

- `content.js` is the upstream userscript's code, adapted for use as an
  extension content script. All of the stylesheet, player-resize, theater-mode,
  SPA-navigation and keyboard-toggle logic is Chris H's original work.
- `manifest.json`, `popup.html`, `popup.css`, `popup.js`, `build-crx.js` and the
  icons are new.

This repository is **not affiliated with or endorsed by the original author.**

## License

Released under the **GNU General Public License v3.0 or later**. See
[LICENSE](LICENSE).

### A note on the upstream license

The upstream project states its license two different ways: its `README.md` says
**GPL**, while the `@license` tag in the userscript metadata says **MIT**. There
is no `LICENSE` file in the upstream repository, so the two statements cannot be
reconciled from the source alone.

GPL-3.0-or-later was chosen here because it is the only option that is valid
under *both* readings. If the upstream code is GPL, a derivative work must also
be GPL. If it is MIT, MIT-licensed code can still be incorporated into a
GPL-licensed work as long as the original copyright notice and permission text
are preserved. A more permissive license for this repository would only be
defensible if the upstream `README` were known to be stale.

This has been raised with the upstream author for clarification. If they confirm
MIT, this project may be relicensed — the upstream attribution and copyright
notice must be retained either way.

## Links

- **This repository** — <https://github.com/Rob1ts/Resize-Youtube-Player-to-Window-Size-Extension>
- **Releases** — <https://github.com/Rob1ts/Resize-Youtube-Player-to-Window-Size-Extension/releases>
- Upstream project — <https://github.com/Zren/ResizeYoutubePlayerToWindowSize/>
- Upstream userscript — <https://greasyfork.org/scripts/811-resize-yt-to-window-size>
- Chrome Web Store listing — *pending*
- AMO listing — *pending*
