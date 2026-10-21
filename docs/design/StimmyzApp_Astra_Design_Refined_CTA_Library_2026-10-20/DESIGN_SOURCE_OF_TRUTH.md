# StimmyzApp — DEVICE-AUDIO-FIRST approved visual and interaction contract

## Why this file exists

Previous packages delivered an HTML UI whose appearance differed substantially from the design the owner approved. This is **not acceptable**. This package is a fresh rebuild. The browser implementation and PNG previews are generated from the **same code**, and are intended as the **visual target** for engineering. Do not fall back to the old package.

## Design authority and precedence

1. **Owner's most recent explicit functional corrections** override earlier mockup details: Quick Add pinned first, its config arrow only during Edit Board, pad and library three-dot dropdowns, and no redundant controls.
2. **2026-10-20 product decision:** device-audio capture is the primary sound-acquisition method; microphone and file import are secondary. Use `prototype/standalone.html`, `prototype/app.css`, `prototype/app.js` and `previews/*.png`: **current working UI specification** across all pages (Board, Editor/Source, Trim, Customize, Library, menus, theme selector). This prototype was deliberately recreated from the supplied mockups. It replaces the earlier generic handoff appearance.
3. `references/APPROVED_SIX_THEMES.png`: visual authority for the overall playful pastel/Coffee aesthetic, logo, rounded grid, sound pad color density, surface contrast, six named palettes.
4. `references/APPROVED_DARK_UI_BOARD_EDITOR_LIBRARY.png`: visual authority for surface treatment, typography, palette, and neon pads, **not for the obsolete upload-first Editor hierarchy**. The current prototype supersedes its actions.
5. `references/APPROVED_TRIM_FLOW.png`: visual authority for waveform trimming, step header and fine-tune controls.
6. When uncertain, **ask the owner** instead of improvising a different visual design.

### Limits of literal “1:1”

The source mockups are rendered *images*, not exported components, vectors or measured design files. Exact original font glyphs, source artwork, and pixels cannot be reconstructed with provable pixel identity from those images. This package uses manually measured proportions and the approved colors; **it is a high-fidelity editable reconstruction, not a claim of pixel-for-pixel identity**. Astra should not use the raster mockup as a single static UI background. It should implement reusable native components and verify side-by-side screenshots.

## Global visuals

- Brand wordmark: “Stimmyz” bold/italic, ~39px in desktop phone reference, purple → violet → electric blue gradient, tiny magenta sparkle. The **logo does not recolor per theme**.
- Outer screen: themed backdrop (pastel for light themes, warm espresso for Coffee), rounded panels, minimal shadows, strong but not cluttered colorful pads.
- Preferred font: system or Inter-like with legible glyphs; fallbacks are acceptable if sizing/weight is carefully aligned.
- Primary device-capture CTA: purple gradient, ~59px high, 14px radius, white bold label. Active-capture Stop CTA: pink gradient, similar sizing.
- Chrome (inputs, borders, headers) changes per theme; saturated pad palette remains relatively consistent.
- Touch targets: >=48dp for full controls; pad overflow target can occupy a 48dp hitbox while drawing a smaller icon.
- Respect safe-area insets, Android system bars, font scaling, and landscape/small-screen scrolling.

## Bottom navigation — critical fidelity correction

- Three full-size tabs **BOARD · EDITOR · LIBRARY**, icon **28–30dp** (prototype uses 29px), label ~12sp, nav height ~78dp.
- Active color = theme purple, active 4dp underline ~70dp wide.
- The icons are **proper 4-square board / waveform editor / stacked collection cards with a play glyph for Library (never a database cylinder)**, never just dots.
- Source, Trim and Customize are a global creation flow and may present over the regular tab shell; use a full-screen route/sheet with no tiny modal.

## Board — critical fidelity correction

- Header: gradient logo, “Soundboard”, persistent board selector (with its own chevron), **Edit board** button, search field.
- Grid: **4 columns** with approximate 8dp gaps; vivid rounded rectangular meme pads showing optional artwork and a legible sound name.
- **Quick Add is ALWAYS grid index 0**. Treat as a *persistent action tile*, not a sound from the data array. When a new sound is added, it appears after Quick Add; Quick Add's position must never change.
- Quick Add normal mode: large plus, “Quick add”, preferred action label (default **Record device audio**). **NO chevron, NO little dropdown arrow.** Tap executes preferred action. Preserve an existing user’s chosen action when upgrading, rather than resetting settings.
- Quick Add when **Edit board** is on: a small arrow appears on Quick Add. That arrow alone opens the choice menu: **Record device audio (default for new users) / Record microphone / Import audio or video / Open library**. Exiting Edit hides the arrow again.
- Every ordinary sound pad (not Quick Add) has a ⋮ overflow button with **Replace sound, Rename, Move to board, Clear pad**. Do not turn pad taps into menu opens; tapping the main tile plays.
- Board selector opens menu with Main board / Work / Memes / Office / Create new board; selection changes grid (demonstration).
- No redundant standalone search icon beside the search field, no technical debug stats on the primary Board.

## Editor / Source — new primary hierarchy, 2026-10-20

**The old import-first Editor reference is superseded.** New first-screen layout:

1. **Hero card: Record device audio** — visually dominant purple gradient primary CTA, device/sound-wave icon, no explanatory marketing paragraph, and an honest compatibility hint (“Works with compatible apps · Android will ask for permission”).
2. Smaller stacked **Record your voice** option — Android microphone; don't refer to it as device audio.
3. Smaller stacked **Import audio or video** option — local file selector; intentionally secondary but always accessible.
4. In **personal/dev build only**, optional YouTube link panel *after* the three supported sources; omit from Play build and do not claim it is compliant merely because it is private.

Do **not** render redundant selector tabs above these actions. Device recording is the default intent at every creation entry point, but other sources require no extra confirmation or arbitrary restriction.

**Global Source sheet** should present the same order with “Record device audio” highlighted at the top, followed by microphone and import. Selecting device recording launches the established Android MediaProjection consent/foreground-service flow (actual app only). The HTML prototype simulates capture with an explicit disclaimer. User may switch apps, play a moment, and stop via a persistent recording notification; after capture, return to **Trim → Details → Save**. Stop/consent-denial/silence and app-restriction cases must be handled gracefully.

**Quick Add** remains first in the Board grid. Tapping it with the default preference starts device capture directly. Its configurator **arrow is visible only when Edit Board is active**. An existing user's saved preference must survive upgrades.

**Library** main CTA is now **Record device audio**, replacing “Edit a device file.” The CTA is TEXT-ONLY, strictly centered horizontally and vertically (no leading icon). The dashed bottom action remains “More ways to add a sound” and opens the full Source selection. Search and three-dot actions stay unchanged.

**Platform constraints:** Device-audio capture requires Android API 29+; older versions must show a clear unsupported message and keep microphone/local import available. On API 29+, still respect source app policy and Android consent; neither YouTube nor TikTok should be marketed as universally recordable. This is a general-purpose audio feature, **not** copyright authorization.

## Trim

- Full-screen creation header with Back, Source → Trim → Details step indicator.
- Clip summary/title and total duration.
- Central visual waveform with **two independently draggable handles**, tinted selection region and playback preview control.
- Start/end selection values update while dragging. Clip length capped at 60s.
- **New preview behavior:** moving waveform playhead and colored already-played portion, Play/Pause, separate clip-relative progress bar and elapsed/total label. Selection start/end remain absolute to the source. When selection changes, stop preview and reset playhead to new start. Optional looping. See `TRIM_PLAYBACK_PROGRESS_REQUIREMENTS.md`.
- **Fine tune collapsed by default**; expanded view provides Start and End adjustments by -1s/-100ms/+100ms/+1s; show clear numerical times.
- Continue to optional customization; do not place the entire waveform inside a tiny alert dialog.

## Customize / Details

- Final screen matches the same surfaces, typography, gradients and spacing. It is not an unrelated settings form.
- Soundbite name field, **optional artwork** preview and Default / Gallery / Search paths.
- Gallery via Android Photo Picker; persist a cropped/compressed local copy for offline display.
- Search is a design placeholder in this prototype. Do not ship an online image-search service without verified API permissions, licensing, attribution and caching terms. Hidden/unavailable by default is fine.
- Save soundbite; if launched to replace an existing pad, update the targeted item, otherwise append to collection. Do not push Quick Add down.

## Library

- Large stacked-card collection icon (front card includes a small play symbol; not a database cylinder), “Your library ✦”, 2-line offline subtitle, purple **“Record device audio”** CTA.
- One search input and an optional **A–Z sort** button. **No redundant header search icon.**
- Local clip rows: thumbnail, title, duration/offline status, large play button and ⋮ overflow.
- Library row ⋮: **Play / Rename / Change artwork / Add to board / Delete**.
- “More ways to add a sound” dashed CTA after the list, opening the Source chooser (device capture / microphone / import).
- The prototype shows **four saved clips** initially, distinct from a fuller soundboard of sample pads; this reflects the original screenshots' distinction between local clips and layout pads.

## Theme families

| Theme | Backdrop | Surface | Accent/primary | Mood |
|---|---|---|---|---|
| Peach | `#FFEAE6` | `#FFF6F2` | `#A855F7` | soft and warm |
| Mint | `#EAFBF0` | `#F6FFFA` | `#8B5CF6` | bright and calming |
| Snow | `#F8FAFC` | `#FFFFFF` | `#8B5CF6` | crisp neutral |
| Ice | `#E7F4FF` | `#F7FBFF` | `#8B5CF6` | cool blue |
| Vanilla | `#FFF8EC` | `#FFFDFA` | `#8B5CF6` | warm cream |
| Coffee | `#1F1B18` | `#302620` | `#C084FC` | dark cocoa |

These tokens are approximate to the AI-generated reference image and can be tuned by side-by-side screenshot review; keep names and broad color relationships fixed.

## Screenshot-based approval procedure

1. Use `previews/editor-*.png` to compare all six Editor themes, and `previews/board-vanilla.png` / `previews/board-coffee.png` to compare Board appearance to `APPROVED_SIX_THEMES.png`.
2. Compare the new **device-first Editor and Source** screens directly against `previews/03-editor-device-first-vanilla.png` and `previews/09-editor-device-first-coffee.png`; the previous import-first mockup is no longer the correct action hierarchy. Preserve the approved surface language for Trim, Customize, and Library.
3. Verify the **3-dot dropdown screenshots**, the edit-only Quick Add arrow, and the pinned first tile after saving.
4. Test actual Android layouts at >=360dp width, 100% and 150% font scaling; fix truncation and safe-area overlaps.
5. If a visible control differs from the prototype, document why and request approval before shipping.

## Never use as final release artwork

Reference mockups and internal demo crops may depict identifiable protected characters or meme art. They are included only to show style and image treatment, not to license these assets. Replace with rights-cleared, original or user-selected media for the store build.

## Device capture copy guardrails

Use “Record device audio,” not “Record YouTube,” “Download any sound,” or “Bypass restricted apps.” Preview and QA with synthetic and lawful test audio. Recording from other apps can be silent or restricted. No capture is guaranteed by the hardware brand. Recording must be user-initiated; Android consent is fresh per session; keep a visible Stop mechanism. Do not use overlays or an unauthorized extractor as a fallback.


## Approved microcopy revision — 2026-10-20

Remove the redundant descriptive paragraph from the Editor hero below “Record device audio”. Keep the title, primary action, Start → Play moment → Stop & trim mini-flow, and short compatibility/permission note. Do not replace the removed paragraph with other promotional copy or add extra vertical whitespace. This microcopy change must be reflected in the prototype and Android release.

## 2026-10-20 refinement — library icon and primary CTA alignment

- **Editor primary CTA** and **Library primary CTA** must contain only centered text: `Record device audio`. Do not prepend a device/speaker icon or a placeholder icon box.
- Maintain symmetric left/right padding, true geometric centering and consistent height across all six themes; test at 360px width and at large font scale.
- **Library icon** is a stacked-cards/collection-with-play glyph, NOT a database cylinder. Use the same symbol in both navigation and Library page header; preserve existing approved nav icon size **29dp** and header icon approximately **39dp**.
- Board and Editor icons stay unchanged. The primary capture card can still feature a large device-audio pictogram, and secondary method icons remain.
- Library overflow ⋮, board pad ⋮ and edit-only Quick Add chevron must remain operational; unrelated screens and media capture wiring must not be changed.
