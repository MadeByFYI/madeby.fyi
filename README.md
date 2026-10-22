# madeby.fyi

The website for **MadeBy** — verifiable authorship provenance for code, built on
**ACO**, the open [Authorship Certificate of Origin](https://github.com/MadeByFYI/MadeBy/blob/main/ACO.md) standard.

- The standard + reference implementation: https://github.com/MadeByFYI/MadeBy
- `madeby` on npm: https://www.npmjs.com/package/madeby

A static page (`index.html`) plus the files agents read, deployed to <https://madeby.fyi> via
Cloudflare Pages (direct upload — a git push does not deploy).

- `md.mjs` — turns `index.html` into `index.md` (also `index.html.md`) at build, so the Markdown never
  drifts from the page. `functions/_middleware.js` serves it at `/` to `Accept: text/markdown`.
- `llms.txt` — the hand-written agent index (`{{VERSION}}` is filled in at build).
- `build.mjs` — builds `dist/`: the page, `404.html`, `llms.txt`, and, generated from the **published**
  `madeby` package, `llms-full.txt` (the MCP guides, the AGENTS.md convention, the policy schema, the
  CLI reference and the ACO spec), `AGENTS.md` (exactly what `madeby init` writes) and a `robots.txt`
  that welcomes all crawlers, AI training included. (Cloudflare's managed robots.txt and its AI-crawler
  block must stay off in the zone settings, or they override it.) Rebuild after
  each `madeby` release so the agent files match it.

Deploy, from this directory (wrangler picks up `functions/` from here):

```sh
node build.mjs
npx wrangler pages deploy dist --project-name=madeby-fyi --branch=main --commit-hash=$(git rev-parse HEAD)
node indexnow.mjs   # tell Bing and the other IndexNow engines the site changed
```
