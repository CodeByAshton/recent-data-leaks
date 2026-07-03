// Dynamic Open Graph image at /api/og (optionally ?id=<slug>).
// Renders a real PNG (so X, Facebook, LinkedIn, Slack, and Discord show a
// preview) using @vercel/og on the Edge runtime. Breach data comes from the
// site's own /api/feed (the Edge runtime has no filesystem). Falls back to an
// SVG card if image generation fails, so the endpoint never errors out.

import { ImageResponse } from "@vercel/og";

export const config = { runtime: "edge" };

const FONT = "https://cdn.jsdelivr.net/npm/@fontsource/inter@5.0.18/files";

// Literal logo paths (icon + wordmark), viewBox-cropped to the glyph bounds
// (0 49 551 139). Keep in sync with LITERAL_LOGO in api/render.js.
const LOGO_PATHS = `<path d="M129.823 144.506H96.9678V97.7038C96.9677 93.0014 93.1555 89.1891 88.4531 89.1891H40.5713C35.8689 89.1891 32.0567 93.0014 32.0566 97.7038V145.587C32.0569 150.289 35.869 154.1 40.5713 154.1H87.9756V187.948H0V58.1247H129.823V144.506Z"/><path d="M158.602 49.1721H176.994V182H158.602V49.1721ZM199.829 72.5021C199.829 69.3233 200.964 66.6554 203.235 64.4984C205.619 62.3413 208.344 61.2628 211.409 61.2628C214.701 61.2628 217.426 62.3413 219.583 64.4984C221.853 66.6554 222.989 69.3233 222.989 72.5021C222.989 75.5674 221.853 78.2353 219.583 80.5058C217.426 82.6629 214.701 83.7414 211.409 83.7414C208.344 83.7414 205.619 82.6629 203.235 80.5058C200.964 78.2353 199.829 75.5674 199.829 72.5021ZM202.383 103.666H220.434V182H202.383V103.666ZM234.845 103.666H279.292V119.843H234.845V103.666ZM247.958 76.4188H266.179V182H247.958V76.4188ZM326.034 183.703C318.087 183.703 311.048 182 304.918 178.594C298.901 175.188 294.246 170.42 290.954 164.29C287.662 158.159 286.015 151.007 286.015 142.833C286.015 134.545 287.662 127.336 290.954 121.206C294.36 115.075 299.128 110.364 305.258 107.071C311.389 103.666 318.598 101.963 326.886 101.963C335.173 101.963 342.212 103.552 348.002 106.731C353.792 109.91 358.219 114.508 361.285 120.525C364.463 126.428 366.053 133.58 366.053 141.981C366.053 142.89 365.996 143.855 365.883 144.876C365.883 145.898 365.826 146.636 365.712 147.09H296.914V134.488H350.045L344.426 142.322C344.766 141.641 345.107 140.733 345.447 139.597C345.902 138.348 346.129 137.327 346.129 136.532C346.129 132.331 345.277 128.699 343.574 125.633C341.985 122.568 339.714 120.184 336.763 118.481C333.924 116.778 330.575 115.927 326.715 115.927C322.061 115.927 318.087 116.948 314.795 118.992C311.503 121.035 309.005 123.987 307.302 127.847C305.599 131.707 304.691 136.475 304.577 142.152C304.577 147.828 305.429 152.653 307.132 156.626C308.835 160.486 311.332 163.438 314.625 165.482C318.03 167.525 322.117 168.547 326.886 168.547C331.881 168.547 336.252 167.525 339.998 165.482C343.745 163.438 346.867 160.316 349.364 156.116L365.201 162.587C361.114 169.625 355.835 174.904 349.364 178.424C342.893 181.943 335.116 183.703 326.034 183.703ZM401.829 103.666V182H383.608V103.666H401.829ZM425.159 123.249C423.456 121.887 421.867 120.865 420.391 120.184C418.915 119.503 417.042 119.162 414.771 119.162C411.706 119.162 409.208 119.957 407.278 121.546C405.348 123.136 403.929 125.349 403.021 128.188C402.226 130.912 401.829 134.148 401.829 137.894L395.698 134.318C395.698 128.074 396.834 122.568 399.104 117.8C401.488 112.918 404.497 109.058 408.13 106.22C411.876 103.382 415.736 101.963 419.709 101.963C422.548 101.963 425.216 102.417 427.713 103.325C430.211 104.12 432.311 105.596 434.014 107.753L425.159 123.249ZM458.215 157.648C458.215 160.259 458.84 162.53 460.089 164.46C461.337 166.276 463.04 167.639 465.197 168.547C467.468 169.455 470.022 169.909 472.861 169.909C476.494 169.909 479.786 169.171 482.738 167.695C485.803 166.22 488.244 164.063 490.06 161.224C491.99 158.273 492.955 154.867 492.955 151.007L495.68 161.224C495.68 166.22 494.204 170.42 491.252 173.826C488.414 177.118 484.781 179.616 480.353 181.319C476.039 182.908 471.612 183.703 467.071 183.703C462.189 183.703 457.648 182.738 453.447 180.808C449.247 178.878 445.898 176.04 443.4 172.293C440.902 168.547 439.654 164.006 439.654 158.67C439.654 151.064 442.322 145.047 447.657 140.619C452.993 136.078 460.543 133.807 470.306 133.807C475.529 133.807 480.013 134.375 483.759 135.51C487.619 136.646 490.798 138.008 493.296 139.597C495.793 141.073 497.553 142.435 498.575 143.684V153.05C495.055 150.553 491.309 148.736 487.335 147.601C483.362 146.466 479.161 145.898 474.734 145.898C470.874 145.898 467.752 146.409 465.368 147.431C462.984 148.339 461.167 149.644 459.918 151.347C458.783 153.05 458.215 155.151 458.215 157.648ZM452.426 124.101L444.933 111.158C448.452 109.001 452.993 106.901 458.556 104.858C464.232 102.814 470.704 101.792 477.969 101.792C484.44 101.792 490.117 102.757 494.999 104.687C499.994 106.617 503.911 109.399 506.749 113.032C509.587 116.551 511.006 120.922 511.006 126.144V182H492.955V129.72C492.955 127.223 492.501 125.179 491.593 123.59C490.798 122 489.663 120.695 488.187 119.673C486.711 118.651 484.951 117.913 482.908 117.459C480.864 117.005 478.651 116.778 476.266 116.778C472.634 116.778 469.171 117.232 465.879 118.14C462.7 118.935 459.918 119.957 457.534 121.206C455.264 122.341 453.561 123.306 452.426 124.101ZM532.447 49.1721H550.838V182H532.447V49.1721Z"/>`;
// Rendered 26px tall in the card header; width preserves the 551:139 aspect.
const LOGO_W = 103, LOGO_H = 26;
const LOGO_URI = `data:image/svg+xml;charset=utf-8,${encodeURIComponent(
  `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 49 551 139" fill="#1A1A1A">${LOGO_PATHS}</svg>`
)}`;

async function loadFont(weight) {
  const res = await fetch(`${FONT}/inter-latin-${weight}-normal.woff`);
  return res.arrayBuffer();
}

function svgFallback(title, sub, src) {
  const esc = (s) => String(s).replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;");
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" width="1200" height="630"><rect width="1200" height="630" fill="#EDEEEF"/><rect width="1200" height="8" fill="#000000"/><text x="80" y="130" font-family="Arial,Helvetica,sans-serif" font-size="26" fill="#8a8a8a" letter-spacing="3">RECENT DATA LEAKS</text><text x="1005" y="129" text-anchor="end" font-family="Arial,Helvetica,sans-serif" font-size="24" fill="#8a8a8a">by</text><g transform="translate(1017,104) scale(0.187) translate(0,-49)" fill="#1A1A1A">${LOGO_PATHS}</g><text x="80" y="300" font-family="Arial,Helvetica,sans-serif" font-size="72" font-weight="700" fill="#1A1A1A">${esc(title).slice(0, 40)}</text><text x="80" y="500" font-family="Arial,Helvetica,sans-serif" font-size="30" fill="#686868">${esc(sub)}</text><text x="80" y="552" font-family="Arial,Helvetica,sans-serif" font-size="24" fill="#A0A0A0">${esc(src)}</text></svg>`;
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
          // Header row: site brand left, Literal logo right.
          { type: "div", props: { style: { display: "flex", justifyContent: "space-between", alignItems: "center" }, children: [
            { type: "div", props: { style: { color: "#8a8a8a", fontSize: 26, letterSpacing: 4, fontWeight: 400 }, children: "RECENT DATA LEAKS" } },
            { type: "div", props: { style: { display: "flex", alignItems: "center", gap: 10 }, children: [
              { type: "span", props: { style: { color: "#8a8a8a", fontSize: 24 }, children: "by" } },
              { type: "img", props: { src: LOGO_URI, width: LOGO_W, height: LOGO_H } },
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
