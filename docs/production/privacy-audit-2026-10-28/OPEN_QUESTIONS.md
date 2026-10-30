# Owner answers and open questions

## 30 October 2026 beta decisions addendum

The owner now sets the private beta's intended audience at **16+**, limits its
launch to EU countries, and wants only minimal analytics to inform future
monetization. This supersedes the 28 October audience wording for beta planning;
it does not erase that historical answer or close exact Play declarations.
Eligible users may turn analytics off; ineligible or unknown users stay
analytics-off. Eligibility must precede opt-in. All three sound-source features
remain available with analytics off, and no DOB/exact age is sent. Ordinary
builds stay analytics-off; a designated beta build and affirmative consent are
required. Existing persisted opt-ins need reevaluation. No age gate currently
implements this decision, and a checkbox alone does not establish compliance.

Only minimal, coarse beta measures and a short finite window are proposed; the
event allowlist, beta end date, retention and destruction criteria are not
selected. The current eight-event/random-return-ID implementation is distinct
from that proposal. Connected PostHog project 324975 and EU host were confirmed,
but plan and actual retention were not exposed. Official documentation's query
window is not deletion; the previously suggested 90 days is neither configured
nor approved. Verify the actual plan, retention and deletion mechanism before
any fixed-period promise. Support-message retention remains open.

The owner confirms `privacy@stimmyz.app` redirects incoming mail to a personal
Gmail inbox, so Google/Gmail handles forwarded correspondence. Do not publish
the private Gmail address; forwarding does not prove outgoing replies use Brevo.
No private Gmail address is recorded. Outgoing Brevo behavior is only an
assumption and remains unverified; owner-run branded reply testing is needed.
The source privacy draft ZIP was read for planning; the original was not
modified or published.
See [beta privacy decisions](../BETA_PRIVACY_DECISIONS-2026-10-30.md) for
evidence boundaries and the implementation and verification sequence.

Updated 28 October 2026. Release status: **NOT READY**. Blockers below concern
release/public claims or planned analytics activation, not continued local use.
Do not insert private identity, inbox addresses, credentials or tokens here.

**30 October follow-up:** this tracker retains the original audit gaps. Q5 is
partly resolved: the locally configured public token matches connected project
324975 and its `https://eu.i.posthog.com` ingestion host. Actual event retention
and vendor/transfer arrangements remain unverified. Q6 now has an implemented
event/copy contract, while public approval and previously transmitted data handling
remain open. T1/T2/T6 gained a built private testing APK, native artifact checks,
bounded physical consent tests and live ingestion evidence; full traffic coverage,
Play-generated packages and the remaining release matrix are still open. See the
[physical QA record](../../play-product-analytics-phone-2026-10-28.md).

## Answers received

| ID | Question | Owner answer | Result |
| --- | --- | --- | --- |
| A1 | Individual or company? | Individual; queried meaning of private entry | Publisher type confirmed. Owner can fill public name personally during policy review; name not provided. |
| A2 | Domain email tests? | Incoming works; replies untested | Inbound owner-confirmed. Branded reply privacy still open. |
| A3 | Intended audience? | General-purpose soundboard; no particular audience targeted; children may download/use it and users create their own content/value | Clarifies product intent, not an explicit child-directed design or a final Play age-group selection. Review actual design/listing and choose accurate age groups during submission preparation. |
| A4 | Support handler and correspondence retention? | Undecided | Both unresolved. |
| A5 | Random installation ID for day 1/7/30 returns, or aggregate-only events? | Approve pseudonymous return measurement | Random installation ID for future day 1/7/30 return measurement approved in the explicit question context; other implementation/publication decisions remain separate. |

All five are `USER_CONFIRMED` in this chat on 28 October 2026. No project/account,
DNS or public-policy setting was changed as a consequence.

## Remaining owner decisions

| ID | Priority / owner | Exact missing fact or decision | Closing action |
| --- | --- | --- | --- |
| Q1 | Release blocker / owner | Approved public controller name and any applicable required identity details | Owner privately completes exact publication text and approves it; no invented name or public insertion from unrelated profile data. |
| Q2 | Contact blocker / owner | Both addresses' branded reply behavior | Send/reply tests by owner with unrelated recipient; inspect From/Reply-To and received headers for private-inbox leakage and authentication. Public DNS alone is insufficient. No mail authorized/sent by this audit. |
| Q3 | Submission/analytics decision / implementer + owner | Which exact Play target groups/markets accurately describe the general-purpose design and listing? | Owner clarified no specific audience is targeted; possible child downloads alone do not establish a child-directed product. Implementer reviews design/listing and proposes exact selections for owner review. Apply Families/SDK requirements if children are among the intended groups; assess locale-specific minor rules. No age gate or exclusion is authorized by this clarification alone. |
| Q4 | Policy blocker / owner | Support operator, mailbox provider/access, retention and deletion process | Choose practices the owner can actually maintain; identify forwarding/mailbox recipients and relevant vendor arrangements. |
| Q5 | Analytics activation blocker / owner + implementer | Confirm handoff-proposed EU PostHog against actual project, host, client token configuration, retention and vendor agreement/transfer details | Inspect actual dashboard/config through authorized access; record only redacted evidence. Never use secret/admin API keys in the app. |
| Q6 | Analytics implementation blocker / owner + implementer | Event list, remaining buckets, consent copy, treatment of already-transmitted data | Propose exact payload/copy/deletion handling for review; ID approval alone does not settle these. |
| Q7 | Submission blocker / owner | Actual Play track, active artifacts, listing identity/audience, Data safety draft and capture declaration | Inspect confirmed Console settings and release mapping; do not infer from local package metadata. |
| Q8 | Policy blocker / owner + host admin | Vercel project/log access, retention, region/recipients, arrangements and effective date | Read actual hosting configuration/terms in use; public Server header proves routing, not contracts or storage location. |
| Q9 | Publication blocker / owner | Exact final policy, contacts, in-app explanation and submission approval | Review concrete final draft after facts/tests are complete; approve publication and declarations explicitly. |

## Remaining tests / access gaps

| ID | Priority / owner | Missing evidence | Closing test |
| --- | --- | --- | --- |
| T1 | Release privacy blocker / implementer + device owner | Release-candidate app-owned network destinations/fields | Connect a test device/emulator, verify artifact hash and capture coverage; trace all core flows/idle/background/failures with synthetic content. No attached device was available in this pass. |
| T2 | Analytics release blocker / implementer | No collection/request before consent or after withdrawal | After SDK implementation, prove fresh/declined/upgrade silence, no pre-consent backfill, EU-only reviewed dispatch, bounded queue, revoke races/purge and identifier reset. Current build has no analytics integration to test. |
| T3 | Deletion/retention claim blocker / implementer | Physical cleanup, recovery and artwork metadata | Verify normal/cancel/error/process-death media/temporary-file deletion, journal recovery, output image metadata, and exported-copy consequences. Tests exist; current device behavior not newly observed. |
| T4 | Backup claim blocker / device owner + implementer | OEM cloud/device-transfer behavior | Check supported transfer/backup behavior of the exact candidate; binary exclusions are verified, platform behavior is not. Avoid resetting/removing user data; use isolated fixtures. |
| T5 | Website disclosure gap / implementer + host admin | Browser-executed network/storage + host-side processing | Inspect home/policy requests and storage in a clean browser context, compare deployed assets, then reconcile actual host log settings. Current public policy HTML and source inspected. |
| T6 | Final-artifact blocker / implementer | Fresh final build, Play-generated APK/manifest and later SDK graph | After authorized changes, rebuild with Docker available, inventory/hash, inspect final AAB/splits and rerun relevant gates. Existing APK bytes and AAB bundle/DEX are audited; AAB protobuf manifest not decoded. |

No unresolved item is marked complete merely because no obvious upload function
was found. No private-data deletion or test email is implied by this tracker.

## Audience clarification and current guidance

Later on 28 October, the owner clarified that this is a general-purpose soundboard,
with no particular age audience targeted; users create their own content/value,
and children may download it. This resolves the intended meaning of the earlier
word "everyone". It does not select Console age boxes or establish SDK suitability.

Google's [target-audience guidance](https://support.google.com/googleplay/android-developer/answer/9867159)
says to select groups the app is actually designed for, and not select all ages
solely to allow broad availability. Target audience, content rating and enforced
access restrictions are distinct. Its [Families policy](https://support.google.com/googleplay/android-developer/answer/9893335)
adds requirements when children are among the target audiences, including SDK/data
handling. Review the actual product/listing before proposing declarations; do not
force the owner to invent a demographic or misstate the product to simplify launch.
