# StimmyzApp — GIPHY artwork picker (Astra handoff)

**Revision:** 2026-10-22  
**Status:** high-fidelity **interactive UI simulation**; **no live GIPHY API integration** and **no GIPHY media** in the deliverable.

## Intent

Improve artwork discovery while preserving the **device-audio-first** flow and uncluttered main UI. In `Source → Trim → Details / Make it yours`, replace the old nonfunctional generic Search artwork tab with **GIPHY**. Choices remain **Default**, **Gallery**, **GIPHY**. Do not add GIPHY to primary Board / Editor / Library navigation or global Settings.

This handoff is about the **markup and interaction contract**. Before enabling production GIPHY discovery or allowing a GIPHY reaction to be attached to a pad, complete the provider review in the **Policy / release gate** section.

## Prototype interaction design

1. Open `prototype/standalone.html`, choose the **Customize / GIPHY** preview button at right (desktop); on mobile use the existing sound-creation Details step.
2. Select **GIPHY** in the artwork source row. A styled provider section opens inline under the name input.
3. View a 3-column sample result grid with a search field, **Stickers / GIFs** segmented chips, sample reaction labels, and visible attribution.
4. Search `cat`, `wow`, or `laugh` to filter the small embedded *demo* dataset. Empty queries display suggestions; unmatched queries show the empty state.
5. Tap a result. A selected border/check appears and the optional-artwork hero preview changes. Tap **Default** to remove selection; Gallery keeps the existing OS gallery path.
6. Tap **Save soundbite**. **In this browser-only mock**, the chosen *sample reaction ID* is attached to the sound's UI representation. No copyrighted GIPHY media are retrieved, saved, cached, downloaded, embedded, or exported. The audio clip retains its offline behavior.
7. View the preserved Board and Library paths; the demo distinguishes `Audio offline · art online` for a GIPHY-referenced sound.

Result cards are locally styled emojis created for UI demonstration. **They are NOT actual GIPHY results**, should not be mistaken for GIPHY-owned licensed artwork, and do not prove the production integration works.

## Production integration proposal (pending authorization)

**Basic UX**

- Search GIPHY using its **official approved Android API/SDK**, with separate **Stickers / GIFs** filters and debounced queries (e.g., 250–350 ms), bounded result counts and pagination; cancel stale search requests.
- Follow the provider's current approved API key and production-key requirements. Display branded **Powered by GIPHY** attribution as required; review official marks/placement rather than interpreting the prototype's colored bars as approved logo artwork.
- Use unchanged GIPHY-returned media URLs (including query parameters) when displaying previews. Do not proxy GIPHY media or API requests, reorder/filter result order contrary to terms, or mix another provider's cards in the same returned grid.
- Implement loading, no-results, quota/rate-limit, no-internet, declined-permission, removed-content and failed-preview states. Preserve the query and selection across transient UI redraws. Do not ask media permissions merely to search; Gallery requests appropriate Android photo-picker permission only as needed.
- On selecting a reaction, show a preview and explain `Artwork needs internet · your sound still works offline` before saving.
- Keep animated decoding/scaling resource-limited; avoid autoplaying many full animations at once if performance suffers.

**Policy / release gate — essential**

- GIPHY's default developer terms **prohibit caching copies or media URLs unless specifically approved**, and prohibit proxying requests. A standard API response is not a license to copy or ship imagery inside your application. See the official docs listed below.
- **Do not implement `download GIF → extract frame → save in app storage`, bundle selected GIPHY thumbnails in backup ZIPs, or cache media through generic image-loader disk caches without explicit provider approval.** Ensure the networking/image stack does not do automatic disk caching.
- Saving an online media **identifier** and displaying provider-hosted media when connected, with a local fallback icon when offline, is the **proposed UX direction only**. **Confirm with GIPHY that persistent use as personal sound-pad artwork outside the GIPHY search experience is permitted.** Do not claim it is already authorized.
- If this use case is not approved: keep the UI prototype as a concept, disable selection in release, and rely on locally chosen artwork, owned/licensed artwork, or another provider whose terms explicitly support persistent pad thumbnails.
- GIPHY attribution should be conspicuous where API content is displayed. Display attribution next to results and, if required by provider guidance, next to selected online pad imagery as well.
- Assess rights for recognizable characters, brands, and user-uploaded copyrighted material separately from compliance with the GIPHY API license.
- All audio remains local/offline, and failure or revocation of a remote artwork link falls back gracefully rather than preventing pad playback.

**Storage proposal** (only if approved):

```typescript
type Artwork =
  | { kind: 'default' }
  | { kind: 'gallery'; localUri: string }
  | { kind: 'giphy'; mediaId: string; provider: 'giphy'; fallback: 'music'; requiresNetwork: true };
```

Do not persist downloaded GIF blobs, base64 snapshots, or cacheable URLs. Existing local-gallery art remains compatible with backups; remote GIPHY references (if permitted) export as metadata only, with a fallback when missing or offline. Preserve backwards-compatible local artwork migrations.

## Acceptance cases

- **GP-01** Artwork source choices are Default / Gallery / GIPHY. No fourth main tab and no extra global setting.
- **GP-02** GIPHY inline picker matches all six approved themes and narrow mobile widths.
- **GP-03** Search query filtering, switch between GIFs/Stickers, no-results and selected result states render correctly without losing entered sound name.
- **GP-04** Selected result appears in artwork preview; Default removes it; Gallery import still works.
- **GP-05** Sound can be saved and played offline regardless of whether remote artwork is available; fallback artwork is reliable.
- **GP-06** GIPHY source and attribution are visible; samples explicitly say demo / not live.
- **GP-07** Before production enablement: provider approval for persistent pad display is recorded, and implementation passes a no-disk-cache/no-proxy/request-URL-integrity review.
- **GP-08** Regression: Quick Add first, edit-only pad ⋮, 3×4 / 4×4, Pages / Scroll, clip gain and repeat, Trim preview and six themes unchanged.
- **GP-09** Native release test: offline state, broken remote link, quota failures and rapid-query cancellation do not impair soundboard performance or local audio playback.

## Official provider sources reviewed 2026-10-22

- GIPHY Developer API: <https://developers.giphy.com/docs/api/> — beta API keys, production review and search endpoints.
- GIPHY attribution: <https://developers.giphy.com/docs/api/#attribution> — `Powered by GIPHY` marks in API integrations.
- GIPHY prohibited integration and caching rules: <https://developers.giphy.com/docs/api/> — no unapproved media caching, media URL alteration, proxies, or mixed-provider result grids.

**Do not use the obsolete/new-customer-unavailable Google Custom Search JSON API as a GIPHY substitute.**

## Reporting required from Astra

Identify actual Android architecture; propose provider access & compliance plan; state whether persistent pad use is authorized; enumerate exact files changed; include Vanilla/Coffee screenshots; run GP-01..GP-09 and existing board/playback regression tests. Do not call the HTML prototype a working GIPHY integration.
