import test from 'node:test';
import assert from 'node:assert/strict';
import { MeetingClient } from '../src/meeting.js';

class Socket extends EventTarget {
    static OPEN = 1;
    static instances = [];
    readyState = 0;
    messages = [];
    constructor(url) { super(); this.url = new URL(url); Socket.instances.push(this); }
    open() { this.readyState = 1; this.dispatchEvent(new Event('open')); }
    send(raw) { this.messages.push(JSON.parse(raw)); }
    receive(value) { const event = new Event('message'); event.data = JSON.stringify(value); this.dispatchEvent(event); }
    close(code = 1000) { if (this.readyState === 3) return; this.readyState = 3; const event = new Event('close'); event.code = code; this.dispatchEvent(event); }
}
function fixture(t, hostname = 'meethub.test') {
    t.mock.timers.enable({ apis: ['setTimeout', 'setInterval', 'Date'] });
    const previousSocket = globalThis.WebSocket, previousWindow = globalThis.window;
    Socket.instances = [];
    globalThis.WebSocket = Socket;
    globalThis.window = { location: { href: `https://${hostname}/our-room`, hostname } };
    const client = new MeetingClient({ room: 'our-room', name: 'Guest', title: 'Our room', status: {}, media: {}, onChange() {} });
    t.after(() => { client.close(); globalThis.WebSocket = previousSocket; globalThis.window = previousWindow; });
    return client;
}
const joined = { type: 'joined', self: { id: 'self-id' }, resumeToken: 'token', title: 'Our room', peers: [], messages: [], maxParticipants: 4 };

test('a guest whose socket never joins receives an actionable timeout and retries', t => {
    const client = fixture(t); client.start(); const first = Socket.instances[0];
    t.mock.timers.tick(12001);
    assert.equal(client.state, 'reconnecting'); assert.match(client.error, /not responding/); assert.equal(first.readyState, 3);
    t.mock.timers.tick(1400); assert.equal(Socket.instances.length, 2);
    assert.equal(Socket.instances[1].url.searchParams.get('room'), 'our-room');
});
test('Vercel builds without environment variables connect to the room backend', t => {
    const client = fixture(t, 'meethub-pink.vercel.app'); client.start();
    assert.equal(Socket.instances[0].url.hostname, 'meethub.algoace-meethub.workers.dev');
});
test('an unanswered connection check reconnects a half-open mobile socket', async t => {
    const client = fixture(t); client.start(); const socket = Socket.instances[0]; socket.open(); await client.handle(joined);
    t.mock.timers.tick(20000); assert.equal(socket.messages.at(-1).type, 'ping');
    t.mock.timers.tick(10000); assert.equal(socket.readyState, 3); assert.equal(client.state, 'reconnecting');
});
test('a received pong keeps the room connected', async t => {
    const client = fixture(t); client.start(); const socket = Socket.instances[0]; socket.open(); await client.handle(joined);
    t.mock.timers.tick(20000); await client.handle({ type: 'pong' }); t.mock.timers.tick(11000);
    assert.equal(socket.readyState, 1); assert.equal(client.state, 'joined');
});
test('messages from a replaced socket cannot overwrite the resumed session', async t => {
    const client = fixture(t); client.start(); const old = Socket.instances[0]; old.open(); client.reconnect();
    old.receive({ ...joined, title: 'Stale room' }); await client.incoming;
    assert.equal(client.self, undefined);
    const current = Socket.instances[1]; current.open(); current.receive(joined); await client.incoming;
    assert.equal(client.title, 'Our room'); assert.equal(client.self.id, 'self-id');
});
test('an obsolete ICE candidate does not abort the new negotiation', async t => {
    const client = fixture(t); let added = 0;
    const peer = { pc: { remoteDescription: { sdp: 'v=0\r\na=ice-ufrag:new-session\r\n' }, async addIceCandidate() { added++; } } };
    await client.addCandidate(peer, { usernameFragment: 'old-session' }); assert.equal(added, 0);
    await client.addCandidate(peer, { usernameFragment: 'new-session' }); assert.equal(added, 1);
});

test('an answer from the previous media attempt cannot overwrite a replacement connection', async t => {
    const client = fixture(t); let applied = 0;
    const peer = { generation: 'current-attempt', pc: { signalingState: 'have-local-offer', async setRemoteDescription() { applied++; } } };
    await client.receiveSignal(peer, { description: { type: 'answer', sdp: 'old answer' }, replyTo: 'old-attempt' });
    assert.equal(applied, 0);
});
