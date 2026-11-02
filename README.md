# CMS Switcher

A minimal Chrome extension that toggles the active tab between a site's front end and its CMS backend. One keyboard shortcut, no toolbar icons, no configuration screens.

## How it works

Hit **Alt+Shift+A** (macOS: **Alt+Shift+A**) on any site:

1. **Saved path exists** for that site → jump straight between front end and backend. Saved paths always win, even on WordPress sites.
2. **No saved path, WordPress detected** → switch to `/wp-admin` (or back to `/`).
3. **No saved path, nothing detected** → a small prompt appears at the bottom of the page. Type the CMS path (e.g. `/admin`), hit Enter or "Save & go" — the path is saved and you're taken there immediately.
4. If a navigation lands on a **404**, the prompt re-opens pre-filled with the attempted path so you can correct it.

Saved paths live in your browser's Chrome sync storage (`chrome.storage.sync`) under the key `cmsPaths`, keyed per site origin. Nothing leaves your device except standard Chrome sync (if enabled) — the extension does no other networking, has no analytics, and does not transmit page content anywhere.

A "Clear saved path" link appears in the prompt when a path is already saved, for undoing mistakes.

## Installation (unpacked)

1. Download or clone this repository.
2. Open `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the repository folder.

## Permissions, and why

| Permission | Why |
| --- | --- |
| `activeTab`, `scripting`, `tabs` | Detect the CMS of the page you're viewing and inject the prompt UI. |
| `storage` | Persist per-site paths in `chrome.storage.sync`. |
| `webRequest` | Observe the HTTP status of a navigation you triggered, so a 404 can re-open the path prompt. |
| `<all_urls>` host access | The shortcut works on any site you use it on. |

The extension never reads pages you didn't invoke it on and never sends data to a server of its own.

## Browser support

Chrome (and Chromium-based browsers such as Edge where MV3 webRequest observing behaves equivalently). No Firefox support.

## License

[MIT](LICENSE)
