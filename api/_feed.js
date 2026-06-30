// Shared feed loader: live aggregation with a bundled-snapshot fallback so a
// page never renders blank. Used by render, sitemap, rss, and og functions.

const fs = require("node:fs");
const path = require("node:path");
const { aggregate } = require("./_aggregate");

async function getFeed() {
  try {
    const f = await aggregate();
    if (f.items.length) return f;
    throw new Error("empty");
  } catch (_) {
    try {
      return JSON.parse(
        fs.readFileSync(path.join(process.cwd(), "data", "feed.json"), "utf8")
      );
    } catch (e) {
      return { items: [], count: 0, generatedAt: new Date().toISOString(), sources: [] };
    }
  }
}

module.exports = { getFeed };
