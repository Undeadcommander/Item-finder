# Haven · Item finder

A lightweight home inventory app. Start with one room, add rooms and nested containers, and record exactly where each item belongs. Search by item name, notes, or location; a result opens and highlights the item in its container.

## Development

Requires Node.js 20.19+ or 22.12+ (validated with Node 24).

```sh
npm ci
npm run dev
```

Vite serves the app on port 5173. `npm run build` produces the static site in `dist/`; `npm run preview` serves that build. Deploy `dist/` to any static host. Hash-based navigation needs no server rewrite rules.

## Checks

```sh
npm test
npm run build
# With the dev server running:
npm run test:e2e
```

Browser tests use `/usr/bin/chromium`. Set `CHROMIUM_PATH` to another Chromium executable if needed. Tests cover nested containers, search, reload persistence, editing, deletion, backup restore, and mobile overflow.

## Storage and performance

Data is stored in this browser's localStorage, on this site's origin. There is no account, backend, or cross-device sync. Export JSON backups from the sidebar (or footer on mobile); restoring replaces the current inventory after confirmation. Clearing browser data removes the inventory. Storage failures are reported and changes are not silently accepted.

Navigation runs locally without network requests. Location and item lookup maps and card summaries are rebuilt only when data changes; search text is precomputed and displayed results are capped at 30. Container depth has no application limit, subject to browser memory and storage limits. A room's tile summarizes items in all of its nested containers; its page lists directly stored items separately from child containers. Large inventories remain subject to browser rendering and localStorage limits.

No runtime libraries, remote fonts, or third-party services are required.

## GitHub Pages

The `Deploy Haven to GitHub Pages` workflow builds and deploys every push to `main`.
The production build uses `/Item-finder/` as its asset base path.
In repository **Settings → Pages**, set **Source** to **GitHub Actions** once.
The deployment URL is `https://undeadcommander.github.io/Item-finder/` after a successful Pages deployment.
Inventory saved on a local preview does not automatically transfer to this URL; export and restore a backup to move it.
