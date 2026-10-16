# Private Android sideload release

This is a separate, private sideload build of StimyzApp (formerly Soundboard Private). It uses the stable application ID `dev.sarunas.soundboard.sideload`. Updates retain that app's library; the prototype has a separate package and library. It is not a Play Store or public-distribution release.

The build is deliberately split into two steps. From the repository root, build an unsigned APK:

```powershell
.\scripts\build-private-apk.ps1
```

An optional public manifest endpoint may be supplied with `-ManifestUrl https://...`. It must be HTTPS and must not include URL credentials, a query string, or a fragment. The build stages only allowlisted application/source inputs under ignored `data/private-release-*`; it does not copy `.env` files or signing keys. Docker receives `EXPO_NO_DOTENV=1` and blank editor API/token settings. The optional manifest URL is public runtime configuration, not a credential. The stage and unsigned artifact are intentionally retained for review and reproducibility. As in the existing prototype build, the container mounts the repository's ignored `node_modules` writable so Gradle can use/populate native build caches without a multi-gigabyte dependency copy; build-generated changes may appear under that ignored dependency tree, not in the staged source inputs.

The script targets `arm64-v8a` devices and Android API 24 or later (Android 7.0+). Devices without arm64 support are expected to reject installation as incompatible; the APK is not intended to install and then fail at runtime on an unsupported ABI. Both build and signing checks require the APK to advertise exactly `arm64-v8a`. They also check package identity, release debuggability, backup/cleartext settings, blocked permissions, APK alignment, and record the unsigned APK's SHA-256 and size. A successful build is still unsigned and cannot be installed as a normal release. No key is created automatically.

## Create and protect the signing key

Only after reviewing the unsigned build, run:

```powershell
.\scripts\sign-private-apk.ps1 -CreateKey
```

Keytool prompts interactively inside Docker for the key password and certificate details; do not put the password in chat, command arguments, environment variables, or a file beside the key. The key is stored at `data/signing/soundboard-private-release.jks`, which is ignored by Git. Before signing any APK, make an encrypted off-device backup of this key and keep its password separately in a password manager. Do not proceed without a recoverable backup. Losing the key or password prevents future signed updates to this application ID; reinstalling instead would lose this app's local data.

## Sign a reviewed build

Pass the exact unsigned artifact path printed by the build script:

```powershell
.\scripts\sign-private-apk.ps1 -SignUnsignedApk "<path-to>\soundboard-private-unsigned.apk"
```

The signing helper verifies that the artifact matches its recorded SHA-256 before signing. It prompts interactively for the keystore/key passwords, verifies the resulting signature and APK metadata, and writes `soundboard-private.apk` only after checks pass. It rejects debug/prototype certificates, a debuggable package, backup or cleartext traffic, blocked permissions, and a package/version mismatch. The signed APK's checksum is written separately. The helper does not install or distribute the APK.

The package identity and signing key must remain stable for updates. Increment `versionCode` for every update and keep `versionName` meaningful. Keep each release stage, its checksums, and the exact public manifest URL used with the release record. The optional manifest and YouTube/network functionality require connectivity at runtime; release configuration does not bundle editor credentials. Private builds suppress external error-report writes while preserving safe in-app error codes.

## Before calling it production-ready

This workflow establishes a private APK packaging and signing path, not production readiness by itself. Install the signed APK on the intended physical Android device and verify first launch, progress and cancellation UI, import/processing, playback, background/resume behavior, and upgrade over a prior signed private build. Confirm permissions and backup behavior on-device, and retain test evidence with the release record. The scripts do not perform these checks; current phone verification is recorded below.

The dependency/notice inventory is still incomplete. In particular, `react-native-audio-api` 0.13.2 includes FFmpeg `libavcodec`, `libavformat`, `libavutil`, and `libswresample`; this observation does not mean a downloader CLI is bundled. The npm package omits `LICENSE`/`THIRD_PARTY` files referenced by the README. The upstream [0.13.2 THIRD_PARTY inventory](https://github.com/software-mansion/react-native-audio-api/blob/0.13.2/THIRD_PARTY.md) is a primary source to review, not a substitute for checking the exact packaged sources and notices.

Until the dependency/source and notice handoff review is complete, treat any signed APK only as a candidate for private testing on your own phone—not as a cleared handoff, even for wider private distribution. Complete the inventory and include any notices required for the intended handoff. This document is not legal clearance and does not claim the inventory is complete. Public distribution or Play Store release would require a separate review and is outside this private sideload workflow.

## Verification record — 2026-10-15

The release-profile app suite passed 101/101 tests and the TypeScript check
passed. The signed APK at
`data/private-release-20261012-181835-460-2e5fa904/artifacts/soundboard-private.apk`
is 42,282,441 bytes with SHA-256
`DAB85ACCDF8611D0CB27C504E8FE9F053336B6660D4A821C3CB2320EAC424004`, matching
`SHA256-SIGNED.txt`. `apksigner` verified valid v2 and v3 signatures and a
non-debug RSA-3072 signing certificate with SHA-256 fingerprint
`467f0fa1246038a1ed190d71c427923e344c5a16611349e7acf43ab281320571`.
`zipalign`'s 16 KiB check passed. All 1,474 uncompressed APK payload entries
match the unsigned artifact by SHA-256; signing changed the APK container and
signature data only.

Binary APK inspection reports package `dev.sarunas.soundboard.sideload`,
version name `1.0.0`, version code `1`, min SDK 24, target SDK 36, and only the
`arm64-v8a` ABI. The APK is non-debuggable, has `allowBackup=false` and
`usesCleartextTraffic=false`, and has `extractNativeLibs=true`. On 2026-10-15,
the signed APK was freshly installed for user 0 on a Samsung SM-S928B
(ARM64, API 36); installation returned `Success` without replacing,
uninstalling, or clearing data. The original app, prototype, and sideload
packages were all still installed for user 0 at that time. The original app
and prototype packages were later removed at the user's request; only the
sideload package remains on the phone. A cold launch of the sideload package
returned `Status: ok` in 198 ms. Scoped startup logs showed no
AndroidRuntime crash and a SafeAreaView deprecation warning.

During startup, the configured manifest hostname failed DNS resolution on the
phone, although the PC resolved it. Wi-Fi and mobile data were enabled and
airplane mode was off on the phone; no network settings were changed, and the
cause remains unconfirmed. No playback, progress, import, cancellation,
offline, or upgrade acceptance is established by this install/launch check.
The user reports that the encrypted signing-key backup is saved in NordPass;
this backup was not independently verified. No keystore contents were
inspected.

The earlier unsigned APK remains at
`data/private-release-20261012-181835-460-2e5fa904/artifacts/soundboard-private-unsigned.apk`.
It is 42,151,722 bytes with SHA-256
`057A75BC926BFC7B37F2CDF389395CC8C315A88897A9F6B09EEA1548CBF08395`, matching
the staged `SHA256SUMS` record. Its artifact metadata reports the same package
and version. ZIP inspection found only `arm64-v8a`, a 1,466,416-byte embedded
JavaScript bundle, and no `.env` or key-like ZIP entries. Native payloads
include `libpython`, `libpython.zip`, `libqjs`, `libreact-native-audio-api`,
`libavcodec`, `libavformat`, `libavutil`, and `libswresample`; those libraries
do not by themselves establish that a downloader CLI or converter is bundled.
Its stage XML reports 16 native tests with zero errors or failures: seven
classifier tests, seven report tests, and two factory tests. All 22 ARM64 ELF
objects in that APK passed the 16 KiB `PT_LOAD` alignment check;
`libpython.zip.so` is a ZIP archive and was excluded from the ELF count. Its
staged merged manifest confirms package ID, `allowBackup=false`,
`usesCleartextTraffic=false`, `extractNativeLibs=true`, and no debug attribute;
that is not an independent manifest inspection of the APK binary.

Independent intended-phone checks for progress, playback, import,
cancellation, offline operation, and upgrade, plus the exact dependency/source
and notice inventory, remain pending. Keep L16 open; this record does not
establish production readiness or a cleared handoff.

## Keyboard-fix candidate — 2026-10-15

The user reported that the Editor clip-name field and Library rename field
were obscured by the keyboard. The fix implements keyboard avoidance and
focused-input reveal for both fields on Android and iOS, bounds scrolling to
the measured viewport, handles an already-open keyboard, cleans up stale
focus/keyboard measurements, resets on modal reopen, and dismisses the keyboard
from the Editor's Done action. Physical Android and iOS UI checks have not been
run. The combined app suite passes 112/112 tests and the TypeScript check
passes. No native audio processing, data-format, or dependency changes were
made.

The replacement build completed with Gradle `SUCCESS` in 7m57s. The unsigned
APK is at
`data/private-release-20261015-194925-280-09264fd0/artifacts/soundboard-private-unsigned.apk`,
42,156,202 bytes with SHA-256
`68B20CAAF99EE339F02C39B0FE542EB78BDB8A17771AE435182D88281A0A0D33`, matching
`SHA256SUMS`. Stage XML reports 16 native tests with zero errors or failures
(seven classifier, seven report, and two factory tests). Independent APK
inspection reports package `dev.sarunas.soundboard.sideload`, version `1.0.1`,
version code `2`, min SDK 24, target SDK 36, ARM64 only, and non-debuggable.
The APK's ZIP contains only `arm64-v8a`; the 16 KiB `zipalign -P 16` check
passed. The build helper's backup, cleartext, and permission checks passed.

The signed replacement APK is at
`data/private-release-20261015-194925-280-09264fd0/artifacts/soundboard-private.apk`.
It is 42,286,537 bytes with SHA-256
`32A5B75A66A9842EB288AF0E913813555E9BFD06730FC48F0B1BA5F5811F7894`.
`apksigner` verified v2 and v3 signatures using the existing certificate with
SHA-256 fingerprint
`467f0fa1246038a1ed190d71c427923e344c5a16611349e7acf43ab281320571`.
The 16 KiB `zipalign` check passed. The package remains
`dev.sarunas.soundboard.sideload`, version `1.0.1`, version code `2`, ARM64.

On 2026-10-15, `adb install -r --user 0` succeeded on the Samsung SM-S928B.
The installed version and code are `1.0.1` and `2`. The original
`firstInstallTime` (19:33) and `ceDataInode` (174033) remained unchanged; no
uninstall or data clear occurred. A cold launch returned `Status: ok` in
160 ms. Scoped startup logs showed only a SafeAreaView deprecation warning and
no AndroidRuntime error. The earlier manifest-host DNS failure did not appear
in this scoped sample; this does not establish that the DNS issue is resolved.
The keyboard interaction and saved-clip acceptance remain pending, and saved
clip contents were not independently compared or tested. Keep L17 and L16
open; the update-install check alone does not establish that clips remain
usable or that keyboard acceptance passed.

## Board ordering and navigation update — 2026-10-16

StimyzApp `1.0.3` (version code `4`) adds a persisted visual pad order,
drag handles and tap-to-move in Edit mode, and native safe-area padding around
the shared footer. Stable assignment slots, package identity, and signing
identity are retained. Legacy board snapshots need no migration.

The app suite passed 124/124 tests and TypeScript passed. The private APK build
completed in 9m43s, including 16 native tests without failures. The signed APK
is `data/private-release-20261016-214846-587-f7110bbb/artifacts/soundboard-private.apk`
(42,249,483 bytes), with SHA-256
`4671F8101EB51984287080AD7A2B6345AB6FBA8B290213101118EFBA09B52151`.
Independent signature verification confirmed v2/v3 signatures with the existing
certificate; the ARM64-only package, version, permissions, and 16 KiB APK
alignment checks passed.

`adb install -r --user 0` succeeded on the connected Galaxy S23 (SM-S911B).
Version `1.0.3` / code `4` was confirmed. The app's data inode `1217241` and
first-install time `2026-10-16 21:38:17` were unchanged. A dragged pad retained
its new position after force-stop and cold launch (187 ms); tap-to-move then
restored all 16 pads to their captured pre-test order. Footer bounds were
`y=2013..2196` on Board, Editor, and Library, above the phone's three-button
system navigation area. Screenshots and hierarchy dumps are retained under
ignored `data/stimyz-layout-check/`. Scoped app error logs were empty after
these checks.

The phone library was empty during this check. Local-clip ordering, missing
slots, duplicate assignments, capacity, and failed writes have automated
coverage. Long-board edge scrolling, rotation, gesture navigation, and iOS
were not verified on devices. Earlier L16/L17 acceptance items remain open.
