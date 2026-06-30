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

function slugify(s) {
  return String(s || "")
    .toLowerCase()
    .replace(/['’]/g, "")
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "")
    .replace(/-{2,}/g, "-");
}

// Original, page-specific guidance based on what data was exposed. This unique
// content is what separates a breach page from a copied news snippet.
function computeAdvice(it) {
  const classes = (it.tags || []).join(" ").toLowerCase();
  const has = (...k) => k.some((x) => classes.includes(x));
  const out = [];
  if (has("password", "security question"))
    out.push("Change your password for this account, and anywhere you reused it. Turn on two-factor authentication.");
  if (has("credit card", "bank", "payment"))
    out.push("Watch your card and bank statements for unfamiliar charges, and consider requesting a new card number.");
  if (has("social security", "government", "tax", "passport", "driver"))
    out.push("Place a fraud alert or credit freeze with the major credit bureaus to block new accounts opened in your name.");
  if (has("email address"))
    out.push("Expect more phishing and spam at this address. Treat messages that reference this company with extra caution.");
  if (has("phone"))
    out.push("Watch for text-message phishing and SIM-swap attempts on your phone number.");
  if (has("physical address", "date of birth", "geographic", "names"))
    out.push("Be wary of targeted scams that use your personal details to sound convincing.");
  if (!out.length) {
    out.push("If you have an account with this organization, change your password and enable two-factor authentication.");
    out.push("Be cautious of phishing emails, calls, or texts that reference this incident.");
    if (it.sourceType === "breach")
      out.push("Consider monitoring your credit if sensitive personal information may have been involved.");
  }
  return out;
}

function listToText(arr, max = 8) {
  const a = (arr || []).slice(0, max);
  if (!a.length) return "";
  if (a.length === 1) return a[0];
  return a.slice(0, -1).join(", ") + " and " + a[a.length - 1];
}

// Original FAQ per breach. FAQPage structured data is eligible for rich results
// in Google, and the copy is unique to this site.
function computeFaq(it) {
  const isNews = it.sourceType === "news";
  const noun = isNews ? "incident" : "data breach";
  const faq = [];
  faq.push({
    q: `What is the ${it.title} ${noun}?`,
    a: it.summary || `${it.title} is a ${isNews ? "reported security incident" : "data breach"} tracked by Recent Data Leaks.`,
  });
  if (it.occurred || it.published) {
    const when = it.occurred
      ? `occurred around ${new Date(it.occurred).toLocaleDateString("en-US", { year: "numeric", month: "long" })}`
      : `was disclosed on ${new Date(it.published).toLocaleDateString("en-US", { year: "numeric", month: "long", day: "numeric" })}`;
    faq.push({ q: `When did the ${noun} happen?`, a: `This ${noun} ${when}.` });
  }
  if (it.affected)
    faq.push({ q: "How many accounts were affected?", a: `Around ${it.affected.toLocaleString("en-US")} accounts were affected.` });
  if (it.tags && it.tags.length)
    faq.push({ q: "What information was exposed?", a: `Exposed data included ${listToText(it.tags)}.` });
  if (it.advice && it.advice.length)
    faq.push({ q: "What should I do if I was affected?", a: it.advice.join(" ") });
  return faq;
}

// Collapse near-duplicate news that covers the same incident. Heuristic: two
// news items that share a distinctive (non-topic) word and fall within 21 days
// are treated as the same story; the newest is kept.
const TOPIC_STOP = new Set(
  ("the a an and or of to in on for with after says said new newly data breach breaches breached " +
   "leak leaks leaked hack hacks hacked hacker hackers hacking attack attacks attacked cyber cyberattack " +
   "ransomware exposed exposes exposing expose stolen steal steals theft million millions billion thousand " +
   "accounts records customers users user clients people personal information info amid over into from your " +
   "you how why what who security incident report reports reportedly database online million-record")
    .split(/\s+/)
);
function distinctiveTokens(title) {
  return new Set(
    String(title || "").toLowerCase().replace(/[^a-z0-9 ]/g, " ").split(/\s+/)
      .filter((w) => w.length >= 4 && !TOPIC_STOP.has(w))
  );
}
function clusterNews(items) {
  const kept = [];
  const newsAnchors = [];
  for (const it of items) {
    if (it.sourceType !== "news") { kept.push(it); continue; }
    const toks = distinctiveTokens(it.title);
    const t = it.published ? Date.parse(it.published) : 0;
    let dup = null;
    for (const a of newsAnchors) {
      const shared = [...toks].some((x) => a._toks.has(x));
      const within = Math.abs(a._t - t) <= 10 * 86400 * 1000;
      if (shared && within) { dup = a; break; }
    }
    if (dup) { dup._also = (dup._also || 1) + 1; continue; }
    it._toks = toks; it._t = t;
    newsAnchors.push(it);
    kept.push(it);
  }
  for (const it of kept) {
    if (it._toks) { delete it._toks; delete it._t; }
    if (it._also) { it.alsoReported = it._also; delete it._also; }
  }
  return kept;
}

function assignDerived(items) {
  const seen = new Set();
  for (const it of items) {
    const year = String(it.occurred || it.published || "").slice(0, 4) || "na";
    let base = slugify(
      it.sourceType === "breach" && it.domain ? it.domain.split(".")[0] : it.title
    );
    base = base.split("-").slice(0, 8).join("-") || "breach";
    let slug = `${base}-${year}`;
    if (seen.has(slug)) slug = `${slug}-${it.id.slice(0, 4)}`;
    seen.add(slug);
    it.slug = slug;
    it.advice = computeAdvice(it);
    it.faq = computeFaq(it);
  }
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
  // Full catalog (~800 breaches) so every breach gets its own indexable page.
  return breaches.map((b) => {
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

  const clustered = clusterNews(items);
  const finalItems = clustered.slice(0, 1000);
  assignDerived(finalItems);

  return {
    generatedAt: new Date().toISOString(),
    count: finalItems.length,
    sources: ["Have I Been Pwned", ...NEWS_SOURCES.map((s) => s.name)],
    errors,
    items: finalItems,
  };
}

module.exports = {
  aggregate,
  // exported for unit tests
  slugify, decodeEntities, truncate, looksLikeBreach,
  parseFeed, computeAdvice, computeFaq, clusterNews,
};
