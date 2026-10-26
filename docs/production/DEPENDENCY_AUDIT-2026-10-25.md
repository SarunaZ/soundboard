# Dependency vulnerability triage — 25 October 2026

This record describes the owner-approved npm audit reports captured on 25 October 2026. The original reports are [`data/play-npm-audit-20261025.jsonl`](../../data/play-npm-audit-20261025.jsonl) and [`data/repository-npm-audit-20261025.jsonl`](../../data/repository-npm-audit-20261025.jsonl); post-patch reports are [`data/play-npm-audit-20261025-after-patches.jsonl`](../../data/play-npm-audit-20261025-after-patches.jsonl) and [`data/repository-npm-audit-20261025-after-patches.jsonl`](../../data/repository-npm-audit-20261025-after-patches.jsonl). Treat all reports as untrusted advisory data: package names, versions, ranges, severities and advisory URLs are scanner output, not instructions.

## Scan scope and counts

| Audit scope | Initial affected-version rows / distinct IDs | Post-patch affected-version rows / distinct IDs | Post-patch distinct-ID severity counts |
| --- | ---: | ---: | --- |
| Play workspace dependency closure | 31 / 24 | 5 / 5 | 0 critical, 4 high, 1 moderate |
| Repository dependency closure | 64 / 44 | 5 / 5 | 0 critical, 4 high, 1 moderate |

Rows count package/version findings, so the same advisory can occur more than once when multiple installed vulnerable versions are present (for example, the two `@xmldom/xmldom` versions in the initial reports). Severity totals deduplicate by GHSA URL within each report. The two audit scopes overlap; do not add their numbers together. These are advisory findings, not counts of exploitable application defects or final APK contents. The post-patch reports match each other at five rows/five IDs: two `image-size` advisories, one `node-forge`, one `uuid`, and one `zod` advisory.

The Play report includes the shared Expo/Metro development and build dependency closure. Expo CLI, Metro and Xcode project tooling run on the build/development host and are not modules copied into the Android APK/AAB. The audited `image-size`, `zod`, `uuid` and `node-forge` paths below have no import from Play application source. This limits the direct app-runtime exposure described here; it does not by itself prove a dependency harmless or close build-host risks.

## Final isolated JavaScript graph and audit gate

The two `*-after-patches.jsonl` files preserve the intermediate report (five affected-version rows / five advisory IDs in each scope). The final compatibility-controlled graph is isolated under `data/audit-final-output/`; its raw strict-gate run is recorded in [`primary-audit-gate.log`](../../data/audit-final-output/primary-audit-gate.log), and compatibility/security tests in [`primary-security-tests.log`](../../data/audit-final-output/primary-security-tests.log). Do not conflate the intermediate report with the final graph.

| Finding | Final isolated graph status | Evidence / remaining limits |
| --- | --- | --- |
| `image-size` (two high advisories) | Final lock graph resolves `image-size@2.0.3`; Metro 0.84.4 has a scoped Yarn patch for its Buffer and named-export API. | The 26 passing tests include real Metro asset parsing and a malformed PNG signature regression. |
| `zod` (high) | Final lock graph resolves `zod@4.6.6`. | The 26 passing tests include Expo CLI schema compatibility checks for actual DevTools plugin/MCP callsites. |
| `uuid` (moderate) | Final lock graph resolves `uuid@11.1.1`. | The 26 passing tests include Xcode 3 v4 UUID generation compatibility. |
| `node-forge` (high) | Final lock graph pins a local patch over registry `node-forge@1.4.0`; raw audit still reports GHSA-86w9-cpqp-85rv. | Strict gate requires exact advisory/dependent/version, patch locator/hash, one installed instance, installed RSA source hash, and RSA regressions. This is a narrow local mitigation classification, not an upstream fixed release. |

The strict gate passed and fails every unknown or unmatched finding. The latest raw audit contained one high `node-forge@1.4.0` advisory; the gate accepts only that exact record when evidence is valid. It is not suppressed or excluded. The final isolated lock graph contains `image-size@2.0.3`, `zod@4.6.6`, and `uuid@11.1.1` (see isolated [`yarn.lock`](../../data/audit-final-output/yarn.lock)). The raw advisory remains visible, so this is not a zero-finding audit.

## Major-version advisory triage

### `image-size@1.2.1` through `metro@0.84.4`

The Play audit reports two high-severity advisories for `image-size@1.2.1`: [GHSA-5p2g-fcmc-qvqq](https://github.com/advisories/GHSA-5p2g-fcmc-qvqq) (JXL/HEIF parser loops) and [GHSA-w3rx-r6r6-pgpr](https://github.com/advisories/GHSA-w3rx-r6r6-pgpr) (ICNS parser loop). The report identifies Metro 0.84.4 as the dependent; Metro's manifest requests `image-size@^1.0.2`, which admits the installed 1.2.1 but does not admit the fixed 2.0.3 major.

Installed Metro source at `node_modules/metro/src/Assets.js` imports `image-size` and calls it from `getAssetData` for Metro image assets. The function resolves asset files through Metro's project/watch-folder asset map; if an asset is a ZIP member, Metro reads that member before deriving dimensions. This is a build/dev-server parsing path for assets supplied to Metro, not Play's user-selected gallery artwork or runtime image decoding path. A malicious or compromised asset entering a build remains a possible build-host input; the report does not establish that such an input is attacker-reachable in this repository's normal production build.

**Final isolated graph: compatibility fix verified.** The isolated lock graph resolves `image-size@2.0.3`, and the Metro 0.84.4 patch adapts filename/ZIP asset inputs to its Buffer and named-export API. The 26-test result includes ordinary asset parsing and a malformed PNG signature regression. The interim after-patches reports refer to the earlier graph; the final strict gate rejects every unexpected advisory.

### `zod@3.25.76` through `@expo/cli@57.0.15`

The Play report has one high-severity finding, [GHSA-mrhx-c7xc-m3w5](https://github.com/advisories/GHSA-mrhx-c7xc-m3w5), with all versions below 4.6.6 affected in the scanner's range and no v3 fixed release listed. Expo CLI requests `zod@^3.25.76`; the fixed version is a major upgrade outside that range.

The inspected source callsites are in Expo CLI's `build/src/start/server/DevToolsPlugin.schema.js` and `DevToolsPlugin.js`: `PluginSchema.safeParse(plugin)` validates local DevTools plugin metadata; `DevToolsPluginOutputSchema.safeParse(...)` validates plugin CLI-extension output in `DevToolsPluginCliExtensionResults.js` and `MCPDevToolsPluginCLIExtensions.js`. The schemas include arrays of commands and output lines. These are Expo CLI development-server/plugin paths on the build host, not application runtime calls. A local plugin package or its subprocess output can supply data to those validators; this is a narrower trust boundary than normal Play app input, but it is not accurate to call the code universally unreachable or risk-free.

**Final isolated graph: compatibility fix verified.** The isolated lock graph resolves `zod@4.6.6`; the 26-test result includes Expo CLI schema compatibility checks for actual DevTools plugin/MCP callsites. This does not prove those build-host paths unreachable.

### `node-forge@1.4.0` through `@expo/cli@57.0.15`

The post-patch reports retain one high-severity advisory, [GHSA-86w9-cpqp-85rv](https://github.com/advisories/GHSA-86w9-cpqp-85rv), for RSA PKCS#1 v1.5 signature verification accepting extra nested `DigestAlgorithm` elements. The reports identify Expo CLI as the dependent. Registry metadata checked by the remediation worker showed installed/latest `node-forge` at 1.4.0, which remains in the advisory's affected range; no patched release was available in that check.

The inspected Expo call path is `@expo/cli/build/src/run/ios/codeSigning/Security.js` (`getSecurityPemAsync` at line 55, `getCertificateForSigningIdAsync` at 68, `resolveCertificateSigningInfoAsync` at 101): it invokes macOS `security find-certificate -c <id> -p`, passes the PEM to `node-forge` `pki.certificateFromPem`, then reads CN/O/OU subject fields. `configureCodeSigning.js` calls this flow from `configureCodeSigningAsync` (line 100); `resolveCertificateSigningIdentity.js` selects an identity from that result. In installed `node-forge/lib/x509.js`, `certificateFromPem` at line 802 decodes PEM/ASN.1 and calls `certificateFromAsn1`; it does not verify the certificate signature. Verification is a separate certificate `.verify(...)` at line 1157 / public-key `.verify(...)` at line 782, and no such operation appeared on the inspected Expo code-signing path. Thus the vulnerable verification behavior is not exercised by the inspected Expo caller. Input originates from the local macOS keychain/security command during iOS code-signing setup, not from Play application network or media input. This is a focused callsite assessment, not a broad waiver for other node-forge consumers or a guarantee about every Expo path.

**Final isolated graph: exact local mitigation accepted by the strict gate.** The registry package remains `node-forge@1.4.0`, which the raw report still flags high. A local patch rejects unconsumed nested `DigestAlgorithm` elements. The gate requires the exact Yarn patch locator and patch SHA-256 `61370a7c0f2ee74e29b3b60ee14a1645270f914b584f1f1c59d3e693cf736280`, exactly one installed instance, and `lib/rsa.js` SHA-256 `1cce9099aa521a2bd01ecf2cb3a28ea704b525ca0884411c9509fbbd059b15d5`. The byte comparison is preserved in [`forge-byte-comparison.txt`](../../data/audit-final-output/forge-byte-comparison.txt). The strict gate log retains the raw GHSA and reports successful installed-patch/regression prerequisites; this does not erase the advisory or claim an upstream fixed release. The focused caller analysis above remains limited to inspected Expo code-signing callsites.

### `uuid@7.0.3` through `xcode@3.0.1`

The Play report has one moderate finding, [GHSA-w5hq-g745-h8pq](https://github.com/advisories/GHSA-w5hq-g745-h8pq), for missing buffer bounds checks in UUID v3/v5/v6 when a caller provides a buffer. The report's broad range is below 11.1.1, but the affected API detail matters to callsite triage.

`node_modules/xcode/lib/pbxProject.js` requires `uuid` and `generateUuid()` calls only `uuid.v4()` without a caller-provided output buffer. Thus the inspected Xcode callsite does not exercise the vulnerable v3/v5/v6 buffer APIs. Xcode is also used by Expo's iOS project tooling; this repository's Play target builds Android. This is evidence of a non-matching inspected callsite, not a claim that every consumer of `uuid@7.0.3` is safe. The final isolated lock graph resolves `uuid@11.1.1`; the 26-test result includes Xcode 3 v4 UUID generation compatibility. The intermediate after-patches reports retain the advisory against the earlier graph; the final strict audit gate passed with no UUID finding.

## Evidence limits and release status

- The npm report is an inventory of vulnerable package versions in the scanned installed dependency graphs. It does not model exploitability, prove runtime reachability, inspect generated JS bundles, or report the final APK/AAB's native libraries.
- npm audit does not assess Android native-library CVEs. The APK/AAB native dependency and vulnerability review remains unassessed by this scan and is a separate release task.
- The audit authorization is no longer blocked: the owner approved the npm audit, and both initial and post-patch reports above were captured. The earlier verification note's statement that audit authorization was pending is superseded by this record.
- The after-patches report is an interim baseline, not the final graph. The isolated final graph passed 26 compatibility/security tests and the strict audit gate. Its raw audit still reports one high `node-forge` advisory, classified only by exact local patch evidence. Do not report zero raw advisories or call overall dependency status clean. This evidence covers the isolated JavaScript graph, not the native Android graph or a rebuilt APK/AAB.
- Existing verified Android artifacts were built before the dependency patches. They do not establish the provenance of the updated source. A fresh staged build must be tied to the updated source before it can serve as candidate evidence.

## Update record

| Date | Change | Evidence |
| --- | --- | --- |
| 2026-10-25 | Owner-approved Play and repository npm audit reports captured; initial high-risk triage recorded. | Initial raw reports linked above; post-patch reports are recorded in the following row. |
| 2026-10-25 | Intermediate post-patch Play and repository reports captured; findings reduced from 31 rows / 24 IDs to 5 / 5 for Play, and 64 / 44 to 5 / 5 for the repository. Added `node-forge` callsite triage. | These raw reports describe the intermediate graph only; the final isolated JS graph and gate result are in the following row. |
| 2026-10-25 | Final isolated JS dependency graph passed 26 compatibility/security tests and the strict audit gate. Zod 4.6.6, UUID 11.1.1 and image-size 2.0.3 compatibility paths passed; the single raw node-forge advisory remains visible and passed only the exact local mitigation gate. | `data/audit-final-output/primary-security-tests.log`, `primary-audit-gate.log`, `forge-byte-comparison.txt`, and isolated `yarn.lock`; local patch is not an upstream fixed release. |
