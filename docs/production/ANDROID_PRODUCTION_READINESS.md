# Stimmyz Android production readiness tracker

**Analytics follow-up (30 October 2026):** private 1.0.30/code 31 testing APK
installed; bounded physical consent checks and EU-project ingestion verified.
See the [phone QA record](../play-product-analytics-phone-2026-10-28.md).
This updates the earlier source-only status; public policy, retention facts,
full traffic inspection and broader release gates remain open.

**Privacy audit update (28 October 2026):** the [dated audit](privacy-audit-2026-10-28/README.md) inspects current source, retained 1.0.29/code 30 packages and the live public policy. App/backup artifact checks and source tests pass, but policy/contact/audience, vendor facts and runtime traffic/device evidence remain release gaps. No production checkbox or release approval is closed by this audit.

**Source checklist:** copied from `C:/Users/Sarunas/Downloads/Stimmyz_Android_Production_Readiness.md` (reviewed 24 Oct 2026). Every source checklist item is retained below with an explicit status and evidence/next step. Checkboxes intentionally remain open until the stated evidence exists.

## Current release boundary

- The historical r3 APK/AAB were built with playback capture disabled. The owner-approved final scope requires device-audio capture alongside file import and microphone recording. The all-sources r4 APK/AAB are built unsigned; bounded physical capture saved an audible synthetic clip, notification Stop closed a fresh projection, no-usable-audio handling saved no silent clip, and the backup restore retry passed. QA content was removed, original data retained, and volume restored; broader policy/device evidence remains pending.
- The optional GIPHY picker was removed. Artwork uses the device gallery/local saved images. No ad, purchase, billing, login or account SDK is configured in the Play dependency manifest; their checklist sections are conditional N/A for this scope and must be reopened if scope changes.
- Owner-approved v1 scope: local multi-board playback, imported-file, foreground microphone and device-audio capture creation, trim/save to the private Library, themes, Gallery artwork, quick-add, ZIP backup/restore, per-board layout and sound controls. The r4 artifacts enable all three sources; bounded capture, notification Stop, no-usable-audio and restore evidence is recorded. Broader physical coverage and conditional policy evidence remain pending. This is not a final listing/policy approval.
- `app-play/app.json` sets minSdk 24 and compile/target API 36. Google Play's official requirement currently says new apps and updates must target API 36+ from 31 Aug 2026: [Google Play target API requirements](https://support.google.com/googleplay/android-developer/answer/11926878?hl=en) (checked 25 Oct 2026).
- The r3 APK/AAB are verified unsigned production-default artifacts; nothing has been signed, uploaded, or published. Artifact gates are not Play App Signing, device QA, policy approval, or launch sign-off.
- Owner-approved npm audits were captured before and after dependency patches on 2026-10-25. Initial reports had 31 affected-version rows / 24 distinct IDs for Play and 64 / 44 for the repository; intermediate after-patches reports had 5 / 5 each. The final isolated JS graph passed compatibility/security checks and a strict audit gate; one raw high `node-forge` advisory remains visible and is accepted only as an exact local-patch mitigation. [The dependency audit report](DEPENDENCY_AUDIT-2026-10-25.md) records scope and evidence. The FFmpeg 8.0.3 source build and x86_64 synthetic decode probe passed. The earlier stopped Android build produced no APK/AAB; its output comparisons are historical. The final r3 APK/AAB passed identity/manifest checks, 16 packaged FFmpeg hash matches, APK zipalign, and 16 KiB ELF alignment for 44 native libraries in each artifact. Its Maven graph selects Commons IO 2.22.0 and Gson 2.14.0; an OSV query covering all 160 selected coordinates returned zero affected-version results. The artifacts are unsigned; app-flow/physical-device tests, Maven/native attribution and owner/legal review remain open. npm audit does not assess native Android library CVEs. Settings contains 479 searchable notice records (801,284 bytes); 43 are metadata-only and Maven attribution remains open. The existing Dockerfile uses a mutable Node image tag and apt packages; bit-for-bit reproducibility is not yet claimed.

## Evidence index and templates

- Build, manifest and signing record: [release runbook](release-runbook.md)
- Privacy/data-flow and permission inventory: [privacy and data-flow template](privacy-data-flow.md)
- Public policy draft: [privacy policy draft](PRIVACY_POLICY_DRAFT.md)
- Listing and reviewer flow: [store listing draft](store-listing-draft.md)
- Store, support and policy submission fields: [store and support template](store-support.md)
- Branding and content provenance: [asset rights inventory](asset-rights-inventory.md)
- Offline dependency and Android SDK inventory: [package/SDK versions and local license-file evidence](dependency-sdk-inventory.md)
- Searchable Play third-party notices: `app-play/src/data/openSourceNotices.json` (metadata and attribution gaps are listed in the dependency/SDK inventory)
- Device and release regression matrix: [QA matrix](qa-matrix.md)
- Source-level checks: `scripts/build-play-android.ps1`, `scripts/verify-play-stage.mjs`, `scripts/check-elf-page-alignment.py`, `.github/workflows/play-ci.yml`

## Current product decisions and proposed budgets

- The owner-approved final v1 scope is local multi-board playback; audio-file import, foreground microphone recording, and device-audio capture; trim and save into the private Library; themes, artwork from the system Gallery, quick-add, playback controls, and user-initiated ZIP export/restore. The r4 artifact includes all three sources; bounded physical capture and restore checks and device cleanup passed. Broader device coverage remains pending. GIPHY, account/login, cloud sync, ads, billing and online sound search are out of this v1 scope.
- Proposed acceptance budgets (not measured or claimed): warm-source tap-to-audible p95 ≤ 150 ms; cold-source tap-to-audible p95 ≤ 500 ms; cold launch p90 ≤ 3 s on the agreed reference phone; import/trim UI remains responsive with no ANR for the 5-minute/32 MiB cap. Measure with physical audio output and define the exact test fixtures before treating these as gates.
- Emulator coverage includes an API 36 `sdk_gphone64_x86_64` image with 4 KiB pages. Bounded in-place upgrade, import/trim, playback, loop and lifecycle QA was also completed on a Samsung Galaxy S24 Ultra running API 36 with 4,096-byte pages; see [phone QA](PHONE_QA-2026-10-25.md). Neither environment is a 16 KiB memory-page test device or replaces remaining Samsung/Pixel/lower-end coverage.
- Snapshot recovery is fail-closed: valid committed backups or pending transactions can recover, while a doubly corrupted committed snapshot/journal preserves files and reports an error. The Settings retry/backup entry does not reset damaged metadata, and import merges against the current metadata. A documented support/export recovery route for this state remains open.

## Checklist with per-item status
# Stimmyz — Android Production Readiness Checklist

**Reviewed:** 24 October 2026  
**Status:** Working checklist; no code audit performed  
**Owner:** TBD  
**Target launch:** TBD

## Executive launch gate

**Positioning:** A local-first Android soundboard for short, user-chosen sounds (Stimmyz branding), including multiple boards; 3×4/4×4 grids; quick-add; per-pad audio, volume and optional artwork; editing and trimming. The device-audio-recording overlay and GIPHY picker are conditional on being enabled in the actual release. Previous YouTube/TikTok download/import concepts are intentionally excluded.

**Working assumptions:** No mandatory account, backend, cloud sync or payments for v1. If those exist, add a dedicated threat model for authentication, authorization, API rate limits, deletion, breach response and backend operations. This is a design-based checklist, **not** a code or permission audit.

**Priority:** P0 = release blocker **if the feature ships**; P1 = strongly recommended once P0 is stable; P2 = later/optional. Conditional sections apply only when enabled.

### Ten-item go/no-go checklist
- [ ] No known crashes, hangs, data-loss bugs or audio running after Stop
  - **Status:** OPEN — no current crash-free release evidence
  - **Evidence / next step:** Existing unit/emulator records do not replace candidate crash/ANR monitoring. Run the candidate regression matrix and review Play vitals.
- [ ] Core pad playback, import, trim, save and reopen work in signed release
  - **Status:** BLOCKED — no signed release build
  - **Evidence / next step:** Current builds are unsigned testing APK/AAB. Import/trim/emulator evidence exists in the Play implementation records; signed Play AAB flows remain unverified.
- [ ] Device capture included and fully compliant/tested
  - **Status:** OPEN — capture-enabled candidate required
  - **Evidence / next step:** The historical r3 APK/AAB have `projectionCaptureEnabled=false`; r4 sets it to true and includes the required projection/foreground-service components. Physical r4 testing confirmed consent cancellation, active capture, notification stop, and no-usable-audio handling with a synthetic fixture. Complete policy/permission review and broader device QA before release.
- [ ] Permissions and foreground-service declarations match shipped behavior
  - **Status:** R3 ARTIFACT VERIFIED — platform permission use remains documented
  - **Evidence / next step:** The merged manifest contains seven Android platform permissions, including `RECORD_AUDIO` for foreground microphone creation, plus app-owned `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`; no foreground-service or projection components/permissions are present. See the r3 permission and merged-manifest reports.
- [ ] Files, boards and data migrations survive app/process restarts
  - **Status:** PARTIAL — recovery code/tests exist; upgrade matrix open
  - **Evidence / next step:** Versioned board/catalog/preferences snapshots, journaling and backup recovery tests exist. Force-stop and prior-version upgrade coverage is still incomplete.
- [ ] Copyright-safe bundled content and accurate store marketing
  - **Status:** OPEN — rights inventory / sign-off missing
  - **Evidence / next step:** Play artwork currently consists of four local brand/icon PNGs; no audio files are under app-play/assets. Hash/provenance and marketing-rights sign-off are still required.
- [ ] GIPHY storage/attribution terms satisfied, if integrated
  - **Status:** N/A — GIPHY removed from current scope
  - **Evidence / next step:** GIPHY picker/demo were removed; local system Gallery selection is the current artwork path.
- [ ] Privacy policy, Data safety and app content declarations completed
  - **Status:** DRAFTS ADDED — public URL and Console completion pending
  - **Evidence / next step:** Production privacy and store/support drafts are in docs/production. Owner must supply support contact and publish an HTTPS policy; finalize Data safety and app-content declarations against the r3 artifacts and resolved dependency graph.
- [ ] API 36+ build; AAB/Play App Signing; 16 KB native-library check
  - **Status:** R3 ARTIFACT CHECKS PASSED — Play signing and physical 16 KiB device remain open
  - **Evidence / next step:** The unsigned r3 APK/AAB target API 36 and all 44 native libraries in each artifact pass 16 KiB ELF alignment; APK zipalign also passed. No physical 16 KiB device test or Play signing has been completed.
- [ ] Closed testing / production access, crash monitoring and staged rollout ready
  - **Status:** OPEN — Play Console testing/monitoring not configured here
  - **Evidence / next step:** No Play Console track, tester evidence, vitals dashboard or rollout sign-off is attached.

### Recommended order of work (four passes)
1. **Make the product reliable:** audio engine, import/trim, saving, boards, volume, UI states and recovery from crashes.
2. **Close security and privacy gaps:** imported files, permissions, manifest, safe recording, GIPHY licensing, dependencies and data persistence.
3. **Prepare the Play artifact:** API level, signed AAB, Play listing, privacy/data-safety declarations, test matrix and policy evidence.
4. **Run closed testing and launch carefully:** outside-user feedback, Play pre-launch report, monitoring, staged rollout and a hotfix plan.

**Minimum proof to attach to a release:** signed AAB/versionCode; manifest/permission report; Play declarations/screenshots; 3-device QA matrix; test run logs; export/migration test; security/dependency scan; closed-test feedback; and a short release decision note.

## 00 · Launch decision and scope

- [ ] **[P0] Freeze the v1 feature list.** Identify exactly which features ship: boards, quick sound import, local playback, trimming, editing, grid sizes, themes, optional pad images, and (if ready) device-audio capture.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Owner-approved three-source v1 scope and API 36/minSdk 24 are written in the tracker. Build the capture-enabled final-scope candidate, publish the policy/support destination and attach a dated device result.
- [ ] **[P0] Decide whether device-audio capture ships in v1.** If unresolved, remove it completely from release build and store listing; never ship a half-working recording/overlay flow.
  - **Status:** OPEN — launch owner input/evidence required
  - **Evidence / next step:** No public policy/support destination, Play Console submission evidence or signed release record is present in this workspace.
- [ ] **[P0] Write down the offline-first data model.** Inventory boards, pads, clips, trim boundaries, volume, artwork references, per-board layout and preferences; define where each lives.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Owner-approved three-source v1 scope and API 36/minSdk 24 are recorded here. Build the capture-enabled final-scope candidate, publish the policy/support destination and attach a dated device result.
- [ ] **[P0] Record supported Android versions and devices.** Set minSdk and targetSdk deliberately, document supported audio formats and hardware constraints; do not imply universal recording support.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Owner-approved three-source v1 scope and API 36/minSdk 24 are recorded here. Build the capture-enabled final-scope candidate, publish the policy/support destination and attach a dated device result.
- [ ] **[P0] Create a feature inventory and permission map.** For each feature, record API/SDK, OS permission, collected data, third-party provider and fallback when denied or offline.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Owner-approved three-source v1 scope and API 36/minSdk 24 are recorded here. Build the capture-enabled final-scope candidate, publish the policy/support destination and attach a dated device result.
- [ ] **[P1] Define “good enough to ship” numeric budgets.** Set measured goals for sound start latency, cold start, editor responsiveness, storage use and crash-free experience on representative devices.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Owner-approved three-source v1 scope and API 36/minSdk 24 are recorded here. Build the capture-enabled final-scope candidate, publish the policy/support destination and attach a dated device result.

## 01 · Core soundboard behavior

- [ ] **[P0] Make pad playback deterministic.** Single tap starts the correct sound promptly; repeated taps and overlapping taps have documented behavior; no phantom audio.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Board/playback changes have source tests plus the 2026-10-24/25 records in `docs/play-board-modal-protected-2026-10-24.md`, `docs/play-gesture-feedback-2026-10-24.md`, and `docs/play-amplification-2026-10-21.md`. Attach candidate regression results for this exact behavior; physical routing/audio focus remain open.
- [ ] **[P0] Handle sound completion, stop and interruption.** Audio ends cleanly; stop/replay works; no player instance leaks; leaving the screen follows defined playback behavior.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Board/playback changes have source tests plus the 2026-10-24/25 records in `docs/play-board-modal-protected-2026-10-24.md`, `docs/play-gesture-feedback-2026-10-24.md`, and `docs/play-amplification-2026-10-21.md`. Attach candidate regression results for this exact behavior; physical routing/audio focus remain open.
- [ ] **[P0] Implement audio focus properly.** Test music/audio already playing, notification/call interruptions and resume/duck behavior appropriate for short effects.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Board/playback changes have source tests plus the 2026-10-24/25 records in `docs/play-board-modal-protected-2026-10-24.md`, `docs/play-gesture-feedback-2026-10-24.md`, and `docs/play-amplification-2026-10-21.md`. Attach candidate regression results for this exact behavior; physical routing/audio focus remain open.
- [ ] **[P0] Verify output routing.** Speaker, wired headset, Bluetooth and system silent/volume modes behave predictably; no surprise maximum-volume output.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Board/playback changes have source tests plus the 2026-10-24/25 records in `docs/play-board-modal-protected-2026-10-24.md`, `docs/play-gesture-feedback-2026-10-24.md`, and `docs/play-amplification-2026-10-21.md`. Attach candidate regression results for this exact behavior; physical routing/audio focus remain open.
- [ ] **[P0] Apply per-pad volume safely.** Volume changes persist; amplification is limited; add clipping prevention/limiter or explicit gain ceiling and warning.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Board/playback changes have source tests plus the 2026-10-24/25 records in `docs/play-board-modal-protected-2026-10-24.md`, `docs/play-gesture-feedback-2026-10-24.md`, and `docs/play-amplification-2026-10-21.md`. Attach candidate regression results for this exact behavior; physical routing/audio focus remain open.
- [ ] **[P0] Implement 3×4 and 4×4 layouts.** Pad sizes and labels stay usable; layout preference persists between sessions.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Board/playback changes have source tests plus the 2026-10-24/25 records in `docs/play-board-modal-protected-2026-10-24.md`, `docs/play-gesture-feedback-2026-10-24.md`, and `docs/play-amplification-2026-10-21.md`. Attach candidate regression results for this exact behavior; physical routing/audio focus remain open.
- [ ] **[P0] Keep editing controls out of play mode.** Three-dot pad menus appear only in edit mode; taps in normal mode never accidentally move/delete pads.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Board/playback changes have source tests plus the 2026-10-24/25 records in `docs/play-board-modal-protected-2026-10-24.md`, `docs/play-gesture-feedback-2026-10-24.md`, and `docs/play-amplification-2026-10-21.md`. Attach candidate regression results for this exact behavior; physical routing/audio focus remain open.
- [ ] **[P0] Support multi-board operations.** Create, rename, switch, reorder and delete boards; deletion requires confirmation and does not affect other boards.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Board/playback changes have source tests plus the 2026-10-24/25 records in `docs/play-board-modal-protected-2026-10-24.md`, `docs/play-gesture-feedback-2026-10-24.md`, and `docs/play-amplification-2026-10-21.md`. Attach candidate regression results for this exact behavior; physical routing/audio focus remain open.
- [ ] **[P0] Validate empty, full and large boards.** No broken layouts for zero pads, full 4×4 boards, long titles, many boards or missing artwork.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Board/playback changes have source tests plus the 2026-10-24/25 records in `docs/play-board-modal-protected-2026-10-24.md`, `docs/play-gesture-feedback-2026-10-24.md`, and `docs/play-amplification-2026-10-21.md`. Attach candidate regression results for this exact behavior; physical routing/audio focus remain open.
- [ ] **[P0] Make quick-add discoverable.** Plus/add entry point works on first screen; clear import/record choices and helpful empty state.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Board/playback changes have source tests plus the 2026-10-24/25 records in `docs/play-board-modal-protected-2026-10-24.md`, `docs/play-gesture-feedback-2026-10-24.md`, and `docs/play-amplification-2026-10-21.md`. Attach candidate regression results for this exact behavior; physical routing/audio focus remain open.
- [ ] **[P1] Paginate or virtualize long board lists.** Avoid eager loading all artwork/waveforms/players; scrolling remains smooth with large local libraries.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Board/playback changes have source tests plus the 2026-10-24/25 records in `docs/play-board-modal-protected-2026-10-24.md`, `docs/play-gesture-feedback-2026-10-24.md`, and `docs/play-amplification-2026-10-21.md`. Attach candidate regression results for this exact behavior; physical routing/audio focus remain open.
- [ ] **[P1] Preserve user state across lifecycle changes.** Board selection and edits survive rotation, background/foreground and process recreation as appropriate.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Board/playback changes have source tests plus the 2026-10-24/25 records in `docs/play-board-modal-protected-2026-10-24.md`, `docs/play-gesture-feedback-2026-10-24.md`, and `docs/play-amplification-2026-10-21.md`. Attach candidate regression results for this exact behavior; physical routing/audio focus remain open.

## 02 · Import, trimming and file reliability

- [ ] **[P0] Use Android document picker for audio import.** Prefer ACTION_OPEN_DOCUMENT / SAF rather than blanket storage access; accept audio/* content URIs.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Local import/record/trim code has unit coverage in `app-play/src/media/` and historical file-picker/recording records. Attach current candidate MP3/M4A/WAV/AAC, corrupt-file, cancel, low-storage and process-death results; phone coverage remains incomplete.
- [ ] **[P0] Persist access or copy imported audio internally.** If retaining the URI, take persistable read permission where available; otherwise safely copy into app-private storage.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Local import/record/trim code has unit coverage in `app-play/src/media/` and historical file-picker/recording records. Attach current candidate MP3/M4A/WAV/AAC, corrupt-file, cancel, low-storage and process-death results; phone coverage remains incomplete.
- [ ] **[P0] Validate files by content, not filename.** Reject corrupted, empty, malformed, unsupported and misleadingly named files without crashing.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Local import/record/trim code has unit coverage in `app-play/src/media/` and historical file-picker/recording records. Attach current candidate MP3/M4A/WAV/AAC, corrupt-file, cancel, low-storage and process-death results; phone coverage remains incomplete.
- [ ] **[P0] Enforce resource limits.** Put configurable caps on clip duration, file size, decode memory and concurrent processing; fail with actionable messages.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Local import/record/trim code has unit coverage in `app-play/src/media/` and historical file-picker/recording records. Attach current candidate MP3/M4A/WAV/AAC, corrupt-file, cancel, low-storage and process-death results; phone coverage remains incomplete.
- [ ] **[P0] Ensure trimming is loss-safe.** Preview correct bounds; never overwrite source until output is complete; use temporary file + atomic finalize when possible.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Local import/record/trim code has unit coverage in `app-play/src/media/` and historical file-picker/recording records. Attach current candidate MP3/M4A/WAV/AAC, corrupt-file, cancel, low-storage and process-death results; phone coverage remains incomplete.
- [ ] **[P0] Keep saved audio and metadata consistent.** Transactions or repair logic handle interrupted saves; detect and clean orphan files; no broken pad after restart.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Local import/record/trim code has unit coverage in `app-play/src/media/` and historical file-picker/recording records. Attach current candidate MP3/M4A/WAV/AAC, corrupt-file, cancel, low-storage and process-death results; phone coverage remains incomplete.
- [ ] **[P0] Sanitize imported filenames and URIs.** Never concatenate untrusted filenames into paths; guard path traversal, null metadata and malicious content providers.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Local import/record/trim code has unit coverage in `app-play/src/media/` and historical file-picker/recording records. Attach current candidate MP3/M4A/WAV/AAC, corrupt-file, cancel, low-storage and process-death results; phone coverage remains incomplete.
- [ ] **[P0] Test common codecs and edge cases.** Check MP3, WAV, M4A/AAC and OGG where supported; odd sample rates, mono/stereo, very short clips and variable-bit-rate sources.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Local import/record/trim code has unit coverage in `app-play/src/media/` and historical file-picker/recording records. Attach current candidate MP3/M4A/WAV/AAC, corrupt-file, cancel, low-storage and process-death results; phone coverage remains incomplete.
- [ ] **[P0] Support cancel and failure cleanup.** User cancellation, out-of-disk, app kill and decoder failure leave no partial pad or runaway background task.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Local import/record/trim code has unit coverage in `app-play/src/media/` and historical file-picker/recording records. Attach current candidate MP3/M4A/WAV/AAC, corrupt-file, cancel, low-storage and process-death results; phone coverage remains incomplete.
- [ ] **[P1] Handle storage exhaustion gracefully.** Warn before writing huge files, show real errors, and leave the library usable at low disk space.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Local import/record/trim code has unit coverage in `app-play/src/media/` and historical file-picker/recording records. Attach current candidate MP3/M4A/WAV/AAC, corrupt-file, cancel, low-storage and process-death results; phone coverage remains incomplete.
- [ ] **[P1] Add duplicate-import behavior.** Define whether a copied sound makes a new pad, a shared source, or an intentional duplicate; avoid unexpected disk multiplication.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Local import/record/trim code has unit coverage in `app-play/src/media/` and historical file-picker/recording records. Attach current candidate MP3/M4A/WAV/AAC, corrupt-file, cancel, low-storage and process-death results; phone coverage remains incomplete.
- [ ] **[P1] Add export/import of user-created boards.** Portable backup format includes metadata and owned audio; validation protects against malicious archive paths and huge decompression.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Local import/record/trim code has unit coverage in `app-play/src/media/` and historical file-picker/recording records. Attach current candidate MP3/M4A/WAV/AAC, corrupt-file, cancel, low-storage and process-death results; phone coverage remains incomplete.

## 03 · Device audio recording / overlay (conditional launch blocker)

- [ ] **[P0] Use sanctioned capture APIs.** Use AudioPlaybackCapture + MediaProjection on supported Android versions; do not bypass OS capture restrictions.
  - **Status:** OPEN — conditional launch evidence pending
  - **Evidence / next step:** The historical r3 artifact was capture-off; r4 includes device-audio capture. Physical checks confirm consent cancellation, active capture, notification stop and no-usable-audio handling with a synthetic fixture. Finish cleanup and verify the remaining evidence for this checklist item.
- [ ] **[P0] Gate capture behind an explicit user action.** Explain audio access before requesting RECORD_AUDIO and MediaProjection consent; never start recording silently.
  - **Status:** OPEN — conditional launch evidence pending
  - **Evidence / next step:** The historical r3 artifact was capture-off; r4 includes device-audio capture. Physical checks confirm consent cancellation, active capture, notification stop and no-usable-audio handling with a synthetic fixture. Finish cleanup and verify the remaining evidence for this checklist item.
- [ ] **[P0] Respect source-app capture restrictions.** Some apps cannot be captured; show “audio unavailable/protected” without claiming you can record all sources.
  - **Status:** OPEN — conditional launch evidence pending
  - **Evidence / next step:** The historical r3 artifact was capture-off; r4 includes device-audio capture. Physical checks confirm consent cancellation, active capture, notification stop and no-usable-audio handling with a synthetic fixture. Finish cleanup and verify the remaining evidence for this checklist item.
- [ ] **[P0] Handle per-session token and revocation.** Never reuse an expired projection token; stop instantly on onStop, user revoke, screen lock or service termination as applicable.
  - **Status:** OPEN — conditional launch evidence pending
  - **Evidence / next step:** The historical r3 artifact was capture-off; r4 includes device-audio capture. Physical checks confirm consent cancellation, active capture, notification stop and no-usable-audio handling with a synthetic fixture. Finish cleanup and verify the remaining evidence for this checklist item.
- [ ] **[P0] Use foreground service correctly if needed.** Declare mediaProjection FGS type/permission, show an ongoing notification, provide user stop control and stop service promptly.
  - **Status:** OPEN — conditional launch evidence pending
  - **Evidence / next step:** The historical r3 artifact was capture-off; r4 includes device-audio capture. Physical checks confirm consent cancellation, active capture, notification stop and no-usable-audio handling with a synthetic fixture. Finish cleanup and verify the remaining evidence for this checklist item.
- [ ] **[P0] Prepare Play Console FGS declaration.** Supply exact user benefit, justification and demonstration video for any foreground service type used.
  - **Status:** OPEN — conditional launch evidence pending
  - **Evidence / next step:** The historical r3 artifact was capture-off; r4 includes device-audio capture. Physical checks confirm consent cancellation, active capture, notification stop and no-usable-audio handling with a synthetic fixture. Finish cleanup and verify the remaining evidence for this checklist item.
- [ ] **[P0] Avoid overlay permission unless genuinely essential.** Prefer notification/quick-settings or standard controls where viable; if using draw-over-other-apps, explain grant and test touch/overlay safety.
  - **Status:** OPEN — conditional launch evidence pending
  - **Evidence / next step:** The historical r3 artifact was capture-off; r4 includes device-audio capture. Physical checks confirm consent cancellation, active capture, notification stop and no-usable-audio handling with a synthetic fixture. Finish cleanup and verify the remaining evidence for this checklist item.
- [ ] **[P0] Show active-capture status unambiguously.** Visible timer and stop control; do not capture before consent, after stop, or after system revocation.
  - **Status:** OPEN — conditional launch evidence pending
  - **Evidence / next step:** The historical r3 artifact was capture-off; r4 includes device-audio capture. Physical checks confirm consent cancellation, active capture, notification stop and no-usable-audio handling with a synthetic fixture. Finish cleanup and verify the remaining evidence for this checklist item.
- [ ] **[P0] Make silent/blocked recordings recoverable.** Detect zero/silent output; offer explanation, discard option and retry guidance, not an unusable saved clip.
  - **Status:** OPEN — conditional launch evidence pending
  - **Evidence / next step:** The historical r3 artifact was capture-off; r4 includes device-audio capture. Physical checks confirm consent cancellation, active capture, notification stop and no-usable-audio handling with a synthetic fixture. Finish cleanup and verify the remaining evidence for this checklist item.
- [ ] **[P0] Test capture on real devices.** At least Samsung and Pixel plus relevant Android versions; test app switching, rotation, incoming call, Bluetooth and repeated sessions.
  - **Status:** OPEN — conditional launch evidence pending
  - **Evidence / next step:** The historical r3 artifact was capture-off; r4 includes device-audio capture. Physical checks confirm consent cancellation, active capture, notification stop and no-usable-audio handling with a synthetic fixture. Finish cleanup and verify the remaining evidence for this checklist item.
- [ ] **[P0] Keep capture locally scoped.** Do not send user recordings, audio buffers or filenames to analytics, support logs or servers.
  - **Status:** OPEN — conditional launch evidence pending
  - **Evidence / next step:** The historical r3 artifact was capture-off; r4 includes device-audio capture. Physical checks confirm consent cancellation, active capture, notification stop and no-usable-audio handling with a synthetic fixture. Finish cleanup and verify the remaining evidence for this checklist item.
- [ ] **[P1] Limit recording length and resources.** Auto-stop or warn at documented limits; stream to bounded storage and recover after interruption.
  - **Status:** OPEN — conditional launch evidence pending
  - **Evidence / next step:** The historical r3 artifact was capture-off; r4 includes device-audio capture. Physical checks confirm consent cancellation, active capture, notification stop and no-usable-audio handling with a synthetic fixture. Finish cleanup and verify the remaining evidence for this checklist item.

## 04 · Persistence, backup and migration

- [ ] **[P0] Use versioned, transactional persistent storage.** Store app metadata with schema migrations; run upgrade tests for each supported schema version.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Data lives under `Paths.document/play-library`; board/catalog snapshots are v1, preferences v5, and transaction recovery/ZIP backup have tests. Verify upgrade from each supported beta schema, restore of partial backups, deletion and Android device-transfer behavior.
- [ ] **[P0] Keep clips in app-private storage by default.** Do not expose the whole sound library to unrelated apps or broad external storage.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Data lives under `Paths.document/play-library`; board/catalog snapshots are v1, preferences v5, and transaction recovery/ZIP backup have tests. Verify upgrade from each supported beta schema, restore of partial backups, deletion and Android device-transfer behavior.
- [ ] **[P0] Define deletion semantics.** Deleting a pad/board removes only intended data; shared media references are not deleted prematurely; no long-lived orphans.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Data lives under `Paths.document/play-library`; board/catalog snapshots are v1, preferences v5, and transaction recovery/ZIP backup have tests. Verify upgrade from each supported beta schema, restore of partial backups, deletion and Android device-transfer behavior.
- [ ] **[P0] Make migrations non-destructive.** Update from previous beta builds without losing boards, trim positions or images; provide recovery path on corruption.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Data lives under `Paths.document/play-library`; board/catalog snapshots are v1, preferences v5, and transaction recovery/ZIP backup have tests. Verify upgrade from each supported beta schema, restore of partial backups, deletion and Android device-transfer behavior.
- [ ] **[P0] Decide Android Auto Backup rules deliberately.** Auto Backup is limited; large audio may not be included. Explicitly include/exclude files and document what restore actually restores.
  - **Status:** R3 ARTIFACT VERIFIED — UX/data-transfer disclosure remains open
  - **Evidence / next step:** The r3 APK/AAB set `allowBackup=false`; inspect the r3 merged manifest. Document data/device transfer behavior and test supported restore flows.
- [ ] **[P0] Tell users when data is device-only.** Make uninstall/device-transfer data-loss behavior clear; do not promise sync or backup if none exists.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Data lives under `Paths.document/play-library`; board/catalog snapshots are v1, preferences v5, and transaction recovery/ZIP backup have tests. Verify upgrade from each supported beta schema, restore of partial backups, deletion and Android device-transfer behavior.
- [ ] **[P1] Offer manual export before uninstall.** A simple board export prevents user lock-in and makes upgrades/device migration practical.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Data lives under `Paths.document/play-library`; board/catalog snapshots are v1, preferences v5, and transaction recovery/ZIP backup have tests. Verify upgrade from each supported beta schema, restore of partial backups, deletion and Android device-transfer behavior.
- [ ] **[P1] Test restore from old/partial backup.** Verify absent audio, stale URIs and newer schema versions fail safely with clear messages.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Data lives under `Paths.document/play-library`; board/catalog snapshots are v1, preferences v5, and transaction recovery/ZIP backup have tests. Verify upgrade from each supported beta schema, restore of partial backups, deletion and Android device-transfer behavior.

## 05 · GIPHY and optional pad artwork

- [ ] **[P0] Confirm whether GIPHY artwork is in launch scope.** If no, remove API dependency and permissions; if yes, finish all checks in this section.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.
- [ ] **[P0] Comply with GIPHY storage rules.** Standard API usage prohibits independent caching/proxying/storing media: use GIPHY-hosted URLs/IDs, or obtain written permission before persistent artwork storage.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.
- [ ] **[P0] Show required “Powered by GIPHY” attribution.** Place conspicuous approved attribution wherever the GIPHY API is used.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.
- [ ] **[P0] Verify API key and production terms.** Use Android-specific key, appropriate production access/rate limit and current GIPHY terms; public client keys are not private secrets.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.
- [ ] **[P0] Handle connection failure and removed GIFs.** Offline, 429/rate-limit, timeouts, deleted/expired media and null images should fall back to a neutral pad image.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.
- [ ] **[P0] Set appropriate content-rating behavior.** Confirm age target and GIPHY rating restrictions; avoid presenting inappropriate search results to children.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.
- [ ] **[P0] Do not ship unlicensed demo artwork.** Screenshots, default pads and store graphics use original/licensed imagery and sounds only.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.
- [ ] **[P1] Optimize remote artwork rendering.** Select small suitable rendition, avoid huge animated files on all visible pads, honor data/network constraints.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.

## 06 · Privacy, security and abuse resistance

- [ ] **[P0] Complete a real data-flow audit.** List every outgoing network call and what it contains (GIPHY, crash reporting, analytics, ads); verify with proxy/network inspection.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.
- [ ] **[P0] Minimize permissions and remove leftovers.** No broad storage, location, contact, accessibility, overlay or background permission unless essential to shipped behavior.
  - **Status:** R3 PERMISSION INVENTORY VERIFIED — device behavior review remains open
  - **Evidence / next step:** The r3 permission report lists seven Android platform permissions, plus app-owned `DYNAMIC_RECEIVER_NOT_EXPORTED_PERMISSION`; no FGS or projection permissions are present. Review each remaining permission against final feature behavior.
- [ ] **[P0] Review merged AndroidManifest.xml.** Explicitly scope exported activities/services/providers; remove unused intent filters and permissions injected by SDKs.
  - **Status:** R3 MERGED MANIFEST RECORDED — manual security review remains open
  - **Evidence / next step:** Inspect `data/play-readiness-security-20261025-r3/artifacts/merged-AndroidManifest.xml`; capture is off, backup/cleartext are disabled, and no FGS/projection components are packaged. Review exported surfaces and permissions as part of the security review.
- [ ] **[P0] Harden file sharing and imports.** Use ContentResolver/FileProvider with minimal temporary grants; do not expose arbitrary app-private paths.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Stage/build checks cover the source allowlist, no YouTube marker, debug signing fallback, manifest flags, permission set, capture omission and native alignment. Still inspect the signed artifact and proxy traffic, publish the policy, review the single raw node-forge advisory against its documented local mitigation and retain strict audit evidence, and complete MASVS review.
- [ ] **[P0] Enforce TLS for external traffic.** No cleartext traffic in release; never disable TLS/hostname validation.
  - **Status:** R3 ARTIFACT VERIFIED — network-flow review remains open
  - **Evidence / next step:** `allowCleartextTraffic=false` in the r3 release metadata/merged manifest. Proxy and endpoint data-flow review remains separate evidence.
- [ ] **[P0] Remove secrets and development artifacts.** No private tokens, signing keys, production credentials, hardcoded test endpoints, debug menus or logs in APK/repository.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Stage/build checks cover the source allowlist, no YouTube marker, debug signing fallback, manifest flags, permission set, capture omission and native alignment. Still inspect the signed artifact and proxy traffic, publish the policy, review the single raw node-forge advisory against its documented local mitigation and retain strict audit evidence, and complete MASVS review.
- [ ] **[P0] Protect signing material and Play Console.** Enable MFA; use Play App Signing; keep upload key in protected CI secrets, not source control; document key recovery.
  - **Status:** OPEN — launch owner input/evidence required
  - **Evidence / next step:** No public policy/support destination, Play Console submission evidence or signed release record is present in this workspace.
- [ ] **[P0] Make release build non-debuggable.** Check minification/shrinking config, verify debug flags/logging absent and exported debuggable surfaces closed.
  - **Status:** R3 ARTIFACT VERIFIED — security review remains open
  - **Evidence / next step:** r3 is an unsigned release build with R8 minification and resource shrinking enabled; build checks verified non-debuggable release metadata. Review diagnostic exposure and exported surfaces separately.
- [ ] **[P0] Prevent sensitive diagnostics.** Do not log file paths containing personal data, recordings, search queries, raw media, device identifiers or consent responses unnecessarily.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Stage/build checks cover the source allowlist, no YouTube marker, debug signing fallback, manifest flags, permission set, capture omission and native alignment. Still inspect the signed artifact and proxy traffic, publish the policy, review the single raw node-forge advisory against its documented local mitigation and retain strict audit evidence, and complete MASVS review.
- [ ] **[P0] Audit dependencies / third-party SDK collection.** Lock versions, inspect transitive SDKs, run vulnerability scans, and remove libraries that are no longer needed.
  - **Status:** JS AUDIT GATE AND R3 ARTIFACT VERIFIED — security and attribution review remains open
  - **Evidence / next step:** The isolated JS graph passed compatibility/security checks and the strict audit gate; one raw high `node-forge` GHSA remains visible and is mitigated only by exact local-patch evidence. The r3 APK/AAB resolved Commons IO 2.22.0 and Gson 2.14.0; the fresh OSV batch covered all 160 selected Maven coordinates and returned zero affected-version results. The r3 APK/AAB passed merged-manifest, FFmpeg hash, ELF alignment, zipalign and stage-input checks. The standalone FFmpeg 8.0.3 source build and seven-fixture x86_64 emulator probe passed. Full app import/editor flow and physical-device tests remain open. See [the dependency audit report](DEPENDENCY_AUDIT-2026-10-25.md), [the native audit](NATIVE_DEPENDENCY_AUDIT-2026-10-25.md), and [verification snapshot](VERIFICATION-2026-10-25.md). The searchable notices dataset is included, with 43 metadata-only package records and Maven attribution/legal review pending. Signed artifact, proxy inspection and MASVS review remain separate release evidence.
- [ ] **[P0] Make privacy policy match actual behavior.** Include in-app and public policy URL; accurately describe recording, data stored locally and third parties; ensure Play Data safety matches.
  - **Status:** OPEN — launch owner input/evidence required
  - **Evidence / next step:** No public policy/support destination, Play Console submission evidence or signed release record is present in this workspace.
- [ ] **[P0] Provide an in-app disclosure where required.** If device capture/data access is not reasonably expected, show prominent purpose/usage disclosure before permission/consent flow.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Stage/build checks cover the source allowlist, no YouTube marker, debug signing fallback, manifest flags, permission set, capture omission and native alignment. Still inspect the signed artifact and proxy traffic, publish the policy, review the single raw node-forge advisory against its documented local mitigation and retain strict audit evidence, and complete MASVS review.
- [ ] **[P1] Review OWASP MASVS mobile risks.** Focus on local file handling, IPC, deep links, WebViews (if present), storage, network and build integrity.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Stage/build checks cover the source allowlist, no YouTube marker, debug signing fallback, manifest flags, permission set, capture omission and native alignment. Still inspect the signed artifact and proxy traffic, publish the policy, review the single raw node-forge advisory against its documented local mitigation and retain strict audit evidence, and complete MASVS review.
- [ ] **[P1] Restrict crash/analytics collection.** Opt out/minimize data wherever possible; define retention and deletion requests for any remotely collected personal data.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Stage/build checks cover the source allowlist, no YouTube marker, debug signing fallback, manifest flags, permission set, capture omission and native alignment. Still inspect the signed artifact and proxy traffic, publish the policy, review the single raw node-forge advisory against its documented local mitigation and retain strict audit evidence, and complete MASVS review.
- [ ] **[P1] Consider CI supply-chain protections.** Dependabot/Renovate, pinned build tooling, least-privilege tokens, provenance and protected release branches.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Stage/build checks cover the source allowlist, no YouTube marker, debug signing fallback, manifest flags, permission set, capture omission and native alignment. Still inspect the signed artifact and proxy traffic, publish the policy, review the single raw node-forge advisory against its documented local mitigation and retain strict audit evidence, and complete MASVS review.

## 07 · UX, accessibility and polish

- [ ] **[P0] No dead-end user flows.** Every screen has working back/cancel/save, including empty library, import failure, trim editor and recording permission denial.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Current UI records include the S24 and API 36 emulator checks in `STEPS.md` and the October 24/25 interaction reports. Complete TalkBack, large-font, contrast, touch-target and outside-user checks for the release candidate.
- [ ] **[P0] Make destructive actions reversible or confirmed.** Confirm deletion and disclose exactly what data will be lost; use undo for low-risk changes.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Current UI records include the S24 and API 36 emulator checks in `STEPS.md` and the October 24/25 interaction reports. Complete TalkBack, large-font, contrast, touch-target and outside-user checks for the release candidate.
- [ ] **[P0] Use consistent loading/error/empty states.** Never show indefinite spinner, blank pad, invisible progress, or unexplained failed GIF/audio.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Current UI records include the S24 and API 36 emulator checks in `STEPS.md` and the October 24/25 interaction reports. Complete TalkBack, large-font, contrast, touch-target and outside-user checks for the release candidate.
- [ ] **[P0] Support font scaling and TalkBack.** Every icon, pad, board switcher and volume slider has semantic labels/actions; test at large system font.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Current UI records include the S24 and API 36 emulator checks in `STEPS.md` and the October 24/25 interaction reports. Complete TalkBack, large-font, contrast, touch-target and outside-user checks for the release candidate.
- [ ] **[P0] Respect touch targets and contrast.** Aim for at least 48dp tap targets, legible labels and contrast in all selected light/dark themes.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Current UI records include the S24 and API 36 emulator checks in `STEPS.md` and the October 24/25 interaction reports. Complete TalkBack, large-font, contrast, touch-target and outside-user checks for the release candidate.
- [ ] **[P0] Test navigation bar, gestures and insets.** Edge-to-edge, keyboard display and system bars must not obscure pad controls or editors.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Current UI records include the S24 and API 36 emulator checks in `STEPS.md` and the October 24/25 interaction reports. Complete TalkBack, large-font, contrast, touch-target and outside-user checks for the release candidate.
- [ ] **[P0] Make trim control operable without fine motor precision.** Precise handles have accessible alternative/time input; preview playhead and bounds are visually clear.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Current UI records include the S24 and API 36 emulator checks in `STEPS.md` and the October 24/25 interaction reports. Complete TalkBack, large-font, contrast, touch-target and outside-user checks for the release candidate.
- [ ] **[P0] Avoid accidental loud playback.** Use safe default gain and visible volume control; warn when amplification can cause distortion or hearing discomfort.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Current UI records include the S24 and API 36 emulator checks in `STEPS.md` and the October 24/25 interaction reports. Complete TalkBack, large-font, contrast, touch-target and outside-user checks for the release candidate.
- [ ] **[P1] Support landscape/foldable/tablet gracefully.** No clipped modal, unreachable button or stretched GIF on wide screens; choose responsive grid policy.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Current UI records include the S24 and API 36 emulator checks in `STEPS.md` and the October 24/25 interaction reports. Complete TalkBack, large-font, contrast, touch-target and outside-user checks for the release candidate.
- [ ] **[P1] Support reduced motion and battery saver.** Avoid excessive decorative animation and continuous waveform updates; stop animation when hidden.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Current UI records include the S24 and API 36 emulator checks in `STEPS.md` and the October 24/25 interaction reports. Complete TalkBack, large-font, contrast, touch-target and outside-user checks for the release candidate.
- [ ] **[P1] Design a first-use path.** Explain add sound, record/import distinction, grid editing and why some audio sources cannot be recorded.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** Current UI records include the S24 and API 36 emulator checks in `STEPS.md` and the October 24/25 interaction reports. Complete TalkBack, large-font, contrast, touch-target and outside-user checks for the release candidate.

## 08 · Performance, memory and battery

- [ ] **[P0] Measure start and tap-to-sound latency.** Profile release build on real low/mid-range phone; define p95 budget and measure before claiming “instant playback”.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/play-playback-fix-2026-10-22.md` reports source preparation/UI timing, not acoustic latency. This turn adds ZIP and ELF alignment gates; capture physical p95 latency, release profiling, 16 KiB device and battery/resource evidence.
- [ ] **[P0] Keep decoding and waveform generation off UI thread.** No audible lag, frozen drag handles or ANR while importing/trimming.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/play-playback-fix-2026-10-22.md` reports source preparation/UI timing, not acoustic latency. This turn adds ZIP and ELF alignment gates; capture physical p95 latency, release profiling, 16 KiB device and battery/resource evidence.
- [ ] **[P0] Manage audio engine resources.** Dispose players/AudioRecord after stop; release projection/notifications on every exit path.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/play-playback-fix-2026-10-22.md` reports source preparation/UI timing, not acoustic latency. This turn adds ZIP and ELF alignment gates; capture physical p95 latency, release profiling, 16 KiB device and battery/resource evidence.
- [ ] **[P0] Bound memory for waveforms and images.** Use thumbnails/downsampling and cache ceilings; no decoded full-size assets for offscreen pads.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/play-playback-fix-2026-10-22.md` reports source preparation/UI timing, not acoustic latency. This turn adds ZIP and ELF alignment gates; capture physical p95 latency, release profiling, 16 KiB device and battery/resource evidence.
- [ ] **[P0] Avoid unnecessary background CPU/battery use.** When idle or screen locked, no polling, capture process or wake locks left running.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/play-playback-fix-2026-10-22.md` reports source preparation/UI timing, not acoustic latency. This turn adds ZIP and ELF alignment gates; capture physical p95 latency, release profiling, 16 KiB device and battery/resource evidence.
- [ ] **[P0] Profile in release configuration.** Run Android Studio profiler, baseline/frame checks and Android vitals review with minification enabled.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/play-playback-fix-2026-10-22.md` reports source preparation/UI timing, not acoustic latency. This turn adds ZIP and ELF alignment gates; capture physical p95 latency, release profiling, 16 KiB device and battery/resource evidence.
- [ ] **[P0] Check 16 KB memory page compatibility.** If the bundle contains native .so libraries (e.g., audio DSP/transcoding), verify packaging/alignment and test on 16 KB devices.
  - **Status:** R3 ARTIFACT ALIGNMENT PASSED — physical device pending
  - **Evidence / next step:** All 44 native libraries in each r3 artifact passed 16 KiB ELF alignment, and APK zipalign passed. Run the candidate on a physical 16 KiB-page device before release.
- [ ] **[P1] Defer expensive assets.** Lazy-load board previews, GIFs and waveforms; prioritize visible pads and playback-ready audio.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/play-playback-fix-2026-10-22.md` reports source preparation/UI timing, not acoustic latency. This turn adds ZIP and ELF alignment gates; capture physical p95 latency, release profiling, 16 KiB device and battery/resource evidence.
- [ ] **[P1] Set reasonable cache and storage cleanup policy.** Temporary recordings, failed imports and derived thumbnails do not accumulate forever.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/play-playback-fix-2026-10-22.md` reports source preparation/UI timing, not acoustic latency. This turn adds ZIP and ELF alignment gates; capture physical p95 latency, release profiling, 16 KiB device and battery/resource evidence.
- [ ] **[P1] Track real-world performance after release.** Monitor launch time, ANR/crashes, slow rendering, memory and battery regressions per device model.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/play-playback-fix-2026-10-22.md` reports source preparation/UI timing, not acoustic latency. This turn adds ZIP and ELF alignment gates; capture physical p95 latency, release profiling, 16 KiB device and battery/resource evidence.

## 09 · Testing strategy and CI

- [ ] **[P0] Add unit tests for core state transitions.** Board CRUD, pad mapping, file references, trim ranges, volume, migrations and delete rules.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `.github/workflows/play-ci.yml` runs immutable install, Play tests, typecheck, source-stage audit and dual-ABI Android build. Record a successful workflow run, review the documented node-forge local-patch mitigation and preserve strict audit gating, and complete signed Play install, process-death, device and outsider tests.
- [ ] **[P0] Add integration tests for real media.** Import → trim → save → restart → play → delete on representative formats and corrupted files.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `.github/workflows/play-ci.yml` runs immutable install, Play tests, typecheck, source-stage audit and dual-ABI Android build. Record a successful workflow run, review the documented node-forge local-patch mitigation and preserve strict audit gating, and complete signed Play install, process-death, device and outsider tests.
- [ ] **[P0] Add system-permission flow tests.** Denied, denied permanently, approved, revoked mid-session, backgrounded and interrupted recording paths.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `.github/workflows/play-ci.yml` runs immutable install, Play tests, typecheck, source-stage audit and dual-ABI Android build. Record a successful workflow run, review the documented node-forge local-patch mitigation and preserve strict audit gating, and complete signed Play install, process-death, device and outsider tests.
- [ ] **[P0] Test process death and upgrades.** Force-stop or kill during import/record/save; reopen without lost library metadata.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `.github/workflows/play-ci.yml` runs immutable install, Play tests, typecheck, source-stage audit and dual-ABI Android build. Record a successful workflow run, review the documented node-forge local-patch mitigation and preserve strict audit gating, and complete signed Play install, process-death, device and outsider tests.
- [ ] **[P0] Test at least 3 representative devices.** One lower-end Android phone, one Samsung and one Pixel/Android reference (devices may overlap coverage only if defensible).
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `.github/workflows/play-ci.yml` runs immutable install, Play tests, typecheck, source-stage audit and dual-ABI Android build. Record a successful workflow run, review the documented node-forge local-patch mitigation and preserve strict audit gating, and complete signed Play install, process-death, device and outsider tests.
- [ ] **[P0] Test online, offline and flaky network.** Core playback/import works offline; GIF search is optional and fails non-destructively.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `.github/workflows/play-ci.yml` runs immutable install, Play tests, typecheck, source-stage audit and dual-ABI Android build. Record a successful workflow run, review the documented node-forge local-patch mitigation and preserve strict audit gating, and complete signed Play install, process-death, device and outsider tests.
- [ ] **[P0] Implement basic CI release gates.** Every PR: build, tests, lint/static analysis and dependency checks; main branch release must be reproducible.
  - **Status:** WORKFLOW ADDED — first run pending
  - **Evidence / next step:** .github/workflows/play-ci.yml pins actions and Node, installs the immutable Yarn lock, and runs app tests/typecheck/stage checks. Record the first successful CI run.
- [ ] **[P0] Test the signed release AAB installed through Play.** Do not rely on debug APK behavior; verify minification and permission declarations from Play-distributed artifact.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `.github/workflows/play-ci.yml` runs immutable install, Play tests, typecheck, source-stage audit and dual-ABI Android build. Record a successful workflow run, review the documented node-forge local-patch mitigation and preserve strict audit gating, and complete signed Play install, process-death, device and outsider tests.
- [ ] **[P0] Do exploratory user tests with outsiders.** Observe 3–5 users adding/playing/trimming clips without coaching; fix blockers before launch.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `.github/workflows/play-ci.yml` runs immutable install, Play tests, typecheck, source-stage audit and dual-ABI Android build. Record a successful workflow run, review the documented node-forge local-patch mitigation and preserve strict audit gating, and complete signed Play install, process-death, device and outsider tests.
- [ ] **[P1] Automate smoke UI tests.** App launch, import, soundboard interaction, edit mode and board switching.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `.github/workflows/play-ci.yml` runs immutable install, Play tests, typecheck, source-stage audit and dual-ABI Android build. Record a successful workflow run, review the documented node-forge local-patch mitigation and preserve strict audit gating, and complete signed Play install, process-death, device and outsider tests.
- [ ] **[P1] Add a regression checklist for each release.** Explicitly cover new code touching codecs, DB migration, permissions or media services.
  - **Status:** R3 RELEASE-CANDIDATE BASELINE RECORDED — signed/device runs remain open
  - **Evidence / next step:** The r3 candidate has artifact and security-gate records in [the verification snapshot](VERIFICATION-2026-10-25.md). Keep the codec, migration, permission and media-service regression list for each signed/release run.
- [ ] **[P1] Run accessibility scanner and manual TalkBack pass.** Scanner findings triaged; primary actions operable by screen reader.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `.github/workflows/play-ci.yml` runs immutable install, Play tests, typecheck, source-stage audit and dual-ABI Android build. Record a successful workflow run, review the documented node-forge local-patch mitigation and preserve strict audit gating, and complete signed Play install, process-death, device and outsider tests.

## 10 · Play Store publishing and legal

- [ ] **[P0] Target Android 16 / API 36 or newer.** Current Play requirement for new Android phone apps and updates since 31 Aug 2026.
  - **Status:** R3 ARTIFACT VERIFIED — release policy submission remains open
  - **Evidence / next step:** R3 artifact release metadata verifies minSdk 24 and targetSdk 36. Confirm the current Play policy again at submission time.
- [ ] **[P0] Upload a signed Android App Bundle.** Enable Play App Signing, unique applicationId, versionCode/versionName and release artifact provenance.
  - **Status:** OPEN — launch owner input/evidence required
  - **Evidence / next step:** No public policy/support destination, Play Console submission evidence or signed release record is present in this workspace.
- [ ] **[P0] Complete Play app content declarations.** Data safety, privacy policy, target audience, content rating, ads, app access, and required permissions/FGS declarations.
  - **Status:** OPEN — launch owner input/evidence required
  - **Evidence / next step:** No public policy/support destination, Play Console submission evidence or signed release record is present in this workspace.
- [ ] **[P0] Make Data safety declaration exact.** Includes any information collected by third-party SDKs, even when Stimmyz itself stores audio only on-device.
  - **Status:** OPEN — launch owner input/evidence required
  - **Evidence / next step:** No public policy/support destination, Play Console submission evidence or signed release record is present in this workspace.
- [ ] **[P0] Provide public and in-app privacy policy.** Have stable HTTPS URL and an in-app entry; state offline data behavior and third-party integrations accurately.
  - **Status:** OPEN — launch owner input/evidence required
  - **Evidence / next step:** No public policy/support destination, Play Console submission evidence or signed release record is present in this workspace.
- [ ] **[P0] Check all copyrighted content and branding.** Original/licensed default pads, sounds, screenshots and promo artwork; avoid marketing the app as a way to rip protected media.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** API 36 is set and checked by source/build gates; official Play target guidance is linked above. Signed AAB, listing, privacy/Data safety declarations, content rating, closed-test eligibility, pre-launch report and rollout evidence remain open.
- [ ] **[P0] Check store listing promises against reality.** Screenshots and copy must show actual available flows; avoid “record any app” or “download YouTube/TikTok sounds”.
  - **Status:** OPEN — launch owner input/evidence required
  - **Evidence / next step:** No public policy/support destination, Play Console submission evidence or signed release record is present in this workspace.
- [ ] **[P0] Provide support contact and review instructions.** Support email/web contact, feature walkthrough and access notes for recording and overlay flow.
  - **Status:** OPEN — launch owner input/evidence required
  - **Evidence / next step:** No public policy/support destination, Play Console submission evidence or signed release record is present in this workspace.
- [ ] **[P0] Verify developer account testing gate.** For personal Play accounts created after 13 Nov 2023, run qualifying 12-tester/14-day closed test and apply for production access.
  - **Status:** OPEN — launch owner input/evidence required
  - **Evidence / next step:** No public policy/support destination, Play Console submission evidence or signed release record is present in this workspace.
- [ ] **[P0] Review pre-launch report and policy warnings.** Resolve crashes, permission problems, install failures, accessibility failures and device coverage warnings.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** API 36 is set and checked by source/build gates; official Play target guidance is linked above. Signed AAB, listing, privacy/Data safety declarations, content rating, closed-test eligibility, pre-launch report and rollout evidence remain open.
- [ ] **[P0] Verify localization and distribution.** Choose countries, locales, price/free choice and accurate store metadata; test localized overflow.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** API 36 is set and checked by source/build gates; official Play target guidance is linked above. Signed AAB, listing, privacy/Data safety declarations, content rating, closed-test eligibility, pre-launch report and rollout evidence remain open.
- [ ] **[P1] Write concise public release notes.** Disclose what changed, major limits and known limitations; publish a changelog/version history.
  - **Status:** OPEN — launch owner input/evidence required
  - **Evidence / next step:** No public policy/support destination, Play Console submission evidence or signed release record is present in this workspace.

## 11 · Monetization (only if ads or purchases ship)

- [ ] **[P0] Audit exact ad SDK data practices.** Include ad identifiers/network requests and SDK collection in privacy policy and Play Data safety.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.
- [ ] **[P0] Implement appropriate consent handling.** For EEA/UK/Switzerland AdMob personalized ads, use a Google-certified CMP/TCF and honor consent; validate ads SDK behavior.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.
- [ ] **[P0] Place ads away from playback controls.** No deceptive tap targets, full-screen interruption during audio playback or accidental clicks near pads.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.
- [ ] **[P0] Use test ad units during QA.** Never click live ads while testing; confirm production IDs configured only for production.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.
- [ ] **[P0] If selling digital upgrades, use compliant Play Billing.** Test purchase, cancellation, restore, refunds and offline entitlements if in-app purchases exist.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.
- [ ] **[P1] Measure whether ads hurt retention.** Experiment conservatively; consider starting ad-free until core use and retention are validated.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.

## 12 · Monitoring, rollout and operations

- [ ] **[P0] Set up Android vitals and crash reporting.** Play Console alerts enabled; stack traces are readable (upload mapping files if obfuscated).
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/production/release-runbook.md` now contains an operator checklist and hotfix sequence. Configure Play vitals/support channels and record staged rollout, alerts, owner contact and review dates.
- [ ] **[P0] Monitor crash and ANR rate.** Play bad-behavior thresholds (as of Oct 2026): user-perceived crash 1.09%, ANR 0.47% overall; aim materially lower.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/production/release-runbook.md` now contains an operator checklist and hotfix sequence. Configure Play vitals/support channels and record staged rollout, alerts, owner contact and review dates.
- [ ] **[P0] Have a release rollback/hotfix plan.** Use staged rollout and halt when regressions emerge; fix-forward with higher versionCode as needed.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/production/release-runbook.md` now contains an operator checklist and hotfix sequence. Configure Play vitals/support channels and record staged rollout, alerts, owner contact and review dates.
- [ ] **[P0] Ship via internal → closed → staged production.** Collect real device evidence; record launch sign-off before exposing all users.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/production/release-runbook.md` now contains an operator checklist and hotfix sequence. Configure Play vitals/support channels and record staged rollout, alerts, owner contact and review dates.
- [ ] **[P0] Make user feedback possible.** Support address in app/listing and low-friction “report a problem” flow without automatically attaching sensitive files.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/production/release-runbook.md` now contains an operator checklist and hotfix sequence. Configure Play vitals/support channels and record staged rollout, alerts, owner contact and review dates.
- [ ] **[P0] Document one-person on-call procedure.** Know where to view Play issues, disable/remove a faulty feature in next build, and communicate known issues.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/production/release-runbook.md` now contains an operator checklist and hotfix sequence. Configure Play vitals/support channels and record staged rollout, alerts, owner contact and review dates.
- [ ] **[P1] Choose privacy-respecting product metrics.** Track feature adoption (board created, first clip imported, day-7 retention) without collecting recordings or pad names.
  - **Status:** OPEN — evidence required
  - **Evidence / next step:** `docs/production/release-runbook.md` now contains an operator checklist and hotfix sequence. Configure Play vitals/support channels and record staged rollout, alerts, owner contact and review dates.
- [ ] **[P1] Recheck policies and dependencies quarterly.** Revalidate targetSdk, SDKs, GIPHY terms, privacy declarations, API limits and Play warnings.
  - **Status:** N/A for current v1 scope
  - **Evidence / next step:** Current scope removes GIPHY; no ad or billing SDK is configured. Recheck the shipped dependency/artifact inventory if scope changes.

## Release record (fill out before every upload)

- **Release version + versionCode:** ______________________________________________
- **Source commit / tag:** ______________________________________________
- **AAB SHA-256:** ______________________________________________
- **QA devices + Android versions:** ______________________________________________
- **Permissions added/removed:** ______________________________________________
- **Database migration version:** ______________________________________________
- **Data safety / privacy policy changed?:** ______________________________________________
- **Crash / ANR dashboard snapshot:** ______________________________________________
- **Known issues / accepted risks:** ______________________________________________
- **Approver / date:** ______________________________________________

## Official reference links (verified 24 Oct 2026)

- [Google Play target API requirement (API 36, 2026)](https://support.google.com/googleplay/android-developer/answer/11926878)
- [Personal developer-account closed testing](https://support.google.com/googleplay/android-developer/answer/14151465)
- [Data safety declaration](https://support.google.com/googleplay/android-developer/answer/10787469)
- [User Data policy and prominent disclosure](https://support.google.com/googleplay/android-developer/answer/10144311)
- [Android AudioPlaybackCapture and MediaProjection](https://developer.android.com/media/platform/av-capture)
- [Foreground service and Play declaration](https://support.google.com/googleplay/android-developer/answer/13392821)
- [Android document picker / content URIs](https://developer.android.com/reference/android/content/Intent#ACTION_OPEN_DOCUMENT)
- [Google Play intellectual property policy](https://support.google.com/googleplay/android-developer/answer/9888072)
- [GIPHY API guidance / caching / attribution](https://developers.giphy.com/docs/api/)
- [Android vitals quality thresholds](https://developer.android.com/topic/performance/vitals/)
- [Android app security best practices](https://developer.android.com/privacy-and-security/security-best-practices)
- [Android 16 KB page-size compatibility](https://developer.android.com/guide/practices/page-sizes)
- [Android Auto Backup](https://developer.android.com/identity/data/autobackup)
- [AdMob EU consent and certified CMP](https://support.google.com/admob/answer/13554116)
- [UMP consent SDK for Android](https://developers.google.com/admob/android/privacy)

---
**Important:** Google Play policies, GIPHY terms and SDK requirements can change. Reconfirm before each production submission. User-supplied sounds do not automatically establish rights to distribute or promote copyrighted samples.
