# TimeSink ⏳

A Chrome extension that floats a live counter in the top-right corner of time-sink websites, showing how long you've spent there **today**. Blocking doesn't work — you just disable the blocker. TimeSink doesn't block anything; it just makes sure you can't *not know*.

Tracked out of the box: **Instagram, Facebook, YouTube, 9GAG**.

## What it looks like

- A small glass panel floats over the page's top-right corner — always visible, nothing to click, and it never blocks the page (clicks pass straight through it):
  - **45m 06s** — your total for today on this site, ticking live
  - **Now, since 19:49 · 6m** — the session you're currently in
  - Every previous session today with its time range and duration
- Hours only appear once you've spent an hour (`1h 12m`); before that it's minutes and seconds.
- Everything resets at local midnight.
- The pill hides itself during fullscreen video.

## How counting works

- Time counts whenever the site's tab is **visible** — the tab is in the foreground of its window, on any monitor, in any Chrome window. Focus is not required, so a visible Instagram window on your second monitor counts even while you type elsewhere. (Chrome marks tabs in fully-covered windows as hidden, so buried windows don't count.)
- A **session** ends after the site has been out of view for 45 seconds. Short peeks merge into one session; a real break starts a new one.
- Two visible tabs of the same site never double-count — they extend the same session.
- Data lives entirely in `chrome.storage.local` on your machine. No network requests, no analytics, no permissions beyond storage.

## Install

1. Download or `git clone https://github.com/sami3d/timesink.git`
2. Open `chrome://extensions` in Chrome
3. Turn on **Developer mode** (top-right toggle)
4. Click **Load unpacked** and pick the `timesink` folder

## Add or remove tracked sites

Edit the `matches` list in [manifest.json](manifest.json) — one line per site:

```json
"matches": [
  "*://*.instagram.com/*",
  "*://*.facebook.com/*",
  "*://*.youtube.com/*",
  "*://*.9gag.com/*"
]
```

Then hit the reload icon on the extension card in `chrome://extensions`.

## Toolbar popup

Click the TimeSink toolbar icon for a summary of today's totals across all tracked sites, sorted by damage.

## License

[MIT](LICENSE)
