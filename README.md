# Recent Data Leaks

A live, server-rendered timeline of public data breaches: who was breached, when,
how many accounts were affected, what data was exposed, and what to do about it.
Click any entry for a full detail page.

- **Live:** https://recentdataleaks.com
- **Repo:** https://github.com/CodeByAshton/recent-data-leaks
- **Stack:** Vercel serverless + edge functions, vanilla JS, no build step, one runtime dependency.

This doc is the full onboarding reference. For an at-a-glance architecture summary, see the live page `/how-its-built`.

---

## Goal

This is an engineering-for-traction project: a genuinely useful tool that doubles
as a portfolio piece. The current priority is **organic search traffic** (SEO),
then turning visitors into a returning audience. See the Roadmap at the bottom.

---

## Quick start

```bash
git clone https://github.com/CodeByAshton/recent-data-leaks
cd recent-data-leaks
npm install

npm test            # unit tests (node --test, no extra deps)
npm run seed        # refresh data/feed.json fallback snapshot from live sources
npm i -g vercel && vercel dev   # full local run at http://localhost:3000
```

There is **no build step**. Functions and static assets are served as-is.

> Local note: the repo includes a throwaway preview server pattern used during
> development that emulates the Vercel rewrites. `vercel dev` is the supported
> way to run everything locally, including the edge OG function.

---

## Architecture

Server-rendered for SEO, hydrated for interactivity.

**Request flow**
1. A page request (`/`, `/breach/:slug`, archives, etc.) is rewritten in
   `vercel.json` to `api/render.js`, which returns fully-rendered HTML with
   per-page `<title>`, meta description, Open Graph, and JSON-LD. Vercel's CDN
   caches it (~15 min, `s-maxage`).
2. `assets/app.js` then hydrates the page: it fetches `/api/feed` and re-renders
   the home/detail views with live data plus filtering, search, and client-side
   navigation. On non-managed routes (archives, stats, etc.) it leaves the
   server HTML untouched. If the feed is unreachable it leaves SSR in place.
3. `/api/feed` aggregates all sources server-side (no CORS), dedupes and clusters,
   and returns a light recent window. `data/feed.json` is a bundled fallback so a
   page never renders blank if every source is down.
4. `/api/og` generates a per-breach PNG share image at the edge.

**Module conventions (important)**
- Every file in `api/` is **CommonJS** (`require` / `module.exports`) **except
  `api/og.js`, which is an ESM Edge function** (`import` / `export default` +
  `export const config = { runtime: "edge" }`).
- **Do not add `"type": "module"` to package.json** — it would break all the
  CommonJS functions. The single ESM file works because Vercel detects the Edge
  runtime from its `config` export.
- Files prefixed with `_` (e.g. `_aggregate.js`) are shared modules, not routes.

---

## File map

```
api/
  render.js      SSR for all HTML pages (home, breach, year, stats, company,
                 glossary, about, methodology, how-its-built). Wired via rewrites.
  feed.js        GET /api/feed — live aggregated JSON (recent 100, no `details`,
                 plus full `years` list and a slim full-catalog `index` for
                 client-side search). Falls back to data/feed.json.
  og.js          GET /api/og[?id=slug] — EDGE function, returns a PNG OG image
                 (SVG fallback on error). Fetches data from /api/feed.
  sitemap.js     GET /sitemap.xml — home + breaches + years + companies + pages.
  rss.js         GET /rss.xml — RSS 2.0 of recent items.
  _aggregate.js  Source list, fetching, RSS parsing, breach keyword filter,
                 news clustering, slug + advice + FAQ generation. Exports pure
                 helpers for tests.
  _feed.js       getFeed(): live aggregate with snapshot fallback.
  _content.js    companySlug(), slugify(), and the GLOSSARY entries (shared by
                 render + sitemap).
assets/
  app.js         Client hydration: routing, timeline, detail, year pager, search,
                 hamburger nav. Vanilla, no framework.
  styles.css     Liquid-glass theme (Literal design tokens), light default + dark toggle, mobile rules.
data/
  feed.json      Fallback snapshot (regenerate with `npm run seed`). Details
                 stripped to keep it small.
test/
  aggregate.test.js   Unit tests for the pure aggregation logic.
.github/workflows/ci.yml   Syntax check + node --test on push/PR.
vercel.json      Function config, cron, and all route rewrites.
```

## Routes

| URL | Handled by | Notes |
|---|---|---|
| `/` | render (home) | Timeline, 15 at a time ("View more" pages through the full catalog) |
| `/breach/:slug` | render | Per-breach page; old hash ids 301 to slug |
| `/year/:yyyy` | render | Year archive |
| `/company/:slug` | render | "Has X had a data breach?" hub |
| `/biggest-data-breaches` | render | Ranked by accounts affected |
| `/glossary`, `/glossary/:slug` | render | Glossary index + term pages |
| `/stats` | render | Live statistics |
| `/about`, `/methodology`, `/how-its-built` | render | Trust + engineering pages |
| `/privacy` | render | Privacy policy (analytics, local storage) |
| `/api/feed` | feed | Light JSON feed |
| `/api/og`, `/api/og?id=:slug` | og (edge) | PNG share image |
| `/sitemap.xml` | sitemap | Dynamic |
| `/rss.xml` | rss | RSS 2.0 |

---

## Sources

Configured at the top of `api/_aggregate.js`:
- **Have I Been Pwned** (`/api/v3/breaches`) — the full catalog of confirmed breaches.
- **RSS:** BleepingComputer, The Hacker News, Krebs on Security, The Record, SecurityWeek.

News items are filtered to genuine breach incidents by `BREACH_KEYWORDS`, then
near-duplicate stories about the same incident are clustered (`clusterNews`).
To add a source, add it to `NEWS_SOURCES`. To tune relevance, edit `BREACH_KEYWORDS`.

---

## SEO

- Server-rendered pages, each with title, meta description, Open Graph, JSON-LD.
- The **full HIBP catalog is kept uncapped** (every breach is a permanent
  indexable page); only news items are capped (`NEWS_CAP` in `_aggregate.js`)
  because they are ephemeral. The sitemap lists breach pages only — news pages
  stay reachable on-site but are not submitted, since they 404 once they fall
  out of the source RSS windows.
- Keyword-friendly slugs (`/breach/company-year`); old hash URLs 301 to the slug.
- Per-breach FAQ with FAQPage schema; company hubs with FAQPage; glossary DefinedTerm.
- Original "what to do if affected" guidance (anti-thin-content).
- Year archives, biggest-breaches, company hubs, glossary, stats — all cross-linked.
- Dynamic sitemap + RSS + per-breach PNG OG images.

**Search Console / Bing verification** is wired to environment variables:
set `GOOGLE_SITE_VERIFICATION` and/or `BING_SITE_VERIFICATION` in
Vercel → Settings → Environment Variables. The meta tags appear automatically.

---

## Caching

- HTML pages: `s-maxage=900, stale-while-revalidate=3600`.
- `/api/feed`: same.
- `/api/og`: `s-maxage=86400`.
- A Vercel Cron (`vercel.json` → `crons`) pings `/api/feed` daily to keep the
  cache warm without traffic. **Frequency depends on your Vercel plan** — the
  Hobby plan only allows once-daily crons (`0 0 * * *`); on Pro you can raise it
  to hourly (`0 * * * *`).

---

## Deploy

```bash
vercel            # first run: log in + link/create the project
vercel --prod     # promote to production
```
Or import the GitHub repo in the Vercel dashboard (framework preset: **Other**,
no build command, no output directory). Pushes to `main` auto-deploy if connected.

**Custom domain:** Vercel → Settings → Domains → add `recentdataleaks.com`, then
add the DNS records Vercel shows. HTTPS is automatic.

**The domain string** `https://recentdataleaks.com` is hard-coded as `SITE` in
`api/render.js`, `api/sitemap.js`, `api/rss.js`, and `api/og.js`. Update all four
if the domain changes.

**Analytics:** enable Vercel Web Analytics in the dashboard (Project → Analytics).
The script tag is already injected by `render.js`; no package needed.

---

## Testing & CI

- `npm test` runs `node --test` against `test/`.
- `.github/workflows/ci.yml` runs syntax checks + tests on every push/PR.
- Before pushing: `node --test` and `node --check` the CommonJS files. `og.js` is
  ESM, so validate it with `node -e "import('./api/og.js')"`.

---

## Known caveats

- **OG images:** PNG via `@vercel/og` (edge). The Inter font is fetched at runtime
  from a pinned jsDelivr URL; if that fails, the endpoint returns an inline SVG
  fallback (generated in `og.js` itself).
- **News clustering** is a heuristic (shared distinctive token within 10 days).
  It can occasionally over- or under-merge; low impact since the catalog is
  ~99% confirmed HIBP breaches.
- **News pages are ephemeral** by design: once an item leaves the source RSS
  windows it drops from the feed and its page 404s. That's why the sitemap only
  lists confirmed breaches.
- **Fallback snapshot** can go stale; it only serves if live aggregation fails.
- **Company pages** for single-incident companies overlap the breach page; framed
  as a distinct question ("Has X had a data breach?"). Revisit with `noindex` if
  Search Console flags duplication.
- **Source fetches time out after 8s** (`FETCH_TIMEOUT_MS`) so one hanging feed
  degrades to an `errors` entry instead of stalling page renders.

---

## Roadmap

**Off-site (the current bottleneck — nothing ranks until this is done):**
1. Enable Vercel Web Analytics.
2. Verify in Google Search Console + Bing; submit `sitemap.xml`; request indexing.
3. Earn backlinks: Show HN, r/webdev, r/cybersecurity, breach-tracker directories.

**Product:**
- Email alerts / subscribe (returning audience) — needs an email provider + store.
- "Check if you were affected" lookup — likely needs a paid HIBP key + privacy handling.
- Terms of use (privacy policy is live at `/privacy`).

**Attribution:** every link to Literal carries UTM parameters with a distinct
`utm_content` per placement (`byline`, `hero-cta`, `breach-cta`), so conversions
can be traced to the CTA that drove them. See `literalUrl()` in `render.js`
and `app.js` (keep the two in sync).

---

## License

MIT — see `LICENSE`. Aggregated content belongs to the respective sources; this
site is for awareness only and is not affiliated with any of them.
