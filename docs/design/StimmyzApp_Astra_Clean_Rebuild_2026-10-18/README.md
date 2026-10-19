# StimmyzApp — CLEAN REBUILD / Astra handoff

**Status:** New handoff written from scratch on 2026-10-18. Supersedes **every earlier StimmyzApp handoff ZIP**. No old handoff or old HTML prototype is used as implementation authority.

## Open this first

1. `prototype/standalone.html` — **single, completely offline HTML design preview**. Open it in a desktop browser. It includes six themes and real interactive dropdown examples. On a phone-sized viewport it fills the screen.
2. `DESIGN_SOURCE_OF_TRUTH.md` — the precise relationship between approved mockups, the recreated prototype and later UX changes. This document is **required reading**.
3. `ASTRA_IMPLEMENTATION.md` — phased engineering handoff and acceptance tests.
4. `previews/` — screenshots captured directly from the rebuilt HTML prototype. They show **what Astra should implement**, not an unrelated styling system.
5. `references/APPROVED_SIX_THEMES.png` — approved palette and Board appearance. Other references cover the dark Editor/Library and trim flow.

## Non-negotiable details

- **Quick Add is ALWAYS the first/top-left board tile**. It never moves when creating clips. Its primary tap is the user's selected quick action.
- **Quick Add has NO dropdown chevron in normal Board mode**. Only **Edit Board** reveals the small arrow to change the preferred quick action: Record, Choose file or Library.
- **Normal sound pads have functional ⋮ menus. Library rows have functional ⋮ menus.** These are distinct controls.
- **Large bottom navigation icons**: 28–30 dp, with approximately 12 sp labels and a prominent 4 dp active underline. Do not shrink them into dots or miniature icons.
- **Six distinct palettes:** Peach, Mint, Snow, Ice, Vanilla and Coffee. Preserve the purple-to-blue Stimmyz wordmark.
- The visual design is the **same across every page**, not a theme wrapper around old layouts.
- Record/import → drag waveform handles → optional fine tune → Customize name/artwork → Save. The creation route can open from multiple places.
- The Play Store build must not contain direct unauthorized YouTube extraction or related dependencies. A personal development build is distinct, but private use is not automatically authorized by YouTube or copyright law.

## What has been validated

`design/validation.json` documents browser checks for all six themes, first-slot Quick Add, edit-only arrow, pad ⋮ menu, library ⋮ menu, 29px nav icons, interactive waveform dragging and fine-tune controls, optional artwork, and new-sound saving that preserves Quick Add position.

**This is a visual/interaction prototype, not an actual Android implementation.** It does not encode or trim audio, record from the microphone, call image APIs or save real sound files.

## Media rights

`prototype/assets/` contains **cropped illustrations from the approved AI-generated concept image** to make the design demonstrably close to the mockup. They are for internal design comparison **only**. Some images resemble recognizable characters or memes. **Do not ship these as bundled app assets.** Use user-provided images, original illustration, or licensed assets instead. Likewise, audit all preloaded audio clips.

## One-line Astra instruction

> Read `DESIGN_SOURCE_OF_TRUTH.md` and `ASTRA_IMPLEMENTATION.md`. Open `prototype/standalone.html` and inspect every page plus the screenshots in `previews/`. First inspect the Android repository and propose a file-by-file plan. Recreate the prototype's **layout, icon sizing, hierarchy, menus, theme tokens and actual behavior**, not the previous handoff styling. Preserve working audio logic and apply the store/personal build separation. Do not ship demo artwork or unauthorized media.
