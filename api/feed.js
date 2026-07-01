// Vercel serverless function: GET /api/feed
// Aggregates live sources server-side (no CORS issues) and lets Vercel's CDN
// cache the result. Falls back to the bundled snapshot if every source fails.
//
// Two shapes:
//   GET /api/feed          -> light recent window (100 items, no `details`) + years
//   GET /api/feed?id=<key> -> a single item by slug or id (used by /api/og so the
//                             OG image endpoint can resolve any breach in the
//                             catalog, not just the recent window).

const path = require("node:path");
const fs = require("node:fs");
const { aggregate } = require("./_aggregate");

const strip = ({ details, ...rest }) => rest;

module.exports = async function handler(req, res) {
  const u = new URL(req.url, "http://localhost");
  const wantId = u.searchParams.get("id");

  try {
    const feed = await aggregate();
    if (feed.items.length > 0) {
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=900, stale-while-revalidate=3600"
      );
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.statusCode = 200;

      // Single-item lookup: search the full catalog, not just the recent window.
      if (wantId) {
        const item = feed.items.find((x) => x.slug === wantId || x.id === wantId);
        return res.end(JSON.stringify({
          generatedAt: feed.generatedAt,
          items: item ? [strip(item)] : [],
        }));
      }

      // If we got real data, cache it hard at the edge: serve cached for 15 min,
      // then revalidate in the background for up to an hour.
      // The full catalog is large; the client only needs a recent window and
      // not the long `details` body (the server renders that into pages).
      // Include the full year list so the client's year nav matches the
      // server-rendered one (otherwise all years flash, then shrink to recent).
      const years = [...new Set(
        feed.items.map((x) => String(x.occurred || x.published || "").slice(0, 4)).filter(Boolean)
      )].sort().reverse();
      // Slim index of the FULL catalog (title/slug/meta only) so client-side
      // search can find any breach, not just the 100-item recent window; the
      // client renders index-only matches as plain links that resolve via SSR.
      const index = feed.items.slice(100).map((x) => ({
        slug: x.slug, title: x.title, source: x.source, sourceType: x.sourceType,
        published: x.published, occurred: x.occurred, affected: x.affected,
      }));
      const light = {
        ...feed,
        years,
        items: feed.items.slice(0, 100).map(strip),
        index,
      };
      return res.end(JSON.stringify(light));
    }
    throw new Error("no items aggregated");
  } catch (err) {
    // Total failure: serve the bundled snapshot so the site never goes blank.
    try {
      const snapRaw = fs.readFileSync(
        path.join(process.cwd(), "data", "feed.json"),
        "utf8"
      );
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("X-Feed-Fallback", "snapshot");
      res.setHeader("Cache-Control", "public, s-maxage=300");
      res.statusCode = 200;

      if (wantId) {
        const snap = JSON.parse(snapRaw);
        const item = (snap.items || []).find((x) => x.slug === wantId || x.id === wantId);
        return res.end(JSON.stringify({
          generatedAt: snap.generatedAt,
          items: item ? [strip(item)] : [],
        }));
      }
      return res.end(snapRaw);
    } catch (e) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.statusCode = 502;
      return res.end(JSON.stringify({ error: "aggregation failed", detail: String(err) }));
    }
  }
};
