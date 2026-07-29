// TimeSink content script: heartbeats while the page is visible and renders
// the floating counter in the page's top-right corner.
//
// "Visible" uses the Page Visibility API: the tab is in the foreground of
// its window, even if that window is on another monitor without focus.
// Chrome marks tabs in fully-covered windows as hidden, so a buried window
// doesn't count.

(() => {
  const BEAT_MS = 5000;
  const SESSION_GAP_MS = 45_000;
  const MIN_SHOWN_SESSION_MS = 10_000;

  // instagram.com from www.instagram.com etc.
  const DOMAIN = location.hostname.split(".").filter((p) => p !== "www").slice(-2).join(".");

  let siteData = { sessions: [] };
  let lastBeatAt = 0;
  let expanded = false;

  async function beat() {
    if (document.visibilityState !== "visible") return;
    const at = Date.now();
    try {
      const fresh = await chrome.runtime.sendMessage({ type: "heartbeat", domain: DOMAIN });
      if (fresh && Array.isArray(fresh.sessions)) {
        siteData = fresh;
        lastBeatAt = at;
      }
    } catch {
      // Service worker unavailable (e.g. extension reloaded); retry next beat.
    }
  }

  // --- formatting -----------------------------------------------------------

  function fmt(ms) {
    const s = Math.max(0, Math.floor(ms / 1000));
    const h = Math.floor(s / 3600);
    const m = Math.floor((s % 3600) / 60);
    const sec = s % 60;
    if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
    if (m > 0) return `${m}m ${String(sec).padStart(2, "0")}s`;
    return `${sec}s`;
  }

  function clock(ts) {
    const d = new Date(ts);
    return `${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
  }

  // --- UI -------------------------------------------------------------------

  const host = document.createElement("div");
  host.id = "timesink-overlay";
  const shadow = host.attachShadow({ mode: "closed" });
  shadow.innerHTML = `
    <style>
      :host { all: initial; }
      .wrap {
        position: fixed; top: 12px; right: 12px; z-index: 2147483647;
        font: 500 12.5px/1.4 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #fff; text-align: right; user-select: none;
        display: flex; flex-direction: column; align-items: flex-end; gap: 6px;
      }
      .pill {
        display: inline-flex; align-items: center; gap: 6px;
        background: rgba(20, 20, 24, 0.82); backdrop-filter: blur(8px);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 999px; padding: 5px 12px; cursor: pointer;
        box-shadow: 0 2px 10px rgba(0, 0, 0, 0.35);
      }
      .pill:hover { background: rgba(20, 20, 24, 0.95); }
      .dot { width: 7px; height: 7px; border-radius: 50%; background: #ff453a; }
      .dot.idle { background: #8e8e93; }
      .panel {
        background: rgba(20, 20, 24, 0.92); backdrop-filter: blur(12px);
        border: 1px solid rgba(255, 255, 255, 0.14);
        border-radius: 12px; padding: 10px 14px; min-width: 190px;
        box-shadow: 0 6px 24px rgba(0, 0, 0, 0.4); text-align: left;
      }
      .panel h1 { font-size: 11px; font-weight: 600; margin: 0 0 2px;
                  color: #98989e; text-transform: uppercase; letter-spacing: 0.4px; }
      .total { font-size: 17px; font-weight: 700; margin-bottom: 8px; }
      .row { display: flex; justify-content: space-between; gap: 16px; padding: 2px 0; }
      .row .when { color: #98989e; }
      .row.current .when { color: #ff453a; }
      .sep { border: 0; border-top: 1px solid rgba(255,255,255,0.12); margin: 8px 0 6px; }
      .hidden { display: none; }
    </style>
    <div class="wrap">
      <div class="pill" part="pill">
        <span class="dot"></span><span class="pill-text">0s</span>
      </div>
      <div class="panel hidden">
        <h1 class="site"></h1>
        <div class="total"></div>
        <div class="current-wrap"></div>
        <hr class="sep">
        <h1>Earlier today</h1>
        <div class="history"></div>
      </div>
    </div>`;

  const el = {
    dot: shadow.querySelector(".dot"),
    pillText: shadow.querySelector(".pill-text"),
    panel: shadow.querySelector(".panel"),
    site: shadow.querySelector(".site"),
    total: shadow.querySelector(".total"),
    currentWrap: shadow.querySelector(".current-wrap"),
    history: shadow.querySelector(".history"),
    sep: shadow.querySelector(".sep"),
  };
  el.site.textContent = DOMAIN;
  shadow.querySelector(".pill").addEventListener("click", () => {
    expanded = !expanded;
    el.panel.classList.toggle("hidden", !expanded);
  });

  function attach() {
    if (!document.documentElement.contains(host)) {
      document.documentElement.appendChild(host);
    }
  }

  function render() {
    // Hide over fullscreen video (YouTube etc.)
    host.style.display = document.fullscreenElement ? "none" : "";

    const now = Date.now();
    const visible = document.visibilityState === "visible";
    const sessions = siteData.sessions ?? [];
    const synced = sessions.reduce((sum, s) => sum + (s.end - s.start), 0);
    // Time accrued since the last acknowledged heartbeat isn't stored yet.
    const unsynced = visible && lastBeatAt ? Math.min(now - lastBeatAt, BEAT_MS * 3) : 0;
    const total = synced + unsynced;

    el.pillText.textContent = fmt(total);
    el.total.textContent = fmt(total);
    el.dot.classList.toggle("idle", !visible);

    const last = sessions[sessions.length - 1];
    const inSession = visible && last && now - last.end <= SESSION_GAP_MS;
    el.currentWrap.innerHTML = "";
    if (inSession) {
      const row = document.createElement("div");
      row.className = "row current";
      row.innerHTML = `<span class="when">Now, since ${clock(last.start)}</span><span></span>`;
      row.lastElementChild.textContent = fmt(last.end - last.start + unsynced);
      el.currentWrap.appendChild(row);
    }

    const earlier = sessions
      .slice(0, inSession ? -1 : undefined)
      .filter((s) => s.end - s.start >= MIN_SHOWN_SESSION_MS)
      .slice(-8)
      .reverse();
    el.history.innerHTML = "";
    for (const s of earlier) {
      const row = document.createElement("div");
      row.className = "row";
      row.innerHTML = `<span class="when"></span><span></span>`;
      row.firstElementChild.textContent = `${clock(s.start)}–${clock(s.end)}`;
      row.lastElementChild.textContent = fmt(s.end - s.start);
      el.history.appendChild(row);
    }
    const hasEarlier = earlier.length > 0;
    el.sep.classList.toggle("hidden", !hasEarlier);
    el.history.previousElementSibling.classList.toggle("hidden", !hasEarlier);
  }

  attach();
  beat();
  render();
  setInterval(beat, BEAT_MS);
  setInterval(render, 1000);
  document.addEventListener("visibilitychange", () => {
    if (document.visibilityState === "visible") beat();
    render();
  });
  // SPA sites (Instagram/YouTube) can rebuild <html> children; re-attach.
  setInterval(attach, 3000);
})();
