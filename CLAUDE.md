# Claude Code guide — Recent Data Leaks

A live, server-rendered timeline of public data breaches. Vercel + vanilla JS,
**no build step**, one runtime dependency (`@vercel/og`). Read `README.md` for the
full architecture, file map, and route table. This file is the quick operating guide.

## What it is
- SSR HTML pages (`api/render.js`) + a JSON feed (`api/feed.js`) + edge PNG OG
  images (`api/og.js`) + sitemap/rss. Client (`assets/app.js`) hydrates the home
  and breach pages for search/filter/nav; it leaves other pages as server-rendered.
- Goal: organic search traffic (engineering-for-traction project).

## Commands
- `npm test` — unit tests (`node --test`, no extra deps).
- `npm run seed` — regenerate `data/feed.json` fallback snapshot from live sources.
- `vercel dev` — run everything locally (includes the edge OG function).
- Deploy: push to `main` (auto-deploys if connected) or `vercel --prod`.

## Conventions (do not break these)
- **All `api/*.js` are CommonJS** (`require`/`module.exports`) **except `api/og.js`,
  which is ESM Edge** (`import`/`export default` + `export const config = { runtime: "edge" }`).
- **Never add `"type": "module"` to package.json** — it breaks every CommonJS function.
- Keep it **dependency-free** apart from `@vercel/og`. No front-end framework, no build.
- Files starting with `_` (`_aggregate`, `_feed`, `_content`) are shared modules, not routes.
- Routes are wired in `vercel.json` (`rewrites`). New pages = a `view`/param branch
  in `render.js` + a rewrite + a sitemap entry + (usually) a footer link.
- The domain string `SITE = "https://recentdataleaks.com"` is duplicated in
  `render.js`, `sitemap.js`, `rss.js`, `og.js`. Change all four together.

## Before you commit
1. `node --test` passes.
2. `node --check` the CommonJS files; validate the ESM one with
   `node -e "import('./api/og.js')"`.
3. Only commit/push when asked. End commit messages with the agreed co-author line
   if your workflow uses one.

## Where things live
- Sources / RSS parsing / breach filter / clustering / slug+advice+FAQ: `api/_aggregate.js`.
- Page markup + JSON-LD + handler routing: `api/render.js`.
- Glossary + company-slug logic: `api/_content.js`.
- Styles (Literal liquid-glass design tokens; light default + `.dark` toggle, mobile rules): `assets/styles.css`.

## Current focus
On-site work is largely done. The remaining bottleneck is off-site: enable Vercel
Analytics, verify Search Console + Bing (env vars `GOOGLE_SITE_VERIFICATION` /
`BING_SITE_VERIFICATION`), submit the sitemap, and earn backlinks. See README → Roadmap.
