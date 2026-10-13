# Resize YT To Window Size — Browser Extension

A Firefox and Chromium browser extension that moves the YouTube player to the top of
the page and expands it to fill the browser window, so the rest of the page scrolls
beneath the video instead of sitting beside it.

Toggle it with the **W** key while the player has focus, or from the toolbar button.

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

## Installing the signed `.xpi`

Once published on AMO, the signed build can be installed from its listing page.
Firefox release builds reject unsigned add-ons, so a signed build (or Developer
Edition, Nightly, or ESR with `xpinstall.signatures.required` disabled) is required.

To rebuild the `.xpi` locally after changing anything under `Firefox/`:

```powershell
Add-Type -AssemblyName System.IO.Compression.FileSystem
$src = 'Firefox'
$xpi = 'resize_yt_to_window_size.xpi'
Remove-Item -Force $xpi -ErrorAction SilentlyContinue
$zip = [System.IO.Compression.ZipFile]::Open($xpi, 'Create')
Get-ChildItem -LiteralPath $src -Recurse -File | ForEach-Object {
    $rel = $_.FullName.Substring((Resolve-Path $src).Path.Length + 1).Replace('\', '/')
    [System.IO.Compression.ZipFileExtensions]::CreateEntryFromFile(
        $zip, $_.FullName, $rel, 'Optimal') | Out-Null
}
$zip.Dispose()
```

`manifest.json` must sit at the archive root and entry names must use forward
slashes. PowerShell 5.1's `Compress-Archive` produces backslashes, which Firefox
rejects — the snippet above is why this uses `System.IO.Compression` directly.

## Known issue: brief black flash on load

When a watch page first loads, the player jumps from its natural size to fill the
window, and a black frame is visible for well under a second before the video
appears.

This is not a CSS transition — the player has no transitions applied. Clicking
theater mode (which the extension triggers) **re-parents** the `<video>` element,
swapping six ancestors and forcing the browser to rebuild the hardware video layer,
after which the extension's stylesheet immediately resizes it to `100vh`. The
player background is black, so it shows through while the new layer rasterizes.

Firefox makes this visible; Chrome usually scales the existing layer in place and
the gap is not apparent. Left as-is because the alternative — skipping the theater
mode click — risks breaking the layout, and a sub-second cosmetic flash is a
better trade than a layout bug.

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