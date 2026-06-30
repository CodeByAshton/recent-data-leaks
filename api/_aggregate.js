// Shared aggregation logic. Pulls multiple public sources and normalizes them
// into a single feed object. Used by api/feed.js (Vercel serverless) and the
// seed script. Dependency-free: Node 18+ global fetch + hand-rolled RSS parsing.

const { createHash } = require("node:crypto");

const UA = "breach-feed (personal-project)";

// Phrases that mark a news item as an actual data-breach incident. News feeds
// carry lots of general security news (RCE, malware, phishing); we keep only
// items whose text strongly signals a data exposure/leak. Tuned for precision —
// single generic words like "exposed" or "hacked" caused false positives.
const BREACH_KEYWORDS = [
  "data breach", "data breaches", "breached", "data leak", "leaked data",
  "leaked database", "exposed database", "exposed data", "data exposed",
  "records exposed", "accounts exposed", "million records", "million accounts",
  "personal data", "customer data", "user data", "stolen data", "data stolen",
  "data theft", "exfiltrat", "leaked online", "credentials exposed",
  "leak site", "suffered a breach", "disclosed a breach", "info stealer",
];

const NEWS_SOURCES = [
  { name: "BleepingComputer", url: "https://www.bleepingcomputer.com/feed/" },
  { name: "The Hacker News", url: "https://feeds.feedburner.com/TheHackersNews" },
  { name: "Krebs on Security", url: "https://krebsonsecurity.com/feed/" },
  { name: "The Record", url: "https://therecord.media/feed/" },
  { name: "SecurityWeek", url: "https://www.securityweek.com/feed/" },
];

const sha = (s) => createHash("sha1").update(s).digest("hex").slice(0, 16);

function decodeEntities(s = "") {
  return s
    .replace(/<!\[CDATA\[([\s\S]*?)\]\]>/g, "$1")
    .replace(/<[^>]+>/g, " ")
    .replace(/&amp;/g, "&")
    .replace(/&lt;/g, "<")
    .replace(/&gt;/g, ">")
    .replace(/&quot;/g, '"')
    .replace(/&#0?39;|&apos;|&#x27;/gi, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/&#8216;|&#8217;|&#x2019;|&#x2018;/g, "'")
    .replace(/&#8220;|&#8221;|&#x201c;|&#x201d;/gi, '"')
    .replace(/&#8211;|&#8212;|&#x2013;|&#x2014;/gi, "-")
    .replace(/&#8230;|&#x2026;/gi, "...")
    .replace(/&#(\d+);/g, (_, n) => String.fromCodePoint(+n))
    .replace(/&#x([0-9a-f]+);/gi, (_, n) => String.fromCodePoint(parseInt(n, 16)))
    .replace(/\s+/g, " ")
    .trim();
}

function tag(block, name) {
  const m = block.match(new RegExp(`<${name}[^>]*>([\\s\\S]*?)</${name}>`, "i"));
  return m ? m[1] : "";
}

function atomLink(block) {
  const m = block.match(/<link[^>]*href=["']([^"']+)["'][^>]*\/?>/i);
  return m ? m[1] : "";
}

function truncate(s, n = 260) {
  if (!s || s.length <= n) return s;
  return s.slice(0, n).replace(/\s+\S*$/, "") + "...";
}

function looksLikeBreach(text) {
  const t = text.toLowerCase();
  return BREACH_KEYWORDS.some((k) => t.includes(k));
}

async function fetchText(url) {
  const res = await fetch(url, {
    headers: { "User-Agent": UA, Accept: "*/*" },
    redirect: "follow",
  });
  if (!res.ok) throw new Error(`HTTP ${res.status}`);
  return res.text();
}

async function fetchHIBP() {
  const res = await fetch("https://haveibeenpwned.com/api/v3/breaches", {
    headers: { "User-Agent": UA },
  });
  if (!res.ok) throw new Error(`HIBP HTTP ${res.status}`);
  const breaches = await res.json();
  breaches.sort((a, b) => new Date(b.AddedDate) - new Date(a.AddedDate));
  return breaches.slice(0, 60).map((b) => {
    const full = decodeEntities(b.Description);
    return {
      id: sha("hibp:" + b.Name),
      source: "Have I Been Pwned",
      sourceType: "breach",
      title: b.Title,
      url: `https://haveibeenpwned.com/PwnedWebsites#${encodeURIComponent(b.Name)}`,
      summary: truncate(full),
      details: full,
      published: b.AddedDate,
      occurred: b.BreachDate || null,
      affected: b.PwnCount || null,
      tags: Array.isArray(b.DataClasses) ? b.DataClasses : [],
      domain: b.Domain || null,
      logo: b.LogoPath || null,
      verified: b.IsVerified !== false,
    };
  });
}

function parseFeed(xml, sourceName) {
  const items = [];
  const isAtom = /<entry[\s>]/i.test(xml) && !/<item[\s>]/i.test(xml);
  const blocks = isAtom
    ? xml.match(/<entry[\s>][\s\S]*?<\/entry>/gi) || []
    : xml.match(/<item[\s>][\s\S]*?<\/item>/gi) || [];

  for (const block of blocks) {
    const title = decodeEntities(tag(block, "title"));
    let link = decodeEntities(tag(block, "link"));
    if (!link || isAtom) link = atomLink(block) || link;
    const rawDesc =
      tag(block, "description") ||
      tag(block, "summary") ||
      tag(block, "content:encoded") ||
      tag(block, "content");
    const full = decodeEntities(rawDesc);
    const dateStr =
      tag(block, "pubDate") ||
      tag(block, "published") ||
      tag(block, "updated") ||
      tag(block, "dc:date");
    const published = dateStr ? new Date(decodeEntities(dateStr)).toISOString() : null;

    if (!title || !link) continue;
    if (!looksLikeBreach(`${title} ${full}`)) continue;

    items.push({
      id: sha("news:" + link),
      source: sourceName,
      sourceType: "news",
      title,
      url: link.trim(),
      summary: truncate(full),
      details: full,
      published,
      occurred: null,
      affected: null,
      tags: [],
      domain: null,
      logo: null,
      verified: true,
    });
  }
  return items;
}

async function aggregate() {
  const collected = [];
  const errors = [];

  const jobs = [
    (async () => {
      const hibp = await fetchHIBP();
      collected.push(...hibp);
    })().catch((e) => errors.push(`HIBP: ${e.message}`)),
    ...NEWS_SOURCES.map((src) =>
      (async () => {
        const xml = await fetchText(src.url);
        collected.push(...parseFeed(xml, src.name));
      })().catch((e) => errors.push(`${src.name}: ${e.message}`))
    ),
  ];
  await Promise.all(jobs);

  // Dedupe by id and by normalized url.
  const seen = new Set();
  const items = [];
  for (const it of collected) {
    const urlKey = it.url.toLowerCase().replace(/\/+$/, "");
    if (seen.has(it.id) || seen.has(urlKey)) continue;
    seen.add(it.id);
    seen.add(urlKey);
    items.push(it);
  }

  // Newest first; undated sink to the bottom.
  items.sort((a, b) => {
    const da = a.published ? Date.parse(a.published) : 0;
    const db = b.published ? Date.parse(b.published) : 0;
    return db - da;
  });

  return {
    generatedAt: new Date().toISOString(),
    count: items.length,
    sources: ["Have I Been Pwned", ...NEWS_SOURCES.map((s) => s.name)],
    errors,
    items: items.slice(0, 250),
  };
}

module.exports = { aggregate };
