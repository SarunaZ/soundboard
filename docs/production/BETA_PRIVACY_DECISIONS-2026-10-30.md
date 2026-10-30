# Beta privacy decisions — 30 October 2026

This record captures the owner's latest decisions for a private EU beta. It
updates the intended-audience and analytics direction in the 28 October audit;
it does not close unrelated release, policy, support, or vendor questions.

## Owner-confirmed decisions

- **Audience:** intended users are **16+**. The earlier general-purpose / no
  particular age targeted wording in the 28 October audit is superseded for
  beta planning. This is an intended-audience decision, not evidence that
  app-wide age blocking exists or that the Play age declarations are complete.
- **Geography:** beta launch is limited to EU countries. The exact enabled
  country list and corresponding distribution settings still need verification.
- **Analytics purpose:** collect only the minimum useful beta analytics to
  inform future monetization decisions. The owner prioritizes a least-invasive
  beta; whether return measurement or its random ID is needed must be reviewed
  against that narrower purpose.
- **Eligibility and choice:** only users determined eligible for the 16+ beta
  may be offered the analytics choice. Eligible users may turn analytics off
  in Settings. Ineligible or unknown-eligibility users remain analytics-off.
  Eligibility must be decided before showing the opt-in; a checkbox alone is
  not an age decision or a legal-compliance determination.
- **Core use:** all three existing sound-source features remain available when
  analytics is off, including for users who are ineligible or whose eligibility
  is unknown. No date of birth or exact age should be sent to analytics.
- **Build gate:** ordinary builds keep analytics disabled. Analytics requires
  an explicitly designated beta build and affirmative eligible-user consent.
- **Privacy contact:** the owner confirms incoming mail to
  `privacy@stimmyz.app` redirects to a personal Gmail inbox. No personal Gmail
  address was supplied or requested for this record. Outgoing Brevo mail was
  described only as an assumption and remains unverified; branded reply tests
  are still needed before publishing the contact behavior. Google/Gmail handles
  forwarded correspondence; do not publish the private Gmail address. Incoming
  forwarding does not prove outgoing replies use Brevo.

## Current implementation and evidence boundary

The existing implementation already has a Settings consent toggle, an
installation-local random ID, an in-memory bounded queue, and an eight-event
contract. Standard builds default to analytics off; the explicitly enabled
private testing build required consent before dispatch. Existing consented
opt-ins need eligibility review before beta use. There is no age-eligibility
gate yet, so the present toggle must not be treated as sufficient beta gating.

The latest bounded phone record reports 223 app tests, 15 staging/build checks,
strict TypeScript success, and bounded consent/ingestion checks. It does not
include an age-gating test or full packet capture. See the [phone QA record](../play-product-analytics-phone-2026-10-28.md)
and [implementation record](../play-product-analytics-2026-10-28.md).

## Proposed beta scope — not yet implemented or approved as a final event list

Before enabling beta analytics, define a short, finite measurement window and
use a small allowlist of coarse event outcomes and aggregate counts that answer
the monetization questions. Exclude detailed behavioral histories, D1/7/30
returns, media/content/name fields, exact age, and unnecessary persistent
identifiers. Review whether a random installation ID is needed for each chosen
question; prior approval for return measurement does not establish it is
necessary for this narrower purpose. State the beta end date and stop
collection when the window ends. Exact events, end date, retention duration, and destruction
criteria remain unselected.

This proposal is distinct from the currently implemented eight-event contract
and random-return-ID behavior. Do not describe proposed minimization as current
behavior, promise deletion on a fixed schedule, or update public disclosures
until the selected behavior is implemented and verified.

## PostHog retention and deletion verification

Read-only evidence identifies connected PostHog project **324975** (named
“Default project”, timezone UTC) and the configured EU ingestion host. The
connected project evidence does not expose the account plan or its actual event
retention setting. The [official events-retention documentation](https://posthog.com/docs/data/events-retention)
describes Cloud Free's one-year and Paid's seven-year query windows; a query
window is not a deletion mechanism and does not establish this account's plan.
The [official data-deletion documentation](https://posthog.com/docs/privacy/data-storage#data-deletion)
describes deletion tools, but no deletion setting or completed deletion was
verified. No account setting was changed and no raw event IDs were retrieved.

Therefore, the earlier 90-day suggestion is not configured or owner-approved,
and no automatic 30- or 90-day purge may be promised. Before public claims or
beta activation, verify the account plan, actual retention setting, applicable
deletion mechanism, and evidence that deletion works for the selected data.
Record the exact verified limitation and responsibility. Support-message
retention remains a separate open decision.

## Next steps before beta activation or publication

1. Implement and review an eligibility decision before the analytics opt-in;
   keep analytics off for unknown or ineligible users and preserve all three
   sound-source features. Add targeted checks for those states and consent.
2. Re-evaluate already persisted opt-ins under the new eligibility rule. Do not
   silently treat prior consent as beta eligibility.
3. Have the owner verify EU country distribution settings and perform a branded
   reply test to confirm the recipient sees no private Gmail address. No test
   email was authorized or sent by this record.
4. Verify PostHog account plan, actual retention, deletion controls, and a
   documented deletion result before making a retention promise.
5. Select the minimal beta event allowlist, finite window, end date, retention,
   and destruction criteria; then implement and inspect the resulting traffic.
6. Update the privacy draft and any Play declarations only after the shipped
   behavior, contact route, countries, and vendor facts are verified and the
   owner approves the exact text. The draft ZIP at
   `C:/Users/Sarunas/Downloads/Stimmyz_Privacy_Draft_Fresh_2026-10-30.zip` is a
   reference only; its contents were read for planning, and the original ZIP was
   not modified or published.

No provider settings, messages, policy pages, or Play declarations were changed
by this documentation update. No public launch or analytics activation is
approved by this record.
