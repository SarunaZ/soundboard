# StimmyzApp — Device Audio Capture Proof of Concept

**Astra engineering handoff · 19 October 2026**  
**Scope:** isolated prototype + real-device compatibility tests. **Do not redesign the application or modify unrelated screens.**  
**Priority:** optional enhancement, not a launch dependency.  
**Owner:** StimmyzApp developer. **Implementation/testing owner:** Astra.

## 1. Executive brief — what we are trying to achieve

StimmyzApp is a personal, offline-first soundboard for short, memorable sounds, office quotes, vocal-stim favorites, and memes. It already has (or is being built around) a common **Source → Trim → Customize → Save → Play** workflow, a library, and personalized boards.

The pain point: a user hears a funny 2–5-second moment **inside another phone app** and wants to turn it into a soundboard button, without hunting for a downloadable video or audio file.

**Experiment:** add **Record device audio** as a third, entirely optional source beside **Record microphone** and **Import audio/video**. Use Android's supported **Audio Playback Capture API** to record *permitted playback audio* from another app while the user plays it. Bring the captured recording into the same existing trim editor.

**This experiment is not:** a YouTube downloader; a `yt-dlp` integration; a tool to bypass protected content; a system-wide interception service; microphone recording; a new soundboard UI; a promise to capture audio from every app.

### Desired experience

1. From StimmyzApp's existing **Create sound / Source** view, select **Record device audio**.
2. Explain briefly: “Capture audio playing in compatible apps. Android will ask for recording permission. Some apps may block capture.”
3. User explicitly grants the necessary Android permissions and media-projection consent.
4. Start a user-visible recording session with a persistent **Stop** action in a foreground-service notification; user switches to a media app and plays a moment.
5. User taps **Stop**; recording and projection end and resources are released.
6. If useful audio was captured, open existing **Trim** with a playable waveform → **Customize** (name, optional artwork) → **Save** → the new sound is available immediately and offline.
7. If no usable audio is detected, **do not silently save an empty clip**. Explain that there may have been silence or the source app may restrict capture; let the user retry, use the microphone, or import a file.

**Important:** Use the existing Stimmyz visual design and global creation route from the current app/repository. Do not revert to the older handoff prototypes. Preserve the pinned-first Quick Add pad, large bottom navigation icons, edit-only Quick Add arrow, and pad/Library overflow menus. This POC should not alter those interactions.

## 2. Critical Samsung observation — test, do not assume

The owner has confirmed **Samsung's built-in screen recorder can record YouTube with “Media sounds.”** Samsung documents a media-audio screen recording option; this is a useful positive control.

This does **not** establish that a third-party app can capture the same YouTube audio. Android allows source apps to select different playback-capture policies, including **ALLOW_CAPTURE_BY_SYSTEM** (available to system components, but not normal third-party apps). Samsung's built-in recorder may use system/vendor privileges unavailable to StimmyzApp.

**Required A/B test on the same Samsung handset and same source clip:**

- **A. Samsung native screen recorder:** select *Media sounds*, record 5–10 seconds of YouTube playback, confirm audio is present in its output.
- **B. Stimmyz prototype:** using only Android's documented third-party playback capture APIs, record the same 5–10 seconds under similar conditions, then inspect/play the resulting file.
- If A succeeds and B is silent, report the divergence. **Do not attempt root access, privileged app signing, DRM circumvention, accessibility abuse, hidden APIs, microphone substitution, or file extraction from the Samsung recorder.**
- Document handset model, Android version, One UI version, source-app version, and whether audio is present. Do not state “YouTube is universally supported/blocked” based on one device.

**Separate fallback worth considering for the *future*, not required for this POC:** on Samsung phones, users can make a permitted screen recording via the native recorder and import/share the resulting **video file** into StimmyzApp, where the existing video-import audio-trim path extracts the sound. This is **not** automatic internal audio capture, and users still need appropriate rights for the media.

## 3. Platform constraints Astra must respect

- **Minimum API for this feature:** Android 10 / API 29. On earlier Android versions, hide/disable this source with a clear explanation; preserve microphone and import workflows.
- Use `MediaProjectionManager` for explicit user consent and `MediaProjection` with `AudioPlaybackCaptureConfiguration` and `AudioRecord` for permitted device playback. Do **not** request microphone audio as a substitute. Android requires `RECORD_AUDIO` permission even when using playback capture; explain that permission accurately in UX.
- Capturable playback must meet Android's allowed `AudioAttributes` usages (media/game/unknown), capture policy, user-profile rules, and other platform constraints. Voice calls and other protected usages are not target sources.
- Source apps can prohibit third-party capture. A source may return silence without exposing the exact reason. Treat “blocked” as a **possible diagnosis**, not a conclusively identifiable state.
- Use a **user-started foreground service** with `mediaProjection` service type and ongoing recording notification. For modern targets, correctly declare `FOREGROUND_SERVICE` and `FOREGROUND_SERVICE_MEDIA_PROJECTION` plus other relevant permissions; handle API 34+ single-use consent/session rules and `MediaProjection.Callback.onStop()`.
- Do **not** add `SYSTEM_ALERT_WINDOW` or floating overlay permission in this POC. Notification Stop is enough. If a floating control is desired later, assess separately.
- Use only the permissions needed. On Android 13+, account for notification permission/foreground-service notification behavior. Record no screen video and save no images or other apps' private content.
- Do not start silently at boot, auto-resume after force stop, or keep a perpetual audio monitor. Record only after an explicit user request. Establish a sensible maximum session duration (e.g., **120 seconds** in this prototype, configurable) and ensure the service can be stopped promptly.
- Different Android releases may present a full-screen vs single-app sharing/capture choice. Test the actual system consent UX and audio capture behavior; do not assume every option works the same way.

### Suggested implementation boundaries (adapt after repository inspection)

```text
CreateSound / Source
    ├── Import file                 [existing]
    ├── Record microphone           [existing/planned]
    └── Record device audio         [NEW, optional]
            ├── Consent / permission UX
            ├── DeviceAudioCaptureController
            ├── MediaProjection foreground service
            ├── AudioRecord / playback capture config
            ├── Temp recording / validity checks
            └── CaptureResult(fileUri, durationMs, sampleRate, ...)
                          ↓
             Existing waveform trim & preview
                          ↓
               Existing customize & save
                          ↓
                Existing board / library
```

- Audit and **reuse** the existing audio file schema, waveform decoder, encoder, app-private storage, and cleanup logic. If the editor takes a URI/file instead of a typed result, adapt to that contract rather than forcing a new data model.
- For a POC, lossless short WAV/PCM output is acceptable if the current editor supports it. Confirm actual audio format and playback, don't rely on filename extension alone.
- Use explicit capture states: `idle → requesting-permission → preparing → recording → stopping → ready | failed | cancelled`. Guard against double-start and double-stop.
- Errors must leave both StimmyzApp and Android's media-projection session cleanly stopped.
- Avoid identifying or logging the user's active apps, titles, URLs, raw samples, or private content. Debug logs can include capture duration, sample rate, frames recorded, and peak/RMS estimates.

## 4. Acceptance criteria — feature behavior

**Astra may only mark an item PASS if actually verified.** Mark `NOT TESTED` if access to an Android device is unavailable. Never fabricate source-app compatibility.

| ID | Acceptance criterion | Evidence |
|---|---|---|
| AC-01 | The new “Record device audio” entry is available from the existing sound creation screen on Android API 29+, without affecting existing sources. | UI screenshot + supported OS details |
| AC-02 | Explicit Android consent occurs before each session; rejecting consent does not crash, start recording, or create a file. | Manual test + logs |
| AC-03 | No microphone signal is mixed into the recording; the feature captures only playback that the OS permits. | Playback test with room noise + capture settings |
| AC-04 | A known-compatible local test/player app configured for `ALLOW_CAPTURE_BY_ALL` and `USAGE_MEDIA` records clearly audible audio. | Recorded test fixture + comparison |
| AC-05 | Recording continues when user leaves StimmyzApp for the source app, with a visible persistent notification and working Stop action. | Real-device test |
| AC-06 | Stopping returns a playable temporary audio file, accurate duration, and a waveform visible in the existing Trim UI. | Playback + trim screenshot |
| AC-07 | Trim → optional Customize → Save creates one sound that plays offline from the Library and can be assigned to a board. | End-to-end test |
| AC-08 | Empty/silent recording produces a useful, non-accusatory message and is not silently saved as a valid sound. | Silent/blocked-source test |
| AC-09 | Screen lock, permission denial, MediaProjection revocation, interruption, app process death, repeated sessions, and rapid double-taps stop safely and clean temp files. | QA matrix + logs |
| AC-10 | Android 14+ foreground-service requirements and projection lifecycle are satisfied (no token reuse). | Modern device test + code inspection |
| AC-11 | No overlay permission, `yt-dlp`, hidden API, privileged API, screen video capture, or DRM workaround is introduced by this feature. | Diff/dependency review |
| AC-12 | Existing mic/file import, soundboards, six themes, pad overflow menus, and **Quick Add pinned first** continue working unchanged. Its edit-only dropdown arrow behavior is preserved. | Regression checks |
| AC-13 | If a real supported test device is available, Astra runs the Samsung native-recorder vs Stimmyz capture A/B test on YouTube and reports results with device/app versions. | Compatibility report |

### Notes on audio validation

- Inspect peak/RMS levels and non-zero frame counts, but **non-zero file size does not prove useful audio**.
- A quiet signal may be intentional. “No meaningful signal detected” is more accurate than “app blocked recording.” Allow review/retry; choose a threshold empirically.
- Verify basic sample rates/channels and end-to-end playback with a recognizable **rights-cleared** synthetic tone or personally created test recording.
- Verify that recorded output can be imported/truncated if the capture lasts beyond the desired soundbite interval.

## 5. Test matrix — compatibility research (Astra must execute if device available)

At minimum, test on the actual Samsung handset, and another non-Samsung Android device **if available**. Log whether Stimmyz records **audible usable audio**, not merely whether the API returned samples. No assumption of success for YouTube/TikTok/etc.

| Source / scenario | Expected classification | Test outcome to record |
|---|---|---|
| Controlled test player with ALLOW_CAPTURE_BY_ALL | Baseline must pass | Audible audio, waveform, saved clip |
| Controlled test player with ALLOW_CAPTURE_BY_SYSTEM or NONE | Expected third-party capture restriction | Silence/failed capture, safe UX |
| YouTube Android app / Shorts | Unknown | Samsung-native result **vs** Stimmyz result |
| YouTube in Chrome | Unknown | Capturable / silent / failure |
| TikTok app | Unknown | Capturable / silent / failure |
| Instagram Reels | Unknown | Capturable / silent / failure |
| Local media player | Depends on player policy | Capturable / silent / failure |
| Known compatible game | Likely but not guaranteed | Capturable / silent / failure |
| Source muted/no playback | No useful signal | Clear empty-audio handling |
| User cancels projection consent | No recording | No crashes/files/session leakage |
| MediaProjection stopped from Android system UI | Session terminates | Proper cleanup and message |
| Lock phone / rotate / change audio route | OS/device dependent | Capture & lifecycle outcome |

**Capture per test:** device manufacturer/model, Android API level, One UI version if Samsung, Stimmyz build/target SDK, tested source/app version, test duration, capture method, consent selection (where relevant), whether headphones/Bluetooth were connected, audible audio Y/N, peak/RMS if useful, issue notes, logs/screenshots (non-sensitive), and PASS / FAIL / BLOCKED / NOT TESTED.

**Don't conflate source policy with implementation bugs.** If the controlled source fails, fix the prototype before interpreting real-world app results.

## 6. Privacy, copyright, and store-policy boundary

- This POC is an **Android-supported, user-consented recorder for audio that source apps permit to be captured**, not an authorization to reproduce every sound. Removing `yt-dlp` changes the technical integration but does **not** waive copyright or YouTube/TikTok terms of service.
- Market it as **“Record device audio from compatible apps”** rather than “Record any YouTube Short” or “bypass protected sources.” No copyrighted source logos, recordings, or characters in demo assets without rights.
- Keep recordings on-device by default. Do not upload source audio, log the recording content, or build sharing/monetization in this POC.
- Don't intercept telephone calls, voice chats, or privileged/DRM-protected audio; don't attempt to overcome Android restrictions.
- Before a Play Store release, review permissions, privacy disclosures, Data Safety declarations, foreground-service declarations, and Google Play's intellectual-property policy. Store acceptance is not guaranteed by use of a public Android API.
- For compatibility demos, use owner-created or otherwise properly authorized test audio. Avoid distributing copyrighted recordings in QA artifacts.

## 7. Astra deliverables and reporting format

**D1 — Repo audit + short plan (before implementation).** Identify current framework/Android target, audio pipeline, state/storage, creation route, and file-level planned changes. Keep scope isolated; ask questions only when truly blocking.

**D2 — POC implementation.** Working optional third capture source with native permissions, visible stop, local temporary file, and handoff into the existing editor. Implement no new soundboard design.

**D3 — Tests.** Automated tests for state/lifecycle/file handling where feasible, plus real-device execution of Section 5 where access exists. Provide reproducible manual test steps when the device is inaccessible.

**D4 — Results report** in `DEVICE_AUDIO_CAPTURE_RESULTS.md`, with this exact structure:

```markdown
# Stimmyz device-audio capture test results
Date:
Commit / branch:
Build variant / targetSdk:
Devices + Android / One UI versions:

## Acceptance criteria
| Criterion | PASS / FAIL / BLOCKED / NOT TESTED | Evidence / notes |

## Source compatibility
| Source (app/version) | Samsung recorder | Stimmyz POC | Notes |

## Known restrictions / crashes

## Permissions / privacy observations

## Go / No-go recommendation
- Ship as optional source? Yes / No / Further testing needed
- Supported devices/versions:
- Sources empirically confirmed to work:
- Sources empirically confirmed not to work:
- Remaining unknowns:
- Next minimal change:
```

**Do not report “passed on Samsung” or “YouTube capture works” without a recording actually obtained through the Stimmyz test build.** If Astra cannot access real hardware, stop at a compiling prototype and a detailed runnable test procedure; report compatibility **NOT TESTED**.

## 8. Implementation sequence and stop/go gates

**Gate 0 — Audit (no changes):** Inspect repository, confirm feature can be added without destabilizing current media pipeline.

**Gate 1 — Technical feasibility:** Capture a rights-cleared tone from a controlled source with Android API on a physical device and play it back from a local temporary file. If this fails, fix native capture before touching the UX.

**Gate 2 — Product connection:** Source → capture session → Stop → existing Trim → Save → offline playback. Verify no regression to file import/microphone.

**Gate 3 — Compatibility:** Samsung native recorder vs Stimmyz A/B tests, YouTube/Chrome/TikTok/other-source matrix, source-restriction diagnostics, modern Android lifecycle.

**Gate 4 — Decision:** Recommend optional rollout only if controlled capture passes, failure UX is clear, lifecycle/permissions are safe, and useful sources are confirmed. Otherwise leave behind an isolated prototype and factual test report; do not block the core app launch.

## 9. Message to Astra (copy/paste)

> Please implement a **small, isolated device-audio capture proof of concept** in the existing StimmyzApp repository, following this handoff. First inspect the repo and propose file-level changes. Use Android's official Audio Playback Capture / MediaProjection APIs to record permitted on-device playback into the existing trim workflow. This is an **optional third input** beside microphone and local media import. Do not use `yt-dlp`, microphone substitution, floating overlays, special privileges, bypasses, or major UI redesigns. Keep Quick Add fixed first and its configuration arrow edit-only. Test with a controlled capturable media source, and on a Samsung device compare the built-in recorder's YouTube result against **Stimmyz's own capture result**; document differences and all failures honestly. Produce `DEVICE_AUDIO_CAPTURE_RESULTS.md` with actual evidence. If no physical device is available, clearly mark real-device tests `NOT TESTED` and provide repeatable instructions.

## 10. Primary references (verify against current Android targets)

- Android Developers — Capture video and audio playback: https://developer.android.com/media/platform/av-capture
- Android API — AudioPlaybackCaptureConfiguration: https://developer.android.com/reference/android/media/AudioPlaybackCaptureConfiguration
- Android API — AudioAttributes / capture policies: https://developer.android.com/reference/android/media/AudioAttributes
- Android Developers — Media projection: https://developer.android.com/media/grow/media-projection
- Android Developers — Required foreground-service types: https://developer.android.com/about/versions/14/changes/fgs-types-required
- Samsung — Screen recording / media audio: https://www.samsung.com/uk/support/mobile-devices/how-to-record-your-screen-on-your-samsung-galaxy-device/
- Google Play — Intellectual property policy: https://support.google.com/googleplay/android-developer/answer/9888072

---

**Engineering definition of success:** The prototype captures at least one authorized external playback source on a real Android device, trims/saves it in the existing app, and truthfully documents compatible and blocked sources—**without compromising Android capture restrictions or existing StimmyzApp features**.
