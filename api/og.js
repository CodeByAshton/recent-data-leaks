// Dynamic per-breach Open Graph image at /api/og?id=<slug>. Returns an SVG card
// with the breach title, source, and impact, so shared links look distinct.
//
// Note: SVG OG images render in Google and several platforms but not in every
// social crawler (Facebook/X prefer PNG/JPG). For guaranteed raster output the
// follow-up is @vercel/og (satori). SVG keeps this dependency-free.

const { getFeed } = require("./_feed");

function esc(s) {
  return String(s == null ? "" : s)
    .replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;").replace(/'/g, "&apos;");
}

function wrap(text, maxChars, maxLines) {
  const words = String(text || "").split(/\s+/);
  const lines = [];
  let cur = "";
  for (const w of words) {
    if ((cur + " " + w).trim().length > maxChars) {
      if (cur) lines.push(cur.trim());
      cur = w;
      if (lines.length >= maxLines) break;
    } else {
      cur = (cur + " " + w).trim();
    }
  }
  if (cur && lines.length < maxLines) lines.push(cur.trim());
  if (lines.length >= maxLines) {
    const joined = lines.join(" ");
    if (joined.length < String(text || "").length) {
      lines[maxLines - 1] = lines[maxLines - 1].replace(/[.,…]*$/, "") + "…";
    }
  }
  return lines.slice(0, maxLines);
}

module.exports = async function handler(req, res) {
  const u = new URL(req.url, "http://localhost");
  const key = u.searchParams.get("id");
  const feed = await getFeed();
  const it = feed.items.find((x) => x.slug === key || x.id === key);

  const title = it ? it.title : "Recent Data Leaks";
  const lines = wrap(title, 24, 3);
  const sub = it
    ? (it.affected
        ? `${it.affected.toLocaleString("en-US")} accounts affected`
        : (it.sourceType === "breach" ? "Confirmed data breach" : "Breach report"))
    : "A live timeline of data breaches";
  const src = it ? it.source : "recentdataleaks.com";

  const startY = 300 - (lines.length - 1) * 44;
  const titleSvg = lines
    .map((ln, i) => `<text x="80" y="${startY + i * 88}" font-family="Georgia, 'Times New Roman', serif" font-size="78" font-weight="500" fill="#f5f5f5">${esc(ln)}</text>`)
    .join("");

  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630" viewBox="0 0 1200 630">
  <rect width="1200" height="630" fill="#0a0a0a"/>
  <rect x="0" y="0" width="1200" height="8" fill="#f5f5f5"/>
  <text x="80" y="130" font-family="Helvetica, Arial, sans-serif" font-size="26" fill="#9a9a9a" letter-spacing="3">RECENT DATA LEAKS</text>
  ${titleSvg}
  <text x="80" y="500" font-family="Helvetica, Arial, sans-serif" font-size="30" fill="#f5f5f5">${esc(sub)}</text>
  <text x="80" y="552" font-family="Helvetica, Arial, sans-serif" font-size="24" fill="#6a6a6a">${esc(src)}</text>
</svg>`;

  res.setHeader("Content-Type", "image/svg+xml; charset=utf-8");
  res.setHeader("Cache-Control", "public, s-maxage=86400, stale-while-revalidate=604800");
  res.statusCode = 200;
  return res.end(svg);
};
