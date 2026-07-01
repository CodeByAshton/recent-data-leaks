// Server-side rendering for Recent Data Leaks.
// Routes (wired in vercel.json): "/" (home timeline), "/breach/:slug" (a breach),
// "/year/:yyyy" (year archive). Each returns fully-rendered HTML with its own
// <title>, meta description, Open Graph tags, and JSON-LD, which is what makes the
// pages indexable. Falls back to the bundled snapshot.

const { getFeed } = require("./_feed");
const { companySlug, GLOSSARY } = require("./_content");

const SITE = "https://recentdataleaks.com";
const NAME = "Recent Data Leaks";
// Recent Data Leaks is a Literal property; this is the funnel target.
const LITERAL = "https://literal.so";
// Each word in its own span so the brand can stack one-per-line on mobile.
const BRAND = NAME.split(" ").map((w) => `<span>${w}</span>`).join(" ");
const TAGLINE = "A live timeline of data breaches";
// "by Literal" lockup, shown under the wordmark; links to the product.
const BYLINE = `<a class="byline" href="${LITERAL}" target="_blank" rel="noopener">by <span>Literal</span></a>`;
// Funnel button: sends worried visitors from a breach to Literal.
function protectCTA(place) {
  return `<a class="protect-cta${place ? " " + place : ""}" href="${LITERAL}" target="_blank" rel="noopener">Protect your data <span aria-hidden="true">&rarr;</span></a>`;
}
const DESC =
  "Recent Data Leaks is a live, continuously updated timeline of public data breaches: who was breached, when it happened, how many accounts were affected, and what data was exposed. Aggregated from Have I Been Pwned and leading security news sources.";

// ---------- helpers ----------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const jsonLd = (obj) => JSON.stringify(obj).replace(/</g, "\\u003c");
function fmtNum(n) { return n == null ? null : n.toLocaleString("en-US"); }
function fmtDate(iso) {
  if (!iso) return null;
  return new Date(iso).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" });
}
function relTime(iso) {
  if (!iso) return "unknown date";
  const diff = (Date.now() - new Date(iso).getTime()) / 1000;
  if (diff < 60) return "just now";
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  if (diff < 86400 * 30) return `${Math.floor(diff / 86400)}d ago`;
  return fmtDate(iso);
}
function dayKey(iso) {
  if (!iso) return "Undated";
  const d = new Date(iso), today = new Date(), y = new Date();
  y.setDate(today.getDate() - 1);
  if (d.toDateString() === today.toDateString()) return "Today";
  if (d.toDateString() === y.toDateString()) return "Yesterday";
  return d.toLocaleDateString("en-US", { weekday: "long", month: "long", day: "numeric", year: "numeric" });
}
const yearOf = (it) => String(it.occurred || it.published || "").slice(0, 4);

// ---------- markup ----------
function cardHTML(it) {
  const isNews = it.sourceType === "news";
  const logo = it.logo ? `<img class="logo" src="${esc(it.logo)}" alt="" loading="lazy" />` : "";
  const bits = [];
  if (it.affected) bits.push(`<span><b>${esc(fmtNum(it.affected))}</b> accounts affected</span>`);
  if (it.occurred) bits.push(`<span>Occurred <b>${new Date(it.occurred).getFullYear()}</b></span>`);
  const meta = bits.length ? `<div class="meta">${bits.join("")}</div>` : "";
  return `<a class="card${isNews ? " news" : ""}" href="/breach/${esc(it.slug || it.id)}">${logo}<div class="card-body"><div class="card-top"><span class="badge${isNews ? " news" : ""}">${isNews ? "News" : "Breach"}</span><span class="src">${esc(it.source)}</span><span class="time">${esc(relTime(it.published))}</span></div><h3>${esc(it.title)}</h3><p>${esc(it.summary || "")}</p>${meta}</div></a>`;
}

function listHTML(items) {
  if (!items.length) return `<div class="empty">No incidents available right now.</div>`;
  let out = `<div class="timeline">`, day = null;
  for (const it of items) {
    const k = dayKey(it.published);
    if (k !== day) {
      if (day !== null) out += `</div>`;
      out += `<div class="day-label">${esc(k)}</div><div class="day-items">`;
      day = k;
    }
    out += cardHTML(it);
  }
  return out + `</div></div>`;
}

function yearNavHTML(items) {
  const years = [...new Set(items.map(yearOf).filter(Boolean))].sort().reverse();
  if (!years.length) return "";
  // Static first window + paging buttons. The client (app.js) makes the buttons
  // interactive on the home page; this is just the initial, non-wrapping paint.
  const N = 7;
  const win = years.slice(0, N).map((y) => `<a href="/year/${y}">${y}</a>`).join("");
  const nextDisabled = years.length <= N ? " disabled" : "";
  return `<nav class="yearnav" aria-label="Browse by year"><span class="yn-label">Browse by year:</span><button class="yn-btn" type="button" aria-label="Previous years" disabled>&lsaquo;</button><span class="yn-window">${win}</span><button class="yn-btn" type="button" aria-label="Next years"${nextDisabled}>&rsaquo;</button></nav>`;
}

// Labels for the source filter chips; mirrors app.js so the server-rendered
// controls match the hydrated ones and the layout doesn't shift on load.
const SOURCE_LABELS = { all: "All", breach: "Confirmed breaches", news: "News" };
function controlsHTML(feed) {
  const sources = ["all", "breach", "news", ...(feed.sources || [])];
  const chips = sources
    .map((s) => `<button class="chip${s === "all" ? " active" : ""}" type="button">${esc(SOURCE_LABELS[s] || s)}</button>`)
    .join("");
  return `<div class="controls"><input class="search" type="search" placeholder="Search breaches, companies, sources&hellip;" aria-label="Search breaches" value="" /></div><div class="chips">${chips}</div>`;
}

const HOME_LIMIT = 80;
function homeMain(feed) {
  const recent = feed.items.slice(0, HOME_LIMIT);
  const more = feed.count > HOME_LIMIT
    ? `<p class="more-note">Showing the ${HOME_LIMIT} most recent of ${feed.count} tracked incidents. <a href="/stats">See statistics</a> or browse by year above.</p>`
    : "";
  return `<section class="hero"><h1>${esc(TAGLINE)}</h1><p><span class="count">${feed.count}</span> tracked incidents &middot; newest first</p><div class="hero-cta">${protectCTA()}</div>${yearNavHTML(feed.items)}</section>${controlsHTML(feed)}${listHTML(recent)}${more}`;
}

function statsMain(feed) {
  const items = feed.items;
  const breaches = items.filter((x) => x.sourceType === "breach");
  const totalAccounts = breaches.reduce((s, x) => s + (x.affected || 0), 0);
  const byYear = {};
  for (const it of items) { const y = yearOf(it); if (y) byYear[y] = (byYear[y] || 0) + 1; }
  const years = Object.keys(byYear).sort().reverse();
  const tagCount = {};
  for (const b of breaches) for (const t of b.tags || []) tagCount[t] = (tagCount[t] || 0) + 1;
  const topTags = Object.entries(tagCount).sort((a, b) => b[1] - a[1]).slice(0, 10);
  const largest = [...breaches].filter((x) => x.affected).sort((a, b) => b.affected - a.affected).slice(0, 8);

  const stat = (n, l) => `<div class="stat"><div class="stat-n">${esc(n)}</div><div class="stat-l">${esc(l)}</div></div>`;
  const yearRows = years.map((y) => `<li><a href="/year/${y}">${y}</a><span class="bar" style="--w:${Math.round((byYear[y] / Math.max(...Object.values(byYear))) * 100)}%"></span><b>${byYear[y]}</b></li>`).join("");
  const tagRows = topTags.map(([t, c]) => `<li><span>${esc(t)}</span><b>${c}</b></li>`).join("");
  const bigRows = largest.map((b) => `<li><a href="/breach/${esc(b.slug)}">${esc(b.title)}</a><b>${esc(fmtNum(b.affected))}</b></li>`).join("");

  return `<a class="back" href="/">&larr; Back to timeline</a>
<section class="hero"><h1>Data breach statistics</h1><p>A live snapshot of what Recent Data Leaks is tracking.</p></section>
<div class="statgrid">${stat(fmtNum(feed.count), "incidents tracked")}${stat(fmtNum(breaches.length), "confirmed breaches")}${stat(fmtNum(totalAccounts), "accounts exposed")}${stat(years.length, "years covered")}</div>
<div class="section-title">Incidents by year</div><ul class="ranklist">${yearRows}</ul>
<div class="section-title">Most commonly exposed data</div><ul class="ranklist plain">${tagRows}</ul>
<div class="section-title">Largest breaches by accounts</div><ul class="ranklist plain">${bigRows}</ul>`;
}

function aboutMain() {
  return `<a class="back" href="/">&larr; Back to timeline</a>
<section class="hero"><h1>About Recent Data Leaks</h1></section>
<div class="prose">
<p>Recent Data Leaks is a continuously updated timeline of public data breaches. The goal is simple: help people quickly see who was breached, when it happened, how many accounts were affected, what data was exposed, and what to do about it.</p>
<p>Every breach has its own page with a plain-English summary, the categories of data exposed, and concrete steps to take if you may be affected. The site refreshes automatically as new breaches are disclosed.</p>
<p>Recent Data Leaks aggregates publicly available information and links back to the original sources. It is not affiliated with any of them, and it is provided for awareness only. It is not legal, financial, or security advice.</p>
<p>See the <a href="/methodology">methodology</a> for how the data is collected, or browse the <a href="/stats">statistics</a>.</p>
</div>`;
}

function methodologyMain(feed) {
  return `<a class="back" href="/">&larr; Back to timeline</a>
<section class="hero"><h1>Methodology</h1></section>
<div class="prose">
<p>Recent Data Leaks aggregates breach information from public sources and normalizes it into a single timeline.</p>
<h2>Sources</h2>
<ul>
<li><b>Have I Been Pwned</b> &mdash; the catalog of confirmed, verified breaches, including the company, date, number of accounts, and the categories of data exposed.</li>
<li><b>Security news</b> &mdash; breach reporting from BleepingComputer, The Hacker News, Krebs on Security, The Record, and SecurityWeek, filtered to genuine data-breach incidents.</li>
</ul>
<h2>How it works</h2>
<ul>
<li>Sources are fetched server-side and combined into one feed, refreshed roughly every 15 minutes.</li>
<li>News headlines are filtered with breach-specific keywords, and near-duplicate stories about the same incident are collapsed.</li>
<li>Each breach page adds an original summary, the exposed-data categories, and "what to do if affected" guidance.</li>
<li>Account totals and dates come directly from the source records.</li>
</ul>
<h2>Limitations</h2>
<p>Breach data is inherently incomplete and sometimes revised after disclosure. Account counts are estimates reported at the time. Always confirm details with the original source before acting. Currently tracking ${feed.count} incidents.</p>
</div>`;
}

function yearMain(items, year) {
  return `<a class="back" href="/">&larr; Back to timeline</a><section class="hero"><h1>Data breaches in ${esc(year)}</h1><p><span class="count">${items.length}</span> tracked incident${items.length === 1 ? "" : "s"} from ${esc(year)}</p></section>${listHTML(items)}`;
}

function relatedHTML(it, items) {
  let pool = items.filter((x) => x.id !== it.id && x.source === it.source).slice(0, 4);
  if (pool.length < 3) {
    const yr = yearOf(it);
    const more = items.filter((x) => x.id !== it.id && yearOf(x) === yr && !pool.includes(x)).slice(0, 4 - pool.length);
    pool = pool.concat(more);
  }
  if (!pool.length) return "";
  return `<div class="section-title">Related breaches</div><ul class="related">${pool.map((r) => `<li><a href="/breach/${esc(r.slug || r.id)}">${esc(r.title)}</a><span class="rel-src">${esc(r.source)}</span></li>`).join("")}</ul>`;
}

function detailMain(it, items) {
  const isNews = it.sourceType === "news";
  const logo = it.logo ? `<img class="logo" src="${esc(it.logo)}" alt="" />` : "";
  const pills = [`<span class="pill"><b>${esc(it.source)}</b></span>`,
    `<span class="pill${isNews ? "" : " danger"}">${isNews ? "News report" : "Confirmed breach"}</span>`];
  if (it.published) pills.push(`<span class="pill">Added <b>${esc(fmtDate(it.published))}</b></span>`);
  if (it.occurred) pills.push(`<span class="pill">Occurred <b>${esc(fmtDate(it.occurred))}</b></span>`);
  if (it.affected) pills.push(`<span class="pill danger"><b>${esc(fmtNum(it.affected))}</b> accounts</span>`);
  if (it.domain) pills.push(`<span class="pill"><b>${esc(it.domain)}</b></span>`);
  if (!isNews) pills.push(`<a class="pill pill-link" href="/company/${esc(companySlug(it))}">All ${esc(it.title)} breaches &rarr;</a>`);

  const exposed = (it.tags && it.tags.length)
    ? `<div class="section-title">What was exposed</div><div class="exposed">${it.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>`
    : "";
  const advice = (it.advice && it.advice.length)
    ? `<div class="section-title">What to do if you were affected</div><ul class="advice">${it.advice.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`
    : "";
  const protect = `<div class="protect-block"><div><b>Worried your data is exposed?</b><span>Take back control of your personal data with Literal.</span></div>${protectCTA("on-block")}</div>`;
  const faq = (it.faq && it.faq.length)
    ? `<div class="section-title">Frequently asked questions</div><div class="faq">${it.faq.map((f) => `<div class="faq-item"><h3 class="faq-q">${esc(f.q)}</h3><p class="faq-a">${esc(f.a)}</p></div>`).join("")}</div>`
    : "";

  return `<a class="back" href="/">&larr; Back to timeline</a><div class="detail"><div class="detail-head">${logo}<div><h1>${esc(it.title)}</h1><div class="detail-meta">${pills.join("")}</div></div></div>${exposed}${advice}${protect}<div class="section-title">Details</div><div class="detail-desc">${esc(it.details || it.summary || "No description available.")}</div>${faq}<a class="cta" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer nofollow">${isNews ? "Read full report &#8599;" : "View on source &#8599;"}</a>${relatedHTML(it, items)}</div>`;
}

// ---------- SEO surface pages ----------
function biggestMain(feed) {
  const top = feed.items
    .filter((x) => x.sourceType === "breach" && x.affected)
    .sort((a, b) => b.affected - a.affected)
    .slice(0, 50);
  const rows = top.map((b, i) =>
    `<li><span class="rank">${i + 1}</span><a href="/breach/${esc(b.slug)}">${esc(b.title)}</a><span class="rel-src">${b.occurred ? new Date(b.occurred).getFullYear() : (b.published ? new Date(b.published).getFullYear() : "")}</span><b>${esc(fmtNum(b.affected))}</b></li>`).join("");
  return `<a class="back" href="/">&larr; Back to timeline</a><section class="hero"><h1>The biggest data breaches of all time</h1><p>The largest known breaches by number of accounts affected, drawn from the ${feed.count} incidents tracked here.</p></section><ul class="ranklist plain">${rows}</ul>`;
}

function companyMain(feed, slug) {
  const items = feed.items.filter((x) => x.sourceType === "breach" && companySlug(x) === slug);
  if (!items.length) return null;
  const name = items[0].title;
  const tags = [...new Set(items.flatMap((x) => x.tags || []))];
  const total = items.reduce((s, x) => s + (x.affected || 0), 0);
  const incidents = items.map((b) =>
    `<li><a href="/breach/${esc(b.slug)}">${esc(b.title)}</a><span class="rel-src">${b.occurred ? fmtDate(b.occurred) : (b.published ? fmtDate(b.published) : "")}</span>${b.affected ? `<b>${esc(fmtNum(b.affected))}</b>` : ""}</li>`).join("");
  const exposed = tags.length
    ? `<div class="section-title">Data exposed across these incidents</div><div class="exposed">${tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>`
    : "";
  const intro = `${esc(name)} appears in ${items.length} tracked breach${items.length > 1 ? "es" : ""}${total ? `, affecting around ${fmtNum(total)} accounts in total` : ""}.`;
  return `<a class="back" href="/">&larr; Back to timeline</a><section class="hero"><h1>Has ${esc(name)} had a data breach?</h1><p>${intro}</p></section><div class="section-title">Known incidents</div><ul class="ranklist plain">${incidents}</ul>${exposed}<div class="prose" style="margin-top:24px"><p>If you have an account with ${esc(name)}, change your password and turn on two-factor authentication, and treat messages that reference the company with caution. Open any incident above for what was exposed and what to do.</p></div>`;
}

function glossaryIndexMain() {
  const rows = GLOSSARY.map((g) =>
    `<li><a href="/glossary/${g.slug}">${esc(g.term)}</a><span class="rel-src">${esc(g.short)}</span></li>`).join("");
  return `<a class="back" href="/">&larr; Back to timeline</a><section class="hero"><h1>Security &amp; breach glossary</h1><p>Plain-English definitions of common data-breach and security terms.</p></section><ul class="related">${rows}</ul>`;
}

function glossaryTermMain(g) {
  return `<a class="back" href="/glossary">&larr; All terms</a><section class="hero"><h1>${esc(g.term)}</h1></section><div class="prose"><p>${esc(g.body)}</p><p><a href="/glossary">Back to the glossary</a> or <a href="/">browse recent data breaches</a>.</p></div>`;
}

function builtMain(feed) {
  return `<a class="back" href="/">&larr; Back to timeline</a>
<section class="hero"><h1>How this site is built</h1><p>The engineering behind a live, server-rendered breach timeline.</p></section>
<div class="prose">
<p>Recent Data Leaks is a server-rendered site with no front-end framework and one runtime dependency. It currently tracks ${feed.count} incidents and refreshes continuously.</p>
<h2>Stack</h2>
<ul>
<li><b>Vercel</b> serverless and edge functions, no build step.</li>
<li><b>Vanilla JavaScript</b> for both the server renderer and the client. The pages are server-rendered for SEO, then hydrated for filtering, search, and navigation.</li>
<li><b>Dependency-free aggregation.</b> Sources are fetched server-side and parsed with hand-written RSS handling, so there is no CORS problem and no parser library.</li>
</ul>
<h2>How a request is served</h2>
<ul>
<li><b>Pages</b> (<code>/</code>, <code>/breach/:slug</code>, archives) render full HTML in a serverless function with per-page title, meta, Open Graph, and JSON-LD. Vercel's CDN caches the result for ~15 minutes.</li>
<li><b>The feed</b> (<code>/api/feed</code>) aggregates Have I Been Pwned plus five security news feeds, dedupes and clusters them, and returns a light recent window for the client.</li>
<li><b>OG images</b> (<code>/api/og</code>) are generated as PNGs at the edge, per breach, so shared links show a real preview.</li>
<li><b>A bundled snapshot</b> serves as a fallback so a page never renders blank if a source is down.</li>
</ul>
<h2>SEO surface</h2>
<p>Every breach is its own indexable page with original "what to do" guidance and an FAQ. Year archives, per-company hubs, a statistics page, and a glossary add depth, all cross-linked and listed in a dynamic sitemap.</p>
<p>The source is on <a href="https://github.com/CodeByAshton/recent-data-leaks" target="_blank" rel="noopener">GitHub</a>.</p>
</div>`;
}

// ---------- document ----------
function page({ title, description, canonical, robots, ogType, image, jsonld, main, publishedTime, modifiedTime }) {
  const verify = [
    process.env.GOOGLE_SITE_VERIFICATION ? `<meta name="google-site-verification" content="${esc(process.env.GOOGLE_SITE_VERIFICATION)}" />` : "",
    process.env.BING_SITE_VERIFICATION ? `<meta name="msvalidate.01" content="${esc(process.env.BING_SITE_VERIFICATION)}" />` : "",
  ].join("");
  const img = image || `${SITE}/api/og`;
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<script>try{if(localStorage.getItem("theme")==="dark")document.documentElement.classList.add("dark")}catch(e){}</script>
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="robots" content="${robots || "index, follow, max-image-preview:large, max-snippet:-1"}" />
<meta name="theme-color" content="#EDEEEF" />
<link rel="canonical" href="${esc(canonical)}" />
${verify}
<meta property="og:type" content="${ogType || "website"}" />
<meta property="og:site_name" content="${NAME}" />
<meta property="og:locale" content="en_US" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${esc(img)}" />
<meta property="og:image:width" content="1200" />
<meta property="og:image:height" content="630" />
<meta property="og:image:alt" content="${esc(title)}" />
${ogType === "article" && publishedTime ? `<meta property="article:published_time" content="${esc(publishedTime)}" />` : ""}
${ogType === "article" && modifiedTime ? `<meta property="article:modified_time" content="${esc(modifiedTime)}" />` : ""}
${ogType === "article" ? `<meta property="article:publisher" content="${LITERAL}" />` : ""}
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(img)}" />
<meta name="twitter:image:alt" content="${esc(title)}" />
<link rel="alternate" type="application/rss+xml" title="${NAME}" href="${SITE}/rss.xml" />
${jsonld ? `<script type="application/ld+json">${jsonld}</script>` : ""}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Crect width='100' height='100' rx='24' fill='%231A1A1A'/%3E%3Ccircle cx='50' cy='50' r='19' fill='%23EDEEEF'/%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Inter:wght@400;450;500;600&family=Inter+Tight:wght@500;600;700&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/assets/styles.css" />
</head>
<body>
<a class="skip" href="#app">Skip to content</a>
<header class="topbar"><div class="wrap"><div class="brandblock"><a class="brand" href="/">${BRAND}</a>${BYLINE}</div><nav class="topnav" id="topnav" aria-label="Primary"><a href="/stats">Statistics</a><a href="/about">About</a><a href="/methodology">Methodology</a></nav><div class="status"><span class="dot live" id="liveDot" aria-hidden="true"></span><span id="updated">Live</span><button id="themeToggle" class="ghost-btn icon-btn" type="button" aria-label="Toggle dark mode"><svg class="i-moon" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><path d="M21 12.79A9 9 0 1 1 11.21 3 7 7 0 0 0 21 12.79z"/></svg><svg class="i-sun" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true"><circle cx="12" cy="12" r="4.5"/><path d="M12 2v2M12 20v2M4.9 4.9l1.4 1.4M17.7 17.7l1.4 1.4M2 12h2M20 12h2M4.9 19.1l1.4-1.4M17.7 6.3l1.4-1.4"/></svg></button><button id="refresh" class="ghost-btn" type="button" aria-label="Refresh the feed">Refresh</button></div><button class="navtoggle" id="navtoggle" type="button" aria-label="Menu" aria-controls="topnav" aria-expanded="false"><span></span><span></span><span></span></button></div></header>
<main class="wrap" id="app">${main}</main>
<footer class="wrap foot"><nav class="footnav" aria-label="Footer"><a href="/stats">Statistics</a> &middot; <a href="/biggest-data-breaches">Biggest breaches</a> &middot; <a href="/glossary">Glossary</a> &middot; <a href="/about">About</a> &middot; <a href="/methodology">Methodology</a> &middot; <a href="/how-its-built">How it&#39;s built</a> &middot; <a href="/rss.xml">RSS</a> &middot; <a href="/sitemap.xml">Sitemap</a></nav><p>Aggregated from Have I Been Pwned, BleepingComputer, The Hacker News, Krebs on Security, The Record &amp; SecurityWeek. Not affiliated with any source. For awareness only.</p></footer>
<script defer src="/_vercel/insights/script.js"></script>
<script src="/assets/app.js"></script>
</body>
</html>`;
}

// ---------- handler ----------
module.exports = async function handler(req, res) {
  const u = new URL(req.url, "http://localhost");
  const id = u.searchParams.get("id");
  const year = u.searchParams.get("year");
  const view = u.searchParams.get("view");
  const company = u.searchParams.get("company");
  const term = u.searchParams.get("term");
  const feed = await getFeed();

  let html, status = 200;

  if (id) {
    const it = feed.items.find((x) => x.slug === id || x.id === id);
    // Consolidate old hash-id links onto the canonical slug URL with a 301.
    if (it && id === it.id && it.slug && id !== it.slug) {
      res.statusCode = 301;
      res.setHeader("Location", `/breach/${it.slug}`);
      return res.end();
    }
    if (!it) {
      status = 404;
      html = page({
        title: `Not found — ${NAME}`,
        description: "This breach is no longer in the current feed.",
        canonical: `${SITE}/`,
        robots: "noindex, follow",
        main: `<a class="back" href="/">&larr; Back to timeline</a><div class="empty">That incident isn&#39;t in the current feed.</div>`,
      });
    } else {
      const graph = [
        {
          "@type": "Article",
          headline: it.title,
          description: it.summary || DESC,
          datePublished: it.published || undefined,
          dateModified: it.published || undefined,
          image: `${SITE}/api/og?id=${encodeURIComponent(it.slug || it.id)}`,
          mainEntityOfPage: `${SITE}/breach/${it.slug || it.id}`,
          author: { "@type": "Organization", name: NAME, url: `${SITE}/` },
          publisher: {
            "@type": "Organization", name: NAME,
            logo: { "@type": "ImageObject", url: `${SITE}/assets/icon.svg` },
          },
          isPartOf: { "@type": "WebSite", name: NAME, url: `${SITE}/` },
        },
        {
          "@type": "BreadcrumbList",
          itemListElement: [
            { "@type": "ListItem", position: 1, name: NAME, item: `${SITE}/` },
            { "@type": "ListItem", position: 2, name: it.title },
          ],
        },
      ];
      if (it.faq && it.faq.length) {
        graph.push({
          "@type": "FAQPage",
          mainEntity: it.faq.map((f) => ({
            "@type": "Question",
            name: f.q,
            acceptedAnswer: { "@type": "Answer", text: f.a },
          })),
        });
      }
      const ld = jsonLd({ "@context": "https://schema.org", "@graph": graph });
      const affected = it.affected ? ` ${fmtNum(it.affected)} accounts affected.` : "";
      html = page({
        title: `${it.title} — ${NAME}`,
        description: (it.summary || `${it.title}.${affected}`).slice(0, 300),
        canonical: `${SITE}/breach/${it.slug || it.id}`,
        ogType: "article",
        image: `${SITE}/api/og?id=${encodeURIComponent(it.slug || it.id)}`,
        publishedTime: it.published || undefined,
        modifiedTime: it.published || undefined,
        jsonld: ld,
        main: detailMain(it, feed.items),
      });
    }
  } else if (year) {
    const items = feed.items.filter((x) => yearOf(x) === year);
    const ld = jsonLd({
      "@context": "https://schema.org",
      "@type": "CollectionPage",
      name: `Data breaches in ${year}`,
      url: `${SITE}/year/${year}`,
      description: `Public data breaches recorded in ${year}.`,
    });
    html = page({
      title: `Data breaches in ${year} — ${NAME}`,
      description: `A timeline of public data breaches recorded in ${year}: companies breached, accounts affected, and what data was exposed.`,
      canonical: `${SITE}/year/${year}`,
      robots: items.length ? undefined : "noindex, follow",
      jsonld: ld,
      main: yearMain(items, year),
    });
  } else if (company) {
    const main = companyMain(feed, company);
    if (!main) {
      status = 404;
      html = page({
        title: `Not found — ${NAME}`,
        description: "No tracked breaches found for this company.",
        canonical: `${SITE}/`,
        robots: "noindex, follow",
        main: `<a class="back" href="/">&larr; Back to timeline</a><div class="empty">No tracked breaches found for that company.</div>`,
      });
    } else {
      const cItems = feed.items.filter((x) => x.sourceType === "breach" && companySlug(x) === company);
      const name = cItems[0].title;
      const ld = jsonLd({
        "@context": "https://schema.org",
        "@type": "FAQPage",
        mainEntity: [{
          "@type": "Question",
          name: `Has ${name} had a data breach?`,
          acceptedAnswer: { "@type": "Answer", text: `${name} appears in ${cItems.length} tracked breach${cItems.length > 1 ? "es" : ""}.` },
        }],
      });
      html = page({
        title: `Has ${name} had a data breach? — ${NAME}`,
        description: `Known data breaches involving ${name}: dates, accounts affected, and what data was exposed.`,
        canonical: `${SITE}/company/${company}`,
        jsonld: ld,
        main,
      });
    }
  } else if (view === "biggest") {
    html = page({
      title: `The biggest data breaches of all time — ${NAME}`,
      description: "The largest known data breaches ranked by number of accounts affected, with what was exposed and links to each incident.",
      canonical: `${SITE}/biggest-data-breaches`,
      jsonld: jsonLd({ "@context": "https://schema.org", "@type": "CollectionPage", name: "The biggest data breaches of all time", url: `${SITE}/biggest-data-breaches` }),
      main: biggestMain(feed),
    });
  } else if (view === "glossary") {
    const g = term ? GLOSSARY.find((x) => x.slug === term) : null;
    if (term && !g) {
      status = 404;
      html = page({
        title: `Not found — ${NAME}`,
        description: "Term not found.",
        canonical: `${SITE}/glossary`,
        robots: "noindex, follow",
        main: `<a class="back" href="/glossary">&larr; All terms</a><div class="empty">That term isn&#39;t in the glossary.</div>`,
      });
    } else if (g) {
      html = page({
        title: `${g.term} — ${NAME}`,
        description: g.short,
        canonical: `${SITE}/glossary/${g.slug}`,
        jsonld: jsonLd({ "@context": "https://schema.org", "@type": "DefinedTerm", name: g.term, description: g.body, inDefinedTermSet: `${SITE}/glossary` }),
        main: glossaryTermMain(g),
      });
    } else {
      html = page({
        title: `Security & breach glossary — ${NAME}`,
        description: "Plain-English definitions of common data-breach and security terms: phishing, credential stuffing, ransomware, credit freeze, and more.",
        canonical: `${SITE}/glossary`,
        main: glossaryIndexMain(),
      });
    }
  } else if (view === "stats") {
    html = page({
      title: `Data breach statistics — ${NAME}`,
      description: "Live statistics on the data breaches tracked by Recent Data Leaks: total incidents, accounts exposed, breaches by year, and the most commonly exposed data.",
      canonical: `${SITE}/stats`,
      jsonld: jsonLd({ "@context": "https://schema.org", "@type": "CollectionPage", name: "Data breach statistics", url: `${SITE}/stats`, description: "Statistics on tracked public data breaches." }),
      main: statsMain(feed),
    });
  } else if (view === "about") {
    html = page({
      title: `About — ${NAME}`,
      description: "About Recent Data Leaks: a live timeline of public data breaches built to help people see who was breached, what was exposed, and what to do.",
      canonical: `${SITE}/about`,
      main: aboutMain(),
    });
  } else if (view === "methodology") {
    html = page({
      title: `Methodology — ${NAME}`,
      description: "How Recent Data Leaks collects and normalizes breach data: its sources, refresh cadence, news filtering, and limitations.",
      canonical: `${SITE}/methodology`,
      main: methodologyMain(feed),
    });
  } else if (view === "built") {
    html = page({
      title: `How this site is built — ${NAME}`,
      description: "The engineering behind Recent Data Leaks: server-rendered vanilla JS on Vercel, dependency-free multi-source aggregation, and edge-generated OG images.",
      canonical: `${SITE}/how-its-built`,
      main: builtMain(feed),
    });
  } else {
    const ld = jsonLd({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "Organization",
          "@id": `${SITE}/#organization`,
          name: NAME,
          url: `${SITE}/`,
          logo: `${SITE}/assets/icon.svg`,
          parentOrganization: { "@type": "Organization", name: "Literal", url: LITERAL },
        },
        {
          "@type": "WebSite", name: NAME, url: `${SITE}/`, description: DESC,
          publisher: { "@id": `${SITE}/#organization` },
          potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: `${SITE}/?q={search_term_string}` },
            "query-input": "required name=search_term_string",
          },
        },
        {
          "@type": "ItemList",
          itemListElement: feed.items.slice(0, 25).map((it, i) => ({
            "@type": "ListItem", position: i + 1, url: `${SITE}/breach/${it.slug || it.id}`, name: it.title,
          })),
        },
      ],
    });
    html = page({
      title: `${NAME} — ${TAGLINE}`,
      description: DESC,
      canonical: `${SITE}/`,
      jsonld: ld,
      main: homeMain(feed),
    });
  }

  res.setHeader("Content-Type", "text/html; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
  res.statusCode = status;
  return res.end(html);
};
