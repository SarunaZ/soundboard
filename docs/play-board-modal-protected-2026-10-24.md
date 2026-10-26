# Board modal, protected playback and October 24 design update

**Later owner refinement:** the hold is now one second, protected pads use
disabled styling without a padlock, and each board can choose Left/Right rail
placement. See the [native gesture regression record](play-gesture-feedback-2026-10-24.md)
for the 1.0.23/code 24 implementation and S24 update. This document records the
earlier two-second 1.0.21 baseline.

## Inputs and precedence

Imported the complete Downloads handoff unchanged into
[`design/StimmyzApp_Astra_Board_Modal_Protected_Hold_2026-10-24/`](design/StimmyzApp_Astra_Board_Modal_Protected_Hold_2026-10-24/).
Full ZIP SHA-256: `5e4b91ab25939ebebab86c7af8ae2087ad131b1cc5f87549e82b4712810b8733`.
The separate interactive ZIP SHA-256 is
`abd3b517b81c1490205346446d8a8e80964e09289252c18077f8b6f729ea37fe`.
Reviewed the requirements, prototype source and supplied preview images. Browser
automation rejected the local `file://` prototype URL, so no interactive browser
walkthrough is claimed.

The owner's later instructions override the handoff's release-to-play gesture:
pads must play as soon as a finger touches them. Holding for two seconds promotes
the existing playback to protected playback without restarting its source. A
dedicated visible scroll rail provides a separate area for scrolling without
triggering pads; a brief animated hint respects Reduce Motion. Board renaming
is also part of this update.

## Implementation

- Board settings move into a modal with grid, Pages/Scroll and overlap controls.
  Closing it retains edit mode; Done editing exits. The dialog also provides
  validated board renaming without changing board identity or assignments.
  Page position is saved per board and retained through tab, board and mode
  changes; search clamps only its displayed page.
- Pads retain immediate touch playback and get press/rebound feedback, a
  two-second charge perimeter, protected state, a separate Stop action, and an
  accessible Protect playback action. Runtime pad IDs include board identity.
- The native playback engine keeps protected requests and voices separate from
  ordinary monophonic replacement. Protection preserves repeat/gain processing,
  natural completion unlocks, and Stop all, deletion, backgrounding and audio
  interruption cancel safely. Protected voices count toward memory/voice limits
  and are never stolen by resource eviction.
- Appearance has nine complete palettes, with Coffee migrated to Chocolate.
  Theme selection remains in Settings. Editor/Library redundant page introductions
  and Library creation CTAs are removed.
- Artwork selection is gallery-only. Existing private artwork remains readable;
  remote artwork search/provider requests are removed. Saved thumbnails retain
  safe app-owned paths and offline/backup support. Saved sounds offer Default,
  Open gallery and Cancel; restoring Default retains audio and gradient metadata.
  Cleanup retains current/recovery artwork and reclaims only unreferenced,
  directly owned UUID JPEGs after successful metadata changes.
- New clips persist gradient stops and a stable allocation identity, independent
  of page, theme or order. Preferences migrate to version 5 with a monotonic
  color allocation cursor; presentation version 1 gains optional fields, leaving
  old metadata readable. Backup parsing/merge retain these fields and cursor.
  Board version 1 also accepts an optional legacy-defaulted page index.
  Legacy clips without color metadata receive a stable UUID-based fallback
  without writes during loading; backup exports include those gradient stops.

Implementation was delegated to `gpt-6-luna` workers at high reasoning effort
with separate ownership for playback, Board interactions, and themes/artwork/data.
The primary agent reviewed integration and verification. Dev app source is unchanged.

## File map

- `app-play/App.tsx`: playback/protection callback, deletion/replacement cleanup,
  and Default/gallery artwork routing.
- `src/ui/BoardScreen.tsx`, `boardHold.ts`, `boardScrollRail.ts`: modal editing,
  rename, press/hold, rail, accessibility, and page persistence.
- `src/media/playbackEngine.ts`, `src/types/audioManagerDeepImport.d.ts`:
  protected pending/active sessions, native interruption observation and limits.
- `src/data/boardModel.ts`, `boards.ts`: validated board names and page state.
- `src/data/preferences.ts`, `presentation.ts`, `library.ts`, `padColors.ts`:
  legacy migration, stable gradient metadata and safe artwork persistence.
- `src/media/artwork.ts`, `backup.ts`, `backupMerge.ts`, `src/ui/ArtworkPicker.tsx`:
  system-picker artwork, pruning and backup compatibility. `memeSearch.ts` is removed.
- `src/ui/theme.ts`, `EditorScreen.tsx`, `LibraryScreen.tsx`, `CreateFlow.tsx`,
  `SettingsModal.tsx`, `BrandHeader.tsx`, `Waveform.tsx`, `PadGradient.tsx`:
  nine palettes, minimal pages, gallery-only choices and gradient rendering.
- Corresponding data/media/Board tests cover the new behavior; `app.json` moves
  the local test build to 1.0.21/code 22. Project documentation points to this handoff.

## Verification

- **170/170 Play tests pass**, run with `node --test` from `app-play/`.
  Coverage includes protected active/pending voices, in-place promotion,
  replacement, repeats, stop/interruption, resource limits, board rename/page
  migration, scroll-rail geometry/lazy loading, gallery validation and rollback,
  Default artwork, orphan cleanup, stable legacy colors and backup round trips.
- **Strict TypeScript passes**, with
  `node node_modules/typescript/bin/tsc --noEmit -p app-play/tsconfig.json`.
- **11/11 source-stage/release-plugin tests pass**. The actual delivery stage
  also passes its source-boundary verifier, and all **92 staged inputs match
  the working source** by SHA-256. Tracked `app-client/` files are unchanged.
- **ARM64 + x86_64 release-mode APK and AAB builds pass**. Android manifest,
  native autolinking, extractor exclusion, unsigned-artifact and APK alignment
  audits pass. Package remains `dev.sarunas.soundboard.play`, version
  **1.0.21/code 22**, with backup and cleartext traffic disabled.
- `git diff --check` passes. Initial delivery artifacts were unsigned; the later
  owner-requested phone update is recorded below. No commit, push or publication
  was performed.

Logs, source comparison and stage inventory are under
[`data/play-board-modal-20261024/`](../data/play-board-modal-20261024/).
Earlier `android-build/` and `android-final/` directories are intermediate builds;
**`delivery/` contains the final reviewed source and artifacts**.

The local HTML browser walkthrough was blocked by the browser URL policy.
Requirements, source and supplied preview images were reviewed instead. No updated
emulator UI, physical-device, TalkBack, system-picker, large-font, acoustic latency,
gain/limiter listening or touch/scroll acceptance is claimed. The test emulator
was closed; verification completed in the background. The prior native audio and
capture reports remain historical evidence, not verification of these new gestures.

## Delivery artifacts

| Artifact | Size | SHA-256 |
| --- | ---: | --- |
| [Unsigned APK](../data/play-board-modal-20261024/delivery/artifacts/soundboard-play-testing-unsigned.apk) | 67,014,406 bytes | `cb51ca05f0cb7b5f3eb1a5a0860864b59d6620d361ab569a88e8f81000581027` |
| [Unsigned AAB](../data/play-board-modal-20261024/delivery/artifacts/soundboard-play-unsigned.aab) | 50,164,493 bytes | `63999220162ab8f7c3b2d268f26352ed8b1c5d73ca1a16fd417e455ad2bb8508` |

These artifacts require signing before installation or distribution.

## Owner-requested S24 installation — October 24

Signed the verified delivery APK with the existing Play local-testing certificate
(`b095e9fe2a6242050ef08117a90534e4629da9a35e0fdc095b04335dc32c020c`).
APK v2/v3 signatures, package/version and 16 KiB alignment pass verification.

`adb install -r --user 0` succeeded on the connected **Galaxy S24 Ultra
(SM-S928B)**, updating **1.0.20/code 21 → 1.0.21/code 22**. The application UID
remains `10492` and its original first-install timestamp is unchanged. No
uninstall or app-data clear was performed. This verifies installation, not UI,
playback or listening acceptance; the app was not launched for further testing.

[Signed local-testing APK](../data/play-board-modal-20261024/delivery/artifacts/stimmyz-1.0.21-testing-signed.apk)
SHA-256: `b6c52c8a451f3a0a0519df5ef2a63cd013911600a8c6780eeb9bc0d4547bd495`.
Signature verification and before/after package records are retained in the
task's ignored artifact directory.
