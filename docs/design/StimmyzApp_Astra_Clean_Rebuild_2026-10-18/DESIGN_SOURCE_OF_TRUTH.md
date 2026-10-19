# StimmyzApp — approved design / exact interaction contract

## Why this file exists

Previous packages delivered an HTML UI whose appearance differed substantially from the design the owner approved. This is **not acceptable**. This package is a fresh rebuild. The browser implementation and PNG previews are generated from the **same code**, and are intended as the **visual target** for engineering. Do not fall back to the old package.

## Design authority and precedence

1. **Owner's most recent explicit functional corrections** override earlier mockup details: Quick Add pinned first, its config arrow only during Edit Board, pad and library three-dot dropdowns, and no redundant controls.
2. `prototype/standalone.html`, `prototype/app.css`, `prototype/app.js` and `previews/*.png`: **current working UI specification** across all pages (Board, Editor/Source, Trim, Customize, Library, menus, theme selector). This prototype was deliberately recreated from the supplied mockups. It replaces the earlier generic handoff appearance.
3. `references/APPROVED_SIX_THEMES.png`: visual authority for the overall playful pastel/Coffee aesthetic, logo, rounded grid, sound pad color density, surface contrast, six named palettes.
4. `references/APPROVED_DARK_UI_BOARD_EDITOR_LIBRARY.png`: visual authority for layout and visual hierarchy on the Editor and Library screens and for the brighter neon pad imagery.
5. `references/APPROVED_TRIM_FLOW.png`: visual authority for waveform trimming, step header and fine-tune controls.
6. When uncertain, **ask the owner** instead of improvising a different visual design.

### Limits of literal “1:1”

The source mockups are rendered *images*, not exported components, vectors or measured design files. Exact original font glyphs, source artwork, and pixels cannot be reconstructed with provable pixel identity from those images. This package uses manually measured proportions and the approved colors; **it is a high-fidelity editable reconstruction, not a claim of pixel-for-pixel identity**. Astra should not use the raster mockup as a single static UI background. It should implement reusable native components and verify side-by-side screenshots.

## Global visuals

- Brand wordmark: “Stimmyz” bold/italic, ~39px in desktop phone reference, purple → violet → electric blue gradient, tiny magenta sparkle. The **logo does not recolor per theme**.
- Outer screen: themed backdrop (pastel for light themes, warm espresso for Coffee), rounded panels, minimal shadows, strong but not cluttered colorful pads.
- Preferred font: system or Inter-like with legible glyphs; fallbacks are acceptable if sizing/weight is carefully aligned.
- Primary CTA: purple gradient, ~54px high, 14px corner radius, white bold label. Recording CTA: pink gradient, similar sizing.
- Chrome (inputs, borders, headers) changes per theme; saturated pad palette remains relatively consistent.
- Touch targets: >=48dp for full controls; pad overflow target can occupy a 48dp hitbox while drawing a smaller icon.
- Respect safe-area insets, Android system bars, font scaling, and landscape/small-screen scrolling.

## Bottom navigation — critical fidelity correction

- Three full-size tabs **BOARD · EDITOR · LIBRARY**, icon **28–30dp** (prototype uses 29px), label ~12sp, nav height ~78dp.
- Active color = theme purple, active 4dp underline ~70dp wide.
- The icons are **proper 4-square board / waveform editor / stacked database library**, never just dots.
- Source, Trim and Customize are a global creation flow and may present over the regular tab shell; use a full-screen route/sheet with no tiny modal.

## Board — critical fidelity correction

- Header: gradient logo, “Soundboard”, persistent board selector (with its own chevron), **Edit board** button, search field.
- Grid: **4 columns** with approximate 8dp gaps; vivid rounded rectangular meme pads showing optional artwork and a legible sound name.
- **Quick Add is ALWAYS grid index 0**. Treat as a *persistent action tile*, not a sound from the data array. When a new sound is added, it appears after Quick Add; Quick Add's position must never change.
- Quick Add normal mode: large plus, “Quick add”, preferred action label. **NO chevron, NO little dropdown arrow.** Tap executes preferred action.
- Quick Add when **Edit board** is on: a small arrow appears on Quick Add. That arrow alone opens the choice menu: Record new sound / Choose local file / Open library. Exiting Edit hides the arrow again.
- Every ordinary sound pad (not Quick Add) has a ⋮ overflow button with **Replace sound, Rename, Move to board, Clear pad**. Do not turn pad taps into menu opens; tapping the main tile plays.
- Board selector opens menu with Main board / Work / Memes / Office / Create new board; selection changes grid (demonstration).
- No redundant standalone search icon beside the search field, no technical debug stats on the primary Board.

## Editor / Source

- “Make a sound ✦” heading with subtitle “Turn any audio into a soundbite.”
- One prominent **Choose an audio or video file** dashed rounded card, including icon cluster, supported formats and purple gradient “Choose file”.
- One “Or record a new sound” section and large pink gradient “Start recording” button.
- The personal/dev preview additionally shows one YouTube link section **between Import and Record**; it is absent from Google Play view. Do **not** offer it as licensed or compliant simply because it is development-only.
- **Do not add three redundant Import / Record / Link pills above the identical source actions.** The owner already rejected duplicated controls.
- This screen is a source entry point; Trim / Customize launch in a reusable full-screen creation route accessible from quick add, the Editor tab, and the Library.

## Trim

- Full-screen creation header with Back, Source → Trim → Details step indicator.
- Clip summary/title and total duration.
- Central visual waveform with **two independently draggable handles**, tinted selection region and playback preview control.
- Start/end selection values update while dragging. Clip length capped at 60s.
- **Fine tune collapsed by default**; expanded view provides Start and End adjustments by -1s/-100ms/+100ms/+1s; show clear numerical times.
- Continue to optional customization; do not place the entire waveform inside a tiny alert dialog.

## Customize / Details

- Final screen matches the same surfaces, typography, gradients and spacing. It is not an unrelated settings form.
- Soundbite name field, **optional artwork** preview and Default / Gallery / Search paths.
- Gallery via Android Photo Picker; persist a cropped/compressed local copy for offline display.
- Search is a design placeholder in this prototype. Do not ship an online image-search service without verified API permissions, licensing, attribution and caching terms. Hidden/unavailable by default is fine.
- Save soundbite; if launched to replace an existing pad, update the targeted item, otherwise append to collection. Do not push Quick Add down.

## Library

- Large stacked library icon, “Your library ✦”, 2-line offline subtitle, purple “Edit a device file” CTA.
- One search input and an optional **A–Z sort** button. **No redundant header search icon.**
- Local clip rows: thumbnail, title, duration/offline status, large play button and ⋮ overflow.
- Library row ⋮: **Play / Rename / Change artwork / Add to board / Delete**.
- “Make another sound” dashed CTA after the list.
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

1. Use `previews/01-board-*.png` to compare all six Board themes to `APPROVED_SIX_THEMES.png`.
2. Compare dark Editor, Trim, Customize and Library screenshots to the corresponding reference mockups; maintain the same component language.
3. Verify the **3-dot dropdown screenshots**, the edit-only Quick Add arrow, and the pinned first tile after saving.
4. Test actual Android layouts at >=360dp width, 100% and 150% font scaling; fix truncation and safe-area overlaps.
5. If a visible control differs from the prototype, document why and request approval before shipping.

## Never use as final release artwork

Reference mockups and internal demo crops may depict identifiable protected characters or meme art. They are included only to show style and image treatment, not to license these assets. Replace with rights-cleared, original or user-selected media for the store build.
