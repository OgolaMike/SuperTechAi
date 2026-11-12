# SuperTech AI mobile app foundation

The web application remains the shared product. Capacitor wraps the same Vite build for Android and iOS.

## Local development

1. Install Node.js 22 and dependencies: `npm install`.
2. Build the web app: `npm run build`.
3. Generate native projects once: `npx cap add android` and/or `npx cap add ios`.
4. Sync after web changes: `npm run mobile:sync`.
5. Open native projects with `npm run mobile:android` or `npm run mobile:ios`.

Android builds require Android Studio/SDK and Java 21. iOS builds require macOS and Xcode.

## CI

The Android workflow produces a debug APK for internal device testing. The iOS workflow produces an unsigned simulator build. These are validation artifacts, not store-ready signed releases.

## Store release prerequisites

- Register the publisher's verified Google Play and Apple Developer accounts.
- Confirm the legal entity, financial-services permissions and broker/provider relationships for all trading features in each target market.
- Complete privacy disclosures, account deletion, support/contact details, age/risk notices and store declarations.
- Configure production signing keys and Play App Signing; configure Apple certificates, provisioning profiles and App Store Connect.
- Complete device testing, accessibility, push notification entitlements and privacy review.
- Generate and verify branded launcher icons and launch screens.
- Review platform-specific financial trading restrictions before submitting. A successful wrapper build does not imply store approval.

Never commit signing keys, provisioning profiles, API secrets or broker credentials.
