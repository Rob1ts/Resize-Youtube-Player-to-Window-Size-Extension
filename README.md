# Resize YT To Window Size — Browser Extension

A Firefox and Chromium browser extension that moves the YouTube player to the top of
the page and expands it to fill the browser window, so the rest of the page scrolls
beneath the video instead of sitting beside it.

Toggle it with the **W** key while the player has focus, or from the toolbar button.

This extension was coded using Opencode and Space Bunny Free model.

WARNING: Extensions are not signed.

## Credits and provenance

This project is a **derivative work** of
[ResizeYoutubePlayerToWindowSize](https://github.com/Zren/ResizeYoutubePlayerToWindowSize/)
by **Chris H (Zren / Shade)**.

- `content.js` is the upstream userscript's code, adapted for use as an extension
  content script. All of the stylesheet, player-resize, theater-mode, SPA-navigation
  and keyboard-toggle logic is Chris H's original work.
- `manifest.json`, `popup.html`, `popup.css` and `popup.js` are new, as are the icons.

This repository is not affiliated with or endorsed by the original author.

## Repository layout

```
Firefox/     Manifest V2 extension
Chromium/    Manifest V3 extension
```

Both directories contain the same `content.js` and popup. The manifests differ
because Chrome Web Store no longer accepts Manifest V2, while Firefox still does.

## Installing for development

### Chromium / Chrome / Edge / Brave

1. Go to `chrome://extensions`
2. Enable **Developer mode**
3. Click **Load unpacked** and select the `Chromium/` directory

### Firefox

1. Go to `about:debugging#/runtime/this-firefox`
2. Click **Load Temporary Add-on…**
3. Select `Firefox/manifest.json`

Temporary add-ons are removed when Firefox closes. Use the **Reload** button in
`about:debugging` after editing files to re-apply without restarting.

## License

Released under the **GNU General Public License v3.0 or later**. See `LICENSE`.

### A note on the upstream license

The upstream project states its license two different ways: its `README.md` says
**GPL**, while the `@license` tag in the userscript metadata says **MIT**. There is
no `LICENSE` file in the upstream repository, so the two statements cannot be
reconciled from the source alone.

GPL-3.0-or-later was chosen here because it is the only option that is valid under
*both* readings. If the upstream code is GPL, a derivative work must also be GPL.
If it is MIT, MIT-licensed code can still be incorporated into a GPL-licensed work
as long as the original copyright notice and permission text are preserved. A
permissive license for this repository would only be defensible if the `README`
were known to be stale.

This has been raised with the upstream author for clarification. If they confirm
MIT, this project may be relicensed — the upstream attribution and copyright
notice must be retained either way.

## Links

- Upstream project: <https://github.com/Zren/ResizeYoutubePlayerToWindowSize/>
- Upstream userscript: <https://greasyfork.org/scripts/811-resize-yt-to-window-size>
- Chrome Web Store listing: _pending_
- AMO listing: _pending_
