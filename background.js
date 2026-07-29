// TimeSink service worker: receives heartbeats from content scripts on
// tracked sites and maintains per-day, per-site session lists in
// chrome.storage.local.
//
// Data shape:
//   { "2026-07-29": { "instagram.com": { sessions: [{start, end}, …] } } }
//
// A heartbeat within SESSION_GAP_MS of the last session's end extends that
// session; otherwise a new session starts. Two visible tabs of the same site
// both extend the same session, so time is never double-counted.

const SESSION_GAP_MS = 45_000;
const KEEP_DAYS = 60;

function todayKey(d = new Date()) {
  const y = d.getFullYear();
  const m = String(d.getMonth() + 1).padStart(2, "0");
  const day = String(d.getDate()).padStart(2, "0");
  return `${y}-${m}-${day}`;
}

async function heartbeat(domain) {
  const now = Date.now();
  const key = todayKey();
  const store = await chrome.storage.local.get(key);
  const day = store[key] ?? {};
  const site = day[domain] ?? { sessions: [] };

  const last = site.sessions[site.sessions.length - 1];
  if (last && now - last.end <= SESSION_GAP_MS) {
    last.end = Math.max(last.end, now);
  } else {
    site.sessions.push({ start: now, end: now });
  }

  day[domain] = site;
  await chrome.storage.local.set({ [key]: day });
  return site;
}

async function pruneOldDays() {
  const all = await chrome.storage.local.get(null);
  const cutoff = new Date();
  cutoff.setDate(cutoff.getDate() - KEEP_DAYS);
  const cutoffKey = todayKey(cutoff);
  const stale = Object.keys(all).filter(
    (k) => /^\d{4}-\d{2}-\d{2}$/.test(k) && k < cutoffKey
  );
  if (stale.length) await chrome.storage.local.remove(stale);
}

chrome.runtime.onMessage.addListener((msg, _sender, sendResponse) => {
  if (msg?.type === "heartbeat" && typeof msg.domain === "string") {
    heartbeat(msg.domain).then(sendResponse);
    return true; // keep the message channel open for the async response
  }
  if (msg?.type === "today") {
    chrome.storage.local
      .get(todayKey())
      .then((store) => sendResponse(store[todayKey()] ?? {}));
    return true;
  }
});

chrome.runtime.onInstalled.addListener(pruneOldDays);
chrome.runtime.onStartup.addListener(pruneOldDays);
