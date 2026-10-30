# Play product analytics build configuration

Product analytics is disabled in ordinary Play builds. A build opts in only
when `-EnableProductAnalytics` is supplied together with a public PostHog
project token:

```powershell
./scripts/build-play-android.ps1 -EnableProductAnalytics
```

With that explicit switch, the build reads
`EXPO_PUBLIC_POSTHOG_PROJECT_TOKEN` from `app-play/.env.local` (or the process
environment). The file is ignored by Git and excluded from the staged source.
You can also pass `-PostHogProjectToken` directly instead of using the local
file.

For a consented physical QA build that needs local diagnostic breadcrumbs, also
pass `-AnalyticsDiagnostics`. This switch requires `-EnableProductAnalytics`;
it is off by default and writes only sanitized `STIMMYZ_ANALYTICS_QA` lines,
without tokens, installation IDs, event bodies or raw error text.

Use the project token intended for client applications. It is included in the
app bundle and is not a secret; never pass a personal API key or a secret/admin
key. The build rejects opt-in when the token is missing or malformed and
rejects a token supplied without the explicit opt-in switch. Stage-only review
works without a token and records analytics as disabled:

```powershell
./scripts/build-play-android.ps1 -StageOnly
```

The build fixes the PostHog host to `https://eu.i.posthog.com`, and the
JavaScript configuration additionally requires
`EXPO_PUBLIC_PRODUCT_ANALYTICS_ENABLED=true`. The integration uses the
stateless `@posthog/core` client, pinned at 1.61.2; it does not add the
React Native wrapper or optional native plugins. Release metadata records the
enabled state, fixed host, and SDK name and version without recording the
project token. The analytics source is included in the reviewed Play stage so
its relative imports are checked by the normal stage verifier.

*Dependency review note:* `posthog-react-native` 4.84.3 was inspected from its
public metadata and integrity-verified tarball. Its RN lifecycle setup installs
an AppState listener that cannot be removed through its public API, so the
final integration uses the reviewed `@posthog/core` 1.61.2 stateless client.
The one-time Yarn resolution of the inspected RN package used
`--no-time-gate` because the repository's default quarantine blocked that exact
release. No repository quarantine configuration was changed, and the final
dependency graph uses the direct core pin instead.
