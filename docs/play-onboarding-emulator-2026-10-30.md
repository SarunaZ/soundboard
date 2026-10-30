# Two-button onboarding: emulator flow and UI verification

Verified 30 October 2026 against the Welcome and Privacy PNGs and interactive markup in `Stimmyz_Two_Button_Onboarding_Prototype_and_Astra_Handoff_2026-10-30.zip`.

## Test environment

- Android 36, Pixel 8 AVD `Soundboard_API_36`, x86_64, serial `emulator-5554`.
- Separate package `dev.sarunas.soundboard.play.onboardingqa`, labeled **Stimmyz Onboarding QA**. The original Play package and its data were left intact; no physical phone was used.
- QA debug APK built from the verified source stage with locally cached FFmpeg 8.0.3 libraries whose complete checksum manifest was checked. The normal release build script was not weakened to bypass the failed upstream download.
- APK: `data/onboarding-emulator-qa-20261030/artifacts/stimmyz-onboarding-x86_64-debug.apk`, SHA-256 `f12cd2eed5b98d20746777feceb4bd0cceab54e7d252c5d3fec3e353796fbdcf`.
- This APK loads **current workspace source through Metro**, with dotenv loading disabled and analytics unavailable. The screenshots include UI refinements made after the native APK build; the APK alone does not contain those JavaScript changes and requires Metro. Original native build/cache provenance is in the artifacts directory.

## Results observed on the emulator

| Check | Result |
| --- | --- |
| Fresh QA install | Welcome appears, followed by Privacy; no permission or age prompt. |
| No preselected answer | Privacy has two explicit buttons and no consent switch. Before a choice, neither onboarding nor analytics storage directory existed. |
| Privacy Back | Returns to Welcome without saving a choice. |
| Continue without analytics | Opens Soundboard; writes `{version:1,completed:true}` separately from `{version:2,enabled:false}`. |
| Cold process restart after decline | Skips onboarding and opens Soundboard. Saved OFF consent remains. |
| Settings privacy state | OFF and unavailable, with readable disclosure and policy control. |
| Share while activation unavailable | Opens the same board, shows the truthful unavailable notice, saves completion and OFF consent. Analytics directory contains only `consent.json`, without an installation identifier. |
| Existing navigation | Board, Editor source screen and Library empty state remain reachable and visually intact. This was a navigation/layout check, not a new recording/playback quality test. |
| Vanilla and Grape | Corrected Welcome/Privacy reviewed against the supplied references, with both choices visible at normal scale. |
| Large text and narrow viewport | Font scale 2.0 and density 560, about 309dp wide. Welcome and Privacy scroll; action buttons grow for wrapping labels; both final choices and their footer remain reachable. |
| Back/forward after scrolling | Android Back returns to the top of Welcome; pressing its action after scrolling opens the top of Privacy. |
| Display restoration | Restored the original font scale 1.0 and original density override 400 (physical density 420). |

Onboarding replay used only the isolated QA package's synthetic completion marker, preserving prior verified markers under backup filenames. User media and the original Play app were not cleared.

## Corrections made during the review

All product changes in this verification pass are in `app-play/src/ui/OnboardingFlow.tsx`:

- Matched the soft hero background, eight pad gradients, logo proportions, decorative accents, solid accent actions and simpler disclosure rows to the handoff.
- Replaced the disconnected shield strokes with a continuous shield outline and centered check.
- Added explicit image height: relying on asset aspect ratio alone allowed the native image's intrinsic dimensions to expand the hero beyond the screen.
- Let step text wrap while keeping progress bars within the viewport.
- Reserved layout space for the Welcome arrow so it cannot overlap enlarged button text.
- Kept decorative mini-board text and emoji at illustration scale while allowing actual onboarding copy to scale.
- Gave the two ScrollViews separate keys so native scroll offsets cannot carry between steps.

The owner's final refinement uses white text on both filled onboarding buttons, including the Welcome arrow and saving label, matching the design. The outlined decline button keeps its themed text. White text was confirmed on the emulator Privacy screen and strict TypeScript passed after the change. Native status/navigation chrome, emoji and geometric icons differ from the browser rendering. Production copy explains that analytics are unavailable rather than retaining the mockup-only disclaimer.

## Evidence and checks

Screenshots under `data/onboarding-emulator-qa-20261030/artifacts/`:

These captures document the full layout review before the final white-text refinement; their filled-button text color is historical.

- [Vanilla Welcome](../data/onboarding-emulator-qa-20261030/artifacts/vanilla-welcome.png) and [Privacy](../data/onboarding-emulator-qa-20261030/artifacts/vanilla-privacy.png).
- [Grape Welcome](../data/onboarding-emulator-qa-20261030/artifacts/grape-welcome.png) and [Privacy](../data/onboarding-emulator-qa-20261030/artifacts/grape-privacy.png).
- [Large-text Privacy top](../data/onboarding-emulator-qa-20261030/artifacts/grape-privacy-large-text.png) and [both large-text actions](../data/onboarding-emulator-qa-20261030/artifacts/grape-large-text-choices.png).

After the final UI fixes, **234/234 Play tests** and strict TypeScript passed in Docker. Logs: `data/onboarding-emulator-qa-20261030/final-tests.log` and `final-check.log`. `git diff --check` passed. Screenshots and logs are ignored local QA artifacts.

Initial debug setup required a working IPv4 Metro listener and a cold app restart after a failed first launch. A separately loaded `expo-file-system` development chunk also delayed first render. Thread diagnostics found idle queues rather than an audio deadlock; no product startup fix was inferred from that setup failure. Embedded release startup timing was not measured.

Remaining coverage: seven other themes were not individually screenshot-reviewed, TalkBack spoken output was not tested, and no new physical-device, audio-quality, backup-operation or PostHog wire audit was performed. The selected live privacy policy was not reviewed. Final UI was verified through Metro, not a newly packaged release APK/AAB.

The emulator is left running with the QA app on **Vanilla Privacy** at the original display settings, and Metro remains available. No commit, push, public release or analytics activation was performed.
