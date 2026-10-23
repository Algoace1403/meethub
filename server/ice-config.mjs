const discovery = [{ urls: 'stun:stun.cloudflare.com:3478' }];
const cache = new Map();

export function validIceServers(value) {
    if (!Array.isArray(value)) return [];
    return value.slice(0, 12).flatMap(server => {
        const urls = (Array.isArray(server?.urls) ? server.urls : [server?.urls])
            .filter(url => typeof url === 'string' && /^(stun|stuns|turn|turns):[^\s]+$/.test(url));
        if (!urls.length) return [];
        const result = { urls };
        if (typeof server.username === 'string') result.username = server.username;
        if (typeof server.credential === 'string') result.credential = server.credential;
        return [result];
    });
}

// This function runs only on the backend. A TURN API token never enters a
// browser bundle; participants receive expiring client credentials instead.
export async function getIceConfig(env = {}, request = fetch) {
    if (env.ICE_SERVERS_JSON) {
        const iceServers = validIceServers(JSON.parse(env.ICE_SERVERS_JSON));
        if (!iceServers.length) throw new Error('Invalid ICE configuration');
        return { iceServers, relayAvailable: iceServers.some(server => server.urls.some(url => /^turns?:/.test(url))) };
    }
    if (env.METERED_APP_NAME && env.METERED_API_KEY) {
        if (!/^[a-z0-9-]{1,63}$/.test(env.METERED_APP_NAME)) throw new Error('Invalid relay app name');
        const key = 'metered:' + env.METERED_APP_NAME + ':' + env.METERED_API_KEY;
        const existing = cache.get(key);
        if (existing && existing.expiresAt > Date.now()) return existing.promise;
        const promise = (async () => {
            const endpoint = new URL(`https://${env.METERED_APP_NAME}.metered.live/api/v1/turn/credentials`);
            endpoint.searchParams.set('apiKey', env.METERED_API_KEY);
            const response = await request(endpoint, { signal: AbortSignal.timeout(6000) });
            if (!response.ok) throw new Error('The free relay service could not issue credentials');
            const iceServers = validIceServers(await response.json());
            if (!iceServers.some(server => server.urls.some(url => /^turns?:/.test(url)))) throw new Error('Relay credentials were not returned');
            return { iceServers, relayAvailable: true };
        })();
        cache.set(key, { promise, expiresAt: Date.now() + 10 * 60 * 1000 });
        try { return await promise; } catch (error) { cache.delete(key); throw error; }
    }
    if (!env.TURN_KEY_ID || !env.TURN_API_TOKEN) return { iceServers: discovery, relayAvailable: false };
    const key = env.TURN_KEY_ID + ':' + env.TURN_API_TOKEN;
    const existing = cache.get(key);
    if (existing && existing.expiresAt > Date.now()) return existing.promise;
    const promise = (async () => {
        const response = await request(`https://rtc.live.cloudflare.com/v1/turn/keys/${encodeURIComponent(env.TURN_KEY_ID)}/credentials/generate-ice-servers`, {
            method: 'POST', headers: { Authorization: `Bearer ${env.TURN_API_TOKEN}`, 'Content-Type': 'application/json' },
            body: JSON.stringify({ ttl: 86400 }), signal: AbortSignal.timeout(6000)
        });
        if (!response.ok) throw new Error('The relay service could not issue credentials');
        const iceServers = validIceServers((await response.json()).iceServers);
        if (!iceServers.some(server => server.urls.some(url => /^turns?:/.test(url)))) throw new Error('Relay credentials were not returned');
        return { iceServers, relayAvailable: true };
    })();
    cache.set(key, { promise, expiresAt: Date.now() + 30 * 60 * 1000 });
    try { return await promise; } catch (error) { cache.delete(key); throw error; }
}
