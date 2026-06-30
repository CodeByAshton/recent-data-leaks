// Dynamic sitemap: the home page plus every current breach URL, so search
// engines can discover and index each /breach/:id page. Wired via vercel.json.

const fs = require("node:fs");
const path = require("node:path");
const { aggregate } = require("./_aggregate");

const SITE = "https://recentdataleaks.com";

async function getFeed() {
  try {
    const f = await aggregate();
    if (f.items.length) return f;
    throw new Error("empty");
  } catch (_) {
    try {
      return JSON.parse(fs.readFileSync(path.join(process.cwd(), "data", "feed.json"), "utf8"));
    } catch (e) {
      return { items: [] };
    }
  }
}

module.exports = async function handler(req, res) {
  const feed = await getFeed();
  const urls = [
    `  <url><loc>${SITE}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
    ...feed.items.map((it) => {
      const lastmod = it.published ? `<lastmod>${new Date(it.published).toISOString()}</lastmod>` : "";
      return `  <url><loc>${SITE}/breach/${it.id}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.7</priority></url>`;
    }),
  ];
  const xml = `<?xml version="1.0" encoding="UTF-8"?>
<urlset xmlns="http://www.sitemaps.org/schemas/sitemap/0.9">
${urls.join("\n")}
</urlset>`;
  res.setHeader("Content-Type", "application/xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=3600, stale-while-revalidate=86400");
  res.statusCode = 200;
  return res.end(xml);
};
