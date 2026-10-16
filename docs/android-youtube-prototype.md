# Android YouTube prototype

This private Android prototype is opt-in. Set `SOUNDBOARD_YOUTUBE_PROTOTYPE=1`
only in the isolated build workflow:

```powershell
.\scripts\build-youtube-prototype.ps1
```

The staged build uses a distinct `Soundboard Prototype` label and
`dev.sarunas.soundboard.prototype` package ID. Normal builds select a disabled
Expo module stub and do not resolve yt-dlp. The native implementation accepts
only a UUID and exact canonical YouTube watch URL, limits jobs to one at a time,
reads metadata before download, rejects live/upcoming or over-five-minute
sources, and checks request-directory output against a 32 MiB limit. It requests
only HTTPS M4A audio and performs no FFmpeg conversion. A 45-second metadata
timeout and four-minute job watchdog are best-effort; child-process behavior
must be verified on a physical device before treating cancellation or timeouts
as hard bounds. The wrapper buffers metadata output before its 1 MiB sanity
check, so that check is not a hard memory bound.

The result is a private-cache M4A URI, title, and duration. The JS editor copies
it into the existing local editing flow and then releases the native temporary
directory. The wrapper's process-ID stop API is called during cancellation, but
QuickJS/native child shutdown remains unverified on a physical device. No Imli
service, cookies, authentication, proxies, extractor workarounds, or
access-restriction bypasses are used.

The wrapper's `library` artifact is pinned to upstream 0.18.1 from Maven
Central. Upstream identifies the Android wrapper as GPL-3.0. The app also uses
`react-native-audio-api` 0.13.2, declared MIT in its package metadata; its
README points to separate WebKit and FFmpeg notices. The installed npm package
does not contain the referenced `LICENSE` or `THIRD_PARTY.md`; the upstream
[0.13.2 third-party inventory](https://github.com/software-mansion/react-native-audio-api/blob/0.13.2/THIRD_PARTY.md)
is available separately. A full license, notice, and corresponding source
inventory for the wrapper, yt-dlp, Python, QuickJS, FFmpeg, and other bundled
components is still required before any APK redistribution; this private
prototype has no production or distribution clearance. The wrapper license is
available at [the 0.18.1 source tag](https://github.com/yausername/youtubedl-android/tree/0.18.1).

## Build verification (2026-10-11)

The isolated release build succeeded. The staged artifact is
`data/youtube-prototype-20261011-143413-746-d238236a/app-client/android/app/build/outputs/apk/release/app-release.apk`.
Its APK is 42,141,366 bytes (40.2 MiB),
SHA-256 `B4CAE90EC3E79E0810879657FC856CD02AFEA6196DE32A8894E79FB8966CD249`.
`apksigner` verified its v2 signature; `zipalign -c -P 16 4` passed. The APK
contains package `dev.sarunas.soundboard.prototype`, label `Soundboard
Prototype`, min SDK 24, target SDK 36, and ARM64 only. The embedded Hermes
bundle is 1,455,064 bytes. Python and QuickJS are present; no FFmpeg CLI
executable was found, but native FFmpeg shared libraries are bundled through
`react-native-audio-api`. All 22 ARM64 ELF libraries have `LOAD` segments aligned to at least
16 KiB. The 73 app tests and TypeScript check passed, and normal app config was
confirmed deeply equal to the original `app.json` config. These checks do not
verify extraction or playback. The ordinary disabled-stub release compile also
passed; its `releaseRuntimeClasspath` contains Kotlin, annotations, and Pika,
with no downloader dependency.

## Samsung diagnostic follow-up (2026-10-11)

The initial prototype APK was installed and launched on a Samsung SM-S928B
(main-profile user 0; device `R5CWC206XDT`). The new **LOAD ON DEVICE
PROTOTYPE** button was present. An extraction attempt failed with the generic
message, and the original app logs did not reveal the native cause; the cause
is unconfirmed. The bundled yt-dlp version was verified as 2025.11.12. This is
an observed bundled version, not a claim that it is current or that it caused
the failure.

A diagnostics patch uses `ExpoCodedException` codes of the form
`ERR_SBYT_<INIT|METADATA|DOWNLOAD|OUTPUT>_<finite reason>` with safe
human-readable messages. Expanded download categories include HTTP 401, 403,
404, 429, other 4xx, 5xx, signature, JS challenge, PO token, missing tool, I/O,
Python, and generic extractor errors. They are selected from terminal error-line
evidence, with HTTP errors taking precedence over earlier warnings and Python
tracebacks used as a fallback. These categories are diagnostic clues, not
confirmed root causes. Raw stderr, URLs, tokens, and the underlying cause are
discarded and are not logged or exposed. The patch does not update the
extractor or add authentication, cookies, proxy, FFmpeg, or service behavior.

The first diagnostics APK build completed in 10m33s.
The staged artifact is
`data/youtube-prototype-20261011-150951-072-1abbfe6f/app-client/android/app/build/outputs/apk/release/app-release.apk`;
it is 42,148,374 bytes with SHA-256
`39B022F79761F384A65FABCFB7C548CAF08D02B45DFF78DDFCB2127BC0D6C71C`. Its v2
signature is valid and its certificate matches the initial installed APK. It
contains package `dev.sarunas.soundboard.prototype`, label `Soundboard
Prototype`, SDK 24/36, ARM64 only, and a 1,457,248-byte embedded bundle. Python
and `libqjs` are present; no FFmpeg CLI executable was found, but native FFmpeg
shared libraries are bundled through `react-native-audio-api`. The 16 KiB zipalign check
passed, and all 22 ELF libraries have `LOAD` segments aligned to at least 16
KiB. Four native `testReleaseUnitTest` tests passed with zero failures or
errors. The 78 app tests and TypeScript check also passed on that revision.
Installation via `adb install -r` succeeded; launching
`dev.sarunas.soundboard.prototype/.MainActivity` returned status `ok` (PID
21206). Both `dev.sarunas.soundboard` and the prototype package remain
installed for user 0. The latest ordinary disabled-stub compile also succeeded
in 49 seconds; its `releaseRuntimeClasspath` contains Kotlin, annotations, and
Pika only, with no downloader dependency.

On the first retry with this diagnostics APK, scoped `adb logcat` for prototype
PID 21206 recorded `ERR_SBYT_DOWNLOAD_EXTRACTOR` at 15:24:59. This confirms the
metadata stage completed and the failure occurred during audio download. It
does not establish the exact root cause or confirm an access restriction.
Successful retrieval remains unverified.

The expanded finite download-error categories are a subsequent revision. Its
79 app tests, TypeScript check, and normal-config deep equality check passed.
The staged release build completed in 9m06s at
`data/youtube-prototype-20261011-153136-514-14ca2edd/app-client/android/app/build/outputs/apk/release/app-release.apk`.
It is 42,151,062 bytes with SHA-256
`D4139B6455639215E78C6C6FB00C1F67A8E25387821C94A9480E311F53DCD9E7`. Its v2
signature is valid and matches the installed prototype certificate. It contains
package `dev.sarunas.soundboard.prototype`, label `Soundboard Prototype`, min
SDK 24, target SDK 36, ARM64 only, and a 1,457,444-byte embedded bundle. Python
and `libqjs` are present; no FFmpeg CLI executable was found, but native FFmpeg
shared libraries are bundled through `react-native-audio-api`. `zipalign -c -P 16 4`
passed, and all 22 ELF libraries have `LOAD` segments aligned to at least 16
KiB. All four staged diagnostic source files match the reviewed worktree, and
no `.env` files were staged. Its `testReleaseUnitTest` task passed in 57 seconds;
the XML report shows 7 tests, 0 failures, and 0 errors. `adb install -r`
succeeded, and launching `dev.sarunas.soundboard.prototype/.MainActivity`
returned status `ok` (PID 23263); scoped logs showed the main activity running
with no startup crash. Both the original and prototype packages remain
installed for user 0. No new ordinary disabled-stub compile was run for this
revision.

On retrying the expanded-diagnostics APK, scoped logs for PID 23263 at
15:46:16 again recorded `ERR_SBYT_DOWNLOAD_EXTRACTOR`. This confirms the
metadata stage completed and audio download failed, but the exact root cause
remains unknown. Successful retrieval and editing/playback remain unverified.

The report revision writes a bounded, best-effort-redacted report before
`safeError` conversion to the single fixed app-specific external-files path
`diagnostics/youtube-error-report.txt`, for USB retrieval. It is not a generic
private-internal-storage report or a cloud upload. No debug flag, permissions,
exported component, or audio behavior was added.

The report-revision staged APK build completed in 9m53s at
`data/youtube-prototype-20261011-155529-468-f3369a12/app-client/android/app/build/outputs/apk/release/app-release.apk`.
It is 42,155,606 bytes with SHA-256
`40D53CB2344ECD981632128730DDC5940A50D3B5203EFB8FF062B5CA23A6BC2C`. Its v2
signature is valid and uses the same certificate as the installed prototype.
It contains package `dev.sarunas.soundboard.prototype`, label `Soundboard
Prototype`, min SDK 24, target SDK 36, ARM64 only, and remains non-debuggable
with unchanged permissions. The embedded bundle, Python, and QuickJS are
present; no FFmpeg CLI executable was found, but native FFmpeg shared libraries
are bundled through `react-native-audio-api`. `zipalign -c -P 16 4` passed, and all 22
ARM64 ELF libraries have `LOAD` segments aligned to at least 16 KiB. The 79 app
tests and TypeScript check passed. The staged native XML reports 7 classifier
tests and 7 report tests, with zero failures or errors. Installation of this
APK via `adb -s R5CWC206XDT install -r` returned `Success`. Launching
`dev.sarunas.soundboard.prototype/.MainActivity` returned status `ok` (PID
25806). Both the prototype and ordinary `dev.sarunas.soundboard` packages
remain installed for user 0.

## Error report and likely cause (2026-10-11)

The report timestamp is 16:09:59 local (`timestampUtcMillis=1791724199060`); it
was retrieved from the Samsung phone over USB at 16:10:27 local. It records
stage `DOWNLOAD`, safe code `ERR_SBYT_DOWNLOAD_EXTRACTOR`, and the underlying
exception `YoutubeDLException: ERROR: 'NoneType' object has no attribute
'lower'`.

The same error was reproduced offline with the exact cached yt-dlp 2025.11.12
AAR and a synthetic empty fixture, with network access disabled. The Android
wrapper passes a truthy path through `--ffmpeg-location` even though the APK
has no FFmpeg CLI executable; its `react-native-audio-api` dependency does bundle
FFmpeg shared libraries. In this combination yt-dlp reports FFmpeg as available
with `basename=None`; the `m4a_dash` default fixup then reaches
`configuration_args` and crashes when it calls `exe.lower()`. This is a strong
likely explanation for the phone failure, but the synthetic reproduction does
not prove the exact phone container state or call trace.

A separate offline full `process_info` comparison confirmed that the default
`detect_or_warn` path with synthetic `m4a_dash` and a missing FFmpeg
`ContextVar` reproduces the same `NoneType.lower` failure. With `--fixup never`,
the comparison returns without that fixup. This validates the compatibility
change in the synthetic harness; it does not demonstrate successful phone
extraction.

Upstream addressed the bad `--ffmpeg-location` error in [yt-dlp PR #15104](https://github.com/yt-dlp/yt-dlp/pull/15104), merged on November 19, 2025,
after the version bundled in this prototype. The approved prototype-only
compatibility change is implemented in the prototype-only request factory as
`--fixup never`, disabling automatic repair. It does not add cookies,
access-restriction bypasses, authentication, proxies, FFmpeg, or an extractor
version update. The native XML reports 7 classifier, 7 error-report, and 2
request-factory tests passing with zero failures or errors. The 79 app tests,
TypeScript check, and normal-config deep equality check also passed. The staged
source has three changed files matching the worktree and no `.env` files.

The compatibility-revision APK build completed in 10m06s at
`data/youtube-prototype-20261011-162449-687-5e26e199/app-client/android/app/build/outputs/apk/release/app-release.apk`.
It is 42,155,634 bytes with SHA-256
`896D759A369587766B98B4A12B5BE3F6C7F27A097E6EDDF3136088C2164DB9EF`. Its v2
signature is valid and uses the same certificate as the prior installed
prototype. It contains package `dev.sarunas.soundboard.prototype`, label
`Soundboard Prototype`, min SDK 24, target SDK 36, ARM64 only, and remains
non-debuggable with unchanged permissions. The embedded bundle is 1,457,444
bytes; Python and QuickJS are present, with no FFmpeg CLI executable; native
FFmpeg shared libraries are bundled through `react-native-audio-api`. The 16 KiB
zipalign check and all 22 ARM64 ELF alignment checks passed. Installation via
`adb install -r` returned `Success`. Launching the prototype at 16:39:44 local
returned `Status: ok` (PID 28603); scoped startup logs showed the main activity
running without `SoundboardYoutube` or `AndroidRuntime` errors, with only a
`SafeAreaView` deprecation warning. Both `dev.sarunas.soundboard.prototype` and
`dev.sarunas.soundboard` are present for user 0; neither package was uninstalled
or data-cleared. Phone extraction, decoding, editing, and playback remain
unverified.

Remaining checks:

- Retry accessible Watch and Shorts links, each five minutes or less; confirm
  audio extraction, decoding, editing, saving, and playback in the local
  library/board.
- Try a longer source, an unavailable/sign-in-required source, cancellation,
  and extraction errors; confirm clear errors, cleanup, and no catalog changes.
- Repeat successful extraction and playback after restarting the app.

Build behavior targets the
[Expo SDK 57 docs](https://docs.expo.dev/versions/v57.0.0/) and Expo's
[local-module autolinking](https://docs.expo.dev/modules/autolinking/).
