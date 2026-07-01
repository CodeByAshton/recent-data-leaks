// Dynamic sitemap: the home page, every current breach URL, and each year
// archive, so search engines can discover and index them. Wired via vercel.json.

const { getFeed } = require("./_feed");
const { companySlug, GLOSSARY } = require("./_content");

const SITE = "https://recentdataleaks.com";
const yearOf = (it) => String(it.occurred || it.published || "").slice(0, 4);

module.exports = async function handler(req, res) {
  const feed = await getFeed();
  const years = [...new Set(feed.items.map(yearOf).filter(Boolean))].sort().reverse();
  const companies = [...new Set(feed.items.filter((x) => x.sourceType === "breach").map(companySlug))];

  const urls = [
    `  <url><loc>${SITE}/</loc><changefreq>hourly</changefreq><priority>1.0</priority></url>`,
    `  <url><loc>${SITE}/stats</loc><changefreq>daily</changefreq><priority>0.7</priority></url>`,
    `  <url><loc>${SITE}/biggest-data-breaches</loc><changefreq>daily</changefreq><priority>0.8</priority></url>`,
    `  <url><loc>${SITE}/glossary</loc><changefreq>monthly</changefreq><priority>0.5</priority></url>`,
    ...GLOSSARY.map((g) => `  <url><loc>${SITE}/glossary/${g.slug}</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>`),
    `  <url><loc>${SITE}/about</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>`,
    `  <url><loc>${SITE}/methodology</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>`,
    `  <url><loc>${SITE}/how-its-built</loc><changefreq>monthly</changefreq><priority>0.4</priority></url>`,
    ...years.map((y) => `  <url><loc>${SITE}/year/${y}</loc><changefreq>daily</changefreq><priority>0.6</priority></url>`),
    ...companies.map((c) => `  <url><loc>${SITE}/company/${c}</loc><changefreq>weekly</changefreq><priority>0.6</priority></url>`),
    ...feed.items.map((it) => {
      let lastmod = "";
      if (it.published) {
        const d = new Date(it.published);
        if (!isNaN(d.getTime())) lastmod = `<lastmod>${d.toISOString()}</lastmod>`;
      }
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
