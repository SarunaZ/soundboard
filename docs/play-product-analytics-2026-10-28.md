# Play optional product analytics — implementation and verification

28 October 2026; status updated 30 October. **Implemented and privately tested;
ordinary builds keep analytics disabled by default.** The 1.0.30/code 31 testing
update was built, signed and installed in place. Six consented event types reached
the actual EU project during controlled QA. See the [physical test record](play-product-analytics-phone-2026-10-28.md)
for evidence, final device state and remaining limits. Nothing was published.

## Result and ownership

Play now has one consent-managed `ProductAnalytics` service, a Noop implementation,
an event-only PostHog adapter, an installation-local consent/identity store, strict
schema validation and domain instrumentation. Settings contains a separate Privacy
card with a Share app usage data switch and a link to the public privacy policy.
No first-run prompt was added. Core use is available with analytics disabled.

Implementation was delegated to three explicitly selected `gpt-6-luna` workers
at high reasoning effort for foundation/tests, UI/events and build/dependencies.
The primary reviewed their changes, requested corrections and reran verification.
Pre-existing playback recovery and other user changes were preserved. The
subsequent private testing update increments the version to 1.0.30/code 31.

## SDK and request boundary

The pinned dependency is **`@posthog/core` 1.61.2**, using its official
`PostHogCoreStateless` base. `posthog-react-native` 4.84.3 was evaluated but is not
a final dependency: its constructor installs an unmanaged AppState listener and
attempts remote configuration. The event-only core adapter requires no global
AppState patch, automatic screen/lifecycle capture, replay plugin or new native
dependency. Dependency notices were regenerated from the installed graph.

`app-play/src/analytics/posthogAnalytics.ts` is dynamically initialized only after
valid persisted affirmative consent and build configuration. The only permitted
request is **POST `https://eu.i.posthog.com/batch/`**, with no query parameters.
Both app events and final request bodies are sanitized. The final envelope contains
the public project token, random installation ID, reviewed event/properties and SDK
event UUID/timestamp. Reserved controls are explicitly set to
`$geoip_disable: true` and `$process_person_profile: false`; SDK enrichment is
removed. Transport IP metadata still reaches the recipient; this is pseudonymous
analytics and is not described as legally anonymous.

No identify/alias, user names, media, file/sound/board IDs, filenames, paths,
artwork titles/URLs, search strings, raw exception text or arbitrary numbers are
accepted as event properties. Unknown events/keys and nonprimitive enum values
are rejected. Failures in event delivery cannot interrupt save/playback actions.

Queue storage is in memory, bounded to 50 events. There are no scheduled interval
flushes or automatic fetch retries; captures trigger delivery and offline/failed
delivery is best effort. A final request filter drops invalid, future-dated or
older-than-24-hour events. Pending data is not carried across process death.
This does not promise durable offline telemetry delivery.

## Consent and identity lifecycle

- Ordinary builds resolve to disabled behavior. An explicit enabled build still
  begins with the user switch OFF unless valid prior consent exists.
- Missing, malformed or unreadable consent/configuration fails closed. The SDK
  is not constructed before consent. No pre-consent events are retained/backfilled.
- `Paths.document/play-analytics/` holds consent, random installation ID and the
  last summary time. It is outside `play-library` and its ZIP backup/restore path.
  Media restore cannot grant consent or import an analytics identity.
- Installation IDs use Expo's native UUID v4 after consent, with a Web Crypto
  fallback. If neither is available, activation fails closed; no hardware ID or
  weak random fallback is substituted.
- Withdrawal closes the dispatch gate and invalidates flow epochs immediately,
  aborts active request signals, clears the memory queue and removes the local ID.
  There is no withdrawal-time flush. Already dispatched data cannot be recalled.
- Consent writes are staged. On withdrawal persistence failure the service tries
  to delete consent as a fail-closed fallback and reports any unresolved local
  persistence error. A functioning filesystem is required to guarantee persistence
  across restart; the current session remains closed.

Settings copy describes optional feature use, coarse counts/durations and a random
installation ID for return visits. It states that recordings, names, images and
searches are not sent, and that turning sharing off stops collection and clears
pending on-device events. The switch is unavailable in an unconfigured build.
This copy and event contract were used in private QA; public release review remains open.

## Events and measurement meaning

| Event | Trigger and finite properties |
| --- | --- |
| `creation_started` | First source action in a creation flow, before permission/picker; `source`: device/mic/file. Picker cancellation is a dropout, not a failure. |
| `recording_completed` | Completed mic/device capture; source and duration bucket. File import is not recording. |
| `trim_viewed` | Once per creation flow when usable media reaches Trim; currently adopted source. |
| `sound_saved` | After durable Library save, once per flow; adopted source, clip-duration bucket and selected default/gallery artwork mode. A subsequent board/artwork assignment problem does not erase the saved audio outcome. |
| `creation_failed` | Attempted/adopted source, finite stage and coarse error class. No raw error text. |
| `board_created` | Successful user-created persisted board; grid 3x4/4x4 and navigation pages/scroll. Initial/restored boards do not emit creation. |
| `protected_playback_used` | Successful active protected voice, including accessibility activation, deduplicated while the session remains protected; repeat once/count/loop. Pending requests alone do not count. |
| `usage_summary` | First eligible background transition per 24 hours, using current sound/board counts and successful plays accumulated in this process since consent/last summary. Emission is serialized so concurrent callbacks cannot duplicate it. |

Durations: <=5 seconds, >5–15, >15–30, >30. Sound-count buckets:
0, 1–10, 11–25, 26–50, 51–100, 101–150, 151+. Play buckets: 0, 1–10,
11–50, 51–100, 101+. Board buckets: 0, 1, 2–5, 6+.
Stages: permission/capture/import/trim/save. Error classes:
permission_denied/unavailable/invalid_media/limit_exceeded/storage/capture_failed/
processing_failed/save_failed/unknown.

Creation flows remember their consent epoch; a flow begun without consent or
crossing withdrawal/re-opt-in cannot backfill earlier stages. A source switch can
make the start source differ from the saved source; funnels filtered by source
must account for this. Usage summaries are coarse process-local samples, not a
complete daily play total. Background transitions during device capture can end
the measured window. The physical file picker also triggered an early summary
with zero plays, so this event is not a complete daily usage total.
Force-stop/process death can lose unsent events/counts.
There are no per-pad-play network events or automatic app-session events.

## Local configuration

The owner requested an empty local token file. `app-play/.env.local` was created
with only a comment and:

```dotenv
EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN=
```

`.env*.local` is ignored in `app-play/.gitignore` and excluded from source staging.
No token is recorded in this document, stage metadata or source control. The
owner supplied the client-public token locally. Do not use a personal/admin API
key. Connected-project verification confirmed project 324975 and the fixed EU
ingestion host; event retention and vendor arrangements still need confirmation.

Ordinary builds stay disabled. An explicitly enabled Android build reads the
public token from the parameter, process environment or ignored local file and
forwards it into the bundle environment. Missing/invalid values fail closed.
See [build configuration](play-analytics-build-2026-10-28.md) for exact commands.
The build flag is separate from each user's consent. Supplying a token alone does
not enable the standard build.

## Verification

- Full Play suite including diagnostic checks: **223 passed**, 0 failed (206
  previous + 12 analytics + 5 flow tests).
  Log: `data/play-analytics-phone-tests-20261028.log`.
- Stage/plugin checks: **15 passed**, 0 failed. Includes disabled/enabled staging,
  invalid-token rejection, analytics import allowlist and token-free metadata.
  Includes fake-Docker argument-placement verification for diagnostics.
  Log: `data/play-analytics-phone-build-tests-20261028.log`.
- Strict Play TypeScript: passed.
- Final default-off StageOnly: passed, **110 files / 69 source files** under
  `data/play-analytics-final-stage-20261028`; no local env file included.
- Actual pinned Core SDK tests run with intercepted fetch: no constructor/opt-in
  requests; sanitized EU event body with GeoIP/profile controls; invalid/private
  fields and expired timestamps rejected; active requests aborted and later sends
  blocked after withdrawal. No live PostHog project is contacted by these tests.
- Lifecycle tests cover default/corrupt config, affirmative persistence before
  activation, opt-in/revoke races, concurrent summary throttling, late opt-in
  flow suppression and containment of transport exceptions.
- Android Expo production JS exports passed in both disabled and synthetic-token
  enabled configurations with **828 modules**, no unresolved optional peers. The
  enabled output inlines the test flag/token and fixed EU host. Outputs are ignored
  under `data/analytics-core-export-off-20261028` and
  `data/analytics-core-export-enabled-20261028`. No real token was used.

Host verification used workspace-local temporary directories because Windows
sandbox AppData permissions initially blocked Hermes output. No global config was
changed. SDK review/install notes, including the earlier one-command time-gate
exception while evaluating the removed RN wrapper, are retained in the build note.

## Remaining activation/release work

1. Confirm configured event retention and vendor/transfer arrangements. The local
   token, actual EU project and ingestion host have been verified through the
   connected project; the token is not recorded here.
2. Review the exact consent copy/event schema, audience/minor handling and policy
   for previously transmitted data/deletion requests.
3. Extend the bounded private-device checks to full traffic inspection and the
   remaining capture/permission, backup/transfer, accessibility and device matrix.
   The testing APK and unsigned AAB were built; OFF/ON/restart/withdrawal checks
   and real-project ingestion are recorded in the phone QA follow-up.
4. Update and approve the public policy/Data safety against this final behavior.
   The linked public page is still a draft; it was not published/rewritten here.
5. Prepare funnel/distribution/return dashboards for the opted-in subset. Global
   opt-in rates cannot be inferred from declined users' untransmitted data.

No public release or compliance sign-off is implied by passing source tests.
