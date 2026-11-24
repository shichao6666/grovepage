# GrovePage · Website Tint & Break Reminders

[简体中文](README.md) | English

**GrovePage** is an open-source **Manifest V3** browser extension for **Microsoft Edge** and **Google Chrome**. It applies an adjustable eye-care color tint to web pages and provides flexible break reminders—completely free, local-first, and with zero tracking.

---

## Features

- **Customizable Website Tint**: Choose from 12 built-in presets or pick any custom RGB color. Enabled by default on first install, and remembers your last manual on/off toggle across browser restarts and service worker sleep.
- **Fine Strength & Day/Night Schedule**: Filter opacity combines a 40% base with a 0–100% slider (covering the remaining 60% range). Optional day/night schedule (off by default) switches strengths automatically using local device time. The tint is automatically hidden when printing or saving pages as PDF.
- **Website Rules & Live Status**: Apply to *All sites*, *Specific sites* (requires at least one valid domain), or *Excluded sites*. The popup shows the real-time filter status for the active tab.
- **Temporary Pause**: Pause the tint on the current tab or all tabs for 30 seconds to 5 minutes when viewing original colors or taking screenshots. Pauses stay within the current browser session and automatically resume according to your global toggle and site rules.
- **Break Reminders & Full-Screen Rest**: Choose between fixed-interval reminders or a countdown timer with custom reminder text. Standard reminders auto-close after 5 seconds, or enable full-screen breaks with three built-in synthesized background loops and volume control.
- **6 UI Languages & Shortcuts**: Full interface support for English, 简体中文, 日本語, 한국어, ភាសាខ្មែរ, and Русский. Includes a configurable keyboard shortcut (default `Alt+Shift+Q`, enabled in Advanced settings).
- **JSON Backup & Restore Preview**: Export your saved preferences to JSON (excluding active pauses and running timers). Importing validates the file and previews every change before applying.

---

## Installation

### Load Unpacked from Source

1. Clone this repository or extract `grovepage-v1.0.0-github-source.zip` from Releases.
2. Open `edge://extensions` or `chrome://extensions` and enable **Developer mode**.
3. Click **Load unpacked** and select the `extension/` folder.
4. After updating local files, click **Reload** on the extensions page (or in GrovePage's **About** page). Keep the folder path unchanged to preserve your saved settings.

> Minimum browser version: Chromium 105+ (Microsoft Edge 105+ / Google Chrome 105+).

---

## Privacy & Permissions

GrovePage does not collect browsing history, page content, or analytics, and sends no data to external servers. Site rules, reminders, and strength settings are stored locally; color and language preferences may sync via your browser's extension sync.

See [PRIVACY.md](PRIVACY.md) for full details.

---

## Development & Packaging

No external build toolchain is required. Icons and background audio loops are generated deterministically with standard-library Python scripts:

```bash
# Regenerate extension icons (16/32/48/128) and three WAV audio loops
python -B tools/generate_assets.py

# Build Edge, Chrome, and GitHub source ZIPs + SHA256SUMS.txt into dist/v1.0.0/
python -B tools/build_release.py
```

---

## Feedback & Support

- For bug reports or suggestions, open a GitHub Issue or email `jinshichao666@gmail.com`.
- An optional support page is available inside the extension. All features are free to use.

---

## License

Released under the [MIT License](LICENSE).
