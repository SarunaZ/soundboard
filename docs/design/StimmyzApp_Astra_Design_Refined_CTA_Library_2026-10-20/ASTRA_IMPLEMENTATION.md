# Astra implementation plan — StimmyzApp clean rebuild

**Developer:** Astra / repo coding agent. **Owner instruction:** inspect the real repository first. Existing Android framework, audio-processing implementation and persistence layout are **not verified** by this handoff.

## Stage 0 — repository audit; do not code yet

Identify: Android framework (Kotlin/Compose, WebView, React Native etc.), Gradle flavors, activity navigation, media import & trimming, `yt-dlp` dependency graph, stored clip schema, existing soundboard layouts, play latency, Android versions supported, background recording behavior, app permissions, how UI state survives rotation/process death, and whether audio remains available offline. Produce a **file-by-file change plan** and check it with the owner.

Preserve any already-working native player, audio encoding, local storage, layouts and trim logic. Rebuild the UI components; **don't clone the application or discard stable features**.

## Stage 1 — design tokens and shared shell

Implement `design/tokens.json` natively: six palettes and typography, common rounded surfaces, gradient CTAs, iconography and spacing. Preserve the logo gradient. Construct a shared app shell with three tabs **Board / Editor / Library** and **large (28–30dp) visible icons**, ~12sp labels and ~4dp selected underline. Handle display cutouts/system bar insets (old screenshots overlap the Android status bar). Themes must apply to all screens, dialogs, menus, waveform controls and system navigation bar. Persist theme selection and optionally match system dark preferences.

**Done when:** Board, Editor, Library and creation route screenshots visually align with the updated handoff previews, with all six palettes available.

## Stage 2 — board with fixed Quick Add and contextual menus

Model Quick Add as the first rendered action tile, not a regular `sound` entity. Render it before ordinary pads independent of the sound list. Do not re-order it on search (decide whether to show Quick Add during searching; prototype keeps it visible). Do not animate it away when sounds are appended.

- Normal: plus, “Quick add”, preferred action caption; **NO dropdown arrow**.
- Edit Board: small arrow appears on Quick Add to choose Record device audio / Record microphone / Import file / Library. Persist choice per user (or per board if requested). The tile's main tap may open configuration when Edit mode is active; tapping it when not editing performs the saved action.
- Ordinary pads: ⋮ overflow remains visible and opens **Replace / Rename / Move to board / Clear pad**. Avoid triggering playback through the overflow tap.
- Board selector: actual dropdown (Main board, Work, Memes, Office, New board). Search input is not duplicated with a separate header magnifier.
- Pad main tap: immediate offline playback. Overflow is the only edit affordance outside full board edit.

**Done when:** at least 15 pads + Quick Add fit as a 4-column grid on a typical phone and after inserting a sound the first tile remains Quick Add. Arrow absent in normal mode, present in edit mode; menu actions behave correctly.

## Stage 3 — globally accessible, full-screen creation flow

Single reusable route launched from Editor, Quick Add, Library and (where supported) Android `ACTION_SEND` share sheet. Capture optional `targetBoardId` and `targetPadId`. Maintain a draft as user navigates/backtracks.

1. **Source (device first):** **Record device audio** is the featured, primary method; microphone recording and import are clearly secondary. Connect to the already developed optional Android playback-capture POC **only after inspecting its existing branch/native module**. Preserve existing recording service / MediaProjection consent, notification Stop, capture policy enforcement, no-usable-audio message, 120-second bound and clip handoff. Do **not** rewrite a working native capture implementation to match the HTML simulator. On API <29, the device capture entry should communicate unavailability and offer mic/import. Personal/dev YouTube ingestion, if retained, remains in a separately built variant, never in Play APK/AAB.
2. **Trim:** preserve existing audio waveform behavior, two draggable selection handles, real preview playback; optional +/-100ms and +/-1s controls under collapsed Fine tune. Limit selection to 60s; validate start < end, accurate seek/timestamps and varied audio formats. **NEW:** implement player-synchronized waveform playback progress (moving playhead + played tint), Play/Pause, clip-relative elapsed/total label and thin progress bar. Pause/resume, selection edits and completion must behave exactly as specified in `TRIM_PLAYBACK_PROGRESS_REQUIREMENTS.md`; browser simulation is not native audio logic.
3. **Details:** name, optional user artwork (gallery picker, crop, compression) or default tile, save to app-private storage. Online search deferred until a provider's terms and rights are verified. Save without artwork must work.

**Done when:** **Device capture → Stop → Trim → Customize → Save → Play** is functional for compatible audio on real Android hardware, and **Mic → Trim → Save → Play** and **Local Import → Trim → Save → Play** remain available. No audio processing is simulated in the native implementation. Cancelling is safe and doesn't leak files.

## Stage 4 — Library parity and storage correctness

Render the same Library as the revised prototype: stacked-cards-with-play collection icon and subtitle, **text-only, geometrically centered Record device audio** CTA, search + A–Z sort, thumbnail rows, play and ⋮ dropdown (Play/Rename/Change artwork/Add to board/Delete), More ways to add a sound CTA. Clarify between **bundled demo board pads**, **downloaded or device-local clips**, and **library-owned clips** in real data rather than conflating them.

Prefer deduplicated library audio referenced from multiple boards. Renames/artwork changes update references safely. Deletion should confirm scope (remove from a board vs delete underlying audio everywhere). Document/implement export and import/backups before users accumulate large collections—app-private files typically go away on uninstall.

## Stage 5 — theme fidelity, accessibility and performance

Compare editor screenshot `previews/editor-*.png` for **Peach/Mint/Snow/Ice/Vanilla/Coffee**, and `previews/board-*.png` for the Board; then compare Trim, Customize and Library. Keep vivid pad colors across themes while recoloring chrome/surfaces. Verify text contrast, image overlaid labels, scalable fonts and minimum 48dp hit areas. Ensure quick playback latency remains short even on cold start and slower devices.

## Stage 6 — release/rights/QA review (do not skip)

- Device audio capture through official Android APIs is not a universal copyright clearance, and should not be advertised as bypassing app restrictions. The Google Play build must **exclude unauthorized YouTube media extraction** and all runtime code/dependencies for it, not merely hide the UI. Dev/personal build authorization remains a separate concern; its name doesn't grant a legal exception.
- Do not bundle copyrighted cartoon/music/movie quotes or character artwork merely because the user can create their own. Get licenses or use original/rights-cleared content. **The demo thumbnail crops in this ZIP must not be shipped.**
- Mic recording and local-file import are general-purpose features with legitimate uses; they do not immunize content sharing or supplied samples from copyright claims.
- If cloud sharing/public user-generated content is ever added, implement copyright reporting, takedowns and moderation as required.
- Verify app Privacy Policy/Data Safety details against actual permissions, third-party dependencies, device recording behavior, analytics and network requests. Seek qualified legal review for uncertain rights/policy questions.
- Test on current Android versions, Android 13+ media permissions, scoped-storage pickers, notifications where applicable, device rotation, Bluetooth/audio focus, interruption, low storage, stale URI permissions, accessibility and safe-area handling.
- Google Play account verification/testing requirements vary by developer account; check the account's current console requirements before publishing.

## Acceptance checklist — screenshot and interaction gates

- [ ] Board geometry agrees with approved mockup: wordmark, title, selector, Edit Board, one search input, vivid image pads, 4-column grid.
- [ ] Bottom Board/Editor/Library icons are ~28–30dp **not miniature or dots**; active underline is prominent.
- [ ] Quick Add is always index zero; first grid tile after adding 1, 5 and 20 new clips.
- [ ] Quick Add normal mode has **zero visible chevron/dropdown arrows**; in Edit Board mode the control appears.
- [ ] Quick Add preferred action can be changed using the edit-only dropdown among device capture / mic / import / Library, and behaves accordingly outside Edit. Default for new users = device capture on supported Android versions. Existing persisted action must not be reset.
- [ ] Every normal pad offers a working ⋮ menu and pressing it never plays the sound.
- [ ] Board selector opens a board list and can switch layouts.
- [ ] Library clip ⋮ menu matches prototype, and Library has no redundant header search icon.
- [ ] Editor Source prominently shows **Record device audio**, with microphone and file import as smaller secondary actions and **no duplicate pills**; Play build does not expose dev YouTube links.
- [ ] Source → Trim → Details route can be launched from Board, Editor and Library.
- [ ] Waveform handles drag, playback uses actual selected bounds; Fine tune can collapse/expand.
- [ ] **TP-01–TP-09:** selected-only preview, real player-synchronized progress and time, pause/resume, end/replay, trim edits, lifecycle cleanup, all-theme accessibility, no regressions. See `TRIM_PLAYBACK_PROGRESS_REQUIREMENTS.md`.
- [ ] **TP-10 (optional):** loop preview, synchronized to native player repeat; TP-11 seeking/scrubbing deferred.
- [ ] Save name, optional artwork/default icon and newly created pads display consistently; clip remains offline.
- [ ] Theme selection survives restart; all six palettes apply across all screens and menus.
- [ ] Compare reference/previews after each stage rather than approximate styling late.
- [ ] Demo concept art is replaced with rights-cleared art for any public release.

## Suggested prompt for Astra

> Update the existing StimmyzApp UI **to match `prototype/standalone.html` and the captured `previews/` screenshots**. They were rebuilt specifically from the approved mockups; previous handoff code must not be used. Read `DESIGN_SOURCE_OF_TRUTH.md` first. Run the standalone HTML and compare Board/Editor/Trim/Details/Library and six themes. Your first response should report the current Android architecture, identify the existing device-audio POC module/branch, and provide a file-level implementation plan; **do not start rewriting existing stable audio modules** until their contracts are understood. Implement Quick Add in fixed grid slot 0 with the small dropdown visible ONLY in Edit Board mode; preserve pad/library ⋮ menus and nav icon size. Include a screenshot-based QA review. Ensure Play release excludes unauthorized YouTube extraction and bundles only cleared artwork/audio.

## Updated source priority: device-audio-first (2026-10-20)

The product now has physical proof-of-concept evidence: on one Galaxy S24 Ultra (Android 16), the user reported successful previews from selected clips in YouTube, Shorts, Chrome YouTube playback, TikTok, and Instagram; controlled synthetic audio was captured, trimmed, saved and replayed offline. This does **not** mean every source or device is supported. Consult `DEVICE_AUDIO_CAPTURE_RESULTS.md` (included as the owner-supplied test report) and inspect the actual repository before declaring readiness.

### Updated acceptance criteria for Astra

- [ ] **Editor:** initial viewport has one prominent **Record device audio** CTA. Record microphone and import are smaller, secondary options; no duplicate selector pills.
- [ ] **Source chooser:** device capture option is first, visibly featured; mic second, file third; development URL option only in personal build.
- [ ] **Quick Add:** grid slot #1, preferred action defaults to device capture for **new eligible users**; existing user preference is preserved across upgrades. Edit-only arrow opens all 4 choices.
- [ ] **Library:** main CTA = **Record device audio**; “More ways to add a sound” opens Source. Existing clip menus, playback and search remain intact.
- [ ] **Device capture:** fresh user-initiated Android consent per session; no microphone mixing; obvious recording indicator + Stop notification; Stop returns to Trim with selectable waveform.
- [ ] **Restricted/quiet/cancelled:** no bogus files, no stuck foreground service; explanation is useful without claiming that a particular app blocked capture when cause is unknown.
- [ ] **OS fallback:** below Android API 29, explain feature unavailability and maintain microphone/import routes; never crash or start an unsupported projection.
- [ ] **Regression:** trim drag handles, Fine tune, Customize artwork, Board/Library menus, all six themes, navigation 29dp icons, Edit Board, and saved local clips are unaffected.
- [ ] **Rights:** store marketing describes compatible-app audio capture as a general tool, not automatic permission to copy protected media or guaranteed support for YouTube/TikTok.
- [ ] **QA evidence:** screenshots of Editor, Source, active recording, Trim, Library, and Quick Add Edit menu in Vanilla and Coffee, plus one small-screen layout and a tested Android end-to-end path.


## Editor microcopy adjustment — 2026-10-20

Remove the redundant two-sentence explanation between the **Record device audio** heading and the short Start → Play moment → Stop & trim sequence in the main Editor hero. Preserve the CTA and the compatibility/permission hint. Do not replace it with another explanatory paragraph. Update any UI/snapshot tests accordingly.

## Small design refinement — CTA alignment and collection icon (2026-10-20)

Only adjust the current UI design, not native recording internals:

1. Remove the leading device-audio icon from the **Record device audio** primary button on both Editor and Library screens.
2. Center text using a layout that accounts for the full button width—not an icon-plus-label row or an empty icon spacer. Align vertically and horizontally at 360px width and larger font scales.
3. Replace the cylindrical `database` Library icon in BOTH bottom navigation and Library header with a consistent **stacked-cards collection icon with small play mark**. Keep bottom nav icon size **29dp**, Library heading icon about **39dp**, with original alignment and active-state tint.
4. Keep the large device-capture pictogram on the Editor source card; remove only primary-button icons. Keep secondary source icons, pad menu, Library overflow menu, and edit-only Quick Add arrow.
5. Verify screenshots in Vanilla and Coffee, and smoke-test all six themes.

**Acceptance criteria:** two primary Record device audio CTAs have no embedded SVG/image; text centered by element geometry; no database glyph used anywhere for Library; navigation icon remains 29dp; Library title icon remains 39dp; Record button launches device capture simulation (and native implementation in Android), pad and library menus and edit-only Quick Add unchanged.
