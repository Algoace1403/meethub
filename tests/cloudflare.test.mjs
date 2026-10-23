import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';

const base = process.env.WORKER_TEST_URL;
const integration = (name, fn) => test(name, { skip: !base }, fn);
async function fixture(t) {
    const room = 'test-' + crypto.randomUUID();
    const origin = new URL(base).origin;
    async function peer(roomId = room) {
        const url = new URL('/signal', base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:'; url.searchParams.set('room', roomId);
        const socket = new WebSocket(url, { origin });
        const queue = [], waiters = [];
        socket.on('error', () => {});
        socket.on('message', raw => {
            const value = JSON.parse(raw); const index = waiters.findIndex(waiter => waiter.type === value.type);
            if (index < 0) queue.push(value);
            else { const waiter = waiters.splice(index, 1)[0]; clearTimeout(waiter.timer); waiter.resolve(value); }
        });
        t.after(() => socket.terminate());
        await once(socket, 'open');
        const next = type => {
            const index = queue.findIndex(value => value.type === type);
            if (index >= 0) return Promise.resolve(queue.splice(index, 1)[0]);
            return new Promise((resolve, reject) => { const waiter = { type, resolve, timer: setTimeout(() => reject(new Error('Missing ' + type)), 5000) }; waiters.push(waiter); });
        };
        const send = message => socket.send(JSON.stringify(message));
        return { socket, next, send, join: async (extra = {}) => { send({ type: 'join', room: roomId, name: 'Guest', ...extra }); return next('joined'); } };
    }
    return { peer, room, origin };
}

integration('Cloudflare rooms route media negotiation and prevent cross-room signaling', async t => {
    const { peer } = await fixture(t); const a = await peer(), first = await a.join({ name: 'Host' }); const b = await peer(), second = await b.join();
    assert.equal(second.peers[0].id, first.self.id);
    b.send({ type: 'signal', to: first.self.id, description: { type: 'offer', sdp: 'v=0' } });
    assert.equal((await a.next('signal')).from, second.self.id);
    const other = await peer('other-' + crypto.randomUUID()); await other.join();
    other.send({ type: 'signal', to: first.self.id, description: { type: 'offer', sdp: 'v=0' } });
    assert.equal((await other.next('error')).code, 'peer-unavailable');
});

integration('Cloudflare capacity, identity checks and resumed sessions remain consistent', async t => {
    const { peer, room } = await fixture(t); const host = await peer(), first = await host.join(); const others = [];
    for (let i = 0; i < 3; i++) { const p = await peer(); await p.join(); others.push(p); }
    const fifth = await peer(); fifth.send({ type: 'join', room: 'wrong-route' }); assert.equal((await fifth.next('error')).code, 'invalid-room');
    const intruder = await peer(); intruder.send({ type: 'join', room, resumeId: first.self.id, resumeToken: '💚'.repeat(24) });
    assert.equal((await intruder.next('error')).code, 'invalid-session');
    fifth.send({ type: 'join', room }); assert.equal((await fifth.next('error')).code, 'room-full');
    const oldClosed = once(host.socket, 'close');
    const resumed = await peer(); const info = await resumed.join({ resumeId: first.self.id, resumeToken: first.resumeToken }); assert.equal(info.self.id, first.self.id);
    await oldClosed; resumed.send({ type: 'ping' }); await resumed.next('pong');
    others[0].socket.close(); await resumed.next('peer-left');
    const joined = await fifth.join(); assert.equal(joined.peers.length, 3);
});

integration('Cloudflare chat uses server identity and survives an idle interval', async t => {
    const { peer } = await fixture(t); const a = await peer(), info = await a.join({ name: 'Actual name' }); const b = await peer(); await b.join();
    a.send({ type: 'chat', name: 'Fake', from: 'fake', text: '<b>hello</b>' });
    const message = (await b.next('chat')).message; assert.equal(message.name, 'Actual name'); assert.equal(message.from, info.self.id);
    a.socket.send('{'); assert.equal((await a.next('error')).code, 'invalid-message');
    await new Promise(resolve => setTimeout(resolve, 12000));
    const c = await peer(), joined = await c.join(); assert.equal(joined.messages[0].text, '<b>hello</b>'); assert.equal(joined.peers.length, 2);
    a.send({ type: 'ping' }); await a.next('pong');
});

integration('Cloudflare rejects foreign browser origins and serves own room routes', async () => {
    const url = new URL('/signal?room=valid-room', base); url.protocol = url.protocol === 'https:' ? 'wss:' : 'ws:';
    const bad = new WebSocket(url, { origin: 'https://foreign.test' }); const [error] = await once(bad, 'error'); assert.match(error.message, /403/);
    assert.equal((await fetch(new URL('/health', base))).status, 200);
    const roomPage = await fetch(new URL('/my-own-room', base)); assert.equal(roomPage.status, 200); assert.match(await roomPage.text(), /Meet Hub/);
});
