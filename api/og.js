// Dynamic Open Graph image at /api/og (optionally ?id=<slug>).
// Renders a real PNG (so X, Facebook, LinkedIn, Slack, and Discord show a
// preview) using @vercel/og on the Edge runtime. Breach data comes from the
// site's own /api/feed (the Edge runtime has no filesystem). Falls back to an
// SVG card if image generation fails, so the endpoint never errors out.

import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

const FONT = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.18/files";

async function loadFont(weight) {
  const res = await fetch(`${FONT}/inter-latin-${weight}-normal.woff`);
  return res.arrayBuffer();
}

function svgFallback(title, sub, src) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#0a0a0a"/><rect width="1200" height="8" fill="#f5f5f5"/><text x="80" y="130" font-family="Helvetica" font-size="26" fill="#9a9a9a" letter-spacing="3">RECENT DATA LEAKS</text><text x="80" y="300" font-family="Georgia,serif" font-size="72" font-weight="600" fill="#f5f5f5">${esc(title).slice(0, 40)}</text><text x="80" y="500" font-family="Helvetica" font-size="30" fill="#9a9a9a">${esc(sub)}</text><text x="80" y="552" font-family="Helvetica" font-size="24" fill="#6a6a6a">${esc(src)}</text></svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, s-maxage=86400" } });
}

export default async function handler(req) {
  const { searchParams, origin } = new URL(req.url);
  const id = searchParams.get("id");

  let item = null;
  if (id) {
    try {
      const feed = await (await fetch(`${origin}/api/feed`)).json();
      item = feed.items.find((x) => x.slug === id || x.id === id);
    } catch (_) { /* fall through to generic card */ }
  }

  const title = item ? item.title : "A live timeline of data breaches";
  const sub = item
    ? (item.affected
        ? `${item.affected.toLocaleString("en-US")} accounts affected`
        : (item.sourceType === "breach" ? "Confirmed data breach" : "Breach report"))
    : "Who was breached, when, and what was exposed";
  const src = item ? item.source : "recentdataleaks.com";
  const titleSize = title.length > 48 ? 56 : title.length > 30 ? 68 : 80;

  try {
    const [regular, bold] = await Promise.all([loadFont("400"), loadFont("700")]);
    const el = {
      type: "div",
      props: {
        style: { width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", backgroundColor: "#0a0a0a", padding: "72px 80px", fontFamily: "Inter", borderTop: "8px solid #f5f5f5" },
        children: [
          { type: "div", props: { style: { color: "#9a9a9a", fontSize: 26, letterSpacing: 4, fontWeight: 400 }, children: "RECENT DATA LEAKS" } },
          { type: "div", props: { style: { display: "flex", flexDirection: "column" }, children: [
            { type: "div", props: { style: { color: "#f5f5f5", fontSize: titleSize, fontWeight: 700, lineHeight: 1.1 }, children: title } },
            { type: "div", props: { style: { color: "#9a9a9a", fontSize: 32, marginTop: 28, fontWeight: 400 }, children: sub } },
          ] } },
          { type: "div", props: { style: { color: "#6a6a6a", fontSize: 24, fontWeight: 400 }, children: src } },
        ],
      },
    };
    return new ImageResponse(el, {
      width: 1200,
      height: 630,
      fonts: [
        { name: "Inter", data: regular, weight: 400, style: "normal" },
        { name: "Inter", data: bold, weight: 700, style: "normal" },
      ],
      headers: { "Cache-Control": "public, s-maxage=86400, stale-while-revalidate=604800" },
    });
  } catch (_) {
    return svgFallback(title, sub, src);
  }
}
