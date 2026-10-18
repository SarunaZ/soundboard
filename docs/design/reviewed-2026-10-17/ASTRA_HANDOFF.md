# StimmyzApp — Astra implementation + UI/UX handoff

**Version:** 2026-10-17, revised after legal/market research  |  **Audience:** Astra coding agent / engineering team  |  **Deliverable:** design specification and staged implementation plan, not a patch to the app.


> **IMPORTANT RESEARCH UPDATE:** First read `RESEARCH_AUDIT_2026-10-17.md`, which supersedes conflicting assumptions in this handoff. In particular: multiple boards and clip trimming are **not unique** in this market; ensure rights to every bundled sample sound/image (including preloaded remote clips), don't assume personal `yt-dlp` use is authorized, and do not implement GIPHY offline artwork caching without explicit provider permission. YouTube's official embedded player does support start/end timestamps but isn't an offline soundboard replacement.

> **First action for Astra:** inspect the actual repository, identify the Android framework, media pipeline and persistence schema, then present a **file-by-file implementation plan**. Do not assume the UI prototype is production code or change code until the architecture is understood.

## 0. Bundle navigation

- `RESEARCH_AUDIT_2026-10-17.md` — **updated copyright, store policy, API and market corrections**; read first.
- `design/prototype.html` — self-contained, offline, interactive UI reference: Board, Source → Trim → Customize, Library, menus, themes and optional art picker.
- `design/tokens.json` — initial semantic theme tokens and sizing. Adapt to framework, test contrast.
- `references/current/` — screenshots of the **current implementation** supplied by the owner. This is the ground truth for existing visual design.
- `references/concepts/` — visual inspiration only. AI-produced images may contain illustrative characters or artwork; **do not ship those as assets** or interpret them as already-implemented features.
- `README.md` — getting started.

The HTML is a **behavioral design prototype**, not the Android application. It does not record, trim, download, upload or save actual media. Its fake source entries and image results are placeholders.

## 1. Product principles and objectives

StimmyzApp is a **fast, personal, offline-capable meme/vocal-soundbite soundboard** with occasion-specific layouts. The primary value is immediate playback: open the app → play an assigned sound with one tap. Users can create bite-sized clips from authorized sources, customize each pad visually and reuse the same clip across layouts.

Objectives for this iteration:

1. Make an attractive cohesive design (neon violet/cyan/pink dark mode + calm accessible light mode + system theme).
2. Make creation reachable from anywhere via one globally managed full-screen creation route.
3. Keep the familiar **Board / Editor / Library** bottom navigation in the main app; hide that navigation while a creation sheet/full-screen route is active.
4. Keep *handle-drag trimming* primary; put ±100 ms and ±1 s precision adjustments in optional **Fine tune** disclosure.
5. Add a skippable **Customize** step for clip name and optional thumbnail image. Gallery, default artwork first; online search later with provider/API rights review.
6. Add microphone recording, local video import and Android file share support for the Google Play product.
7. Maintain one source tree with **Play Store** and **personal/development** distributions. YouTube extraction must not be present in the Play Store artifact.
8. Preserve existing clips, IDs, soundboard assignments, layout selection, playback latency and storage. Avoid unnecessary rewrites.

**Explicit non-goals:** rebuild the playback engine; social network; public copyrighted meme library; downloading from social-media platforms in Play Store builds; server-side audio conversion; representing recording/search/publishing compliance as guaranteed.

## 2. Current implementation: what is and is not known

### Observed in supplied screenshots

- Board has a 4-column × 4-row pad grid, search, navigation, and an **Edit board** action; colorized pads with named clips and empty slots.
- Editor currently supports local audio choosing and YouTube-link loading, plus a waveform trim interface with drag handles, Start/End ±1 s / ±100 ms, soundbite name and render action.
- Library lists offline local clips with preview, add to board, rename and delete actions.
- Current editor overflows vertically; system status bar overlaps a heading on at least one screenshot. Fix system window insets and scroll behavior.
- The existing trim selection allows up to **60 seconds**; the current UI shows 5 minutes and 32 MB limits for imports. Audit the true limits before changing them.

### Reported in conversation but not verified in repository

- Multiple soundboard layouts exist and can be selected according to occasion.
- The device-local YouTube extraction uses `yt-dlp`; the whole source may be acquired temporarily and only a trimmed portion retained.
- Local audio import and offline clip storage work.

### Not yet verified as implemented

- Microphone recording, local video extraction, share-intent ingestion, configurable Quick add, artwork, online image search, theme choice, and store build flavors. Treat all as work items until repo confirms otherwise.
- The screenshots mention preloaded remote sounds and cloud identifiers. **Audit these paths and preserve their behavior**; do not assume every existing sound is purely local.

## 3. UX information architecture

### 3.1 Main app screens

**Board (default landing):** compact Stimmyz brand; clear **active board** selector; distinct **Edit board** button; search within current board/library as existing behavior dictates; large 4-column playable pads (responsive to small screens); a configurable **Quick add** tile in an empty slot. Remove technical diagnostics from prominent header, moving them to diagnostics/settings as appropriate.

- Tapping assigned pad immediately plays that sound. Do not route through intermediate menus.
- Assigned pad overflow menu example: **Replace sound**, **Rename pad label**, **Move to board** (submenu/list), **Clear pad** (confirmation). This menu is for board assignment, not permanent library deletion.
- Layout selector example: Main Board, Work, Memes, Office, Create new board. Active layout shows check mark. Selection persists; avoid duplicating media files for different boards.
- Empty pad: add sound, preferably start target-aware create/assignment flow.
- Quick add: tap invokes selected default (`record`, `pick_file`, `library`); accessible menu or long-press lets user change default. **Do not rely on long press as the only way to configure it.** The design prototype uses click + small visible chevron for configuration.
- Pad imagery is optional: fallback to colored tile + simple icon/label. Name readable in 2 lines at larger accessibility font scales where possible.

**Editor tab:** a launch surface for **Create a sound** with two primary actions: Import audio/video and Record. YouTube link input may be shown **only in personal builds**, visually separate. Avoid duplicating a row of tabs such as Import/Record/Link above identical controls.

**Library:** search clips; optionally sort (explicit A–Z / Newest / Duration); preview action; per-row overflow menu with **Play**, **Rename**, **Change artwork**, **Add to board**, **Delete** (confirm; tell user if used by pads); skippable Add/Create entry point. Eliminate redundant top-right search icon because there is already a text input. A single sort control next to the search field is sufficient.

**Appearance:** Dark / Light / Use system; optional accent selection. Avoid cluttering the Board header with an extra gear next to Edit. Discoverable path through an unobtrusive Preferences entry in main navigation/board selector or a settings screen consistent with actual app architecture.

### 3.2 Global sound creation

Use a single destination/route (Android native full-screen dialog/sheet or a dedicated full-screen screen presented as a modal). Prefer a **full-screen experience** rather than a narrow alert dialog, because trim gestures need ample touch space.

Entry points:

| Trigger | Open state | Context |
| --- | --- | --- |
| Board Quick add | Source step (or preferred source directly) | `targetBoardId`, optional `targetPadId` |
| Empty pad | Source step | `targetBoardId`, `targetPadId` |
| Board pad `Replace sound` | Source or Library selector | Existing `targetPadId` |
| Editor | Source step | No target; after saving, stay in Library or prompt to assign |
| Library `Make another sound` | Source step | No target |
| Android `ACTION_SEND` of local media | Trim after import/preparation | Granted media `Uri`, MIME type |
| Opening an existing library clip for re-edit | Trim (copy-on-save unless confirmed) | Existing clip ID |

Manage this as a **state machine**, not individual page-local states:

`source_choice → preparing → trimming → customizing → saving → success`

Also handle `recording`, `permission_denied`, `invalid_media`, `unsupported_codec`, `offline_online_search`, `save_error`, `cancel_requested`, `discard_confirmation`. Preserve a draft across rotation/config changes and interruption where feasible; cleanup temporary media on final discard and after save.

#### Source

- Two large choices: **Choose file** (audio or locally stored video) and **Record sound** (microphone).
- Only personal build: YouTube link extraction. Mark as developer/personal-specific; no extraction-related code, binaries or UI in Play Store build.
- Respect `content://` URI access: no assumptions about regular filesystem paths.
- Do not show unneeded navigation shortcuts or duplicate source buttons.

#### Trim

- Show file/recording name, source duration, single large waveform and selected interval.
- **Drag left/right handles** to set the start/end. Entire selected window can optionally be dragged to move it. Playback cursor remains separately identifiable.
- On-screen preview/stop control and selected length.
- The **Fine tune** disclosure is collapsed by default. Expanded rows for Start and End: `−1 s`, `−100 ms`, `+100 ms`, `+1 s`. Text labels must never awkwardly wrap vertically.
- Clamp to valid `[0, duration]`; require `end > start`; respect maximum 60 seconds (unless real implementation differs and owner confirms). Use precision arithmetic in milliseconds or sample indices, not floating-point `seconds` strings.
- All controls must be keyboard/accessibility operable, not gesture-only. Sliders/handles get accessible labels for start/end and a non-drag adjustment pathway.
- CTA **Continue** goes to Customize, not immediate irreversible render. Leave a Back button preserving selected range.

#### Customize (NEW)

- User edits **Soundbite name** (required, sensible character limit) and picks **optional artwork**. Can skip artwork.
- Options: **Gallery** via Android Photo Picker; **Default icon/color**; **Search online** if connected and provider available (later phase).
- Show live cropped-square preview of the pad with label. Support crop/reposition and confirm. Persist an appropriately sized thumbnail locally for offline board rendering, with external API licensing and attribution preserved as necessary.
- Choose **Save** and assign to target pad/board when launch context supplies one; otherwise save to Library with an explicit optional Add to board action.
- No audio re-extraction simply because artwork changes later.

### 3.3 Online artwork search strategy

**Phase 1:** gallery/photo picker, local image import, and supplied licensed/built-in artwork. Zero network required. No special broad photo-storage permission for the system picker. Default art fallback always available.

**Phase 2:** image-search provider integration, implemented via replaceable `ArtworkSearchProvider` abstraction:

```ts
interface ArtworkSearchProvider {
  search(query: string, page?: number): Promise<Array<{
    id: string;
    previewUrl: string;
    attribution?: string;
    authorName?: string;
    licenseUrl?: string;
    sourceUrl?: string;
    mayStoreLocally: boolean;
  }>>;
}
```

The interface is illustrative TypeScript, not a declaration of current stack. Review provider agreement before selecting/caching media. GIF/sticker providers (e.g., GIPHY) have usage/attribution and caching restrictions: **do not assume their search API permits permanent offline extraction**. Stock photo providers (e.g., Pexels) offer different licenses but are less meme-native. Avoid exposing secret API keys directly in APKs. Consider a constrained proxy if necessary, with rate limits and privacy disclosure. Handle `no_results`, `offline`, `rate_limited`, `permission_denied`, `image_removed`, and attribution.

**Important:** online search results are not automatically rights-cleared for arbitrary sharing. In user-facing MVP, do not prebundle third-party copyrighted meme or cartoon images. Sample images in AI mockups are **not distributable assets**.

## 4. Design system

See `design/tokens.json` for initial values. Visual references are an **inspiration**, not a pixel-perfect requirement. Source of truth for behavior is this document and `design/prototype.html`.

### Color and shape

- Dark: nearly navy black canvas (`#090f22`), raised cards (`#121c34`, `#1b2744`), lilac primary, pink highlights and cyan/mint focus/selection accents.
- Light: near-white lavender canvas (`#faf9ff`), white cards, dark-plum text, violet primary. Light and dark both require tested contrast and usable disabled states.
- Sound pads: playful saturated hues, but respect user choice and accessible name contrast; allow calm palette later.
- Spacing 4/8/12/16/20/24/32 dp. Most interactive targets **≥48 × 48 dp**. Pads 12–18 dp corner radius. Larger modals/sheets ~26 dp corners.
- Typography: strong brand ~30 sp, page headline ~24 sp, body 14–16 sp; use the platform's text scaling. Avoid all-caps for long utility text.
- Navigation: top safe-area/status-bar insets and bottom gesture navigation must **never overlap** app content. Creation full-screen route should have internal scroll; fixed CTA above system bars where appropriate.
- Motion: subtle button press feedback; honor reduced-motion accessibility. No mandatory flashing or autoplay; audience may include sensory-sensitive people.

### Example visual states to implement

- Board selector **open** with named layouts and create-new action.
- Assigned pad overflow **open** showing replace/rename/move/clear.
- Library item overflow **open** showing play/rename/change art/add/delete.
- Source → Trim → Customize step indicator and back handling.
- Artwork chooser with gallery, search, default, optional crop and empty/offline states.
- Dark/light theme preview; no mandatory image.

## 5. Technical architecture guidance (framework unknown)

### Source-independent ingestion

```text
Input Adapter (file / microphone / share / personal YouTube)
    -> URI permission + validation
    -> app-scoped temporary working media
    -> decoder / waveform preparation
    -> trim selection (stable ms offsets)
    -> clip encode/render
    -> optional artwork import and crop
    -> atomic persistence of clip + metadata
    -> optional assignment to target board/pad
    -> temp cleanup
```

Do not duplicate media for shared pad references. Extend existing persistence with optional thumbnail metadata using a tested migration that retains original records. Example **conceptual** entities:

```ts
type Artwork = {
  localPath: string;
  kind: 'gallery' | 'online' | 'builtin';
  attribution?: string;
  sourceUrl?: string;
};

type Soundbite = {
  id: string;
  name: string;
  audioLocalPath: string;
  durationMs: number;
  artwork?: Artwork;
};

type PadAssignment = {
  boardId: string;
  padId: string;
  clipId: string | null;
  labelOverride?: string;
  colorOverride?: string;
};
```

Store paths and IDs in the format that the current application already uses; above is illustrative. Full offline local availability is expected for new saved clips. Use transactions where possible; rollback artwork or audio writes on failure; delete orphan files, but never delete shared audio merely because a pad assignment is cleared.

### Build variants

- Android-native: Gradle flavors/source sets; cross-platform: actual framework's equivalent.
- `playStore`: **no** `yt-dlp`, extraction executable, download route or strings/resources, including transitive dependencies or native libs. This is a packaging property, not just a feature flag.
- `personal`: preserve link extraction implementation for personal testing; do not assume this grants a rights exemption.
- Compile and inspect each APK/AAB, dependencies, manifest merged output and dynamic assets. Review store listing and default shipped content for rights compliance.

### Mic, imports, share

- Request `RECORD_AUDIO` contextually and use foreground UI; clear recording indicator, stop/cancel, interruption behavior, denied permission and no unexpected background capture.
- Use Android Photo Picker or Storage Access Framework for audio/video as compatible with min SDK and framework; `ACTION_OPEN_DOCUMENT` when lasting permission is needed. Never assume external file `Uri` is a path.
- Accept `audio/*` and supported `video/*`, with audio extraction via platform/media library chosen after audit. Validate codec, duration, size, storage and exceptions.
- `ACTION_SEND` for actual media `content://` URIs and granted read permissions; web links are not equivalent to a licensed downloaded file.
- Preserve existing media constraints unless tests require changes and owner approves.

## 6. Suggested implementation increments + definitions of done

### Phase A — Audit, safety rails and split distributions

- Identify runtime/framework, repo topology, UI toolkit, `yt-dlp` packaging, storage and playback engine, thumbnail support (if any), existing test runner.
- Capture navigation and DB/schema migration tests before altering behavior.
- Implement **two build variants** sharing the core; confirm Play Store artifact contains no YouTube extraction functionality.

**Done:** Build validation for both variants; current audio import/trim/save and board playback still work.

### Phase B — Reusable global creation route

- Introduce route coordinator/state machine with source, trim, customize and save steps.
- Launch with context from Board/Editor/Library/empty pad/Quick add.
- Fix status-bar overlap, back behavior, modal dismissal confirmation and app rotation handling.

**Done:** Can launch the same flow from all entry points; unsaved state not silently lost.

### Phase C — Trim redesign

- Keep existing waveform/render engine; change presentation only.
- Enable/retain direct drag handles and preview; put precision controls in expandable Fine tune. Correct selection-length math and clamping.

**Done:** Dragging and precision controls yield the same persisted start/end; keyboard/accessibility alternatives exist, 60-second limit respected.

### Phase D — Audio ingestion enhancements

- Mic recording → existing trim pipeline.
- Local video audio extraction → existing pipeline.
- Android Share media URI → launch trim.
- Temp cleanup and error handling for interruption/storage/missing codec.

**Done:** All three routes produce offline playable clips without regressions.

### Phase E — Artwork + light/dark

- Optional image field and migration; gallery picker, crop, compress, save, render on Board and Library, fallback for no art.
- Theming via semantic tokens and persisted system/light/dark preference; test color contrast, text scaling and hardware back gesture.
- Add configurable Quick add action, board/pad/library overflow behaviors, Library sort.

**Done:** Artwork and clip metadata survive restart; no artwork mandatory; clear-pad does not delete library clip; theme persists.

### Phase F — Online artwork search (deferred until provider approved)

- Select appropriate provider and get licensing/API approval; secure credentials; network/offline behavior.
- Search, preview, attribution, selection/crop, caching only when permitted.

**Done:** Usage conforms to selected provider terms; searches fail gracefully and core app remains offline-capable.

### Phase G — QA, rollout and privacy/legal review

- Test on compact and large phones, high text scaling, light/dark modes, reduced motion, navigation-bar and status-bar modes.
- Regression-test board layout switching, large libraries, local and remote existing sounds, rename, delete and playback latency.
- Use only original/licensed clips and artwork in **bundled pads, remote feeds, screenshots, and store listing**. Verify microphone/privacy disclosures, public privacy policy, Data Safety form and copyright policy; seek advice before commercial release. If the developer account is a new personal account, check the 12-tester/14-day closed-test requirement.
- Closed test ~15–20 users, focus on how fast someone can create three clips and immediately play from their board.

**Done:** No blocking accessibility, crashing, data-loss, packaging or licensing issues known in release candidate. Approval is not guaranteed.

## 7. Acceptance test matrix

| Scenario | Expected |
| --- | --- |
| Cold start | Last board is visible and playable immediately |
| Switch occasion board | Assigned pads update; no audio copies created |
| Board assigned pad overflow | Replace/Rename/Move/Clear, but no accidental library delete |
| Quick add with preferred Record | Launches recording, then trim/create; preference persists |
| Quick add preferred File | Invokes local chooser and targets that pad |
| Library overflow | Rename, Change artwork, Add to board, Delete with confirmation |
| Trim left/right drag | Accurate ms offsets; handles never cross; selection within 60 seconds |
| Fine tune buttons | Change start/end by 100 ms or 1 s, clamp at bounds |
| Short recording | Record/stop → trim → customize → save; playback offline |
| Local video file | Extract audio → trim → save; unsupported codecs yield actionable error |
| Shared local media | Opens creation route with source prefilled |
| No image chosen | Color/icon fallback; audio saves normally |
| Gallery image | Cropped square art saved privately; survives restart/offline |
| Online art no network | No hard failure; default/gallery still usable |
| Cancel midway | Draft preservation/discard confirmation; temporary-file cleanup |
| Play Store binary inspection | Extractor and YouTube-specific path absent from artifact |
| Existing saved clips | Work after DB migration; original layout assignments retained |
| Dark/light/system theme | Persist and render legible on small and large displays |

## 8. Prompt to give Astra

> Read `RESEARCH_AUDIT_2026-10-17.md`, `ASTRA_HANDOFF.md`, `design/tokens.json`, the standalone `design/prototype.html`, and the supplied screenshots. Audit the actual Android repository first. Produce a concise architecture diagram and a **file-level implementation plan with risks and migration strategy**; do not edit code yet. Highlight any mismatch between the prototype and current repository. Once approved, implement in phases A–G, with tests and verification at each stage. Preserve all existing clip data, offline playback and boards. For Google Play, physically exclude YouTube extraction code and related dependencies from the shipped artifact, not just the UI. Use native accessible input, reliable Android URI handling, and a full-screen creation route with draggable waveform handles, optional collapsed Fine tune, and an optional Customize/artwork step. Treat any mock images as illustrative only and do not ship them as assets.

## 9. Open decisions to ask owner only after audit

1. Actual Android stack and navigation model.
2. Whether a pad's **Rename** changes only board-specific label or shared soundbite name (recommend separate pad label vs library item name).
3. Whether multiple saved layouts share the same clips (recommended yes; must respect current schema).
4. Whether current remote sound entries still require special playback/authorization behavior.
5. Whether to implement artwork search in the first release or after gallery art validates usage (recommend later).
6. Default Quick add action and discoverability of configuration.
