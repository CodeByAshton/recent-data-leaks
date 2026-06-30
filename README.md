# Recent Data Leaks

A live, server-rendered timeline of public data breaches: who was breached, when,
how many accounts were affected, and what data was exposed. Click any entry for a
full detail page. Built to deploy on **Vercel**, served at **recentdataleaks.com**.

## Architecture

Server-rendered for SEO, hydrated for interactivity.

- **`api/render.js`** — renders full HTML server-side for the home timeline (`/`)
  and every breach page (`/breach/:id`), each with its own `<title>`, meta
  description, Open Graph tags, and JSON-LD. This makes individual breaches
  indexable and gives them real link previews.
- **`api/feed.js`** — `GET /api/feed`, the live aggregated feed as JSON. Fetches
  all sources server-side (no browser CORS), and Vercel's CDN caches it (~15 min).
- **`api/_aggregate.js`** — shared aggregation + RSS parsing. Also builds each
  item's SEO slug (e.g. `sysco-2026`) and original "what to do if affected" advice.
- **`api/_feed.js`** — shared loader (live aggregate with snapshot fallback).
- **`api/sitemap.js`** — dynamic `sitemap.xml`: home, every breach URL, and year archives.
- **`api/rss.js`** — RSS 2.0 feed at `/rss.xml`.
- **`api/og.js`** — dynamic per-breach Open Graph image at `/api/og?id=<slug>`.
- **`assets/app.js`** — client hydration: re-renders the server HTML with live data,
  plus filtering, search, and client-side navigation. If the feed is unreachable it
  leaves the server-rendered content in place.
- **`data/feed.json`** — bundled snapshot used as a fallback if every live source
  is down, so a page never renders blank.

Routing is wired in `vercel.json` (rewrites `/`, `/breach/:slug`, `/year/:yyyy`,
`/sitemap.xml`, `/rss.xml`). Static files (`/assets/*`, `/robots.txt`) serve directly.

### SEO
- Server-rendered pages with per-page `<title>`, meta description, Open Graph, and JSON-LD.
- Keyword-friendly slug URLs (`/breach/company-year`) and year archive pages with internal links.
- Original per-breach guidance ("what to do if you were affected") to avoid thin/duplicate content.
- Dynamic `sitemap.xml`, RSS feed, and per-breach OG images.
- Search Console / Bing verification via env vars `GOOGLE_SITE_VERIFICATION` and
  `BING_SITE_VERIFICATION` (set them in Vercel → Settings → Environment Variables).

### Sources
Have I Been Pwned (confirmed breaches) plus breach reporting from BleepingComputer,
The Hacker News, Krebs on Security, The Record, and SecurityWeek. News items are
filtered to genuine breach incidents. Edit the list at the top of `api/_aggregate.js`.

## Local development

```bash
npm i -g vercel
vercel dev          # serves the functions + static assets at http://localhost:3000
npm run seed        # refresh the bundled fallback snapshot from live sources
```

## Deploy to Vercel

```bash
vercel            # first run: log in + link/create the project
vercel --prod     # promote to production
```
Or import the GitHub repo in the Vercel dashboard (framework preset: Other, no build
command, no output directory).

## Custom domain (recentdataleaks.com)

1. Vercel → Project → Settings → Domains → add `recentdataleaks.com`.
2. At your registrar, add the DNS records Vercel shows (an A record for the apex, or
   a CNAME to `cname.vercel-dns.com` for `www`).
3. Vercel issues HTTPS automatically once DNS resolves.

## Notes
- No API keys required — every source is public.
- Aggregated content belongs to the respective sources; this is for awareness only.
