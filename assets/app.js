// Recent Data Leaks — client hydration. The pages are server-rendered (see
// api/render.js); this script fetches /api/feed and re-renders the same views
// with live data plus filters, search, and client-side navigation. On failure
// it leaves the server-rendered content in place.

const app = document.getElementById("app");
const updatedEl = document.getElementById("updated");
const liveDot = document.getElementById("liveDot");

let FEED = null;
let filter = { source: "all", q: "" };

// ---------- Data ----------
async function loadFeed() {
  const tryUrls = ["/api/feed", "/data/feed.json", "data/feed.json"];
  for (const url of tryUrls) {
    try {
      const res = await fetch(url + (url.includes("?") ? "" : `?t=${Date.now()}`));
      if (!res.ok) continue;
      const data = await res.json();
      if (data && Array.isArray(data.items)) {
        FEED = data;
        FEED._live = url.includes("/api/");
        return FEED;
      }
    } catch (_) { /* try next */ }
  }
  throw new Error("Could not load feed");
}

// ---------- Helpers ----------
const esc = (s) => (s == null ? "" : String(s));

function el(tag, attrs = {}, ...kids) {
  const n = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) {
    if (v == null) continue;
    if (k === "class") n.className = v;
    else if (k === "text") n.textContent = v;
    else if (k.startsWith("on") && typeof v === "function") n.addEventListener(k.slice(2), v);
    else n.setAttribute(k, v);
  }
  for (const kid of kids) {
    if (kid == null) continue;
    n.appendChild(typeof kid === "string" ? document.createTextNode(kid) : kid);
  }
  return n;
}

function relTime(iso) {
  if (!iso) return "unknown date";
  const d = new Date(iso);
  const diff = (Date.now() - d.getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return d.toLocaleDateString(undefined, { month: "short", day: "numeric", year: "numeric" });
}

function dayKey(iso) {
  if (!iso) return "Undated";
  const d = new Date(iso);
  const today = new Date();
  const y = new Date(today); y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString(undefined, { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}

function fmtNum(n) { return n == null ? null : n.toLocaleString("en-US"); }
function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString(undefined, { year: "numeric", month: "long", day: "numeric" });
}

function visibleItems() {
  const q = filter.q.trim().toLowerCase();
  return FEED.items.filter((it) => {
    if (filter.source === "breach" && it.sourceType !== "breach") return false;
    if (filter.source === "news" && it.sourceType !== "news") return false;
    if (filter.source !== "all" && filter.source !== "breach" && filter.source !== "news" && it.source !== filter.source) return false;
    if (q && !(`${it.title} ${it.summary} ${it.source}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

// ---------- Router ----------
function routeId() {
  const m = location.pathname.match(/^\/breach\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}
function go(id) {
  const url = id ? `/breach/${encodeURIComponent(id)}` : "/";
  history.pushState({ id: id || null }, "", url);
  render();
}
window.addEventListener("popstate", render);

// ---------- Views ----------
function render() {
  if (!FEED) return;
  const id = routeId();
  app.innerHTML = "";
  if (id) renderDetail(id);
  else renderList();
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function renderList() {
  const items = visibleItems();

  app.appendChild(
    el("section", { class: "hero" },
      el("h1", { text: "A live timeline of data breaches" }),
      el("p", {},
        el("span", { class: "count", text: String(FEED.count) }),
        " tracked incidents · newest first")
    )
  );

  // Search + filters
  const search = el("input", {
    class: "search", type: "search", placeholder: "Search breaches, companies, sources…",
    value: filter.q, oninput: (e) => { filter.q = e.target.value; refreshList(); },
  });
  app.appendChild(el("div", { class: "controls" }, search));

  const sources = ["all", "breach", "news", ...FEED.sources];
  const labels = { all: "All", breach: "Confirmed breaches", news: "News" };
  const chips = el("div", { class: "chips" });
  sources.forEach((s) => {
    chips.appendChild(el("button", {
      class: "chip" + (filter.source === s ? " active" : ""),
      text: labels[s] || s,
      onclick: () => { filter.source = s; render(); },
    }));
  });
  app.appendChild(chips);

  const listWrap = el("div", { id: "list" });
  app.appendChild(listWrap);
  drawTimeline(listWrap, items);
}

function refreshList() {
  const listWrap = document.getElementById("list");
  if (listWrap) drawTimeline(listWrap, visibleItems());
}

function drawTimeline(container, items) {
  container.innerHTML = "";
  if (!items.length) {
    container.appendChild(el("div", { class: "empty", text: "No incidents match your filters." }));
    return;
  }
  const tl = el("div", { class: "timeline" });
  let currentDay = null;
  let dayWrap = null;
  for (const it of items) {
    const key = dayKey(it.published);
    if (key !== currentDay) {
      currentDay = key;
      tl.appendChild(el("div", { class: "day-label", text: key }));
      dayWrap = el("div", { class: "day-items" });
      tl.appendChild(dayWrap);
    }
    dayWrap.appendChild(cardFor(it));
  }
  container.appendChild(tl);
}

function cardFor(it) {
  const isNews = it.sourceType === "news";

  const top = el("div", { class: "card-top" });
  top.appendChild(el("span", { class: "badge" + (isNews ? " news" : ""), text: isNews ? "News" : "Breach" }));
  top.appendChild(el("span", { class: "src", text: it.source }));
  top.appendChild(el("span", { class: "time", text: relTime(it.published) }));

  const body = el("div", { class: "card-body" },
    top, el("h3", { text: it.title }), el("p", { text: it.summary || "" }));

  const meta = el("div", { class: "meta" });
  if (it.affected) meta.appendChild(el("span", {}, el("b", { text: fmtNum(it.affected) }), " accounts affected"));
  if (it.occurred) meta.appendChild(el("span", {}, "Occurred ", el("b", { text: new Date(it.occurred).getFullYear() })));
  if (meta.childNodes.length) body.appendChild(meta);

  const kids = [];
  if (it.logo) kids.push(el("img", { class: "logo", src: it.logo, alt: "", loading: "lazy", onerror: function () { this.remove(); } }));
  kids.push(body);

  return el("a", {
    class: "card" + (isNews ? " news" : ""),
    href: `/breach/${encodeURIComponent(it.id)}`,
    onclick: (e) => { e.preventDefault(); go(it.id); },
  }, ...kids);
}

function renderDetail(id) {
  const it = FEED.items.find((x) => x.id === id);
  app.appendChild(el("a", {
    class: "back", href: "/", onclick: (e) => { e.preventDefault(); go(null); },
  }, "← Back to timeline"));

  if (!it) {
    app.appendChild(el("div", { class: "empty", text: "That incident isn't in the current feed." }));
    return;
  }

  const isNews = it.sourceType === "news";
  const head = el("div", { class: "detail-head" });
  if (it.logo) head.appendChild(el("img", { class: "logo", src: it.logo, alt: "", onerror: function () { this.remove(); } }));

  const meta = el("div", { class: "detail-meta" });
  meta.appendChild(el("span", { class: "pill" }, el("b", { text: it.source })));
  meta.appendChild(el("span", { class: "pill" + (isNews ? "" : " danger"), text: isNews ? "News report" : "Confirmed breach" }));
  if (it.published) meta.appendChild(el("span", { class: "pill" }, "Added ", el("b", { text: fmtDate(it.published) })));
  if (it.occurred) meta.appendChild(el("span", { class: "pill" }, "Occurred ", el("b", { text: fmtDate(it.occurred) })));
  if (it.affected) meta.appendChild(el("span", { class: "pill danger" }, el("b", { text: fmtNum(it.affected) }), " accounts"));
  if (it.domain) meta.appendChild(el("span", { class: "pill" }, el("b", { text: it.domain })));

  head.appendChild(el("div", {}, el("h1", { text: it.title }), meta));

  const detail = el("div", { class: "detail" }, head);

  if (it.tags && it.tags.length) {
    detail.appendChild(el("div", { class: "section-title", text: "What was exposed" }));
    const ex = el("div", { class: "exposed" });
    it.tags.forEach((t) => ex.appendChild(el("span", { class: "tag", text: t })));
    detail.appendChild(ex);
  }

  detail.appendChild(el("div", { class: "section-title", text: "Details" }));
  detail.appendChild(el("div", { class: "detail-desc", text: it.details || it.summary || "No description available." }));

  detail.appendChild(el("a", {
    class: "cta" + (isNews ? " news" : ""), href: it.url, target: "_blank", rel: "noopener noreferrer",
  }, isNews ? "Read full report ↗" : "View on source ↗"));

  app.appendChild(detail);
}

// ---------- Boot ----------
function setUpdated() {
  if (!FEED) return;
  updatedEl.textContent = "Updated " + relTime(FEED.generatedAt);
  liveDot.classList.toggle("live", !!FEED._live);
}

async function boot() {
  try {
    await loadFeed();
    // Honor ?q= deep links (matches the site's JSON-LD SearchAction).
    const q = new URLSearchParams(location.search).get("q");
    if (q) filter.q = q;
    setUpdated();
    render();
  } catch (e) {
    // Leave the server-rendered content in place; just flag that live data
    // (filters, search, refresh) isn't available right now.
    updatedEl.textContent = "Offline";
    liveDot.classList.remove("live");
  }
}

document.getElementById("refresh").addEventListener("click", async () => {
  updatedEl.textContent = "Refreshing…";
  try { await loadFeed(); setUpdated(); render(); } catch (_) { updatedEl.textContent = "Offline"; }
});

// Auto-refresh data every 5 minutes while the tab is open.
setInterval(async () => {
  try { await loadFeed(); setUpdated(); if (!routeId()) refreshList(); } catch (_) {}
}, 5 * 60 * 1000);

boot();
