# Stimmyz privacy audit — 28 October 2026

**Subsequent implementation:** the [product analytics record](../../play-product-analytics-2026-10-28.md)
documents later source changes, including the Privacy card/policy link and disabled-by-default
analytics. Findings below describe the earlier audited artifacts/source. Those
retained APK/AAB files do not contain the later implementation. Release sign-off
remains open. The later [physical QA follow-up](../../play-product-analytics-phone-2026-10-28.md)
records a private 1.0.30/code 31 update, bounded consent checks and verified EU
ingestion; it does not replace full traffic or device-transfer inspection.

**Result: technical inspection completed for available source, retained artifacts
and public website. Release privacy sign-off is NOT READY.** Runtime network and
device-transfer behavior remain untested; public identity/contact and other owner
facts remain open. No application behavior, account settings, DNS, public policy
or Play declarations were changed.

- [Evidence and data flows](EVIDENCE_AND_DATA_FLOW.md): build identity, dependency
  inventory, permissions, media lifecycle, website and test results.
- [Open questions](OPEN_QUESTIONS.md): owner answers, unresolved decisions and tests.
- [Remediation](APP_AND_SITE_REMEDIATION.md): ordered fixes and acceptance checks.
- [Retained evidence](evidence/): artifact report, resolved Gradle dependencies,
  manifest, build-input hashes, live policy snapshot, HTTP/DNS and verification
  summaries. These contain public/technical information, not user audio or inbox
  content. No legal name or private mailbox was recorded.

The inspected Play source is **1.0.29 / code 30**, package
`dev.sarunas.soundboard.play`, based on commit `b6d89ad` plus existing uncommitted
changes. All 104 inputs recorded for the retained build match current source.
The signed testing APK, unsigned APK and unsigned AAB were inspected; this is not
a newly rebuilt artifact or a verified Play-distributed installation.

Key findings:

1. Source and artifact evidence support local media processing and explicit
   user-directed export. No known analytics SDK was found in the families checked.
   Networking capability exists; absence of runtime traffic is not proven.
2. Public policy returns HTTP 200 and matches the local built draft exactly. It
   contains legal-name/email placeholders, a draft notice and `noindex, nofollow`.
3. Settings has local privacy information but no public policy link or configured
   support address. Report a problem opens the Android share chooser without
   automatically attached media or diagnostics.
4. Backup/transfer exclusions are present in the APK resources. Device/OEM
   behavior and deletion/cache cleanup still need candidate-specific device proof.
5. Owner confirms individual publication, working inbound domain email and
   approval for future pseudonymous return measurement. Branded replies, public
   controller name, support retention and exact audience selection remain open.
   The owner clarified a general-purpose tool with no particular audience targeted;
   possible child downloads do not by themselves establish child-directed design.

Verification this pass: **206/206 Play tests**, **14/14 stage/plugin tests**,
TypeScript passed, and current StageOnly verification passed with 105 files.
The Docker engine was unavailable. ADB ran outside the restricted sandbox but
reported no attached devices. No app was installed, launched, reset or uninstalled.

Next: settle the open owner facts and obtain runtime evidence, then implement the
approved privacy controls/analytics and review exact policy wording. This audit
does not approve live PostHog collection or policy publication.
