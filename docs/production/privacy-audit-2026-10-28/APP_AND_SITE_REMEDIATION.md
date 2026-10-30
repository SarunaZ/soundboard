# App and site remediation

Prepared 28 October 2026. These are concrete findings and next actions; no product
fix, account change or publication was performed. P0 blocks the applicable release
or public claim; P1 is required implementation/evidence for the intended beta;
P2 improves clarity without implying a hidden data leak.

| ID / priority | Finding and evidence | Required change / owner | Acceptance |
| --- | --- | --- | --- |
| R1 / P0 | Public 200 policy still has controller/email placeholders, draft banner and no actual effective date. Live HTML equals local dist. `website/src/pages/privacy/index.astro:24,45-60,80-84,258-267`; `src/layouts/SiteLayout.astro:31`. | Owner settles identity/contact/practices. Prepare exact evidence-backed policy diff, review, then publish approved text. Remove draft/noindex as part of the agreed finalization gate; noindex itself is not asserted to be a separate Google policy violation. | No placeholders or unsupported assumptions; public HTTPS notice matches actual release, with approved controller/contact/date and accurate app/site processing. |
| R2 / P0 | App Settings exposes only local privacy text; no public policy URL. `app-play/src/ui/SettingsModal.tsx:200-209`. | Add visible public-policy link and accessible Privacy section after wording/destination review. Keep local explanation accurate. | In-app action opens the same final public policy used in Play Console without login; accessibility and offline failure behavior checked. |
| R3 / P0 | Inbound email works per owner; branded replies untested. CF routing is visible in DNS; Brevo TXT/DMARC does not prove sending configuration. | Owner tests both aliases in both directions and approves public contact. Review received headers and selected provider authentication. No DNS/mail changes made by audit. | External recipient sees approved branded sender/reply identity; private inbox not exposed unexpectedly. Record outcome, not private addresses/headers. |
| R4 / P0 for audience-sensitive release | Owner clarified a general-purpose soundboard, no particular age audience targeted, and possible child downloads. Exact age-group declarations/markets remain unselected. | Review actual design/listing and propose accurate Console groups. Broad availability alone is not a reason to mark all ages. Review applicable Families/local rules and SDK/consent behavior for the actual intended groups. | Actual Console selections, UI/content and privacy/analytics handling agree; no invented child-directed intent or unapproved age restriction. |
| R5 / P0 evidence | Networking capability exists; app-owned release traffic not observed. `INTERNET`, OkHttp/Fresco and other framework components are present. | Implementer captures traffic of exact candidate with synthetic content; document coverage, fields, domains and both user and automatic triggers. | Reproducible candidate-specific proof supports each network/policy claim; zero-traffic findings are qualified by interception coverage. |
| R6 / P1, before analytics ships | Desired PostHog integration is absent; no consent control/storage/allowlist/withdrawal implemented. `app-play/package.json`, `src/data/preferences.ts:7-32`. | Implement approved typed ProductAnalytics/Noop/PostHog composition, lazy initialization only after affirmative valid consent, SDK-generated-field filtering, bounded queue and verified revoke semantics. Owner has approved return measurement, not all configuration. | No SDK startup/flag/identity traffic before opt-in; no pre-consent backfill; safe EU payloads; no per-pad events; revoke stops new dispatch and clears queued data; audio path unaffected. |
| R7 / P1, before analytics ships | ZIP backups carry current app preferences (`src/media/backup.ts:275,539,572`). Adding consent there would make it portable. | Keep analytics consent/ID/queue outside media backup/restore; verify Android exclusions cover SDK storage. Missing/corrupt state defaults OFF. | Legacy upgrade/reinstall/restore cannot opt in or reuse another installation's analytics identity. Media preferences continue restoring normally. |
| R8 / P1, integration build requirement | Stage script only includes `src/ui`, `src/data`, `src/media`; verifier allows specific trees. Proposed `src/analytics` would not automatically ship. `scripts/build-play-android.ps1:48`, `scripts/verify-play-stage.mjs` allowedAppPlayTrees. | When adding analytics, extend both exact staging and verifier allowlists/tests deliberately; pin SDK/peers and regenerate dependency/notices evidence. | StageOnly and extractor boundaries pass; analytics files are present in staged sources and final artifact; Dev isolation remains intact. |
| R9 / P0 policy evidence | Support operator/retention undecided. Host/mailbox/vendor regions/access/contracts unknown. Current policy blends legal bases and tentative retention. | Gather owner/account facts; produce purpose-specific disclosures and review material legal classifications. Do not guess retention, transfers or identity. | Every definitive public claim maps to evidence/owner-confirmed practice; withdrawal/request procedure can be performed. |
| R10 / P1 | Packaged backup exclusions confirmed, but OEM transfer, process-death cleanup, gallery output metadata and deletion still lack fresh device evidence. | Test isolated fixtures on exact candidate; keep originals/user Library intact. Describe explicit exported copies and best-effort temporary cleanup accurately. | Device results confirm intended behavior or exact remediation is added; no claim of universal/secure instantaneous erasure. |
| R11 / P1 | Old production privacy worksheet still leads with r3/capture-off-era evidence despite current capture-on code30 artifacts. | Link this dated audit and retain old r3/r4 records as history. Reconcile final worksheet/Console responses when final SDK/runtime evidence exists. | Reviewers can distinguish current source/artifact facts from historical tests; no old checkbox is closed implicitly. |
| R12 / P2 | Report a problem opens a generic Share sheet with no address, not a configured support channel (`SettingsModal.tsx:62-70,209`). | After email is verified, offer an accurate explicit support action or explanatory text. Continue requiring user review and no automatic media/diagnostic attachment. | Users know the destination and what will be sent; app doesn't claim delivery merely because the chooser opened. |

## Current declarations versus future analytics

The current audit found no active app account/ads/billing/remote-artwork feature
or known analytics SDK in the inspected evidence. That does not justify a final
no-collection declaration without runtime and third-party processing evidence.
Current consent-control absence is an integration gap for the planned analytics,
not proof that the present build tracks without consent.

If the handoff-proposed PostHog integration is included, reconcile the final SDK graph, all generated fields,
project region/retention, consent/withdrawal behavior, public policy and Play Data
safety before distribution. Do not add a Firebase SDK to obtain Play Console
metrics. Keep marketing-site tracking outside the requested scope.

## Suggested next implementation order

1. Close owner audience/contact/support/hosting facts while collecting device
   evidence. Owner privately fills controller name during review.
2. Prepare reviewed public-policy and in-app privacy/support changes.
3. Build the consent/Noop/schema foundation; keep live SDK activation pending
   project/event/consent approval and audience review.
4. Add the selected SDK and outcome events, revise staging allowlists, then run
   exact-artifact consent/network/backup regressions.
5. Produce final policy/Data safety drafts and finite owner sign-off; publish or
   submit only on explicit owner authorization.

Coding must use a bounded `gpt-6-luna` implementation worker at high reasoning
effort with primary review, per project instructions. Existing user changes
remain intact; no commit/push was made.
