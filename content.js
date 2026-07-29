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
      .panel {
        position: fixed; top: 12px; right: 12px; z-index: 2147483647;
        font: 500 12.5px/1.45 -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif;
        color: #fff; user-select: none; pointer-events: none;
        background: rgba(30, 30, 34, 0.45);
        backdrop-filter: blur(14px) saturate(1.4);
        -webkit-backdrop-filter: blur(14px) saturate(1.4);
        border: 1px solid rgba(255, 255, 255, 0.18);
        border-radius: 12px; padding: 8px 12px; min-width: 170px;
        box-shadow: 0 4px 18px rgba(0, 0, 0, 0.22);
        text-shadow: 0 1px 2px rgba(0, 0, 0, 0.45);
      }
      .head { display: flex; justify-content: space-between; align-items: baseline;
              gap: 16px; }
      .site { font-size: 10.5px; font-weight: 600; color: rgba(255,255,255,0.75);
              text-transform: uppercase; letter-spacing: 0.4px; }
      .total { font-size: 16px; font-weight: 700; }
      .row { display: flex; justify-content: space-between; gap: 16px; padding: 1px 0; }
      .row .when { color: rgba(255,255,255,0.65); }
      .row.current .when { color: #ff6b60; }
      .sep { border: 0; border-top: 1px solid rgba(255,255,255,0.16); margin: 6px 0 4px; }
      .hidden { display: none; }
    </style>
    <div class="panel">
      <div class="head">
        <span class="site"></span><span class="total">0s</span>
      </div>
      <hr class="sep top-sep hidden">
      <div class="current-wrap"></div>
      <div class="history"></div>
    </div>`;

  const el = {
    site: shadow.querySelector(".site"),
    total: shadow.querySelector(".total"),
    topSep: shadow.querySelector(".top-sep"),
    currentWrap: shadow.querySelector(".current-wrap"),
    history: shadow.querySelector(".history"),
  };
  el.site.textContent = DOMAIN;

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

    el.total.textContent = fmt(total);

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

    el.topSep.classList.toggle("hidden", !inSession && earlier.length === 0);
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
