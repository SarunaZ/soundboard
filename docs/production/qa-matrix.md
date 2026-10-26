# Production QA matrix

Device/runtime rows below count as passed only when a dated run, exact artifact/version and tester notes are attached. The unsigned r3 APK was not installed directly; an owner-authorized local test-key copy was installed in place on one Samsung Galaxy S24 Ultra for bounded upgrade, import/trim, playback, loop, and lifecycle checks. See the [phone QA record](PHONE_QA-2026-10-25.md). This is not full-flow or Play-distributed install QA.

| Device class | Device / Android API | Candidate/versionCode | Scenarios | Result / evidence |
|---|---|---|---|---|
| Android 16 emulator | `sdk_gphone64_x86_64`, API 36, 4 KiB pages | r3 APK, version 1.0.28/code 29 | Install app and test UI flows, import/trim/playback, board changes and permissions | Pending app install/full-flow test. The standalone FFmpeg probe decoded seven synthetic fixtures but is not an app install test. |
| r3 APK/AAB artifact review | APK/AAB, version 1.0.28/code 29, unsigned | [Recorded r3 artifacts](../../data/play-readiness-security-20261025-r3/artifacts/) | Manifest/permission gates, dependency graph, FFmpeg package hashes, native ELF alignment and APK zip alignment | Passed; see [verification snapshot](VERIFICATION-2026-10-25.md). This row covers artifact structure, not runtime behavior. |
| Lower-end Android phone | TBD | TBD | Cold start, import, trim/save, large library, playback latency, low storage | Pending |
| Samsung phone | Galaxy S24 Ultra `SM-S928B`, Android 16/API 36, 4,096-byte pages | Local test-key copy of r3, version 1.0.28/code 29 | In-place upgrade/data preservation, synthetic WAV and M4A/AAC import/trim/save, microphone, preview/loop, stop, protected hold, background lifecycle, empty-file rejection, ZIP backup/restore | **Partial; mixed results.** Upgrade preserved app UID, 12 original Library sounds, existing boards and theme. WAV and M4A/AAC imported through SAF and opened Trim; microphone capture was previewed, user-confirmed, and saved. Loop and board/grid state persisted across force-stop/relaunch; stop/background left no active app AudioTrack and return did not autoplay. Empty synthetic WAV was rejected without saving a broken clip. Initial ZIP restore failed; the r4 follow-up restored the deleted QA items after the journal fix. Routing, calls and wider device coverage remain open. See [phone QA record](PHONE_QA-2026-10-25.md). The tested r3 package is capture-off; r4 device-capture evidence is in the follow-up row. |
| Samsung phone, r4 follow-up | Galaxy S24 Ultra `SM-S928B`, Android 16/API 36, 4,096-byte pages | Locally test-key-signed r4 all-sources APK, version 1.0.28/code 29 | Install/update, projection consent, controlled synthetic capture, stop/notification/background lifecycle, ZIP restore regression | **Passed, bounded flows; cleanup verified.** In-place update preserved app UID. All three source actions appeared; consent cancellation left no projection. A permission-free synthetic fixture was captured to the two-minute cap, opened in Trim, and a six-second result was saved after the user confirmed the ringtone tones audible. A separate fresh session stopped through Android's notification action and closed the projection; a no-usable-audio result saved no silent clip. The r3 backup restored the removed AAC QA clip and QA board; a subsequent deletion transaction passed. QA data and fixture were removed, original Library/boards remained, volume was restored, and no projection/service/AudioTrack remained. See [phone QA record](PHONE_QA-2026-10-25.md). |
| Pixel / Android reference | TBD | TBD | Permission denial/revoke, SAF, insets, offline flow, process death | Pending |
| Android 16 KB page-size device/emulator | Not available in current test inventory | TBD | Install, native DSP playback/import and crash inspection | Pending; current API 36 emulator uses 4 KiB pages |
| Play-distributed signed AAB install | Internal track TBD | TBD | Install/update, permissions, minification, data retention, rollback | Pending |

## Per-candidate regression checklist

- Fresh install: empty board/Library states, first-use choices, permission rationale and denial recovery.
- Import MP3/M4A/WAV/AAC and malformed/empty/oversized/unsupported files; cancel and low-storage paths.
- Trim bounds, save interruption, app kill/reopen, repeated playback, stop, audio focus, Bluetooth/wired/speaker routing and safe gain.
- Create/rename/reorder/delete boards and pads; confirm intended clip deletion only; verify large text, TalkBack and 48 dp targets.
- Gallery selection, revoked URI, missing thumbnail, offline relaunch and cleanup of private media.
- Upgrade from each supported beta/schema; preserve user data and recover safely from partial files.
- Verify merged manifest, permissions, exported components, cleartext, debug flags, backup rules and actual target SDK.
- The final candidate must include device-audio capture alongside file import and microphone recording. Build and test that candidate with the required projection permissions/service, foreground notification and explicit OS consent; the historical r3 APK used for bounded phone QA is capture-off and does not satisfy this requirement.
- Test online/offline/flaky network; inspect actual outbound calls and data payloads.
- Run 3–5 outside-user sessions without coaching; document blockers and changes.
- Accessibility scanner and manual TalkBack; reduced motion, system font scaling and large display.
- If capture is ever in scope: Samsung and Pixel, Android versions, app switching, revocation, lock, calls, Bluetooth, repeated sessions, silence, notification stop and physical device QA.
