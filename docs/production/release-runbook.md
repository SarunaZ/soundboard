# Play release runbook

Use this record for every candidate. A run is not a release approval; the Play artifact must be signed through the approved Play App Signing path and reviewed by the owner.

## Candidate record

- Latest all-sources candidate: **r4, unsigned, unpublished** (artifact record in [`data/play-readiness-all-sources-20261025-r4/artifacts`](../../data/play-readiness-all-sources-20261025-r4/artifacts)); r3 is a historical capture-off build.
- Version / versionCode: `1.0.28` / `29`.
- Source commit / tag: `6e17e875d95714ce6b078935be8c1047b5e8e265`, dirty working tree; staged input hashes/sizes verified 104/104.
- Build command and capture mode: `scripts/build-play-android.ps1`; r4 enables device-audio capture with file import and microphone recording. See r4 artifact hashes above. The local test-key-signed phone copy passed bounded consent, capture-to-save, notification Stop, no-usable-audio and restore checks; QA content was removed and volume restored.
- Build image/toolchain digest or versions: image `sha256:cc812490b1d81490dd7286c3ba1b189986b9da9e6382630d90ab2f9661fa1b75`, Node `v24.22.1`, Yarn `4.18.0`.
- r4 unsigned APK `soundboard-play-testing-capture-unsigned.apk`: 49,711,893 bytes; SHA-256 `448b3885d8a7c941f8dc46c003bf40fe97d479143f5468082a867a6b0254a9cf`.
- r4 unsigned AAB: 37,957,212 bytes; SHA-256 `6bc8ca3707d148e60ed7f6b90d5581ed086967f21cb33bbc650b36189bfe129c`.
- Historical r3 capture-off APK/AAB details remain in [the r3 verification record](VERIFICATION-2026-10-25.md).
- API/min SDK values: minSdk 24; compile/target SDK 36; ABIs arm64-v8a and x86_64.
- r4 capture-enabled manifest/permission and native reports: [r4 artifacts](../../data/play-readiness-all-sources-20261025-r4/artifacts/); `projectionCaptureEnabled=true`, required foreground-service/projection service/activity present, native module allowlist and both-ABI ELF/ZIP checks passed. The locally test-key-signed copy passed bounded capture and restore QA and was cleaned back to its original app data.
- Native library 16 KiB alignment report: APK and AAB each contain 44 native libraries, all pass; APK zipalign passes. Sixteen packaged FFmpeg instances matched validated outputs. See [APK](../../data/play-readiness-security-20261025-r3/artifacts/apk-elf-page-alignment.txt), [AAB](../../data/play-readiness-security-20261025-r3/artifacts/aab-elf-page-alignment.txt), [FFmpeg hashes](../../data/play-readiness-security-20261025-r3/artifacts/packaged-native-ffmpeg-sha256.txt), [zipalign](../../data/play-readiness-security-20261025-r3/artifacts/zipalign-report.txt), and [primary verification](../../data/play-readiness-security-primary-verification-20261025.log).
- CI run URL: none; the recorded build and checks were local.
- Unit/typecheck/stage test results: 200 app tests passed; 31 security/configuration checks passed; strict TypeScript passed; 104 staged source input hashes/sizes matched. See [all-sources app tests](../../data/play-readiness-all-sources-tests-20261025.log), [all-sources TypeScript](../../data/play-readiness-all-sources-typescript-20261025.log), [all-sources security checks](../../data/play-readiness-all-sources-security-tests-20261025.log), and [all-sources primary verification](../../data/play-readiness-all-sources-primary-verification-20261025.log).
- Signed AAB provenance / Play App Signing track: unsigned AAB; Play App Signing setup and signing are outstanding.
- QA devices, OS versions, and tester notes:
- Data migration and backup/restore evidence:
- Play policy, Data safety, and privacy policy review:
- Offline dependency/SDK inventory and license notice bundle:
- Known issues / accepted risks:
- Approver / date:

## Repeatable local source gate

```powershell
yarn install --immutable
yarn workspace app-play test
yarn workspace app-play check
yarn test:play-stage
./scripts/build-play-android.ps1 -StageOnly
```

Build the unsigned candidate with `./scripts/build-play-android.ps1` and include the owner-required device playback capture feature alongside file import and microphone recording. The r4 capture-enabled manifest and package audit and bounded physical capture/restore flows passed; finish broader device review before release. The script does not sign, publish, or upload anything.

The script's APK/AAB audits check identity/version, cleartext and backup flags, debuggability, SDK levels, permissions, capture component presence/absence, unsigned state, extractor markers, native autolinking, APK zip alignment and ELF load segment alignment. The r4 checks passed for the capture-enabled candidate; preserve its linked `artifacts/` with this record. CI currently keeps audit summaries in job logs and does not upload APK/AAB or mapping files as workflow artifacts.

## Release sequence

1. Freeze candidate source and record the commit.
2. Run CI and local gates; build a candidate with file import, microphone, and device-audio capture enabled; review its merged manifest, capture permissions/service/notification behavior and full dependency inventory. The r4 package checks and bounded phone capture flows passed; complete broader coverage before release review.
3. Complete the QA matrix, privacy/data-flow and permission review, legal checks, store listing and Play Console declarations.
4. Produce a signed AAB using the protected upload key / Play App Signing. Keep keys and credentials out of source control and ordinary artifacts.
5. Review Play pre-launch results; start internal then closed testing, meet account-specific test gates, and document tester feedback.
6. Record launch sign-off. Release in a staged rollout and monitor crashes/ANRs, reviews and support reports.
7. If a severe defect appears, halt staged rollout where available; prepare a higher-version fix, retest and communicate the issue.

## One-person operations checklist

- Check Play Console crash/ANR and pre-launch dashboards after each release and during rollout.
- Triage a report without requesting user recordings or private filenames. Ask the user to describe steps and device/Android version.
- Reproduce with a sanitized fixture; never add user media to issue attachments without explicit consent.
- Pause rollout for repeatable data loss, unexpected recording, crashes, install failures, or policy warnings.
- Ship a higher versionCode for a fix; preserve the failed build record and document the decision.
- Review Android target requirements, SDK/dependency changes, privacy declarations and policy guidance quarterly and before submission.

## Evidence still required

- No signed AAB, Play App Signing setup, Play Console declaration, or public release record has been produced here.
- The final isolated JavaScript graph passed the strict audit gate and compatibility/security tests; one raw high node-forge advisory remains visible and is classified only by exact local-patch evidence. The retained 160-coordinate OSV query returned zero affected-version results; r4 Maven package versions match those coordinates exactly, but no fresh r4 query was run. Native Android binaries remain outside npm audit coverage. See the [JavaScript audit](DEPENDENCY_AUDIT-2026-10-25.md) and [native audit](NATIVE_DEPENDENCY_AUDIT-2026-10-25.md).
- The offline Play dependency graph and r3 resolved Gradle runtime graph are recorded in [dependency-sdk-inventory.md](dependency-sdk-inventory.md) and the native audit. APK/AAB packaged library alignment and FFmpeg hashes passed; Maven/native license attribution is still open (43 notice records are metadata-only). This is not legal-compliance clearance.
- Double-corrupt snapshot/journal handling preserves files and fails closed. Define and test a support/export recovery path; the current in-app backup import cannot repair unreadable current metadata.
- An API 36 `sdk_gphone64_x86_64` emulator with 4 KiB pages was used for the standalone FFmpeg decode probe. Bounded app QA was also completed on one Samsung Galaxy S24 Ultra using an owner-authorized local test-key copy of r3; the [phone QA record](PHONE_QA-2026-10-25.md) lists its coverage and limits. Pixel/lower-end coverage, a 16 KiB device, user study, and Play-distributed install remain unverified; package checks do not substitute for these runtime tests.
- Release version remains at the existing source version; increment version and code for a release candidate only when the owner chooses a candidate.
