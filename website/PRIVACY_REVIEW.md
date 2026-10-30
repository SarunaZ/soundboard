# Privacy policy release review — complete before publishing

**Status:** OPEN / developer name and privacy email supplied; final APK/AAB verification and contact checks remain pending.

- Supplied developer / data controller: **Šarūnas Zubė, operating under the name Stimmyz**.
- Supplied privacy contact: **privacy@stimmyz.app**.
- [ ] Verify that the supplied developer name matches the developer identity in Play Console.
- [ ] Verify that `privacy@stimmyz.app` is monitored for requests and complaints.
- [ ] Build and inspect the **actual release APK/AAB**, merged `AndroidManifest.xml`, and bundled dependencies/SDKs, not just a prototype. Check `RECORD_AUDIO`, `POST_NOTIFICATIONS`, MediaProjection / foreground-service permissions, file access, internet access, and whether any background data access occurs.
- [ ] Verify the **device-audio capture flow**: user initiated, OS capture consent, limited to capturable source audio, obvious active recording/Stop, microphone not silently used in device-only mode. Check permission/revocation behavior.
- [ ] Confirm exactly which data the app **collects/transmits off-device**. Inspect network calls and SDK documentation for crash reporting (Firebase Crashlytics/Sentry), analytics (Firebase Analytics etc.), Google Play services, advertising (AdMob/other), updates, diagnostics, and any external APIs. Do not claim “no data collected” if SDKs collect identifiers or diagnostics.
- [ ] If ads/analytics/crash reporting/cloud sync are present, revise the policy to name or describe recipients and categories, retention, consent and opt-out choices as appropriate. Complete Google Play **Data safety** consistently.
- [ ] Verify all sounds, images, board settings, temporary recordings, and caches are truly **local-only**, if claiming that. Test app data deletion, deletion of individual clips, uninstall, and export behavior.
- [ ] Inspect `android:allowBackup`, backup rules, device-to-device transfer, and cloud backups. Update **retention and deletion** accurately (including whether files survive uninstall via export/backups).
- [ ] Confirm security claims: Android sandbox, HTTPS for actual network traffic, encryption if claiming it, access to photo picker and storage, whether sensitive debug logs are excluded.
- [ ] Determine target audience and if any **Families/children** requirements apply; replace provisional text.
- [ ] Decide site host and identify its **server-log/cookie** handling; if adding any tracking, update website privacy and relevant consent mechanism.
- [ ] Remove the draft warning and `noindex, nofollow` metadata after the review. Update the effective date and verify links/grammar.
- [ ] Make final privacy policy accessible via stable **public HTTPS** URL, no login, no PDF, non-geofenced, non-editable. Check an incognito browser.
- [ ] Add the identical privacy-policy URL to **Google Play Console** and a visible link or text **inside the Android app**.
- [ ] Replace “Google Play · Coming soon” with an actual Play Store URL only when published. Do not invent early availability claims.
- [ ] Replace unlicensed prototype meme artwork and clips in promotional screenshots with screenshots of content you can lawfully promote.

Official references (check these at submission time):
- https://support.google.com/googleplay/android-developer/answer/18258653
- https://support.google.com/googleplay/android-developer/answer/10144311
- https://support.google.com/googleplay/android-developer/answer/9859455
