# Play first-slice verification — 2026-10-17

The separate `app-play/` source and its unsigned Android artifacts are verified
at the build level. Device interaction, audible playback, coinstallation and
public-release acceptance remain open. No app was signed, installed or published.

## Inputs and preservation

- Current design input: [reviewed handoff](design/reviewed-2026-10-17/ASTRA_HANDOFF.md)
  and [research audit](design/reviewed-2026-10-17/RESEARCH_AUDIT_2026-10-17.md).
  All 20 extracted files match the reviewed archive; prototype, tokens and visual
  assets match the original bundle.
- All 102 tracked `app-client/` files matched their pre-change SHA-256 baseline.
  The existing Dev package, signing material, private clips and installed app
  were not changed. No Dev clip migration was attempted.
- Play starts with an empty Library and empty Main board. No Dev remote preload,
  demo audio or illustrative handoff artwork is included by the Play source graph.

## Checks passed

| Check | Result |
| --- | --- |
| Play data/media tests | 30/30, including range encoding, cancellation, corruption recovery, repeat snapshot writes and rollback |
| Play staging/plugin tests | 6/6, including explicit import boundaries and unsigned-release configuration |
| Play TypeScript | Pass |
| Dev baseline | 124/124 tests and TypeScript pass; subsequent tracked source hash comparison unchanged |
| Locked dependencies | Yarn 4.18 immutable install passes in isolated Linux storage |
| Frozen Play stage | 43 files, including 30 source files; other workspace manifests are metadata only |
| Native build | `assembleRelease` and `bundleRelease` succeed; 368 tasks, final build 1m 41s |
| Package/version | `dev.sarunas.soundboard.play`, 1.0.0, version code 1 |
| CPU architecture | Both archives contain only `arm64-v8a` native libraries |
| Release settings | APK is non-debuggable; backup and cleartext traffic disabled |
| Permissions | No broad storage/media-read or microphone permission in the inspected APK |
| Extractor exclusion | Source graph, generated native autolinking files, archive paths and extracted APK/AAB payloads pass the configured extractor-marker checks |
| Signing/alignment | APK signature verification confirms it is unsigned; both archives have no JAR signature entries; APK passes 16 KiB ZIP alignment check |

The source allowlist excludes the Dev root, extraction adapters/native module,
default pad loader, credentials and environment files. Third-party dependencies
install into Linux container storage from the lockfile. Audit extraction also
uses Linux storage so case-distinct APK resource names remain distinct.

## Artifacts

Stage: `data/play-build-20261017-182345-047-fa80b51c/`.

| Artifact | Bytes | SHA-256 |
| --- | ---: | --- |
| [Unsigned testing APK](../data/play-build-20261017-182345-047-fa80b51c/artifacts/soundboard-play-testing-unsigned.apk) | 39,360,002 | `30187493568790d05947342925bb869a14010de5dfff1bf7eb50e390106b62a6` |
| [Unsigned AAB](../data/play-build-20261017-182345-047-fa80b51c/artifacts/soundboard-play-unsigned.aab) | 30,387,537 | `343328e4ee64d6a1fe8be57a406cf1207a3ba055ef5253e39b2bba322ac503ef` |

The stage also contains source inventory/hashes, artifact checksums,
`release-info.txt` and native autolinking file/hash inventories. The artifacts
are unsigned and are not an installable or store-ready release.

## Remaining work

Follow the reviewed priorities in [the implementation plan](stimmyz-design-plan.md):
reliable creation and native recording/video first, then media sharing, gallery
art and backup/export/import. Reorder/move UI, advanced draft restoration and
other unfinished D-series acceptance remain open.

Native prebuild reports that `expo-system-ui` is needed to apply the configured
Android interface style globally. Play's React UI has its own persisted theme
selection, but native theme/picker behavior needs follow-up and device checks.
The build also reports upstream peer/deprecation warnings. None failed this
build. Full ELF page-alignment, dependency/notice inventory, policy/privacy
verification and physical-device testing are separate release checks.

Earlier setup failures came from read-only dependency directories; the current
pipeline installs dependencies into writable Linux temporary storage. The first
successful compile's audit hit Windows resource-name case collisions; Linux
audit extraction resolves that. The final pipeline exits successfully.
