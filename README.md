# Market Flow Android

Android app for displaying market status, news and featured-stock JSON feeds.

## Development

```bash
npm ci
npm run check
npm run check:feeds
```

The app reads the three JSON feeds from `KBYOO0815/market-flow-feed` and displays the published dates and sessions. Data changes do not require app rebuilds.

GitHub Actions provides manual test APK builds, release workflow validation, and signed AAB builds. Google Play internal testing publication requires explicit approval. No production or open-testing release is configured.

Current app version: 00.39 (versionCode 39).
