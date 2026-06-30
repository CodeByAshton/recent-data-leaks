// Vercel serverless function: GET /api/feed
// Aggregates live sources server-side (no CORS issues) and lets Vercel's CDN
// cache the result. Falls back to the bundled snapshot if every source fails.

const path = require("node:path");
const fs = require("node:fs");
const { aggregate } = require("./_aggregate");

module.exports = async function handler(req, res) {
  try {
    const feed = await aggregate();

    // If we got real data, cache it hard at the edge: serve cached for 15 min,
    // then revalidate in the background for up to an hour.
    if (feed.items.length > 0) {
      res.setHeader(
        "Cache-Control",
        "public, s-maxage=900, stale-while-revalidate=3600"
      );
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.statusCode = 200;
      return res.end(JSON.stringify(feed));
    }
    throw new Error("no items aggregated");
  } catch (err) {
    // Total failure: serve the bundled snapshot so the site never goes blank.
    try {
      const snap = fs.readFileSync(
        path.join(process.cwd(), "data", "feed.json"),
        "utf8"
      );
      res.setHeader("Cache-Control", "public, s-maxage=300");
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.setHeader("X-Feed-Fallback", "snapshot");
      res.statusCode = 200;
      return res.end(snap);
    } catch (e) {
      res.setHeader("Content-Type", "application/json; charset=utf-8");
      res.statusCode = 502;
      return res.end(JSON.stringify({ error: "aggregation failed", detail: String(err) }));
    }
  }
};
