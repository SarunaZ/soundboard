# Stimmyz beta analytics and privacy plan

Prepared 28 October 2026 from the Downloads handoff and current repository.
Status: planning complete; implementation, account setup and publication pending.

**Implementation update:** the [October 28 source implementation](../play-product-analytics-2026-10-28.md)
now covers consent, privacy controls, sanitized events and build wiring. Live
activation, native/device evidence, dashboards and publication remain pending.

**Audit executed 28 October 2026:** see the [audit results](privacy-audit-2026-10-28/README.md),
including retained 1.0.29/code 30 artifact inspection and owner answers. The later
live policy check succeeded (HTTP 200); public wording and runtime evidence gaps
remain open. The findings below describe the earlier planning pass.

## Source and precedence

Source archive: `C:/Users/Sarunas/Downloads/StimmyzApp_Beta_Analytics_Privacy_Handoff_REDOWNLOAD_2026-10-28.zip`.
SHA-256: `a4a6690959af85adf2a85a534fab11adf89cb1157473bc93f3de81c3f9786779`.
Read its `README.md`, `BETA_ANALYTICS_HANDOFF.md`,
`EMAIL_ALIAS_PRIVACY_HANDOFF.md`, `GOOGLE_PLAY_CONSOLE_MEASUREMENT.md`,
`BETA_LAUNCH_CHECKLIST.md`, and both `privacy_audit/` documents.

Resolve these conflicts before using older bundled instructions:

- The 28 October email handoff supersedes the README/checklist's SimpleLogin task.
  Preferred addresses are `privacy@stimmyz.app` and `support@stimmyz.app`, subject
  to successful inbound and branded reply tests. Domain ownership is reported by
  the handoff; operational email is unverified.
- Keep the current immediate-touch playback and **one-second** protection hold.
  The bundled two-second design is older than the owner's implemented refinement
  (`app-play/src/ui/boardHold.ts`, `app-play/README.md`). Measure the existing
  feature; do not redesign it during analytics integration.
- Preserve nine themes, gallery-only artwork and the separate Dev/Play boundary.
- The future beta's proposed optional analytics supersedes historical assumptions
  of no analytics. This does not establish what any existing artifact transmits.

## Starting point verified from source

Inspection baseline: commit `b6d89ad` with existing uncommitted changes. The current
Play source config is version **1.0.29 / code 30**, package
`dev.sarunas.soundboard.play`. This is not identification of a tested release
artifact. Preserve the existing README/STEPS, App, playback-engine and version
changes, plus the untracked website and creation-recovery record.

| Finding | Evidence | Planning implication |
| --- | --- | --- |
| Expo/React Native app, not a standalone Kotlin application | `app-play/package.json`, `app-play/App.tsx` | Adapt the handoff's Kotlin pseudocode to the actual framework; choose one SDK integration. |
| No direct PostHog dependency is declared | `app-play/package.json` | Audit resolved/native dependencies before concluding there is no existing telemetry. |
| Preferences currently use schema v5 without analytics consent | `app-play/src/data/preferences.ts` | Add installation-local consent with a safe migration/default. |
| Manual backups export and restore preferences | `app-play/src/media/backup.ts` | Keep consent, analytics ID and queue outside portable backups. Restoring media must never grant consent. |
| Android backup is disabled and exclusions are generated | `app-play/app.json`, `app-play/plugins/withPlayRelease.js` | Verify final merged resources, including any new SDK storage. |
| Settings contains expandable device privacy information | `app-play/src/ui/SettingsModal.tsx` | Add a discoverable Privacy section, consent control and public policy link. |
| Local website policy is a draft with placeholders and a no-analytics assumption | `website/src/pages/privacy/index.astro`, `website/PRIVACY_REVIEW.md` | Prepare a reviewed replacement based on measured behavior. |
| Existing privacy/readiness records contain historical r3/r4 evidence and open checks | `docs/production/privacy-data-flow.md`, `ANDROID_PRODUCTION_READINESS.md` | Reconcile these records against the new candidate; do not close old device/policy gates implicitly. |

The web tool could not retrieve `https://stimmyz.vercel.app/privacy/` during this
planning pass. This does not prove the site is down. Deployed content, headers,
redirects, indexing and hosting configuration remain to be checked.

## Work sequence and completion gates

### 1. Establish the shipping data-flow baseline

Inspect the exact production-default staging/build process, merged manifest,
release Gradle dependency graph, Expo autolinking, initialization hooks,
permissions, SDK defaults, native modules, network calls and logging. Separate
Play from Dev's remote-media and YouTube features.

Trace imports, microphone/device capture, trim/save, artwork metadata, temporary
files, deletion, sharing, ZIP backup/restore and Android backup/transfer. Inspect
the built website and actual deployment: scripts, cookies/storage, requests,
hosting logs, support processing and recipients. Verify accounts, ads, billing,
cloud sync and remote artwork from the artifact rather than old specifications.

Create a dated audit directory under `docs/production/` containing
`EVIDENCE_AND_DATA_FLOW.md`, `OPEN_QUESTIONS.md` and
`APP_AND_SITE_REMEDIATION.md`. Use `VERIFIED_FROM_CODE`, `USER_CONFIRMED`,
`UNKNOWN/REQUIRES_TEST` and evidence-backed `NOT_APPLICABLE`; runtime findings
must include the test/build. Record source state, variant, APK/AAB hashes,
dependency versions and redacted network evidence.

**Done when:** every relevant flow has origin, purpose, storage, recipient,
retention/deletion and evidence status; unresolved release blockers have an owner
and exact closing action. Source inspection alone cannot establish network silence.

### 2. Settle owner decisions after discovery

Use short interview rounds, asking only what evidence cannot settle. Do not ask
for credentials or private personal details in shared documents.

First round:

1. Confirm individual/company publishing identity and the public controller name,
   using private entry for sensitive details.
2. Confirm inbound delivery and branded replies for both domain addresses; select
   an outbound arrangement if replies currently expose a private inbox.
3. Confirm Play target audience and who handles support/privacy requests, including
   practical correspondence retention.
4. Approve the proposed events, consent wording and pseudonymous installation ID
   for day 1/7/30 retention, or choose aggregate-only measurement without cohorts.
5. Confirm the actual EU PostHog project/host, retention configuration and Play
   testing track/access. Use only a client project token in app configuration.

Subsequent rounds resolve vendor arrangements/transfers, deletion of transmitted
data, lawful-basis questions and publication choices using gathered evidence.
Record decisions without inventing retention periods, contacts or legal facts.

**Done when:** the implementation contract is approved; unanswered public-policy
facts remain explicit blockers. This planning request does not authorize sending
test emails, changing DNS/accounts or publishing documents.

### 3. Implement a consent-gated analytics foundation

Proposed ownership: new `app-play/src/analytics/` modules for `ProductAnalytics`,
`NoopAnalytics`, `PostHogAnalytics`, event validation and consent lifecycle;
one composition point in `app-play/App.tsx`.

- Evaluate the official Expo/React Native SDK first, pin an audited version and
  inspect its peers, native initialization, generated properties and purge/stop
  behavior. Use an Android bridge only if evidence shows the Expo path cannot meet
  the requirements. Do not install both clients or copy Kotlin configuration
  names into TypeScript without checking the selected SDK.
- Start with Noop. Do not construct the network-capable client until affirmative
  consent is loaded and valid. Missing, corrupt or unreadable consent fails closed.
  Missing/invalid project configuration also leaves analytics disabled.
- Keep durable consent and SDK identity/queue installation-local, outside manual
  media backups, with Android backup exclusions verified. Legacy upgrades default
  OFF. Backup import cannot enable analytics or import another installation's ID.
- Use one reviewed EU ingestion host, a configuration-managed public project token
  and no secret/admin key. Keep development/test traffic separate from beta data.
- Disable automatic screens, touches, lifecycle/deep-link events, replay, exception
  capture, logs, surveys, flag polling and other unsolicited requests. Disable
  person profiles and person-property enrichment; no identify/alias calls.
- Audit and minimize SDK-added fields as well as application properties. Document
  unavoidable transport metadata; do not describe pseudonymous IDs as legally
  anonymous.
- Keep analytics off the audio-start path. Failures must never block core use.
- Bound queue size and event age for consenting use only. Revocation first closes
  the capture/send gate, stops scheduled work, clears pending data and resets local
  identity using verified APIs. Ensure disposal does not flush on revoke. Test
  concurrent capture, startup, retry and revoke; document already dispatched
  requests rather than promising they can be recalled.

**Done when:** automated lifecycle tests prove no pre-consent accumulation,
safe startup/restart, queue purge and identity isolation. Native network tests in
step 6 remain mandatory.

### 4. Add Privacy controls and approved events

Update `app-play/src/ui/SettingsModal.tsx` with a Privacy section, initially OFF
analytics switch, purpose/data explanation, withdrawal and public policy link.
Draft label for owner review: **Share app usage data**. Explain that optional
usage events use a random installation ID if cohorts are approved, and never
include recordings, names, images or searches. The handoff's word "anonymous"
must not obscure pseudonymous processing. Any first-run prompt is optional,
has equal-weight Allow/Not now, appears once, and cannot block creation.

Instrument domain outcomes in `CreateFlow.tsx`, durable save handling in
`App.tsx`, board creation and actual playback protection transitions. Avoid
React-render/effect-driven duplicates and never send arbitrary exception text.

| Proposed event | Trigger and safe fields |
| --- | --- |
| `creation_started` | Once per actual new flow; source `device`/`mic`/`file`. |
| `recording_completed` | Successful mic/device capture; source and duration bucket. File import is not a recording. |
| `trim_viewed` | Once per flow reaching usable Trim; source. |
| `sound_saved` | After durable Library commit; source, trim duration bucket and `default`/`gallery` artwork. A later board-assignment failure must not erase a successful save. |
| `creation_failed` | Source, finite stage and error-class enums; distinguish cancellation from failure. |
| `board_created` | After successful persistence; grid `3x4`/`4x4`, navigation `pages`/`scroll`. |
| `protected_playback_used` | Once on successful protection per session, including accessibility activation; repeat `once`/`count`/`loop`. No pad/clip/board IDs. |
| `usage_summary` | Coarse sound/play/board counts, at most once per installation per day; never per-pad events. |
| `app_session` | Optional, only if approved; reviewed version/OS values and duration bucket, once per consenting session. |

Finalize missing enums before coding: stage/error classes, plays/boards/session
buckets, clip-duration buckets and app-version/OS validation. Define duration
boundaries for fractional seconds: proposed `<=5`, `>5..15`, `>15..30`, `>30`;
do not leave the handoff's 5–6 second gap. Use the handoff's sound-count buckets.
Define flow/session boundaries, background transitions, deduplication and clock
rollback behavior. In-memory flow tokens must never be uploaded.

Use strict runtime allowlists at emission and final SDK payload boundaries. Reject
unknown events/keys, free text, filenames, URLs, raw IDs/counts, media and exception
messages/stacks. Test SDK default fields separately. Do not collect pre-consent
usage to backfill later. A session/flow crossing opt-in must not retroactively
emit its earlier stages; dashboard funnels must account for partial flows.

**Done when:** consent UX is accessible, restore cannot change consent, and tests
cover exact event cardinality and both app/SDK payload sanitization.

### 5. Prepare email, policy and Play declarations

Owner completes domain routing and a tested outbound reply setup. Follow the
chosen provider's current MX/SPF/DKIM/DMARC instructions; do not assume forwarding
alone provides branded replies. Verify both addresses with an unrelated recipient
before publishing them. Public contact and legal controller identity are separate.

Draft these audit outputs after evidence and owner answers are sufficient:

- `PRIVACY_POLICY_FINAL_DRAFT.md`: actual app/site data, recipients, optional
  analytics, identifier/transport processing, retention, withdrawal, requests,
  region and verified vendor arrangements. Keep unresolved drafts clearly marked.
- `PLAY_CONSOLE_DATA_SAFETY_WORKSHEET.md`: field-by-field proposals grounded in
  Google's definitions and measured SDK behavior; cover optional collection and
  other applicable active artifacts/tracks, rather than just the latest build.
- `LAUNCH_PRIVACY_SIGNOFF.md`: finite blockers, evidence, owner review and exact
  release identity. Update the existing readiness/privacy records consistently.

Prepare the website diff in `website/src/pages/privacy/index.astro` and related
review notes only after exact public wording is reviewed. Remove draft notices,
placeholders and policy noindex when approved for publication, then verify the
live HTTPS page and in-app link. Keep marketing-site analytics outside scope.

**Done when:** policy, in-app explanation, real release behavior and proposed Play
answers agree; controller/contact/effective date and material vendor/legal
uncertainties are resolved for owner sign-off. Publication/submission is a later
explicit owner action.

### 6. Verify the exact candidate

Run appropriate existing Play tests and TypeScript checks, focused analytics tests,
staging/native-module boundary checks, dependency/security checks and the unsigned
production-default APK/AAB build. Recheck merged permissions, backup resources,
SDK versions, artifact hashes and actual emitted domains.

| Scenario | Required evidence |
| --- | --- |
| Fresh install, no decision; explicit decline; legacy upgrade | Zero PostHog ingestion, flags, identity or other SDK requests; import/mic/device capture, trim/save and playback still work. |
| Opt in | Correct EU project receives only reviewed sanitized events; no autocapture or extra endpoints; no earlier events uploaded. |
| Offline use, process restart, permission denial, clock changes | Consent remains correct; queue is bounded; event dedupe and summaries behave; cancellation/failure categories stay safe. |
| Online/offline revoke, including startup/send races | No new analytics dispatch after gate closes; pending queue cleared, retries stopped, identity lifecycle proven. Account for in-flight work explicitly. |
| Restore/export, reinstall and OS transfer paths | Export contains no consent/ID/queue; restore cannot opt in; reinstall/transfer behavior matches policy. Preserve user media. |
| Failure, repeated Save, repeated protection, accessibility and large text | No personal payloads or duplicate outcomes; consent remains usable; playback timing/hold behavior preserved. |

Use synthetic QA content. Collect redacted network proof from the release-like
candidate, not just a mocked client or browser prototype. Proxy silence alone is
insufficient if traffic bypasses capture: document capture coverage and limitations.
Compare relevant cold/warm playback behavior to the existing baseline. Leave
broader physical QA gates open where coverage is missing.

**Done when:** must-pass results are tied to APK/AAB hashes and no material privacy
or functional blocker remains unexplained. Keep artifacts unsigned/unpublished
until owner release review.

### 7. Configure beta reporting and release review

After approved access/setup, build EU PostHog dashboards for creation conversion,
source use, categorized failures, duration/collection buckets, board layout and
protected playback adoption. Add day 1/7/30 retention only if the pseudonymous
identity decision supports it. Mark all product analytics as an opt-in sample.

Review Play installs/acquisition, listing conversion, device/OS mix, Android
vitals, reviews and pre-launch results for the confirmed package, version, track
and time window. Small betas may lack reports. No extra Firebase SDK is needed.
Declined consent must never be transmitted to measure opt-in rate; installation-
local counts cannot establish a global opt-in rate. Keep Play and PostHog
denominators separate.

Prepare a manual weekly 15-minute review template: date/build/track, stability,
funnel, top bug, top friction point and one next experiment. Do not create an
automation or scrape dashboards as part of this plan. Pricing/limits require
usage and voluntary willingness-to-pay evidence; do not add new limits now.

**Done when:** dashboard/test-event evidence and an initial manual review are
recorded; owner signs off on final candidate, policy publication and Play submission.

## Implementation execution rules

This is a documentation-only planning pass. No SDK or privacy behavior changed.
For subsequent coding, the primary agent plans/reviews and delegates bounded
implementation to at least one explicitly selected `gpt-6-luna` worker at high
reasoning effort, per repository instructions. Avoid overlapping writers:
foundation/schema first, then UI/events; audit documents and email preparation
can progress independently. Review all worker changes and verify integration.
Do not commit, push, publish, change account settings or send messages implicitly.

Recommended first implementation slice: **shipping audit and owner decision
record**, followed by **Noop/consent/schema foundation**. Keep network activation
behind the project/event/consent approval gate rather than starting with live SDK
calls.

## Primary references checked during planning

- [PostHog React Native SDK](https://posthog.com/docs/libraries/react-native):
  Expo integration exists; validate configuration against the pinned version.
- [PostHog Android SDK](https://posthog.com/docs/libraries/android): source for
  the handoff's Android concepts, not a drop-in TypeScript implementation.
- [Google Play Data safety guidance](https://support.google.com/googleplay/android-developer/answer/10787469):
  declarations include third-party SDK handling; track applicability must be checked.
- [Cloudflare Email Service](https://developers.cloudflare.com/email-service/):
  forwarding/routing and outbound sending are distinct capabilities; verify current
  account eligibility and provider configuration before choosing the reply setup.

These checks support planning only. Vendor project settings, deployed policy,
resolved release dependencies and runtime traffic have not yet been audited.
