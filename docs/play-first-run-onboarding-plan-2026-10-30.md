# Stimmyz two-button first-run onboarding plan

Date: 30 October 2026. Revised for the two-button handoff. Status: source implementation complete; native build and device/visual QA limits are recorded below. This revision supersedes the earlier toggle-and-Continue onboarding plan.

Implementation update: source implementation is now recorded in the [October 30 implementation and verification record](play-first-run-onboarding-2026-10-30.md). The plan below preserves the intended sequence and deferred activation requirements.

## Sources reviewed

- Current authority: Downloads `Stimmyz_Two_Button_Onboarding_Prototype_and_Astra_Handoff_2026-10-30.zip`, including its Markdown handoff, self-contained interactive HTML, and supplied Vanilla/Grape Privacy previews. Working extraction is under ignored `data/two-button-onboarding-handoff-2026-10-30/`.
- Prior reference: `Stimmyz_First_Run_Onboarding_Prototype_and_Astra_Handoff_2026-10-30.zip`. Its onboarding switch, draft choice and generic Continue action are superseded by the explicit two-button flow.
- Root `AGENTS.md`, `README.md`, `STEPS.md`, `PLAN.md`, and `app-play/README.md`. No additional `AGENTS.md` was found under `app-play/`.
- Current `app-play/App.tsx`, Settings, preferences, branding, analytics storage/service/event schema/transport, backup boundaries, and build wiring.
- [Owner beta privacy decisions](production/BETA_PRIVACY_DECISIONS-2026-10-30.md) and [existing analytics implementation](play-product-analytics-2026-10-28.md).

The onboarding package governs the new UI. Existing board/editor/library behavior remains governed by the current project implementation and its later owner refinements. The HTML is a visual/interaction reference; its localStorage consent simulation is not a native persistence or transport design.

## Intended flow

1. **Welcome:** step 1/2, existing transparent mint wordmark, decorative tilted eight-pad soundboard, "Your sounds. Your soundboard.", brief description, Record/Import/Play badges, and **Let's get started**. No account or permission prompt.
2. **Privacy:** step 2/2, Back, shield illustration, disclosure card, PostHog attribution and policy link. Two explicit actions: **Share usage analytics** requests affirmative consent; **Continue without analytics** records OFF. No onboarding toggle, draft selection, default answer or generic Continue button.
3. **Soundboard:** enter the existing board shell. Successful completion is saved independently of analytics consent, including when declined. Later launches and app updates skip the flow after completion is saved.

Privacy Back returns to Welcome without completing onboarding or recording a choice. Returning to Privacy still has no selected answer. Android Back on Privacy does the same; Back on Welcome follows normal Android exit behavior and saves no choice. Leaving the app or opening the external policy link never grants consent.

**Button contract:** use equal full-width targets, approximately 54dp tall at normal text size and never below 48dp; allow height to grow with font scaling. Match the filled accent Share button and outlined Continue without analytics button from the new previews. Neither button has selected state. Both lead into the same full app. Sharing is effective only after all activation checks and persistence succeed; a failed check leads into the app with analytics OFF and an accurate explanation, without saving a latent ON choice for later activation.

Do not port the desktop review sidebar, simulated status bar, device frame, reset controls, Settings replay link, prototype disclaimers, or unrelated prototype features. The decorative mini-board must not play audio or create saved sounds.

## Findings that affect implementation

| Area | Current repository | Planned treatment |
| --- | --- | --- |
| Startup | `App.tsx` mounts the board and initializes analytics independently on mount. | Resolve onboarding and valid consent eligibility before analytics can activate; avoid a board flash or legacy-consent startup dispatch. |
| Completion | No first-run completion record. Preferences v5 are included in media backups. | Add a separate versioned installation-local completion store outside `play-library` and ZIP exports; do not extend portable preferences for this. |
| Consent | Installation-local v1 consent and random installation ID; Settings uses the shared service. | Keep one consent authority, version it for materially changed disclosures/gates, and never migrate v1 ON into new consent. Completion is not consent. |
| Event disclosure | Eight event names are implemented; the new handoff describes sound-creation attempts, saves and failures. The previous handoff proposed `creation_started`, `sound_saved`, `creation_failed`. | Finalize the exact event/property allowlist. No active analytics build may describe only these three outcomes while sending the current eight-event contract. Minimized scope needs an explicit implementation slice before activation. |
| Eligibility | Owner record requires eligible-user determination before offering opt-in; onboarding deliberately has no age questionnaire. The handoff also references an earlier 18+ gate. | Preserve no-age-question onboarding. Until the conflicting eligibility requirements are resolved, keep activation unavailable and clearly OFF. Do not infer eligibility from the 16+ listing or pressing Share. Any enabled rollout must resolve whether the Share action may be offered under that rule. |
| Policy link | Settings uses `https://stimmyz.vercel.app/privacy/`; prototype uses `https://stimmyz.app/privacy/`. | Centralize the selected policy URL and verify the approved live page before an analytics-enabled build. Neither URL's current content was verified in this planning pass. |
| Visuals | Existing nine-theme tokens, icons, gradients and packaged wordmark. | Reuse them for native responsive views; do not add remote assets or screenshot the whole UI. |

## Delivery sequence

### 1. First-run state and startup contract

Suggested new files: `app-play/src/onboarding/storage.ts`, `model.ts`, and focused state/storage tests.

- Persist a small strict record such as `{ version: 1, completed: true }`. Keep onboarding format version separate from consent/disclosure version and app version. Routine app updates do not force another onboarding pass.
- Missing or corrupt completion means Welcome; storage failures must never imply analytics consent. Keep app functionality available when completion cannot be saved, with an honest notice that onboarding may appear again on restart.
- Model finalization as `finishOnboardingChoice(share: boolean)`: Share passes `true`, Continue without analytics passes `false`. There is no draft-consent state. Viewing either screen, navigating Back or opening the policy creates no consent, identifier, queue, transport or request.
- The `false` path never constructs or calls the optional analytics SDK. It records OFF through the shared consent service's local-only path, saves completion and opens the board.
- Serialize finalization and ignore repeated taps. Close the analytics gate first; persist completion and the explicit consent result through one coordinator. Activate only after both writes succeed and every independent gate passes. Any interrupted or failed write leaves analytics OFF; do not persist a reusable ON record before completion is durable.
- When completion is saved but consent writing fails, allow entry with analytics OFF and a recoverable Settings message. When completion writing fails, allow entry for this session with analytics OFF and explain that completion was not saved.
- A valid completion record must not suppress a later consent-version invalidation: keep the app usable, turn analytics OFF, and require any renewed affirmative choice through the reviewed privacy UI.

**Recommended upgrade default:** installations without a completion marker see the two screens once, including existing testers updating to this version. Preserve all existing media, boards and preferences. This is an explicit migration assumption, since the handoff does not specify how pre-onboarding installs are identified. If onboarding must apply only to genuinely fresh installs, select and test a reliable legacy-install migration before coding; sound/board counts alone are insufficient evidence.

Acceptance: missing/corrupt record, completed ON/OFF, unsupported versions, interrupted finalization, concurrent taps and failed writes have deterministic outcomes, with no pre-completion analytics activation. The two buttons pass explicit booleans; navigation cannot produce ON.

The HTML uses `stimmyz-ui-demo-onboarding-v2` and deliberately ignores v1 demo choices. Do not copy its combined localStorage record into Android or assume its v2 number is the native schema version. The revision also fixes a first-load declaration-order bug by initializing the key before reading it; native startup tests must cover persisted rehydration on a real process restart, not just an in-memory rerender.

### 2. Native Welcome and Privacy screens

Suggested new file: `app-play/src/ui/OnboardingFlow.tsx`; use existing `theme.ts`, `Icons.tsx`, `PadGradient.tsx` and the local logo asset. Share privacy disclosure text/status with Settings where useful; retain the later consent switch only in Settings.

- Match the supplied Vanilla and Grape hierarchy: large rounded hero/card, colored title emphasis, two-step progress, generous spacing and full-width actions.
- Use the new Privacy copy and grouping: "What you'd be sharing", "Basic feature usage and errors", "Not your sounds", and "Always your choice". Explain attempts/saves/failures, excluded content, full functionality without analytics and later changes in Settings. Keep PostHog attribution and the policy link below the card. Welcome retains its approved layout and copy.
- Use a scrollable responsive layout, safe-area insets and minimum touch targets; keep actions reachable at large font sizes without fixed phone-height assumptions. Never bake the preview's tiny font sizes into native accessibility behavior.
- Hide the normal header, tab bar, playback overlays and menus while onboarding is active. Restore the current app shell on completion.
- Make illustration content decorative for TalkBack; announce step headings and move focus after transitions. Give Back, policy link and both final actions accurate roles and states; both choice buttons must be focusable. Respect reduced motion. While finalizing, prevent a second conflicting choice and announce progress.
- For the initial analytics-disabled candidate, explain that sharing is unavailable in this build. Preserve the two explicit actions; if Share is pressed, keep consent/collection OFF, finish onboarding and show the unavailable reason. Never report successful sharing or save an ON preference for automatic activation in a future build. An enabled rollout must use the resolved eligibility rule before offering opt-in.
- Remove "This prototype never sends analytics" and use accurate native status copy. Keep "Both choices take you straight to Stimmyz." Retain the explanation that OFF stops future collection rather than deleting historical vendor data. Never claim anonymity.

Acceptance: close visual match in Vanilla/Grape, readable in all nine themes, no clipped content on small screens/large text, no permissions or network-loaded media.

### 3. App integration and consistent Settings

Modify `app-play/App.tsx`, `app-play/src/ui/SettingsModal.tsx`, and the analytics lifecycle interfaces as needed.

- Add explicit startup states for loading onboarding, Welcome, Privacy, completing and ready. Keep local library loading independent so a library error cannot prevent the privacy choice; retain the existing retry/backup recovery UI after onboarding.
- Prevent the current mount-time analytics initializer from activating old v1 consent before the new gate is resolved. Enforce this inside the service as well as the React render path.
- Finalization calls the existing shared consent lifecycle rather than creating a second PostHog client or consent file owned by the UI.
- Settings reflects effective shared status immediately: eligible successful Share means ON; decline or any failed gate means OFF. Keep the Settings grant/revoke switch subject to the same gates, with truthful availability/error reasons. No production replay/reset control.
- Revocation closes the gate synchronously, cancels retries/in-flight work where supported, and discards pending unsent events. Do not interpret the handoff's "flush pending events" as sending queued data after withdrawal.
- Centralize disclosure text and the policy link; handle link-opening failure without losing the step or recording a choice. Keep permissions contextual to recording/capture actions.

Acceptance: Continue without analytics reaches the board, remains OFF after restart and never calls the SDK. Share reaches the same board with ON only if every gate and write succeeded, otherwise truthful OFF. Completed users skip the flow; Settings changes use the same service; all three creation sources, playback, board settings, themes, Library and backup/restore still work.

### 4. Separate analytics activation slice

The onboarding UI can be implemented and verified with analytics disabled. Enabling collection requires resolution of the source documents' eligibility conflict and the remaining beta inputs, not an invented age answer or a new questionnaire added to this design.

- Reconcile the owner's 16+ eligibility record, the handoff's referenced earlier 18+ requirement, and the no-age-question UX into one explicit rule. Unknown eligibility remains OFF. Check the original prior privacy handoff before changing eligibility behavior; it is referenced, not included, in this onboarding ZIP.
- Approve the three-event proposal (including each allowed property), finite beta end time, retention/deletion facts and identifier policy. The current adapter requires an installation ID, so removing or changing identifiers requires deliberate adapter/schema work and wire verification.
- Reduce event producers/allowlist/transport together if the three-event proposal is selected; remove or disable the other five paths and verify default SDK fields. Do not introduce onboarding-impression, decline or opt-in-rate tracking.
- Add versioned consent and explicit beta/build/time/eligibility gates. Recheck them at activation and each dispatch; expiry or gate closure must discard queued events and stop retries even if the app remains running.
- Update build/staging validation for any required gate inputs. Standard builds continue to disable analytics.
- Reconcile website disclosures with measured behavior and verify the selected policy link before collection. Publication remains a separate owner-controlled release action.

Acceptance: missing token/config, legacy consent, uncertain eligibility, unsupported/expired beta, SDK errors and storage errors all produce zero collection without breaking core app use. A supported enabled case requires the explicit Share action (or later reviewed Settings grant) and successful persistence. Withdrawal never sends pending events or automatically deletes historical vendor records.

### 5. Verification and delivery record

- Focused lifecycle/storage tests: fresh install with no selected answer; explicit decline; eligible Share; Share with failed gates/SDK; disclosure views and policy round trip without a choice; Back/re-entry; cold process restart after YES and NO; update; legacy ON; corrupt data; double-submit and conflicting button taps; process death between writes; denied writes; revocation and activation races; expiry while queued. Assert no SDK calls on the decline path.
- Backup/restore tests prove neither completion nor consent/identity/queue is exported, and importing media cannot opt in. Preserve Android backup/data-transfer exclusions.
- Run the Play test suite and strict TypeScript through the existing Docker workflow. Run staging/build checks if startup packaging or analytics gate inputs change.
- Build an analytics-disabled candidate first and compare native screenshots with the supplied references. Exercise TalkBack, large font/display scale, small Android viewport, reduced motion, external-policy round trip, offline restart and an in-place upgrade preserving user data.
- For a later enabled candidate, use synthetic traffic inspection to prove no pre-consent requests, only approved events/properties after consent, no media/names/paths/raw errors/unapproved identifiers, and immediate closure on revoke/expiry. Tie evidence to the tested artifact; existing October 28 results do not verify the new flow.
- Record implementation and verification limits, then add links in README/STEPS while preserving their current uncommitted changes. No automatic commit, push, install, publication or Play submission.

## Implementation ownership

Per project workflow, delegate implementation to a `gpt-6-luna` worker with high reasoning effort and bounded file ownership; the primary agent reviews architecture, the diff and verification. Start with the state/storage slice, then UI/integration, then any approved analytics activation work. Avoid concurrent edits to `App.tsx`, Settings or the analytics lifecycle. This planning pass contains no coding implementation and did not spawn a coding worker.

## Decisions carried into the next step

- Proceed with the exact Welcome and two-button Privacy flow, without age questions, permissions prompts, an onboarding switch or a generic Continue action. Keep analytics unavailable until the independent activation requirements are resolved.
- Use the exact choices **Share usage analytics** and **Continue without analytics**, with equal-sized accessible targets and no preselected answer. Both enter the same full app.
- Use separate installation-local completion persistence and the existing shared consent authority.
- Default to one onboarding pass for installs without a saved marker, preserving existing app data; confirm a different upgrade policy only if required.
- Treat the three-event model and new policy URL as proposed changes requiring implementation/verification before analytics activation, rather than claiming the existing app already matches the prototype.
