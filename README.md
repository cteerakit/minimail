# Minimail (MV3)

A Chrome Manifest V3 extension that customizes Gmail by hiding selected UI elements.

## Features

- Hide Gmail logo
- Hide add-on sidebar
- Hide footer
- Hide search bar
- Collapse top-right utility icons (Help/Settings/Gemini/etc.) until hover/focus
- Hide left sidebar until hover (fade in/out)
- Center search bar
- Optional custom CSS selectors (one per line)
- Persistent settings with `chrome.storage.sync`
- In-page settings button beside the Gmail Help area

## File Overview

- `manifest.json`: MV3 manifest and extension wiring
- `background.js`: initializes default settings on install/update
- `content.js`: injects settings button/popover, applies UI customizations, and watches DOM changes
- `content.css`: class used to hide selected elements

## Load in Chrome

1. Open `chrome://extensions`.
2. Enable **Developer mode**.
3. Click **Load unpacked**.
4. Select this project folder (`minimail`).

## Configure

1. Open Gmail (`https://mail.google.com`).
2. Click the `UI` button near the top-right help area.
3. Toggle desired settings, then click **Save**.
4. Use **Restore defaults** when needed.

**Defaults (fresh install / restore):** hide search bar is **off**, collapse top-right icons is **on**, hide left sidebar until hover is **off**, center search bar is **on**, mail list width is **Small**.

## Manual Test Checklist

- Inbox view: selected elements are hidden.
- Open an email thread: selected elements remain hidden.
- Compose view: hidden state remains after compose opens.
- Navigate within Gmail without full refresh: observer reapplies rules.
- Reload Gmail: saved settings are restored.
- Popover button stays present near the top-right help area.
- Restore defaults in popover: all default hide toggles reapply.
