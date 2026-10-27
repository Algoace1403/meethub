# Meet Hub on Cloudflare

The site, room signaling, and chat run together in your Cloudflare account. Native WebRTC sends audio and video directly between browsers or through the configured TURN relay. No personal computer, VM, paid database, or separate meeting website is required.

## Deploy

Use a Cloudflare account on the Workers Free plan. This configuration uses SQLite-backed Durable Objects, available on that plan. It does not upgrade billing or purchase a domain.

```sh
npm ci
npx wrangler login
npm run deploy:cloudflare
```

The current deployment is **https://meethub.algoace-meethub.workers.dev**. Wrangler prints the actual HTTPS address after each deployment. Open it, create a meeting, and use **Invite people → Copy meeting link**. Guests open that same site and join in their browser. No app installation or account is required.

Keep `VITE_SIGNALING_URL` unset for this deployment: the site connects to its own `/signal?room=...` WebSocket endpoint. Never put account tokens in frontend environment variables or Git.

## Local Cloudflare preview

```sh
npm run dev:cloudflare
```

Open `http://localhost:8787`. In another terminal, run `npm run check:cloudflare` to exercise the local Workers runtime. The Node adapter remains available through `npm run build` followed by `npm start` on port 3001.

## Availability and limits

The Hibernation WebSocket API releases idle compute while Cloudflare keeps browser sockets connected. A new message wakes the room automatically. Membership restores from socket attachments; up to 50 recent chat messages restore from SQLite-backed storage. When the last connection leaves, room history is deleted. Media is not recorded or stored.

This avoids a personal computer or sleeping free VM. It does not guarantee uninterrupted availability: provider outages, deployments, network failures, and free-tier quota exhaustion can interrupt service. The client retries dropped room connections with backoff.

Up to four people can join a room. Media uses a peer-to-peer mesh for this small prototype. No paid relay or subscription is enabled. Free quotas can change; inspect [Workers pricing](https://developers.cloudflare.com/workers/platform/pricing/), [Durable Objects pricing](https://developers.cloudflare.com/durable-objects/platform/pricing/), and [limits](https://developers.cloudflare.com/durable-objects/platform/limits/). Remain on the Free plan if spending must be zero.

The source fallback uses Cloudflare's public STUN service for network discovery. The public deployment has backend relay configuration; actual two-way video over TLS TURN was verified on 27 October 2026. Fresh deployments still require their own relay secrets. If a provider fails or its quota is exhausted, the backend falls back to STUN and restrictive networks may join/chat without establishing media. See [Cloudflare STUN/TURN FAQ](https://developers.cloudflare.com/realtime/turn/faq/).

## Retain the Vercel address (optional)

After deploying the Worker, build the frontend on Vercel with `VITE_SIGNALING_URL=wss://YOUR_ACTUAL_WORKER_HOST/signal`. The Worker allows the existing `https://meethub-pink.vercel.app` frontend via `ALLOWED_ORIGINS` in `wrangler.jsonc`. Add any custom frontend origin there and redeploy the Worker before using it.

Copied invitation links always use the frontend's current origin. Signaling uses your own backend without navigating guests away.

## Redeploy

Run `npm run deploy:cloudflare` after changes. The `v1` migration creates the initial SQLite-backed room class; future class changes need additional migration entries. Existing WebSockets can reconnect during updates. No uptime-pinging service is needed.

## Guest audio/video stuck connecting

A room WebSocket connection and a media connection are separate. STUN alone cannot relay audio/video across every NAT or firewall. Guests on different mobile or restricted Wi-Fi networks may require TURN.

For a strictly free prototype, create a Metered no-card Free TURN trial (use the allowance shown in the dashboard; provider allowances can change), do not add a payment method, and do not enable paid top-ups. Create one client credential under TURN → Credentials; use Get credential → Show API Key on that row as the backend TURN API key, not the workspace secret. Run `npm run setup:relay` and enter its app name and TURN API key in the private local form. The helper verifies the account credentials and stores `METERED_APP_NAME` and `METERED_API_KEY` as Cloudflare backend secrets. The application and signaling remain on your Cloudflare Worker; guests are never sent to the relay provider website. Stay within the Free quota; availability depends on that provider and its allowance.

Alternatively, store your own client ICE configuration as the backend `ICE_SERVERS_JSON` secret. A Cloudflare Realtime TURN key can be configured through `TURN_KEY_ID` and `TURN_API_TOKEN`, but that service has usage-based overages and is not activated by this repository. Do not enable a billable plan without authorization.

After configuration, reload both clients and rejoin. The backend supplies client ICE credentials in the join response before any peer connection is created. Account API keys remain server-side. `/health` reports whether relay settings are configured; this does not prove relay connectivity. Verify actual video with `iceTransportPolicy: relay` and inspect the selected candidate pair before declaring a cross-network issue fixed.

The client times out stalled room handshakes, checks idle WebSocket connections, retries peer negotiation, and exposes a reconnect button after a failed attempt. Chat can continue when the room is connected but media is unavailable. Shared URLs must be public HTTPS links rather than localhost links.
