# Run the project-owned backend on Render

The backend source is `server/index.mjs`, `server/meeting-server.mjs` and `server/ice-config.mjs`. Render supplies the hosting infrastructure; it does not supply the application's room or signaling implementation. Browser media remains native WebRTC, direct or relayed through the configured TURN provider.

`render.yaml` prepares a single Free Node web service that builds and serves both the React frontend and the project's own WebSocket backend. It uses `npm ci && npm run build`, `npm start`, and `/health`. The server binds to `0.0.0.0` on Render's `PORT` automatically. Use one instance: room membership is held in process memory and cannot be distributed across independently running instances without shared coordination.

## Deployment

1. Connect the Render account and select the workspace.
2. Create the service from the repository Blueprint, or create a Node Web Service from `https://github.com/Algoace1403/meethub` with the settings above.
3. Keep the instance on **Free** unless a paid plan has been explicitly authorized.
4. Set backend TURN credentials privately if relayed media is needed. `METERED_APP_NAME`/`METERED_API_KEY`, `TURN_KEY_ID`/`TURN_API_TOKEN`, or `ICE_SERVERS_JSON` use the same server-only integration as the existing deployment. Do not place provider API keys in Git, frontend variables or chat.
5. Open the assigned `https://<service>.onrender.com` URL and verify `/health`. Node health responses identify `runtime: node`; `relayConfigured` is only a configuration indicator. Actual relayed media must be tested separately.
6. Leave `VITE_SIGNALING_URL` blank when Render serves both parts; the browser connects to the same host's `/signal` endpoint.
7. To retain the Vercel frontend, rebuild it with `VITE_SIGNALING_URL=wss://<actual-service>.onrender.com/signal`. The backend's `ALLOWED_ORIGINS` includes the public Vercel origin. Verify the actual socket destination in a fresh browser session.

A prepared Blueprint is not proof of deployment. The current public URLs remain the existing deployment until a Render service has actually been created, configured and tested. Record the assigned URL and change submission links only after that verification.

## Availability and data lifetime

Render Free web services spin down after 15 minutes without inbound HTTP or WebSocket traffic and can take about a minute to wake. The existing client heartbeat sends traffic during a call, but availability is still subject to platform/network failures and quotas. The app's join timeout and backoff permit retries; an idle service can require a wait or retry on first access. Do not promise always-on service from the Free plan.

The Node backend retains up to 50 messages per occupied room in process memory. Room history is cleared when the room empties or the server restarts/redeploys/spins down. Recent room links and display names remain in browser local storage. This differs from the optional Cloudflare Durable Object adapter, which preserves occupied-room chat through hibernation. Permanent meeting/chat history is outside the product scope.

Relay configuration is not automatically copied from Cloudflare secrets to Render. Provider account secrets must be configured in Render privately. New Node socket connections request fresh client ICE configuration through a short-lived cache so a long-running process does not indefinitely reuse expired credentials.

References: [Render WebSockets](https://render.com/docs/websocket), [Free service limits](https://render.com/docs/free), [Blueprint specification](https://render.com/docs/blueprint-spec).
