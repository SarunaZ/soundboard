# StimmyzApp — Astra handoff bundle

**Start with:** `RESEARCH_AUDIT_2026-10-17.md`, then `ASTRA_HANDOFF.md` and `design/prototype.html`.

This is a **design and engineering handoff**, not a change to the Android repository and not a working sound editor. Nothing in the HTML records, trims, downloads, saves or sends actual audio. The bundled drawings are illustrative.

## Contents

| Path | Purpose |
| --- | --- |
| `RESEARCH_AUDIT_2026-10-17.md` | Updated legal/market audit; supersedes earlier assumptions |
| `ASTRA_HANDOFF.md` | Product requirements, screen behavior, architecture, scoped build variants, acceptance tests, staged implementation and the exact Astra prompt |
| `design/prototype.html` | **Standalone offline interactive browser prototype** (open directly in a modern browser) |
| `design/tokens.json` | Proposed dark/light colors, accent palette, spacing and touch target sizes |
| `design/previews/` | Captured screens of the functioning interactive prototype for quick inspection |
| `references/current/` | Four user-supplied screenshots of the current Android Board, Editor, Library, and existing waveform editor |
| `references/concepts/` | AI concept artwork from the design discussion, for **visual inspiration only** |

## What to try in the HTML prototype

1. Open `design/prototype.html` in Chrome, Firefox, Edge, or Safari.
2. Try the **board dropdown** and a pad **⋮ menu**. The menu demonstrates Replace, Rename, Move and Clear.
3. Tap **Quick add**. Tap its little chevron to choose its preferred action: Record / Choose file / Library.
4. Open **Library** and expand a clip's **⋮ menu** to see Play, Rename, Change artwork, Add to board, Delete.
5. Start creation from **Board**, **Editor**, or **Library**. Follow **Source → Trim → Customize**.
6. **Drag both waveform handles**, expand **Fine tune**, and modify Start/End with ±100 ms or ±1 s.
7. Continue to **Customize**. Try the default images, gallery preview or mock online-image results, then simulate Save.
8. Open **Appearance** (in the board selector or Library) for System/Dark/Light theme. You can also switch the *prototype preview* between store and personal build behavior. This is not how actual flavors should be implemented.

## For Astra

- Read the audit update before building: treat all bundled sample sounds/images and preloaded remote clips as requiring rights verification; do not claim the personal build is legally exempt.
- Inspect the actual repo and provide a **file-level implementation plan first**.
- Preserve existing boards, clip IDs, audio pipeline and local/remote sound behavior; prevent destructive migration.
- Follow the handoff for the full-screen creation route, trimmer, optional artwork, build flavors and Android share/import/recording behaviors.
- **The Google Play build must not package any YouTube extraction code, native binaries or UI; simply hiding a button is insufficient.** The HTML prototype has a preview-only distribution switch to document the visual differences, not to suggest feature flags for production.
- Do not bundle the AI-generated meme images or names as app assets. They may depict protected characters or other copyrighted material.
- Review provider terms before adding online artwork search or caching any third-party content. The demo search tiles are not fetched from an API.

## How to share

Hand Astra this **entire ZIP**. Ask it to read `ASTRA_HANDOFF.md` before modifying the repository.
