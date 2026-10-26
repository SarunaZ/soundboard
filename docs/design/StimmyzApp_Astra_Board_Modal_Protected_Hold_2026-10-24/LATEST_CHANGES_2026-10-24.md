# Latest UI decisions — 2026-10-24

Use these rules ahead of screenshots, older handoffs, or historical references.

## 1. Minimal Editor and Library

**Editor:** shared transparent logo header then the existing **Record device audio** hero (kicker, device icon, steps, one text-only primary CTA, compatibility note). Then Record your voice and Import audio or video. Remove top-level `Make a sound ✦` and `Capture the moment. Turn it into a button.`. Keep the internal full-screen creation-flow headings (`Create a sound`, `Make it yours`) because those are contextual steps, not redundant page introductions.

**Library:** shared logo header, then search and sort, count, and sound rows. Remove the Library icon + `Your library ✦` header + two-line description, the big `Record device audio` CTA, and the bottom `More ways to add a sound` CTA. Users create via **Editor** or **Board Quick Add**. Library clip ⋮ menus remain visible. The Library tab icon remains a collection/cards symbol, not a database cylinder.

## 2. Different colorful pads

The rainbow visual identity comes from individual pads, **not a global rainbow gradient applied to all pads**. The current first 15 sample pad gradients are approved and should remain vivid. Each newly saved clip gets a new independent and persisted gradient; added pastels are peach, lavender, aqua, citrus, rose, pistachio, periwinkle and others. Never derive color from on-screen position or theme; no random recoloring while scrolling, reordering, reopening, or switching boards. Quick Add uses its neutral dashed style.

## 3. Artwork only from the user's device

The optional artwork picker offers `Default` and `Open gallery`; use Android Photo Picker / ACTION_OPEN_DOCUMENT fallback rather than remote image search or provider APIs. The user can save images through their own browser or gallery, then pick them in Stimmyz. Images are copied safely to app storage so pad artwork works offline. No image search box, content-provider API keys, external SDK, or web results in the app. Cancel picker without changing saved artwork.

## 4. Themes and menu scope

Global overflow menu must NOT contain `Choose theme` or `Appearance`. Only **Settings → Appearance** exposes theme selection. Nine themes: five light (Vanilla, Peach, Mint, Snow, Ice) and four dark (Chocolate, Grape, Nut, Blackberry). Chocolate carries forward Coffee color choices; map persisted Coffee selections to Chocolate. Grid size and Pages/Scroll are always board-local in Edit Board.

## 5. Guardrails

Keep native functionality, including device-first capture, trim/progress, per-clip boost and limiter, pad edit-only menus, Quick Add placement, offline clip saving, and one-stop Stop all. Do not add new Editor speed/favorites/categories based on the marketing concept image.


## NEWEST UPDATE — 2026-10-24: Board modal and protected 2-second hold

**Read `BOARD_MODAL_AND_PROTECTED_PLAYBACK_HANDOFF.md` first.** `Edit board` now enters edit mode and opens its settings in a dialog rather than expanding an inline panel; the existing controls and their persistence remain. Pads have quick press/rebound feedback and a 2-second charging perimeter on hold. A completed hold starts a protected playback session that cannot be interrupted by other pad taps, regardless of the board-wide overlap toggle. Clip-specific repeat (once/three/loop), stop controls, per-clip gain, accessibility alternatives, and native audio resource limits are mandatory. The browser prototype simulates audio and must not be presented as a production audio engine.
