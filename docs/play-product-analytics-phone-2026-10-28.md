# Play product analytics — private phone QA

Controlled test: 28 October 2026. Backend recheck and cleanup follow-up:
30 October 2026. This records private testing, not Play submission or release approval.

## Artifact and installation

- Package `dev.sarunas.soundboard.play`, version **1.0.30 / code 31**;
  ARM64, minimum API 24, target API 36. Device: Samsung SM_S928B, Android 16/API 36.
- Playback capture, optional product analytics and sanitized QA diagnostics were
  enabled explicitly. Ordinary builds keep analytics and diagnostics disabled.
- Canonical unsigned APK/AAB and native reports:
  `data/play-analytics-phone-build-20261028-r2/artifacts/`.
  The earlier r1 diagnostics configuration was superseded and never installed.
- Signed private APK:
  `data/analytics-phone-qa-20261028/artifacts/stimmyz-1.0.30-testing.apk`.
  SHA-256: `a52ee5836c4f06a234466a54745a8024d9b320389091f4116ab6484b1480d9d5`.
- Existing local testing certificate SHA-256:
  `b095e9fe2a6242050ef08117a90534e4629da9a35e0fdc095b04335dc32c020c`.
  Passwords, project token and installation IDs are not recorded here.
- In-place update from code 30 retained app UID 10492, private data path and
  first-install time `2026-10-17 18:34:03` as reported by Android. Library count
  was 20 before and after installation. No app-data clearing or uninstall occurred.
  This is not a byte-level media integrity or private-directory inode check.

## Controlled checks

Only a synthetic three-second WAV and disposable QA sounds/board were used.
No microphone/room recording, personal-media export or backup restore was performed.

| Case | Observation |
| --- | --- |
| Default/OFF | Privacy switch initially off. Synthetic import, trim, name, save and playback worked; no accepted event or dispatch diagnostic and no ingested project event at the OFF checkpoint. |
| Opt-in | Consent persisted, gate opened; six reviewed event types reached the actual EU project. |
| Restart while ON | Cold restart reported consent on; one installation ID across the six test events and zero person profiles. No raw ID was retrieved. |
| Online withdrawal | Gate closed immediately at 19:58:13 UTC; no withdrawal flush. |
| Offline withdrawal | Re-enabled while offline, attempted protected playback, observed transport failure, then revoked at 19:59:23 UTC. After reconnection no queued event was delivered. Wi-Fi and mobile data were restored enabled. |
| Post-withdrawal local use | Synthetic import/trim/save still worked; saved diagnostics show no new dispatch. |

Read-only backend rechecks on 30 October confirmed **six events, one distinct
installation ID and zero events after withdrawal within the controlled QA window**
(28 October, 19:30–20:30 UTC). Project-wide person profile count was zero.
Eight later creation/recording/save events on 29 October are outside this controlled
window and are not evidence of a withdrawal failure or part of the six QA rows.
During the 30 October follow-up the Library contained 22 sounds and a search
found no QA clips. The two newer non-QA items were preserved. Consent was on
when inspected and was switched off for the final QA state. A backend checkpoint
found zero events dated 30 October through the time of that check.

Final device cleanup confirmed no exact QA board or QA clips remained. A cold
force-stop/relaunch reported `consent=off` and `gate open=false`; the privacy
switch was unchecked. The original board selection was visible, Wi-Fi and mobile
data remained enabled, and our exact synthetic Downloads WAV/UI files were removed
and verified absent. The Library remained at 22; no non-QA item was deleted.
The sanitized local result is `data/analytics-phone-qa-20261028/PHONE_QA_RESULTS.md`.

| Event | Rows in controlled window | Reviewed finite properties |
| --- | --- | --- |
| `creation_started` | 1 | `source=file` |
| `usage_summary` | 1 | `sound_count_bucket=11_25`, `plays_bucket=0`, `boards_bucket=2_5` |
| `trim_viewed` | 1 | `source=file` |
| `sound_saved` | 1 | `source=file`, `clip_duration_bucket=0_5`, `artwork=default` |
| `board_created` | 1 | `grid=4x4`, `navigation=pages` |
| `protected_playback_used` | 1 | `repeat_mode=once` |

All six rows had GeoIP disabled. Final request diagnostics showed person processing
disabled and only allowlisted property keys. Project 324975 and its EU ingestion
host were confirmed through the connected PostHog plugin; the local public token
matched without printing it. [Project event explorer](https://eu.posthog.com/project/324975/activity/explore).
The six QA rows remain in the project as test evidence; no project data was deleted.

## Verification and limits

- Play tests: **223/223**; stage/build/plugin tests: **15/15**; strict TypeScript passed.
  Logs: `data/play-analytics-phone-{tests,build-tests,typecheck}-20261028.log`.
- Disabled/enabled production JS exports passed with 828 modules. Native APK/AAB
  built successfully; zip alignment and 16 KiB ELF alignment passed for 22 native
  libraries. This is not a run on a 16 KiB-page device.
- An early transport failure was logged, but the two affected events were present
  exactly once in PostHog. Delivery remains best effort, with no durable offline queue.
- Opening the system file picker triggered the first eligible background summary
  with zero plays. Summary counts are process-local samples, not complete daily totals.
- Device diagnostics plus backend results prove the bounded cases above. No full
  packet interception was performed; this does not prove silence of every network
  component or all flows. Failure races and payload rejection also have source tests.
- Microphone/device-capture analytics, gallery, backup/transfer, accessibility,
  longer-term D1/7/30 returns and broader device coverage were not physically
  established by this test. Later unsupervised recording events do not close those gates.
- Event retention, vendor arrangements, final audience declarations, support
  practices, public privacy policy and Data safety approval remain open.

Sanitized diagnostics and private UI evidence are retained under ignored
`data/analytics-phone-qa-20261028/`. UI dumps can contain personal sound/board
labels and must not be copied into public documentation. The connected PostHog
plugin supplied backend verification after Firefox automation could not enforce
the required browser URL policy. No public page, Play declaration, commit or push
was made by this QA.
