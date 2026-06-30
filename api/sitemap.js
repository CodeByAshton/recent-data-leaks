// Dynamic sitemap: the home page, every current breach URL, and each year
// archive, so search engines can discover and index them. Wired via vercel.json.

const { getFeed } = require("./_feed");

const SITE = "https://recentdataleaks.com";
const yearOf = (it) => String(it.occurred || it.published || "").slice(0, 4);

module.exports = async function handler(req, res) {
  const feed = await getFeed();
  const years = [...new Set(feed.items.map(yearOf).filter(Boolean))].sort().reverse();

  const urls = [
    `  <url><loc>${SITE}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
    ...years.map((y) => `  <url><loc>${SITE}/year/${y}</loc><changefreq>daily</changefreq><priority>0.6</priority></url>`),
    ...feed.items.map((it) => {
      const lastmod = it.published ? `<lastmod>${new Date(it.published).toISOString()}</lastmod>` : "";
      return `  <url><loc>${SITE}/breach/${it.slug || it.id}</loc>${lastmod}<changefreq>weekly</changefreq><priority>0.7</priority></url>`;
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
