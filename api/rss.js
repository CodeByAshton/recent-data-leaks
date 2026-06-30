// RSS 2.0 feed at /rss.xml (wired in vercel.json). Aids distribution and
// discovery; readers and aggregators can subscribe to new breaches.

const { getFeed } = require("./_feed");

const SITE = "https://recentdataleaks.com";
const NAME = "Recent Data Leaks";

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

module.exports = async function handler(req, res) {
  const feed = await getFeed();
  const items = feed.items.slice(0, 50).map((it) => {
    const url = `${SITE}/breach/${esc(it.slug || it.id)}`;
    const date = it.published ? `<pubDate>${new Date(it.published).toUTCString()}</pubDate>` : "";
    return `    <item>
      <title>${esc(it.title)}</title>
      <link>${url}</link>
      <guid isPermaLink="true">${url}</guid>
      ${date}
      <category>${esc(it.sourceType === "breach" ? "Breach" : "News")}</category>
      <description>${esc(it.summary || "")}</description>
    </item>`;
  }).join("\n");

  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<rss version="2.0" xmlns:atom="http://www.w3.org/2005/Atom">
  <channel>
    <title>${NAME}</title>
    <link>${SITE}/</link>
    <atom:link href="${SITE}/rss.xml" rel="self" type="application/rss+xml" />
    <description>A live timeline of public data breaches.</description>
    <language>en-us</language>
    <lastBuildDate>${new Date(feed.generatedAt || Date.now()).toUTCString()}</lastBuildDate>
${items}
  </channel>
</rss>`;

  res.setHeader("Content-Type", "application/rss+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=900, stale-while-revalidate=3600");
  res.statusCode = 200;
  return res.end(xml);
};
