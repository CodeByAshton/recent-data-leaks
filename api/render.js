// Server-side rendering for Recent Data Leaks.
// Handles the home timeline ("/") and per-breach pages ("/breach/:id"), each
// returned as fully-rendered HTML with its own <title>, meta description, Open
// Graph tags, and JSON-LD. This is what makes individual breaches indexable.
// Wired via rewrites in vercel.json. Falls back to the bundled snapshot.

const fs = require("node:fs");
const path = require("node:path");
const { aggregate } = require("./_aggregate");

const SITE = "https://recentdataleaks.com";
const NAME = "Recent Data Leaks";
const TAGLINE = "A live timeline of data breaches";
const DESC =
  "Recent Data Leaks is a live, continuously updated timeline of public data breaches: who was breached, when it happened, how many accounts were affected, and what data was exposed. Aggregated from Have I Been Pwned and leading security news sources.";

// ---------- data ----------
async function getFeed() {
  try {
    const f = await aggregate();
    if (f.items.length) return f;
    throw new Error("empty");
  } catch (_) {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "data", "feed.json"), "utf8")
      );
    } catch (e) {
      return { items: [], count: 0, generatedAt: new Date().toISOString(), sources: [] };
    }
  }
}

// ---------- helpers ----------
function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}
const jsonLd = (obj) =>
  JSON.stringify(obj).replace(/</g, "\\u003c"); // safe inside <script>

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

// ---------- markup ----------
function cardHTML(it) {
  const isNews = it.sourceType === "news";
  const logo = it.logo
    ? `<img class="logo" src="${esc(it.logo)}" alt="" loading="lazy" />` : "";
  let meta = "";
  const bits = [];
  if (it.affected) bits.push(`<span><b>${esc(fmtNum(it.affected))}</b> accounts affected</span>`);
  if (it.occurred) bits.push(`<span>Occurred <b>${new Date(it.occurred).getFullYear()}</b></span>`);
  if (bits.length) meta = `<div class="meta">${bits.join("")}</div>`;
  return `<a class="card${isNews ? " news" : ""}" href="/breach/${esc(it.id)}">${logo}<div class="card-body"><div class="card-top"><span class="badge${isNews ? " news" : ""}">${isNews ? "News" : "Breach"}</span><span class="src">${esc(it.source)}</span><span class="time">${esc(relTime(it.published))}</span></div><h3>${esc(it.title)}</h3><p>${esc(it.summary || "")}</p>${meta}</div></a>`;
}

function listHTML(items) {
  if (!items.length) return `<div class="empty">No incidents available right now.</div>`;
  let out = `<div class="timeline">`;
  let day = null;
  for (const it of items) {
    const k = dayKey(it.published);
    if (k !== day) {
      if (day !== null) out += `</div>`;
      out += `<div class="day-label">${esc(k)}</div><div class="day-items">`;
      day = k;
    }
    out += cardHTML(it);
  }
  out += `</div></div>`;
  return out;
}

function homeMain(feed) {
  return `<section class="hero"><h1>${esc(TAGLINE)}</h1><p><span class="count">${feed.count}</span> tracked incidents &middot; newest first</p></section>${listHTML(feed.items)}`;
}

function detailMain(it) {
  const isNews = it.sourceType === "news";
  const logo = it.logo ? `<img class="logo" src="${esc(it.logo)}" alt="" />` : "";
  const pills = [];
  pills.push(`<span class="pill"><b>${esc(it.source)}</b></span>`);
  pills.push(`<span class="pill${isNews ? "" : " danger"}">${isNews ? "News report" : "Confirmed breach"}</span>`);
  if (it.published) pills.push(`<span class="pill">Added <b>${esc(fmtDate(it.published))}</b></span>`);
  if (it.occurred) pills.push(`<span class="pill">Occurred <b>${esc(fmtDate(it.occurred))}</b></span>`);
  if (it.affected) pills.push(`<span class="pill danger"><b>${esc(fmtNum(it.affected))}</b> accounts</span>`);
  if (it.domain) pills.push(`<span class="pill"><b>${esc(it.domain)}</b></span>`);

  let exposed = "";
  if (it.tags && it.tags.length) {
    exposed = `<div class="section-title">What was exposed</div><div class="exposed">${it.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>`;
  }
  return `<a class="back" href="/">&larr; Back to timeline</a><div class="detail"><div class="detail-head">${logo}<div><h1>${esc(it.title)}</h1><div class="detail-meta">${pills.join("")}</div></div></div>${exposed}<div class="section-title">Details</div><div class="detail-desc">${esc(it.details || it.summary || "No description available.")}</div><a class="cta" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer nofollow">${isNews ? "Read full report &#8599;" : "View on source &#8599;"}</a></div>`;
}

// ---------- document ----------
function page({ title, description, canonical, robots, ogType, jsonld, main }) {
  return `<!DOCTYPE html>
<html lang="en">
<head>
<meta charset="UTF-8" />
<meta name="viewport" content="width=device-width, initial-scale=1.0" />
<title>${esc(title)}</title>
<meta name="description" content="${esc(description)}" />
<meta name="robots" content="${robots || "index, follow, max-image-preview:large, max-snippet:-1"}" />
<meta name="theme-color" content="#0a0a0a" />
<link rel="canonical" href="${esc(canonical)}" />
<meta property="og:type" content="${ogType || "website"}" />
<meta property="og:site_name" content="${NAME}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${SITE}/assets/og.svg" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${SITE}/assets/og.svg" />
${jsonld ? `<script type="application/ld+json">${jsonld}</script>` : ""}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='42' fill='%23f5f5f5'/%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/assets/styles.css" />
</head>
<body>
<header class="topbar"><div class="wrap"><a class="brand" href="/">${NAME}</a><div class="status"><span class="dot live" id="liveDot"></span><span id="updated">Live</span><button id="refresh" class="ghost-btn" title="Refresh">Refresh</button></div></div></header>
<main class="wrap" id="app">${main}</main>
<footer class="wrap foot"><p>Aggregated from Have I Been Pwned, BleepingComputer, The Hacker News, Krebs on Security, The Record &amp; SecurityWeek. Not affiliated with any source. For awareness only.</p></footer>
<script src="/assets/app.js"></script>
</body>
</html>`;
}

// ---------- handler ----------
module.exports = async function handler(req, res) {
  const u = new URL(req.url, "http://localhost");
  const id = u.searchParams.get("id");
  const feed = await getFeed();

  let html, status = 200;

  if (id) {
    const it = feed.items.find((x) => x.id === id);
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
      const ld = jsonLd({
        "@context": "https://schema.org",
        "@graph": [
          {
            "@type": "Article",
            headline: it.title,
            description: it.summary || DESC,
            datePublished: it.published || undefined,
            dateModified: it.published || undefined,
            mainEntityOfPage: `${SITE}/breach/${it.id}`,
            author: { "@type": "Organization", name: NAME },
            publisher: { "@type": "Organization", name: NAME },
          },
          {
            "@type": "BreadcrumbList",
            itemListElement: [
              { "@type": "ListItem", position: 1, name: NAME, item: `${SITE}/` },
              { "@type": "ListItem", position: 2, name: it.title },
            ],
          },
        ],
      });
      const affected = it.affected ? ` ${fmtNum(it.affected)} accounts affected.` : "";
      html = page({
        title: `${it.title} — ${NAME}`,
        description: (it.summary || `${it.title}.${affected}`).slice(0, 300),
        canonical: `${SITE}/breach/${it.id}`,
        ogType: "article",
        jsonld: ld,
        main: detailMain(it),
      });
    }
  } else {
    const ld = jsonLd({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite",
          name: NAME,
          url: `${SITE}/`,
          description: DESC,
          potentialAction: {
            "@type": "SearchAction",
            target: { "@type": "EntryPoint", urlTemplate: `${SITE}/?q={search_term_string}` },
            "query-input": "required name=search_term_string",
          },
        },
        {
          "@type": "ItemList",
          itemListElement: feed.items.slice(0, 25).map((it, i) => ({
            "@type": "ListItem",
            position: i + 1,
            url: `${SITE}/breach/${it.id}`,
            name: it.title,
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
