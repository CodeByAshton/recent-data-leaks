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
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#EDEEEF"/><rect width="1200" height="8" fill="#000000"/><text x="80" y="130" font-family="Arial,Helvetica,sans-serif" font-size="26" fill="#8a8a8a" letter-spacing="3">RECENT DATA LEAKS</text><text x="1120" y="130" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="26" fill="#8a8a8a">by <tspan fill="#1A1A1A" font-weight="700">Literal</tspan></text><text x="80" y="300" font-family="Arial,Helvetica,sans-serif" font-size="72" font-weight="700" fill="#1A1A1A">${esc(title).slice(0, 40)}</text><text x="80" y="500" font-family="Arial,Helvetica,sans-serif" font-size="30" fill="#686868">${esc(sub)}</text><text x="80" y="552" font-family="Arial,Helvetica,sans-serif" font-size="24" fill="#A0A0A0">${esc(src)}</text></svg>`;
  return new Response(svg, { headers: { "Content-Type": "image/svg+xml; charset=utf-8", "Cache-Control": "public, s-maxage=86400" } });
}

export default async function handler(req) {
  const { searchParams, origin } = new URL(req.url);
  const id = searchParams.get("id");

  let item = null;
  if (id) {
    try {
      // Ask the feed for this specific breach so any page in the catalog gets a
      // real per-breach card, not just the recent window.
      const feed = await (await fetch(`${origin}/api/feed?id=${encodeURIComponent(id)}`)).json();
      item = (feed.items || []).find((x) => x.slug === id || x.id === id);
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
        style: { width: "100%", height: "100%", display: "flex", flexDirection: "column", justifyContent: "space-between", backgroundColor: "#EDEEEF", padding: "72px 80px", fontFamily: "Inter", borderTop: "8px solid #000000" },
        children: [
          // Header row: site brand left, Literal attribution right (text
          // lockup for now — swap for the logo asset when available).
          { type: "div", props: { style: { display: "flex", justifyContent: "space-between", alignItems: "baseline" }, children: [
            { type: "div", props: { style: { color: "#8a8a8a", fontSize: 26, letterSpacing: 4, fontWeight: 400 }, children: "RECENT DATA LEAKS" } },
            { type: "div", props: { style: { display: "flex", gap: 9, color: "#8a8a8a", fontSize: 26, fontWeight: 400 }, children: [
              { type: "span", props: { children: "by" } },
              { type: "span", props: { style: { color: "#1A1A1A", fontWeight: 700 }, children: "Literal" } },
            ] } },
          ] } },
          { type: "div", props: { style: { display: "flex", flexDirection: "column" }, children: [
            { type: "div", props: { style: { color: "#1A1A1A", fontSize: titleSize, fontWeight: 700, lineHeight: 1.1, letterSpacing: -1 }, children: title } },
            { type: "div", props: { style: { color: "#686868", fontSize: 32, marginTop: 28, fontWeight: 400 }, children: sub } },
          ] } },
          { type: "div", props: { style: { color: "#A0A0A0", fontSize: 24, fontWeight: 400 }, children: src } },
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
