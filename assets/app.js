// Recent Data Leaks — client hydration. The pages are server-rendered (see
// api/render.js); this script fetches /api/feed and re-renders the same views
// with live data plus filters, search, and client-side navigation. On failure
// it leaves the server-rendered content in place.

const app = document.getElementById("app");

let FEED = null;
let filter = { source: "all", q: "" };
const LITERAL = "https://literal.so"; // funnel target (keep in sync with render.js)
// UTM-tagged Literal link, one utm_content per placement (mirrors render.js).
function literalUrl(content) {
  return `${LITERAL}/?utm_source=recentdataleaks&utm_medium=referral&utm_campaign=breach-timeline&utm_content=${content}`;
}
// True once the user has navigated inside the SPA. On a direct load/reload the
// server-rendered detail page is complete (full details, works for the whole
// catalog), so we leave it untouched and only take over after in-app navigation.
let navigated = false;

// ---------- Data ----------
async function loadFeed() {
  const tryUrls = ["/api/feed", "/data/feed.json", "data/feed.json"];
  for (const url of tryUrls) {
    try {
      const res = await fetch(url + (url.includes("?") ? "" : `?t=${Date.now()}`));
      if (!res.ok) continue;
      const data = await res.json();
      if (data && Array.isArray(data.items)) {
        // The API sends the recent window with full card data plus a slim
        // `index` of the rest of the catalog, so search/filters cover every
        // breach. Index entries are flagged: their cards become plain links
        // (full navigation, SSR resolves them) instead of SPA navigation.
        if (Array.isArray(data.index) && data.index.length) {
          const have = new Set(data.items.map((x) => x.slug || x.id));
          data.items = data.items.concat(
            data.index
              .filter((x) => x.slug && !have.has(x.slug))
              .map((x) => ({ ...x, _indexOnly: true }))
          );
        }
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

// Literal funnel button (mirrors render.js protectCTA so it survives hydration).
function protectEl(place, content) {
  return el("a", { class: "protect-cta" + (place ? " " + place : ""), href: literalUrl(content || "hero-cta"), target: "_blank", rel: "noopener" },
    "Protect your data ", el("span", { "aria-hidden": "true" }, "→"));
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
    if (q && !(`${it.title} ${it.summary || ""} ${it.source}`.toLowerCase().includes(q))) return false;
    return true;
  });
}

// ---------- Router ----------
// "/" -> home, "/breach/<slug>" -> detail. Other server-rendered routes
// (e.g. "/year/2026") are left untouched so their SSR content stays in place.
function routeId() {
  const m = location.pathname.match(/^\/breach\/(.+)$/);
  return m ? decodeURIComponent(m[1]) : null;
}
function isManagedRoute() {
  return location.pathname === "/" || /^\/breach\//.test(location.pathname);
}
function go(key) {
  const url = key ? `/breach/${encodeURIComponent(key)}` : "/";
  navigated = true;
  history.pushState({ key: key || null }, "", url);
  render();
}
window.addEventListener("popstate", () => { navigated = true; render(); });

// ---------- Views ----------
// True after the first client re-render. Gates the entrance animations: the
// hydration re-render replaces visually identical SSR content and must not
// replay the page cascade or fade the cards a reader is already looking at.
let hadFirstRender = false;
function render() {
  if (!FEED) return;
  if (!isManagedRoute()) return; // leave server-rendered archive pages alone
  const id = routeId();
  if (id) {
    // The light feed carries only the recent window and no `details` body, so a
    // client re-render of a breach page is strictly worse than the server one
    // (and empty for anything outside that window). On first paint leave the SSR
    // content in place; only re-render once the user navigates within the SPA and
    // we actually have the item loaded.
    const it = FEED.items.find((x) => x.slug === id || x.id === id);
    if (!navigated || !it) return;
    document.body.classList.add("hydrated"); // stop the SSR page cascade rules
    app.classList.add("read");
    app.innerHTML = "";
    renderDetail(id);
  } else {
    document.body.classList.add("hydrated");
    app.classList.remove("read");
    app.innerHTML = "";
    renderList(!hadFirstRender);
  }
  hadFirstRender = true;
  window.scrollTo({ top: 0, behavior: "instant" in window ? "instant" : "auto" });
}

function renderList(noAnim) {
  const hero = el("section", { class: "hero" },
    el("h1", { text: "A live timeline of data breaches" }),
    el("p", {},
      el("span", { class: "count", text: String(FEED.count) }),
      " tracked incidents · newest first")
  );
  const status = el("div", { class: "feed-status" },
    el("span", { class: "dot live", id: "liveDot", "aria-hidden": "true" }),
    el("span", { id: "updated", text: "Live" }),
    el("button", { id: "refresh", class: "ghost-btn", type: "button", "aria-label": "Refresh the feed" }, "Refresh"));
  hero.appendChild(el("div", { class: "hero-actions" }, protectEl(), status));
  app.appendChild(hero);

  // Browse controls cluster below the hero: search, filter chips, year nav
  // (mirrors the server-rendered order in render.js homeMain).
  const search = el("input", {
    class: "search", type: "search", placeholder: "Search breaches, companies, sources…",
    value: filter.q, oninput: (e) => { filter.q = e.target.value; refreshList(); },
  });
  app.appendChild(el("div", { class: "controls" }, search));

  // Two chip rows (mirrors render.js controlsHTML): type filter, then a
  // quieter labeled row of individual sources. Same single-select semantics.
  const labels = { all: "All", breach: "Confirmed breaches", news: "News" };
  const chipFor = (s) => el("button", {
    class: "chip" + (filter.source === s ? " active" : ""),
    text: labels[s] || s,
    onclick: () => { filter.source = s; render(); },
  });
  const typeChips = el("div", { class: "chips", role: "group", "aria-label": "Filter by type" });
  ["all", "breach", "news"].forEach((s) => typeChips.appendChild(chipFor(s)));
  app.appendChild(typeChips);
  const srcChips = el("div", { class: "chips chips-src", role: "group", "aria-label": "Filter by source" });
  (FEED.sources || []).forEach((s) => srcChips.appendChild(chipFor(s)));
  app.appendChild(srcChips);

  // Prefer the full year list from the API (matches the server-rendered nav);
  // fall back to deriving from loaded items.
  const years = (FEED.years && FEED.years.length)
    ? FEED.years
    : [...new Set(FEED.items.map((i) => String(i.occurred || i.published || "").slice(0, 4)).filter(Boolean))].sort().reverse();
  if (years.length) app.appendChild(buildYearNav(years));

  const listWrap = el("div", { id: "list" });
  app.appendChild(listWrap);
  shownCount = PAGE_SIZE;
  drawTimeline(listWrap, noAnim ? Infinity : 0);
  setUpdated(); // fill the freshly-built hero status
}

function refreshList() {
  shownCount = PAGE_SIZE; // new search/filter context starts from page one
  const listWrap = document.getElementById("list");
  if (listWrap) drawTimeline(listWrap);
}

// Year nav. Mobile: every year in one scrollable row, matching the chips.
// Desktop: a windowed pager with prev/next buttons.
function buildYearNav(years) {
  const mq = (q) => window.matchMedia && window.matchMedia(q).matches;
  if (mq("(max-width: 640px)")) {
    const win = el("span", { class: "yn-window" });
    years.forEach((y) => win.appendChild(el("a", { href: `/year/${y}` }, String(y))));
    return el("nav", { class: "yearnav", "aria-label": "Browse by year" },
      el("span", { class: "yn-label", text: "Browse by year:" }), win);
  }
  const page = 7;
  let offset = 0;
  const label = el("span", { class: "yn-label", text: "Browse by year:" });
  const prev = el("button", { class: "yn-btn", type: "button", "aria-label": "Previous years" }, "‹");
  const win = el("span", { class: "yn-window" });
  const next = el("button", { class: "yn-btn", type: "button", "aria-label": "Next years" }, "›");
  let firstDraw = true; // the initial window matches the SSR paint; only paging animates
  function draw() {
    win.innerHTML = "";
    years.slice(offset, offset + page).forEach((y, i) => {
      const a = el("a", { href: `/year/${y}` }, String(y));
      if (!firstDraw) {
        a.classList.add("enter");
        a.style.animationDelay = `${i * 20}ms`;
      }
      win.appendChild(a);
    });
    prev.disabled = offset <= 0;
    next.disabled = offset + page >= years.length;
    firstDraw = false;
  }
  prev.addEventListener("click", () => { offset = Math.max(0, offset - page); draw(); });
  next.addEventListener("click", () => { offset = Math.min(Math.max(0, years.length - page), offset + page); draw(); });
  draw();
  return el("nav", { class: "yearnav", "aria-label": "Browse by year" }, label, prev, win, next);
}

// Progressive paging: PAGE_SIZE entries at a time, "View more" reveals the
// next page until the whole (filtered) catalog is on the page. shownCount
// resets whenever the list context changes (navigation, search, chips).
const PAGE_SIZE = 15;
let shownCount = PAGE_SIZE;
// animFrom: index of the first card that should play the entrance animation.
// 0 animates everything (new search/filter context), a previous shownCount
// animates only the newly revealed page, Infinity animates nothing (hydration,
// background auto-refresh).
function drawTimeline(container, animFrom = 0) {
  container.innerHTML = "";
  const all = visibleItems();
  if (!all.length) {
    container.appendChild(el("div", { class: "empty", text: "No incidents match your filters." }));
    return;
  }
  const items = all.slice(0, shownCount);

  const tl = el("div", { class: "timeline" });
  let currentDay = null;
  let dayWrap = null;
  items.forEach((it, i) => {
    const key = dayKey(it.published);
    if (key !== currentDay) {
      currentDay = key;
      tl.appendChild(el("div", { class: "day-label", text: key }));
      dayWrap = el("div", { class: "day-items" });
      tl.appendChild(dayWrap);
    }
    const card = cardFor(it);
    if (i >= animFrom) {
      card.classList.add("enter");
      card.style.animationDelay = `${Math.min(i - animFrom, 14) * 24}ms`;
    }
    dayWrap.appendChild(card);
  });
  if (all.length > items.length) {
    tl.appendChild(el("div", { class: "view-more-wrap" },
      el("button", {
        class: "ghost-btn view-more", type: "button",
        onclick: () => {
          const from = shownCount;
          shownCount += PAGE_SIZE;
          drawTimeline(container, from);
        },
      }, `View more (${all.length - items.length} remaining)`)));
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

  const key = it.slug || it.id;
  // Index-only items (outside the loaded window) navigate normally so the
  // server renders their full page; loaded items use SPA navigation.
  const attrs = { class: "card" + (isNews ? " news" : ""), href: `/breach/${encodeURIComponent(key)}` };
  if (!it._indexOnly) attrs.onclick = (e) => { e.preventDefault(); go(key); };
  return el("a", attrs, body);
}

function renderDetail(key) {
  const it = FEED.items.find((x) => x.slug === key || x.id === key);
  app.appendChild(el("a", {
    class: "back", href: "/", onclick: (e) => { e.preventDefault(); go(null); },
  }, "← Back to timeline"));

  if (!it) {
    app.appendChild(el("div", { class: "empty", text: "That incident isn't in the current feed." }));
    return;
  }

  const isNews = it.sourceType === "news";

  const meta = el("div", { class: "detail-meta" });
  meta.appendChild(el("span", { class: "pill" }, el("b", { text: it.source })));
  meta.appendChild(el("span", { class: "pill" + (isNews ? "" : " danger"), text: isNews ? "News report" : "Confirmed breach" }));
  if (it.published) meta.appendChild(el("span", { class: "pill" }, "Added ", el("b", { text: fmtDate(it.published) })));
  if (it.occurred) meta.appendChild(el("span", { class: "pill" }, "Occurred ", el("b", { text: fmtDate(it.occurred) })));
  if (it.affected) meta.appendChild(el("span", { class: "pill danger" }, el("b", { text: fmtNum(it.affected) }), " accounts"));
  if (it.domain) meta.appendChild(el("span", { class: "pill" }, el("b", { text: it.domain })));

  // .enter plays the entrance animation — renderDetail only runs on SPA
  // navigation (direct loads keep the SSR page), so this is always user-driven.
  const detail = el("div", { class: "detail enter" }, el("h1", { text: it.title }), meta);

  if (it.tags && it.tags.length) {
    detail.appendChild(el("div", { class: "section-title", text: "What was exposed" }));
    const ex = el("div", { class: "exposed" });
    it.tags.forEach((t) => ex.appendChild(el("span", { class: "tag", text: t })));
    detail.appendChild(ex);
  }

  if (it.advice && it.advice.length) {
    detail.appendChild(el("div", { class: "section-title", text: "What to do if you were affected" }));
    const ul = el("ul", { class: "advice" });
    it.advice.forEach((a) => ul.appendChild(el("li", { text: a })));
    detail.appendChild(ul);
  }

  detail.appendChild(el("div", { class: "protect-block" },
    el("div", {},
      el("b", { text: "Worried your data is exposed?" }),
      el("span", { text: "Take back control of your personal data with Literal." })),
    protectEl("on-block", "breach-cta")));

  detail.appendChild(el("div", { class: "section-title", text: "Details" }));
  detail.appendChild(el("div", { class: "detail-desc", text: it.details || it.summary || "No description available." }));

  if (it.faq && it.faq.length) {
    detail.appendChild(el("div", { class: "section-title", text: "Frequently asked questions" }));
    const wrap = el("div", { class: "faq" });
    it.faq.forEach((f) => wrap.appendChild(el("div", { class: "faq-item" },
      el("h3", { class: "faq-q", text: f.q }),
      el("p", { class: "faq-a", text: f.a }))));
    detail.appendChild(wrap);
  }

  detail.appendChild(el("a", {
    class: "cta" + (isNews ? " news" : ""), href: it.url, target: "_blank", rel: "noopener noreferrer",
  }, isNews ? "Read full report ↗" : "View on source ↗"));

  // Related breaches by shared exposed-data tags, then same year (mirrors
  // render.js relatedHTML). Plain links (full navigation) so breaches outside
  // the loaded recent window still resolve via SSR.
  const myTags = new Set(it.tags || []);
  const yr = String(it.occurred || it.published || "").slice(0, 4);
  const scored = [];
  for (const x of FEED.items) {
    if (x.id === it.id || (x.slug && x.slug === it.slug)) continue;
    let shared = 0;
    if (myTags.size && x.tags) for (const t of x.tags) if (myTags.has(t)) shared++;
    let score = Math.min(shared, 10);
    if (yr && String(x.occurred || x.published || "").slice(0, 4) === yr) score += 2;
    if (score > 0) scored.push([score, x]);
  }
  scored.sort((a, b) => b[0] - a[0]);
  let pool = scored.slice(0, 4).map((s) => s[1]);
  if (pool.length < 4) {
    const more = FEED.items.filter((x) => x.id !== it.id && !pool.includes(x)).slice(0, 4 - pool.length);
    pool = pool.concat(more);
  }
  if (pool.length) {
    detail.appendChild(el("div", { class: "section-title", text: "Related breaches" }));
    const ul = el("ul", { class: "related" });
    pool.forEach((r) => {
      ul.appendChild(el("li", {},
        el("a", { href: `/breach/${encodeURIComponent(r.slug || r.id)}` }, r.title),
        el("span", { class: "rel-src", text: r.source })
      ));
    });
    detail.appendChild(ul);
  }

  app.appendChild(detail);
}

// ---------- Boot ----------
// The status now lives in the (re-rendered) hero, so re-query each call and
// no-op on pages that don't have it.
function setUpdated() {
  if (!FEED) return;
  const u = document.getElementById("updated");
  const dot = document.getElementById("liveDot");
  if (u) u.textContent = "Updated " + relTime(FEED.generatedAt);
  if (dot) dot.classList.toggle("live", !!FEED._live);
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
    const u = document.getElementById("updated"); if (u) u.textContent = "Offline";
    const dot = document.getElementById("liveDot"); if (dot) dot.classList.remove("live");
  }
}

// Refresh lives in the hero (re-rendered), so delegate the click so it works for
// both the server-rendered button and any client re-render.
async function doRefresh() {
  const u = document.getElementById("updated"); if (u) u.textContent = "Refreshing…";
  try { await loadFeed(); setUpdated(); render(); }
  catch (_) { const u2 = document.getElementById("updated"); if (u2) u2.textContent = "Offline"; }
}
document.addEventListener("click", (e) => {
  if (e.target && e.target.closest && e.target.closest("#refresh")) { e.preventDefault(); doRefresh(); }
});

// Theme toggle: light <-> dark by toggling the `dark` class on <html>, persisted
// to localStorage. The no-flash setup in the document <head> applies the saved
// choice before first paint; this just handles clicks and keeps theme-color in sync.
const themeToggle = document.getElementById("themeToggle");
if (themeToggle) {
  const themeMeta = document.querySelector('meta[name="theme-color"]');
  const applyTheme = (dark) => {
    document.documentElement.classList.toggle("dark", dark);
    themeToggle.setAttribute("aria-pressed", dark ? "true" : "false");
    if (themeMeta) themeMeta.setAttribute("content", dark ? "#111111" : "#EDEEEF");
  };
  applyTheme(document.documentElement.classList.contains("dark"));
  themeToggle.addEventListener("click", () => {
    const dark = !document.documentElement.classList.contains("dark");
    // Cross-fade the whole page between themes (skipped under reduced motion).
    if (!(window.matchMedia && window.matchMedia("(prefers-reduced-motion: reduce)").matches)) {
      document.documentElement.classList.add("theme-anim");
      setTimeout(() => document.documentElement.classList.remove("theme-anim"), 350);
    }
    try { localStorage.setItem("theme", dark ? "dark" : "light"); } catch (_) {}
    applyTheme(dark);
  });
}

// Scroll feedback: the topbar lifts (stronger shadow) once the page is
// scrolled. Wired on every page; passive listener, cheap class toggle.
const topbar = document.querySelector(".topbar");
if (topbar) {
  const onScroll = () => topbar.classList.toggle("scrolled", window.scrollY > 4);
  window.addEventListener("scroll", onScroll, { passive: true });
  onScroll();
}

// Mobile hamburger: toggle the nav dropdown. Wired independently of the feed so
// it works on every page, even server-rendered ones the client doesn't manage.
const navToggle = document.getElementById("navtoggle");
const topNav = document.getElementById("topnav");
if (navToggle && topNav) {
  navToggle.addEventListener("click", () => {
    const open = topNav.classList.toggle("open");
    navToggle.setAttribute("aria-expanded", open ? "true" : "false");
  });
  topNav.querySelectorAll("a").forEach((a) =>
    a.addEventListener("click", () => {
      topNav.classList.remove("open");
      navToggle.setAttribute("aria-expanded", "false");
    })
  );
}

// Auto-refresh data every 5 minutes while the tab is open. Redraw in place
// without resetting shownCount, so a reader deep in the list isn't yanked
// back to the first page.
setInterval(async () => {
  try {
    await loadFeed(); setUpdated();
    if (!routeId()) {
      const listWrap = document.getElementById("list");
      if (listWrap) drawTimeline(listWrap, Infinity); // silent background redraw
    }
  } catch (_) {}
}, 5 * 60 * 1000);

boot();
