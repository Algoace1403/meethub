# Run the UI refresh locally

The original Jitsi Meet app is in this repository. The refresh changes web presentation, copy, and brand assets. Room navigation, media handling, chat, screen sharing, and conferencing services continue to use Jitsi's implementations.

## Start

Requires Node.js 24 or newer and npm 11 or newer.

```sh
cd meethub
npm ci
npm start
```

Open **https://localhost:8080/**. The development server uses a self-signed HTTPS certificate; accept the browser's localhost certificate prompt. HTTPS supports camera and microphone access. If dependencies are already installed, only `npm start` is needed.

The current workspace was installed with `npm ci --ignore-scripts`, followed by `./node_modules/.bin/patch-package --error-on-fail`. This applies the upstream patches needed for the web build without running mobile setup. The lockfile and dependency versions are unchanged.

## Try it

1. Enter a unique meeting name and click **Start meeting**, or press Enter.
2. On the pre-join screen, enter your display name and check your camera and microphone.
3. Join the meeting and share its link with another participant. The other participant must be able to access the frontend hosting the link; their own `localhost` points to their own computer.
4. Return to the home page to find recent meetings. Use the settings gear for Jitsi's existing device, profile, and calendar settings.

## What runs locally

Webpack builds the actual Jitsi React frontend and serves its assets locally. Jitsi's upstream development setup proxies backend requests to **https://alpha.jitsi.net**. Internet access is required for actual conferences; authentication and service availability follow that backend's policy. This is not a self-hosted conferencing backend.

Use an existing compatible Jitsi deployment when required:

```sh
WEBPACK_DEV_SERVER_PROXY_TARGET=https://your-jitsi.example npm start
```

Run a full Jitsi server stack separately if you need a completely self-hosted installation. No server, signaling, authentication, or WebRTC logic was modified by this refresh.

## Changes

- Cream and forest-green welcome page, responsive meeting form, illustrated preview, and a three-step guide.
- Existing recent meeting and calendar panels and warning messages retained.
- Matching pre-join panel, rounded controls, and web theme colors.
- New SVG favicon plus matching Apple touch, ICO, and PWA icons.
- English strings use the existing translation system; other languages fall back to English for new copy.

## Checks

```sh
npm run tsc:web
./node_modules/.bin/eslint react/features/welcome/components/WelcomePage.web.tsx react/features/base/premeeting/components/web/PreMeetingScreen.tsx react/features/base/ui/components/BaseTheme.web.ts --max-warnings 0
git diff --check
```

The development build compiles with `npm start`. Browser review screenshots are stored as `local-preview-desktop.png`, `local-preview-mobile.png`, `local-preview-prejoin.png`, `local-preview-prejoin-mobile.png`, and `local-preview-meeting.png` after validation.

Validation completed on 23 October 2026: the webpack development bundles and web TypeScript check passed, and ESLint reported no warnings for changed components. Chrome checks covered desktop and 390 px mobile layouts, scrolling, the settings dialog, invalid room names, keyboard submission, pre-join controls, joining the development backend, camera and microphone toggles, and opening chat. No page JavaScript errors occurred. Media checks used Chrome's synthetic devices; real hardware and end-to-end multi-party media were not tested.
