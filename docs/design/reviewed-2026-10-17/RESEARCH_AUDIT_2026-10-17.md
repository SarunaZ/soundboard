# StimmyzApp — Legal, market and product audit (17 October 2026)

**Audience:** Astra coding agent and product owner. **Status:** researched recommendations, not legal advice and not verification of the Android source repository. This document supersedes any conflicting legal or market assumptions in the earlier handoff. Keep design changes scoped and confirm current implementation in code before working.

## Decision summary

- **Proceed with a Play Store-oriented MVP**, but narrow the value proposition: personal voice/meme soundboard, instant one-tap playback, occasion-specific boards, fast local import and voice recording, offline control. **Don't claim board layouts, artwork, trimming or offline playback are unique**, as direct competitors already offer them.
- **Keep YouTube extraction out of the public Play Store release unless specifically authorized and legally reviewed.** Using `yt-dlp` locally, clipping only a few seconds, temporary downloading, or internally re-recording does not automatically supply platform permission. A personal/development build is **not** a legal exemption or authorization.
- **Inspect EVERY shipped sample sound, thumbnail, remote clip, store screenshot and marketing asset for rights.** Shipping recognizable copyrighted meme/cartoon clips can generate its own policy problem regardless of how users import their own media. Use original recordings or properly licensed examples by default. The AI-created visual references in this ZIP are *not production assets*.
- **Do not block the MVP on an online image-search integration.** Gallery/import, simple geometric icons and pad colors are enough. If online search is later used, provider terms control storage and attribution; GIPHY normally forbids partner caching and therefore conflicts with an offline-first artwork model.
- **Prioritize creation time, retention, restoration and simplicity** ahead of an elaborate theme engine or community store. Validate with real users in addition to testing visual polish.

## Legal/policy distinctions — precise boundaries

1. **Copyright in the media** and **platform terms governing retrieval** are separate layers. A short excerpt is not universally royalty-free. There is no categorical three-second safe harbor; EU exceptions and national implementation depend on circumstances.
2. Lithuania's **Copyright and Related Rights Act, Article 20** (edition effective 1 June 2026) allows certain personal, noncommercial reproductions of lawfully published works by natural persons. This exception is not blanket permission for public sharing, public performances, app-bundled clips or every mode of extraction. The CJEU's *ACI Adam* ruling distinguishes private copies from lawful versus unlawful sources.
3. YouTube's **general** ToS restrict downloading/reproducing/altering content unless authorized or legally permitted. Its **API-specific** policies expressly forbid audiovisual download/cache and audio-only separation without appropriate approval when API Services are used. Do not describe the API-specific terms as necessarily directly governing a pure `yt-dlp` integration; the general ToS and other rights still matter.
4. Apple's App Review **5.2.3** explicitly addresses unapproved third-party media downloading/conversion. Google Play's **Intellectual Property** policy prohibits encouraging infringement and identifies soundboards of copyrighted clips as potential violations. Approval is not a legal clearance.
5. A **microphone recorder** and **local-file importer** are general-purpose and have legitimate uses, but a user can still make unauthorized copies. Product marketing, bundling and sharing functionality affect risk. Be careful about recording other people without consent/notice; separate privacy and personality rights may apply.
6. **YouTube iframe playback supports `start` and `end` parameters**, contrary to an earlier statement in conversation. However, the compliant embedded player is not a reliable substitute for the one-tap/offline/audio-only UX: minimum visible player dimensions, no removing controls, ad interference or hidden/background playback, internet requirement, and start-seek approximations remain.
7. **Play Store flavor isolation** is a prudent engineering and review-risk control, not a statute requiring every unused extraction string to be absent. Keep code and dependencies separated to verify that the Store artifact genuinely lacks the downloader functionality. This does not legalize the separate personal build.

## Product and market reality

Competitors (public Google Play figures at time of review, download bands not DAU or revenue):

- **Custom Soundboard**, Johannes Maagk — 1M+ downloads; multiple boards, file/direct URLs, thumbnails, colors, millisecond trims, backup and board sharing. Developer explicitly says YouTube URL downloading was not implemented because of Google/YouTube guidelines.
  https://play.google.com/store/apps/details?id=me.maagk.johannes.customsoundboard
- **Meme Soundboard 2016–2026**, Oleh Andriushchenko — 1M+ downloads; custom boards, audio/video import and trimming, drag/drop layouts, light/dark themes, home-screen widgets.
  https://play.google.com/store/apps/details?id=fun.memesoundboard.andanylo
- **Voicy: Meme Soundboard & SFX** — 100K+ downloads; create personal sound libraries/boards, share sounds to messaging apps.
  https://play.google.com/store/apps/details?id=network.voicy

**Positioning hypothesis to test:** "Your favorite oddly specific sounds, one tap away" — personalized repeating quotes and inside jokes, not a giant generic prank-noise pack. Reddit discussions show people describing vocal stims and even using custom soundboards for them, but that is qualitative audience resonance, not validated install volume or monetization.

Be careful with language: vocal stimming usually describes vocal behavior, not necessarily hearing clips through a phone. Avoid medical claims, autism treatment promises, or assuming this audience's needs without speaking to them. Offer sensory-friendly options: no autoplay, accessible text, volume awareness, sound interruption/stop, reduced motion and light/dark/calm choices.

**Biggest commercial uncertainty:** removing arbitrary YouTube import also removes the low-friction discovery source that was the original hook. Design *file/record/import-to-play* to be frictionless, provide a few **rights-cleared** demo sounds and sensible empty states, and measure how many people create their own clips and return to play them.

**Validation targets (hypotheses, not market benchmarks):** ~20–30 potential users across meme/office/vocal-stim audiences, record task success and creation time, measure three clips made, 7-day retention, second-board creation, and word-of-mouth sharing. Interviews: where did your audio originate? What step was hardest? Would you still use it without YouTube links? What features are confusing? Compare experience side-by-side with Custom Soundboard on actual devices.

## Revised Astra priorities

### P0 before public test
- Repo-level audit: present all current `remote` preloads and **licensing provenance**; determine whether any playback/upload network calls conflict with the offline/privacy description.
- Store variant without arbitrary YouTube extraction (unless formal approval exists); confirm functionality and dependencies of both build variants; avoid promising personal-build legality.
- Global creation route, **local audio/video file import + microphone recording**, fast draggable waveform trimming, optional fine tune, naming, save and assign. Keep artwork optional and do not force 3 screens if user testing shows too much friction.
- Fix Android status bar overlap, small-screen scrolling, reachable controls, cancellation and source URI permissions.
- Ship original/licensed starter clips and images or empty state. No Scooby-Doo/recognizable copyrighted meme audio in the shipped assets without rights documentation.
- Privacy policy and Data Safety disclosures, even if no user data is collected; permission-in-context for microphone and accurate disclosures for all SDKs/APIs.

### P1 after creating/playing works smoothly
- Import from Android share sheet **when actual media files are shared**; a shared YouTube URL is not itself an authorized downloadable file.
- Optional photo picker artwork, crop/compression and default symbols; proper cleanup and rights notices.
- Export/import or backup of personally created board/clip content **with rights warnings**; this protects against losing app-private files on uninstall and creates sharing utility where lawful.
- Configurable quick-add action, appropriate board/clip menus, adequate touch targets, no duplicate controls.

### P2 only after evidence of need
- Online artwork search with provider-approved caching/redistribution and attribution.
- Licensed/creator-approved sound packs or direct authorized-media links; don't quietly reintroduce YouTube/TikTok scraping.
- Public board sharing: add moderation, infringement/reporting and takedown paths before enabling user-visible shared content.

### Specific API note: image search
- **GIPHY** API is a poor default for *offline saved thumbnails*: its current documentation states that normal partners must not cache/proxy/store media, except for individually approved exceptions, and requires Powered by GIPHY attribution.
- **Pexels** licenses broad use of photos, subject to restrictions, but its gallery is not focused on memes; review API-specific terms and attribution if using the API. Prefer local gallery and original clip artwork for v1.
- **Freesound** could be investigated for rights-cleared demo audio *per sound license* (CC0 vs CC BY vs NC), but its API is free only for noncommercial projects absent a separate agreement, and not all files have the same permissions. Avoid assuming that search/API access grants right to republish arbitrary files.

## Store readiness details not in the first handoff

- Google Play Data Safety form and **public privacy policy link** required even when developer declares no collection (internal test only has a form exception); microphone/network/analytics behavior must match declarations.
- Newly created **personal** Play developer accounts after 13 November 2023 require a closed test of at least **12 continuously opted-in testers for 14 days** before applying for production access (and may require further review). Check account eligibility rather than assume this applies to every developer account.
- Confirm app name **Stimmyz / StimmyzApp** trademark clearance, domain/social availability and potential confusing similarity prior to brand-heavy spend. A web search alone is not trademark clearance.
- Confirm distribution of any clip images/audio in exported boards respects third-party licenses. If a cloud feed of remote clips exists, review moderation, copyright provenance and privacy policy rather than assuming everything is local.

## Primary sources consulted (current on audit date)

- YouTube general ToS: https://www.youtube.com/t/terms
- YouTube API developer policies: https://developers.google.com/youtube/terms/developer-policies
- YouTube iframe start/end parameters: https://developers.google.com/youtube/player_parameters
- YouTube minimum player functionality: https://developers.google.com/youtube/terms/required-minimum-functionality
- Google Play intellectual property: https://support.google.com/googleplay/android-developer/answer/9888072
- Google Play user-generated content (when shared to others): https://support.google.com/googleplay/android-developer/answer/9876937
- Google Play Data Safety/privacy policy: https://support.google.com/googleplay/android-developer/answer/10787469
- Google Play new personal accounts closed testing: https://support.google.com/googleplay/android-developer/answer/14151465
- Apple App Review 5.2.3: https://developer.apple.com/app-store/review/guidelines/
- Lithuania copyright law, Article 20 (June 2026 edition): https://www.infolex.lt/ta/23542:str20
- CJEU case *ACI Adam*, C-435/12: https://infocuria.curia.europa.eu/tabs/redirect/juris/document/document.jsf?docid=150786&doclang=en
- EU copyright directive: https://eur-lex.europa.eu/eli/dir/2001/29/oj
- GIPHY API and no-cache guidance: https://developers.giphy.com/docs/api/
- Pexels license: https://www.pexels.com/legal-pages/license
- Freesound license and API conditions: https://freesound.org/help/faq/ and https://freesound.org/docs/api/terms_of_use.html

**Boundary:** This is a structured product/policy review, not legal counsel, store preapproval, or proof that any app currently satisfies every applicable legal requirement. If the public release depends on copyrighted third-party media, obtain an IP lawyer's scoped opinion for Lithuania/EU and intended distribution regions.
