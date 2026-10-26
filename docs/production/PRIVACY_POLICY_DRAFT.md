# Stimmyz Privacy Policy (publication draft)

**Status:** Draft prepared from the current Play source on 25 October 2026. It is not a public policy URL until the owner supplies contact details, verifies the released dependency/network audit and publishes it over HTTPS.

**Developer / service provider:** Sarunas [confirm legal name and location before publishing]  
**Contact:** [support email or web contact required]  
**Effective date:** [set on publication]

## Summary

Stimmyz is a local soundboard. You can import sound files, record your voice, capture eligible device playback after Android's consent prompt, trim sounds, arrange boards and select artwork. The Play app stores its library and settings in private storage on your device. It does not require an account or provide cloud sync. Verify this description against the final capture-enabled candidate before publication; historical r3 is capture-off.

## Information stored on your device

Stimmyz stores the sound files you import or record, clip names and presentation choices, board and pad settings, playback volume/repeat settings, app preferences, and artwork thumbnails you choose. This information remains in the app's private storage. The app does not automatically upload sound files, recordings, file names or artwork to a Stimmyz server.

Imported media is selected using Android's system document picker. Artwork is selected using Android's system photo picker and copied into the app as a bounded thumbnail. The original selected files remain with their providers. Microphone recording starts only after you choose the microphone recording action and grant Android permission. The app does not record microphone audio in the background.

The app provides an optional manual backup/export. When you choose Export and select a location, the app writes a copy of selected app data there. That exported copy is controlled by the destination you choose; deleting it from the app does not delete that external copy. Android automatic app backup is disabled in the current Play build configuration, including explicit cloud-backup and device-transfer exclusions. Uninstalling the app removes its private app data. Keep an exported backup if you need a separate copy.

## Permissions and device playback capture

Android may ask for microphone permission when you choose Record your voice. Device playback capture requires a separate explicit action and Android MediaProjection consent; some apps prevent their playback from being captured. The application will not claim it can record every app. The final candidate must include this feature; the previously verified r3 build does not.

## Sharing and support

The Report a problem action opens Android's sharing interface with a blank prompt for you to describe the issue. Stimmyz does not automatically attach recordings, file names or diagnostic files. If you choose a share target and add information, that target's own privacy policy applies.

## Service providers and network activity

The current Play source does not configure an account service, advertising SDK, in-app purchase SDK, analytics SDK or crash-reporting SDK. Android, Google Play and selected file/gallery/share providers may process data under their own terms when you use their services. This description must be checked against the resolved dependency list and actual network traffic from the signed candidate before publication. If a future version adds any third-party service or app-owned endpoint, this policy and the Play Data safety declaration must be updated before release.

## Data retention and deletion

You can delete sounds, artwork, boards or exported copies using the in-app actions or the selected destination's controls. Removing a board keeps sounds in the Library. Removing a sound removes its app-owned data and assignments. Uninstalling Stimmyz removes its private local library. Stimmyz does not currently provide account-based remote deletion because it does not operate account storage.

## Children and changes

The intended audience and age rating have not yet been selected in Google Play Console. Confirm the target audience and any child-directed requirements before publication. This policy should be reviewed whenever data handling, SDKs or permissions change.

## Contact

For privacy questions or requests, contact: **[owner must provide a monitored support/privacy email or web form]**.
