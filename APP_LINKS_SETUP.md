# App Links / Universal Links setup

## Android (opens anonroom.in links in the APK)

1. Host is already served at `https://anonroom.in/.well-known/assetlinks.json`
2. Replace `REPLACE_WITH_YOUR_UPLOAD_KEYSTORE_SHA256` with your signing cert fingerprint:

```bash
keytool -list -v -keystore your-upload.jks -alias your-alias
# copy SHA-256
```

3. In the Capacitor AndroidManifest (CI generates android/), add intent filters for https://anonroom.in

4. package_name must match: `in.anonroom.app`

## iOS

1. Replace `TEAMID` in `apple-app-site-association` with your Apple Team ID
2. Enable Associated Domains: `applinks:anonroom.in`

## In-app navigation

Use `navigateInApp(path)` from `src/lib/subdomain.js` instead of `window.open` / full `location.href` for same-origin routes.
