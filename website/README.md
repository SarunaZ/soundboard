# Stimmyz launch website

Standalone Astro static site for the Stimmyz Android app. It builds the launch page and a draft privacy policy as static HTML, with no runtime server dependency.

## Run locally

Use Node.js 24.22.1 or newer and pnpm 11.25.0. From the repository root, enter the website folder and install dependencies:

```sh
cd website
pnpm install
```

Start the development server with:

```sh
pnpm dev
```

Build the static site and preview the production output with:

```sh
pnpm build
pnpm preview
```

The production output is in `dist/`. Deploy the **contents** of that directory to any static host. Configure Astro's `base` option in `astro.config.mjs` when publishing below a path prefix; navigation links, screenshot assets, and the theme preview use Astro's base URL.

## Run with Docker

Docker Engine with the Compose plugin is the only host prerequisite. From the
repository root, build and start the standalone static site:

```sh
docker compose -f website/compose.yaml up --build -d
```

Open <http://127.0.0.1:4321/>. Compose binds to loopback by default; choose a
different host port with `WEBSITE_PORT=4322` if needed. To stop and remove the
container, run:

```sh
docker compose -f website/compose.yaml down
```

View its output with:

```sh
docker compose -f website/compose.yaml logs -f website
```

The image builds with the pinned Node 24.22.1 and frozen pnpm lockfile, then
serves only the generated static files through nginx on container port 8080.
The default Docker deployment serves the site at `/`. For a subpath deployment,
set `SITE_BASE` at build time and configure the reverse proxy to strip that
prefix before forwarding requests to the container. `/privacy/` is a static
page; unknown paths return 404 rather than falling back to the home page.

## Pages and assets

- `/` — responsive landing page, product features, real app screenshots, and five selectable theme previews.
- `/privacy/` — draft policy, intentionally marked `noindex` and carrying the draft notice.
- `public/assets/` — supplied logo, launcher icon, and optimized screenshots from the October 25, 2026 reference package.
- `PRIVACY_REVIEW.md` — release checklist that must be completed before the policy is published.

The site was converted from `Stimmyz_Launch_Website_2026-10-25.zip`, based on the October 24 Stimmyz app handoff and the approved October 22 transparent mint logo. The privacy page now uses the October 31 analytics-disabled beta policy draft supplied in `Stimmyz_Privacy_Policy_Review_Package_2026-10-31.zip` and the matching standalone Markdown. It remains under owner review, `noindex`, and marked as a draft; the provider, release, Data Safety, retention, and publication gates in `PRIVACY_REVIEW.md` are still open. Its screenshots are genuine prototype captures rather than marketing concept art. The landing page corrects the reference's stale “two seconds” pad-protection sentence to the current one-second hold requirement in the repository's October 24–25 app handoff. Other product copy is retained.

The direct `cookie@2.0.1` dependency ensures Astro's externalized prerender runtime resolves the same ESM cookie package as Astro itself when built inside the Yarn monorepo, whose root `node_modules` contains an older CommonJS cookie package.

Set `SITE_BASE=/soundboard/` when building for a static host subpath (for example, GitHub project pages); omit it for a domain root.

## Before publishing

The privacy page is not release-ready. The October 31 beta policy copy supplies the developer name and privacy and support contacts, but these are not verified facts. Complete `PRIVACY_REVIEW.md`, verify the controller identity and contact paths, inspect the exact active release APK/AABs, providers, network behavior, and backup/deletion behavior, and set the actual publication date. Then remove the draft banner and `noindex` metadata. Do not replace the Google Play “Coming soon” status with a store link until the app is published. Confirm usage rights for prototype screenshot artwork before using it as promotional material.

The site includes no analytics, third-party scripts, external fonts, or embedded remote content. A hosting provider may still retain ordinary access logs.
