# Play Imgflip artwork — 2026-10-18

Play 1.0.8/code 9 adds an optional Imgflip popular-template picker in Customize,
after trimming. It loads the free `get_memes` list and filters names locally;
it does not use the paid full-catalog search or require an API key. Openverse
was dropped at the user's request before any implementation was made.

The picker is virtualized and supports loading, retry, no matches, cancellation,
source links, square cover previews, removal and default icon/color fallback.
Image downloads are restricted to HTTPS Imgflip raster URLs, capped at 2 MiB,
decoded and encoded as JPEG thumbnails up to 512 px. Draft files are removed
after cancellation/replacement or copying to private Library storage. Optional
artwork metadata extends the existing v1 presentation snapshots; missing files
and image decode errors fall back to the clip icon. Recovery snapshot references
prevent premature image deletion. Existing audio files and Dev source are unchanged.

The provider permits downloading API images but does not clear every image's
underlying rights. No meme artwork is bundled in the APK. Search-result images
link to Imgflip and saved provenance links to the original template page.
Sources: [Imgflip API](https://imgflip.com/api), [terms](https://imgflip.com/terms).

Validation passed:

- TypeScript; all 58 Play tests; 9 staging/plugin tests. New checks cover invalid
  provider data, network failures, cancellation, local filtering, download caps,
  owned draft paths, missing artwork and metadata-write rollback cleanup.
- ARM64+x86_64 unsigned APK/AAB build and Play package/exclusion audits.
  The local testing APK passed v2/v3 signature and ZIP alignment checks.
- Installed only simulator Play with `install -r`, preserving its saved sounds.
- Native free-list loading, `zzz` no-results state and `Doge` filtering passed.
  Android Back closed the picker without losing the audio draft.
- Selected Buff Doge vs. Cheems; live preview displayed the local image. Back
  to Trim retained the 20.57-second selection and returning to Customize kept
  the artwork. Saved one silent simulator sample named **Imgflip test**.
- Library displayed the thumbnail and template source link. Assigned only the
  sample to a new **Artwork demo** board, preserving existing board assignments.
- Disabled simulator Wi-Fi and mobile data, force-stopped and relaunched Play.
  `dumpsys connectivity` reported **Active default network: none** and artwork
  still displayed. Restored Wi-Fi/mobile data to enabled; airplane mode stayed off.
- All 27 shared text elements retained identical normal/edit bounds. Saved-pad
  menus remained absent normally and available only in Edit board. The simulator
  is left on Artwork demo in normal mode, with the sample available to inspect.

Evidence: [picker](../data/emulator-review-2026-10-18/imgflip-popular-loaded.png),
[no results](../data/emulator-review-2026-10-18/imgflip-no-results.png),
[selected preview](../data/emulator-review-2026-10-18/imgflip-selected.png),
[Library](../data/emulator-review-2026-10-18/imgflip-library.png),
[offline restart](../data/emulator-review-2026-10-18/imgflip-offline-restart.png),
[edit bounds](../data/emulator-review-2026-10-18/imgflip-edit-bounds.json).

[Signed testing APK](../data/play-build-20261018-152414-289-45acc0e5/artifacts/soundboard-play-testing.apk)
SHA-256: `c07782d1530dad2fe2652d96e5519a0655ebdedeb4fa8d1c21175e8e59602e84`.
Unsigned APK/AAB and audit metadata are in the same artifact directory.

This slice uses center-cover artwork; manual crop/reposition, gallery import and
changing artwork for an already saved clip remain pending. The emulator capture
input is silent, so microphone sound quality is not a claim of this check.
No commit, push, store publication or physical-phone update occurred.

## Image action wording follow-up

Play 1.0.11/code 12 changes Customize actions to **Choose image** and **Change
image**, including picker result accessibility labels. TypeScript passed; the
ARM64+x86_64 native build, package audit, testing signature v2/v3 and ZIP alignment
checks passed. Updated only simulator Play after the user explicitly requested
discarding the open draft. Native checks confirmed both labels and opening the
picker; the unsaved QA draft was then discarded and Editor left ready. Saved
clips, artwork and boards were preserved; Dev source remains unchanged.

Evidence: [Choose image](../data/emulator-review-2026-10-18/image-label-choose.png),
[Change image](../data/emulator-review-2026-10-18/image-label-change-verified.png).
[Signed testing APK](../data/play-build-20261018-160107-933-199803a5/artifacts/soundboard-play-testing.apk)
SHA-256: `1e57946191f031181354df4d34cb750cdc1d9a04552db2febc2616e81849f0f5`.
