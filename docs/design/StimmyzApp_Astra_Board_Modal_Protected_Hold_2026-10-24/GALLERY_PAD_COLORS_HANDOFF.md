# Gallery-only artwork and per-sound color assignment

## User flow

`Record / import → Trim → Customize → Optional artwork: [Default] [Open gallery] → Save`. Artwork is optional. Select **Open gallery** and launch Android's system Photo Picker; the user may have downloaded an image through their browser and can select it here. Display a preview and allow switching back to Default before save. Picking an image must not leave unfinished clips unsaved; cancel must preserve the prior selection. Change artwork from a saved sound's Library ⋮ menu follows the same UI.

## Android architecture

- No remote image API, third-party gallery index, app-controlled Google Images search, web scraping or embedded search UI.
- `PickVisualMedia(ImageOnly)` or platform-appropriate document picker fallback. Work with the returned content URI via `ContentResolver`, **copy and normalize** to app-owned storage; no assumption that URI remains accessible forever.
- Decode sampled bitmap, honor EXIF, enforce reasonable size and memory ceilings, downscale/crop for square art, store original attribution only if needed (not personal photo paths), produce thumbnail for grid and list, and handle failed/canceled selection without deleting the old art.
- Preview shows optional gallery image. Persist an app-local URI/path reference, not raw OS path or external web URL. Keep artwork in backup/restore and remove orphaned files. Explain that users should use images they have rights to distribute if they share the board.

## Background colors — contract, not decoration

- Pad color comes from the **sound metadata**, never the board, index within currently rendered page, theme, or random color on render.
- Keep current 15 varied *vivid* RGB gradients for existing sample sounds. Use an extended palette with 16 distinct pastel pairs for the next clips; an unbounded deterministic hue sequence (golden angle ≈137.508°) works when curated colors are exhausted.
- In the demo, `state.nextColorIndex=15` is monotonic and `nextPadColor()` increments it only when a **new** clip is saved. Persist `nextPadColorIndex` or derive a collision-resistant stable key on Android. A replacement or name/artwork edit keeps the same color. Every sound must visibly differ from adjacent newly created sounds. The color may recur only after reasonable palette exhaustion and should not be visually identical to a direct neighbor.
- Store a stable color key or primary/secondary ARGB gradient stops in the sound entity and include it in export/import backups. Keep existing assignments during migrations; don't reassign because new palettes were introduced.
- Readability: choose label foreground from luminance, add subtle text shadow/scrim over arbitrary user images, keep sufficient contrast on pastel pink/lilac/mint/yellow, and avoid changing pad backgrounds between light/dark themes.
- Quick Add is always a **neutral dashed** empty tile, independent of the automatic sound palette.

## UI prototype constraints

The attached HTML uses local mock data and browser `FileReader` for demo; it does not implement native Android file import. Verify the Android Photo Picker, storage, size handling and color persistence separately.
