import test from 'node:test';
import assert from 'node:assert/strict';
import { getIceConfig, validIceServers } from '../server/ice-config.mjs';

test('missing relay credentials explicitly reports discovery-only service', async () => {
    const config = await getIceConfig();
    assert.equal(config.relayAvailable, false);
    assert.deepEqual(config.iceServers, [{ urls: 'stun:stun.cloudflare.com:3478' }]);
});
test('configured relay credentials override discovery-only settings', async () => {
    const config = await getIceConfig({ ICE_SERVERS_JSON: JSON.stringify([{ urls: 'turns:relay.test:443?transport=tcp', username: 'short-lived', credential: 'client-secret' }]) });
    assert.equal(config.relayAvailable, true);
    assert.equal(config.iceServers[0].credential, 'client-secret');
    assert.deepEqual(validIceServers([{ urls: ['https://wrong.test', null, 'turn:relay.test:3478'] }, { urls: null }]), [{ urls: ['turn:relay.test:3478'] }]);
});
test('a free relay account is fetched by the backend without exposing its API key', async () => {
    const env = { METERED_APP_NAME: 'meet-hub-test', METERED_API_KEY: 'private-free-api-key' };
    let calls = 0;
    const request = async url => {
        calls++;
        assert.equal(url.hostname, 'meet-hub-test.metered.live');
        assert.equal(url.searchParams.get('apiKey'), env.METERED_API_KEY);
        return Response.json([{ urls: 'turns:standard.relay.metered.ca:443?transport=tcp', username: 'client', credential: 'client-password' }]);
    };
    const result = await getIceConfig(env, request);
    assert.equal(result.relayAvailable, true);
    assert.equal(JSON.stringify(result).includes(env.METERED_API_KEY), false);
    await getIceConfig(env, request); assert.equal(calls, 1);
    await assert.rejects(getIceConfig({ ...env, METERED_APP_NAME: 'foreign.example/path' }, request), /Invalid/);
});
test('relay API tokens stay server-side and only temporary credentials reach clients', async () => {
    let calls = 0;
    const env = { TURN_KEY_ID: 'test-' + crypto.randomUUID(), TURN_API_TOKEN: 'private-api-token' };
    const request = async (url, options) => {
        calls++;
        assert.match(url, /\/credentials\/generate-ice-servers$/);
        assert.equal(options.headers.Authorization, 'Bearer private-api-token');
        assert.equal(JSON.parse(options.body).ttl, 86400);
        return Response.json({ iceServers: [{ urls: ['turn:turn.cloudflare.com:3478?transport=udp', 'turns:turn.cloudflare.com:443?transport=tcp'], username: 'temporary-name', credential: 'temporary-secret' }] });
    };
    const result = await getIceConfig(env, request);
    assert.equal(result.relayAvailable, true);
    assert.equal(JSON.stringify(result).includes('private-api-token'), false);
    assert.equal((await getIceConfig(env, request)).iceServers[0].username, 'temporary-name');
    assert.equal(calls, 1);
});
test('a failed credential request is retried and never cached as a working relay', async () => {
    const env = { TURN_KEY_ID: 'test-' + crypto.randomUUID(), TURN_API_TOKEN: 'private' };
    await assert.rejects(getIceConfig(env, async () => new Response('', { status: 403 })), /could not issue/);
    await assert.rejects(getIceConfig(env, async () => Response.json({ iceServers: [{ urls: 'stun:stun.cloudflare.com:3478' }] })), /not returned/);
    const result = await getIceConfig(env, async () => Response.json({ iceServers: [{ urls: 'turn:relay.test:3478', username: 'name', credential: 'secret' }] }));
    assert.equal(result.relayAvailable, true);
});
