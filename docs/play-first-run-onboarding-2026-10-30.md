# Play two-button first-run onboarding

Implemented 30 October 2026 from `Stimmyz_Two_Button_Onboarding_Prototype_and_Astra_Handoff_2026-10-30.zip` in Downloads. See the [approved implementation plan](play-first-run-onboarding-plan-2026-10-30.md).

## Behavior

- Welcome introduces recording, importing and playback using the packaged logo and a decorative eight-pad board. Let's get started opens Privacy.
- Privacy has two explicit choices: **Share usage analytics** and **Continue without analytics**. There is no onboarding switch or preselected answer. Both choices open the same app.
- Back on Privacy returns to Welcome. No Android permission prompt, account or age questionnaire is introduced. The policy opens externally at `https://stimmyz.app/privacy/`; opening it never saves a choice. Its published content was not verified in this implementation pass.
- Completion is a strict versioned marker in `Paths.document/play-onboarding/completion.json`, separate from media, portable preferences and analytics consent. Valid completion skips onboarding on subsequent starts and updates. Existing testers without the new marker see the flow once; their media and settings are preserved.
- Missing/corrupt/unreadable completion starts Welcome. Consent/storage failures leave analytics OFF while allowing app use. An unsuccessful completion write is reported, and the flow may reappear on the next start.
- Finalization accepts an explicit boolean, deduplicates conflicting simultaneous taps, closes analytics before writing completion, and checks effective activation rather than assuming a resolved grant means ON.

## Analytics boundary

The shipped device analytics service has an explicit closed activation policy, including builds with the previous analytics flag/token. This is intentional: the approved plan leaves eligibility, the finite beta window, finalized event properties, identifier policy and vendor disclosures unresolved. The new UI explains that sharing is unavailable in this build. Share therefore currently finishes with analytics OFF; it does not save a pending ON preference for future activation.

Consent format is now v2. Legacy v1 ON records cannot activate analytics. The OFF path removes the old installation identifier; no SDK or identifier is constructed on decline. Settings uses the same service, disclosure and policy URL, and keeps its grant switch unavailable under the closed policy. Existing generic/injected analytics tests still exercise successful activation and revocation independently of the shipped device policy.

This change does not enable the proposed three-event beta. The existing event producers/schema remain behind the closed device gate. A later activation change must resolve the [owner's beta decisions](production/BETA_PRIVACY_DECISIONS-2026-10-30.md), narrow and verify the actual transport contract, and reconcile public disclosures before collection.

## Implementation

- `app-play/src/onboarding/`: strict marker storage, serialized finalization coordinator, centralized privacy disclosure and policy-link helper.
- `app-play/src/ui/OnboardingFlow.tsx`: native, themed Welcome/Privacy views with scrollable content/actions, growing touch targets, accessibility headings/focus, Back handling and reduced-motion styling.
- `app-play/App.tsx`: startup completion gate before rendering the normal shell; local library loading/recovery remains independent.
- Analytics lifecycle/storage: v2 consent and service-level activation policy; Settings shares the same consent authority.
- Play staging/build allowlists include the new onboarding tree without expanding the permitted shared/native source boundary.

Implementation was delegated to a `gpt-6-luna` worker with high reasoning effort and reviewed by the primary agent. Existing uncommitted changes were preserved. No package dependency, application identity or version change was needed.

## Verification

Final checks after the reviewed layout/storage refinements:

| Check | Result |
| --- | --- |
| Full Play tests in Docker | 234/234 passed; `data/onboarding-qa-20261030/play-tests.log`. |
| Strict Play TypeScript in Docker | Passed; `data/onboarding-qa-20261030/play-check.log`. |
| Staging/build verifier tests on Windows, including PowerShell integration | 8/8 passed; `data/onboarding-qa-20261030/stage-host-tests.log`. Linux also passed its seven applicable tests and skipped the PowerShell-specific case. |
| Source staging | Passed: 116 files, 75 source files; inventory under `data/play-onboarding-20261030-final/play-stage-inventory.json`. |
| Android production JavaScript/Hermes export | Passed: 834 modules, packaged offline wordmark, 3.1 MB Hermes bundle. Output: `data/onboarding-qa-20261030/android-export`; log: `data/onboarding-qa-20261030/android-export.log`. Dotenv loading and product analytics were disabled explicitly for this verification. |
| Unsigned native APK/AAB build | Attempted with default analytics-disabled configuration; failed before app compilation because `ffmpeg.org:443` was unreachable while downloading the pinned FFmpeg 8.0.3 source. No APK/AAB was produced. Log: `data/onboarding-qa-20261030/android-build.log`. |

Tests cover strict completion validation, cold coordinator/storage restarts, explicit decline, failed/cancelled grants, independent consent/completion write failures, conflicting simultaneous choices, durable completion after failed replacement, isolated storage, legacy consent rejection and the closed activation policy. Existing media/backup/lifecycle regression suites also passed.

The later [Android 36 emulator flow/UI review](play-onboarding-emulator-2026-10-30.md) verifies both choices, persistence, Settings, navigation, Vanilla/Grape rendering and large-text/narrow-viewport behavior. It records the UI fixes, screenshots and the isolated QA build using verified cached native libraries. The original browser preview was not visually verified. TalkBack speech, seven other theme screenshots, physical-device behavior and a final packaged release/upgrade check remain open.

No commit, push, website publication, Play submission or analytics activation was performed. Emulator installation was subsequently authorized for the separate QA package in the linked review; no physical installation was performed.
