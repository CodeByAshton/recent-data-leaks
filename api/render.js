// Server-side rendering for Recent Data Leaks.
// Routes (wired in vercel.json): "/" (home timeline), "/breach/:slug" (a breach),
// "/year/:yyyy" (year archive). Each returns fully-rendered HTML with its own
// <title>, meta description, Open Graph tags, and JSON-LD, which is what makes the
// pages indexable. Falls back to the bundled snapshot.

const { getFeed } = require("./_feed");

const SITE = "https://recentdataleaks.com";
const NAME = "Recent Data Leaks";
const TAGLINE = "A live timeline of data breaches";
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
  return `<nav class="yearnav">Browse by year: ${years.map((y) => `<a href="/year/${y}">${y}</a>`).join("")} &middot; <a href="/rss.xml">RSS</a></nav>`;
}

const HOME_LIMIT = 80;
function homeMain(feed) {
  const recent = feed.items.slice(0, HOME_LIMIT);
  const more = feed.count > HOME_LIMIT
    ? `<p class="more-note">Showing the ${HOME_LIMIT} most recent of ${feed.count} tracked incidents. <a href="/stats">See statistics</a> or browse by year above.</p>`
    : "";
  return `<section class="hero"><h1>${esc(TAGLINE)}</h1><p><span class="count">${feed.count}</span> tracked incidents &middot; newest first</p>${yearNavHTML(feed.items)}</section>${listHTML(recent)}${more}`;
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

  const exposed = (it.tags && it.tags.length)
    ? `<div class="section-title">What was exposed</div><div class="exposed">${it.tags.map((t) => `<span class="tag">${esc(t)}</span>`).join("")}</div>`
    : "";
  const advice = (it.advice && it.advice.length)
    ? `<div class="section-title">What to do if you were affected</div><ul class="advice">${it.advice.map((a) => `<li>${esc(a)}</li>`).join("")}</ul>`
    : "";
  const faq = (it.faq && it.faq.length)
    ? `<div class="section-title">Frequently asked questions</div><div class="faq">${it.faq.map((f) => `<div class="faq-item"><h3 class="faq-q">${esc(f.q)}</h3><p class="faq-a">${esc(f.a)}</p></div>`).join("")}</div>`
    : "";

  return `<a class="back" href="/">&larr; Back to timeline</a><div class="detail"><div class="detail-head">${logo}<div><h1>${esc(it.title)}</h1><div class="detail-meta">${pills.join("")}</div></div></div>${exposed}${advice}<div class="section-title">Details</div><div class="detail-desc">${esc(it.details || it.summary || "No description available.")}</div>${faq}<a class="cta" href="${esc(it.url)}" target="_blank" rel="noopener noreferrer nofollow">${isNews ? "Read full report &#8599;" : "View on source &#8599;"}</a>${relatedHTML(it, items)}</div>`;
}

// ---------- document ----------
function page({ title, description, canonical, robots, ogType, image, jsonld, main }) {
  const verify = [
    process.env.GOOGLE_SITE_VERIFICATION ? `<meta name="google-site-verification" content="${esc(process.env.GOOGLE_SITE_VERIFICATION)}" />` : "",
    process.env.BING_SITE_VERIFICATION ? `<meta name="msvalidate.01" content="${esc(process.env.BING_SITE_VERIFICATION)}" />` : "",
  ].join("");
  const img = image || `${SITE}/assets/og.svg`;
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
${verify}
<meta property="og:type" content="${ogType || "website"}" />
<meta property="og:site_name" content="${NAME}" />
<meta property="og:title" content="${esc(title)}" />
<meta property="og:description" content="${esc(description)}" />
<meta property="og:url" content="${esc(canonical)}" />
<meta property="og:image" content="${esc(img)}" />
<meta name="twitter:card" content="summary_large_image" />
<meta name="twitter:title" content="${esc(title)}" />
<meta name="twitter:description" content="${esc(description)}" />
<meta name="twitter:image" content="${esc(img)}" />
<link rel="alternate" type="application/rss+xml" title="${NAME}" href="${SITE}/rss.xml" />
${jsonld ? `<script type="application/ld+json">${jsonld}</script>` : ""}
<link rel="icon" href="data:image/svg+xml,%3Csvg xmlns='http://www.w3.org/2000/svg' viewBox='0 0 100 100'%3E%3Ccircle cx='50' cy='50' r='42' fill='%23f5f5f5'/%3E%3C/svg%3E" />
<link rel="preconnect" href="https://fonts.googleapis.com" />
<link rel="preconnect" href="https://fonts.gstatic.com" crossorigin />
<link href="https://fonts.googleapis.com/css2?family=Newsreader:ital,opsz,wght@0,6..72,400;0,6..72,500;1,6..72,400&family=Inter:wght@400;500;600&display=swap" rel="stylesheet" />
<link rel="stylesheet" href="/assets/styles.css" />
</head>
<body>
<a class="skip" href="#app">Skip to content</a>
<header class="topbar"><div class="wrap"><a class="brand" href="/">${NAME}</a><nav class="topnav" aria-label="Primary"><a href="/stats">Stats</a><a href="/about">About</a></nav><div class="status"><span class="dot live" id="liveDot" aria-hidden="true"></span><span id="updated">Live</span><button id="refresh" class="ghost-btn" type="button" aria-label="Refresh the feed">Refresh</button></div></div></header>
<main class="wrap" id="app">${main}</main>
<footer class="wrap foot"><nav class="footnav" aria-label="Footer"><a href="/stats">Statistics</a> &middot; <a href="/about">About</a> &middot; <a href="/methodology">Methodology</a> &middot; <a href="/rss.xml">RSS</a> &middot; <a href="/sitemap.xml">Sitemap</a></nav><p>Aggregated from Have I Been Pwned, BleepingComputer, The Hacker News, Krebs on Security, The Record &amp; SecurityWeek. Not affiliated with any source. For awareness only.</p></footer>
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
          mainEntityOfPage: `${SITE}/breach/${it.slug || it.id}`,
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
  } else {
    const ld = jsonLd({
      "@context": "https://schema.org",
      "@graph": [
        {
          "@type": "WebSite", name: NAME, url: `${SITE}/`, description: DESC,
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
