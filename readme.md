# Clear Pop Up

A local-first Chrome Manifest V3 extension that blocks unsolicited pop-ups and hides intrusive overlays. No telemetry, servers, cloud sync or remote code. MIT licensed.

## Install

For a packaged ZIP, extract it and load the extracted `clear-popup` folder containing `manifest.json`. The steps below refer to a source repository checkout.

1. Download or clone this repository.
2. Open `chrome://extensions` and enable Developer mode.
3. Choose **Load unpacked** and select the repository's `src/` folder. Generated UI assets are committed, so no build is needed for this method.
4. Pin **Clear Pop Up** and open its toolbar popup on a normal HTTP/HTTPS page.

For a packaged local build, follow the development commands below and load `dist/clear-popup/`. After updating an existing installation, reload it from the extensions page and reload test pages to replace old content-script contexts. The extension is not currently distributed through the Chrome Web Store. Safari packaging has not been validated.

## Features

- **Basic pop-ups:** intercepts unsolicited `window.open`, target-blank links and forms. Directly requested openings remain allowed. A first-block notice offers **Allow this site** or **Keep blocked**. Allowing requires a trusted click, saves the exact source hostname and offers an explicit reload; blocked windows are never replayed automatically. Chrome and other blockers operate independently.
- **Automatic overlays:** uses local geometry, positioning and structural signals. Checks three viewport points and up to eight ancestors per point, rather than continuously scanning the whole DOM. Mutation handling runs before paint, including during document loading. Hidden tabs are not scanned.
- **Requested interfaces:** focused interfaces and those appearing within 1.8 seconds of an interaction are preserved. Manual scanning bypasses that delay. Empty full-screen backdrops left behind by another cosmetic filter can be removed separately.
- **Manual hiding:** choose an element; hold Shift while clicking to keep selecting. A normal click exits selection; Escape cancels it. Optionally save a unique CSS selector for that hostname, without the element's text.
- **Undo:** restore the most recently hidden element from the page toolbar or extension popup. The toolbar dismisses after five idle seconds, pausing while hovered or focused. Restored elements are ignored until reload. Disabling overlays restores hidden elements.
- **Site exceptions:** exact hostname only. `example.com` does not allow `example.com.evil` or automatically allow subdomains. Frames use their own origins. Setting changes apply to open pages; tabs with stale or restricted contexts are reported as needing a reload.
- **Counters:** count blocked attempts and hidden elements, not ads or sites. They reset on top-level page load, live in session storage and disappear when the tab closes.

## Interface and shared theme

Clear Pop Up uses Basecoat 1.1.0 with the shared Clear 1.0.0 light/dark theme. Indigo indicates active protection, amber marks an allowed site and gray with a dashed border marks disabled protection. All states also have explicit text. The palette follows the OS theme.

Read [the design system](ui/design-system.md) and [theme tokens](ui/clear-theme.css). This repository contains an independent copy of the parent extensions theme, so it builds without a sibling checkout. Edit [the popup source stylesheet](ui/popup.css) or [isolated notification styles](ui/notices.css), then run `bun run ui`. Basecoat supplies control styles; this version uses native controls and existing extension actions, so no Basecoat JavaScript controllers are shipped. Injected notifications use a small isolated theme, not the full Basecoat stylesheet.

## Permissions and data

- `storage`: local settings and saved selectors; temporary counters in session storage. No Google synchronization.
- `scripting`: registers MAIN and ISOLATED startup scripts, excluding allowed hosts.
- `activeTab` and HTTP/HTTPS host access: interact with the current page and frames to perform blocking and restoration.

There are no extension network APIs, telemetry identifiers, conversation analysis, request inspection or remote uninstall URLs. Websites still make their own network requests. Read [the privacy policy](privacy.md).

## Limitations

Heuristics can miss an overlay or hide something useful. Payment, OAuth and login flows are not recognized through URL keyword lists; directly requested openings are preserved, but legitimate delayed openings may require a site exception. A hostile page can modify MAIN-world hooks or imitate events, so this is not a security boundary or a replacement for a firewall/network blocker.

The extension does not manage cookie consent, bypass paywalls, remove all advertisements or maintain malicious-domain lists. Hiding an element does not guarantee that already-loaded media stops. Complex site styles can limit scroll restoration. Internal browser pages and the Chrome Web Store cannot be modified.

## Development

Use Node.js 22+ and Bun. Dependencies are development tools; compiled CSS and small local scripts are bundled with the extension.

```sh
bun install --frozen-lockfile
bunx playwright install chromium
bun run check
bun run test
bun run build
```

Tests load the real MV3 extension in disposable Chromium profiles with loopback-only fixture pages; they do not use a personal Chrome profile. The build creates the loadable folder, versioned ZIP and SHA256 in `dist/`. Generated files in `src/` are committed for direct installation.

## License and provenance

Original implementation informed by functional analysis of Poper Blocker 8.11.3; no source code, SDK or rule catalogue from that product is included. Read [the MIT license](license). Basecoat and Tailwind MIT notices are bundled in [third-party licenses](src/licenses/).
