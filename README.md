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
- **`api/_aggregate.js`** — shared aggregation + RSS parsing logic. No dependencies.
- **`api/sitemap.js`** — dynamic `sitemap.xml` listing the home page plus every
  current breach URL.
- **`assets/app.js`** — client hydration: re-renders the server HTML with live data,
  plus filtering, search, and client-side navigation. If the feed is unreachable it
  leaves the server-rendered content in place.
- **`data/feed.json`** — bundled snapshot used as a fallback if every live source
  is down, so a page never renders blank.

Routing is wired in `vercel.json` (rewrites `/`, `/breach/:id`, `/sitemap.xml` to
the functions). Static files (`/assets/*`, `/robots.txt`, `og.svg`) serve directly.

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
