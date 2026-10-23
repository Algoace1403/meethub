# Meet Hub

A lightweight browser meeting prototype with its own room server and native WebRTC media. Create a room, copy its link, and invite up to four people. Guests stay on Meet Hub, with no account or app installation required.

Live Cloudflare deployment: **https://meethub.algoace-meethub.workers.dev**

## Run locally

Requires Node.js 22.12 or newer.

```sh
npm ci
npm run build
npm start
```

Open **http://localhost:3001/**. The same process serves the frontend and handles room signaling. Camera and microphone access works on localhost; remote devices need HTTPS.

For frontend development, run `npm run server` and `npm run dev` in separate terminals. Vite proxies the local signaling connection to port 3001.

## Features

- Unique room links and browser pre-join screen.
- Peer-to-peer audio/video for up to four participants.
- Camera/microphone toggles, screen sharing, chat, participants, and raised hands.
- Joining with devices off and enabling them later.
- Room-server reconnects and same-site help.
- Responsive cream/forest-green UI and Meet Hub icons.

## Free prototype hosting

See [DEPLOYMENT.md](DEPLOYMENT.md). `npm run deploy:cloudflare` publishes the site and room backend together using Workers Static Assets and SQLite-backed Durable Objects. Hibernating WebSockets keep idle rooms connected without an always-running VM. Use the Workers Free plan and included provider address. Availability and usage limits still apply.

No payment integration or paid media relay is configured. The default browser ICE configuration uses a free public STUN server for network discovery. Some networks require a TURN relay and cannot connect with STUN alone. Use `npm run setup:relay` to connect a strictly Free relay account; no relay account or paid plan is created automatically. Calls have not been certified for every physical device or network combination.

## Test

```sh
npm test
npm run build
```

The backend tests exercise room isolation, signaling, chat attribution, room capacity, malformed messages, resume-token handling, reconnects, and browser-origin enforcement. Browser verification checks actual remote video frames, copied links, cross-client chat, device controls, raised hands, device-free joining, and same-site navigation.

Cloudflare restores membership from socket attachments and the latest 50 messages from room storage after hibernation; the local Node adapter stores them in memory. Room history is removed when the last connection leaves. Media streams travel between browsers; they are not recorded or routed through this server.

The original Meet Hub code is proprietary; see [LICENSE](LICENSE). Third-party dependency notices are retained in [public/THIRD_PARTY_NOTICES.txt](public/THIRD_PARTY_NOTICES.txt).
