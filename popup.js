function fmt(ms) {
  const s = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(s / 3600);
  const m = Math.floor((s % 3600) / 60);
  if (h > 0) return `${h}h ${String(m).padStart(2, "0")}m`;
  if (m > 0) return `${m}m`;
  return `${s}s`;
}

chrome.runtime.sendMessage({ type: "today" }).then((day) => {
  const entries = Object.entries(day ?? {})
    .map(([site, data]) => [
      site,
      (data.sessions ?? []).reduce((sum, s) => sum + (s.end - s.start), 0),
    ])
    .filter(([, total]) => total > 0)
    .sort((a, b) => b[1] - a[1]);

  if (!entries.length) return;
  const list = document.getElementById("list");
  list.innerHTML = "";
  for (const [site, total] of entries) {
    const row = document.createElement("div");
    row.className = "row";
    row.innerHTML = `<span class="site"></span><span class="time"></span>`;
    row.firstElementChild.textContent = site;
    row.lastElementChild.textContent = fmt(total);
    list.appendChild(row);
  }
});
