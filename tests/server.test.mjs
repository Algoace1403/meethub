import test from 'node:test';
import assert from 'node:assert/strict';
import { once } from 'node:events';
import WebSocket from 'ws';
import { createMeetingServer } from '../server/meeting-server.mjs';

async function fixture(t, options = {}) {
  const app = createMeetingServer({
    origins: ['https://meethub.test'],
    ...options,
  });
  await new Promise((resolve) => app.server.listen(0, '127.0.0.1', resolve));
  t.after(() => app.close());
  const address = `ws://127.0.0.1:${app.server.address().port}/signal`;
  async function peer(origin = 'https://meethub.test') {
    const socket = new WebSocket(address, { origin });
    const pending = [];
    const queued = [];
    socket.on('error', () => {});
    socket.on('message', (raw) => {
      const value = JSON.parse(raw);
      const index = pending.findIndex((waiter) => waiter.type === value.type);
      if (index >= 0) {
        const waiter = pending.splice(index, 1)[0];
        clearTimeout(waiter.timer);
        waiter.resolve(value);
      } else queued.push(value);
    });
    const next = (type) => {
      const index = queued.findIndex((value) => value.type === type);
      if (index >= 0) return Promise.resolve(queued.splice(index, 1)[0]);
      return new Promise((resolve, reject) => {
        const waiter = { type, resolve, reject };
        waiter.timer = setTimeout(
          () => reject(new Error(`Missing ${type} message`)),
          3000,
        );
        pending.push(waiter);
      });
    };
    await once(socket, 'open');
    return {
      socket,
      next,
      send: (message) => socket.send(JSON.stringify(message)),
      join: async (room = 'room-one', name = 'Guest', extra = {}) => {
        socket.send(
          JSON.stringify({
            type: 'join',
            room,
            name,
            status: { mic: true, camera: true },
            ...extra,
          }),
        );
        return next('joined');
      },
    };
  }
  return { app, peer, address };
}

test('participants discover each other and exchange connection messages inside their room', async (t) => {
  const { peer } = await fixture(t);
  const host = await peer();
  const first = await host.join('room-one', 'Host');
  const guest = await peer();
  const second = await guest.join('room-one', 'Guest');
  assert.equal(second.peers.length, 1);
  assert.equal(second.peers[0].id, first.self.id);
  assert.equal((await host.next('peer-joined')).peer.id, second.self.id);
  guest.send({
    type: 'signal',
    to: first.self.id,
    description: { type: 'offer', sdp: 'v=0\r\n' },
  });
  assert.deepEqual(await host.next('signal'), {
    type: 'signal',
    from: second.self.id,
    description: { type: 'offer', sdp: 'v=0\r\n' },
  });
});

test('connection messages cannot cross room boundaries', async (t) => {
  const { peer } = await fixture(t);
  const a = await peer();
  const aInfo = await a.join('room-one');
  const b = await peer();
  await b.join('room-two');
  b.send({
    type: 'signal',
    to: aInfo.self.id,
    description: { type: 'offer', sdp: 'v=0' },
  });
  assert.equal((await b.next('error')).code, 'peer-unavailable');
});

test('media recovery requests reach only the selected participant in the same room', async (t) => {
  const { peer } = await fixture(t);
  const a = await peer();
  const first = await a.join();
  const b = await peer();
  const second = await b.join();
  b.send({ type: 'signal', to: first.self.id, restart: true });
  assert.deepEqual(await a.next('signal'), {
    type: 'signal',
    from: second.self.id,
    restart: true,
  });
  const other = await peer();
  await other.join('other-room');
  other.send({ type: 'signal', to: first.self.id, restart: true });
  assert.equal((await other.next('error')).code, 'peer-unavailable');
});

test('room chat is attributed by the server and bounded', async (t) => {
  const { peer } = await fixture(t);
  const a = await peer();
  const info = await a.join('room-one', 'Actual name');
  const b = await peer();
  await b.join('room-one');
  a.send({
    type: 'chat',
    from: 'forged',
    name: 'Forged name',
    text: 'hello '.repeat(500),
  });
  const received = (await b.next('chat')).message;
  assert.equal(received.from, info.self.id);
  assert.equal(received.name, 'Actual name');
  assert.equal(received.text.length, 2000);
});

test('capacity is enforced and a departing member frees a place', async (t) => {
  const { peer } = await fixture(t, { maxParticipants: 2 });
  const a = await peer();
  await a.join();
  const b = await peer();
  await b.join();
  const c = await peer();
  c.send({ type: 'join', room: 'room-one', name: 'Third' });
  assert.equal((await c.next('error')).code, 'room-full');
  b.socket.close();
  await a.next('peer-left');
  const joined = await c.join();
  assert.equal(joined.peers.length, 1);
});

test('unknown and malformed messages do not crash the room service', async (t) => {
  const { peer, app } = await fixture(t);
  const a = await peer();
  a.socket.send('{');
  assert.equal((await a.next('error')).code, 'invalid-message');
  a.send({ type: 'signal', to: 'unknown' });
  assert.equal((await a.next('error')).code, 'not-joined');
  await a.join();
  a.send({ type: 'unrecognized' });
  assert.equal((await a.next('error')).code, 'unknown-message');
  const health = await fetch(
    `http://127.0.0.1:${app.server.address().port}/health`,
  );
  assert.equal(health.status, 200);
});

test('a resume token cannot be forged with equal-length unicode', async (t) => {
  const { peer } = await fixture(t);
  const a = await peer();
  const joined = await a.join();
  const intruder = await peer();
  intruder.send({
    type: 'join',
    room: 'room-one',
    resumeId: joined.self.id,
    resumeToken: '💚'.repeat(24),
  });
  assert.equal((await intruder.next('error')).code, 'invalid-session');
  a.send({ type: 'ping' });
  assert.equal((await a.next('pong')).type, 'pong');
});

test('a valid reconnect keeps identity without removing the resumed member', async (t) => {
  const { peer } = await fixture(t);
  const a = await peer();
  const joined = await a.join();
  const b = await peer();
  await b.join();
  await a.next('peer-joined');
  const reconnect = await peer();
  const resumed = await reconnect.join('room-one', 'Guest', {
    resumeId: joined.self.id,
    resumeToken: joined.resumeToken,
  });
  assert.equal(resumed.self.id, joined.self.id);
  assert.equal(resumed.peers.length, 1);
  assert.equal((await b.next('peer-updated')).peer.id, joined.self.id);
});

test('the room service rejects an unapproved browser origin', async (t) => {
  const { address, app } = await fixture(t);
  const foreign = new WebSocket(address, { origin: 'not-a-valid-origin' });
  const [error] = await once(foreign, 'error');
  assert.match(error.message, /403/);
  const health = await fetch(
    `http://127.0.0.1:${app.server.address().port}/health`,
  );
  assert.equal(health.status, 200);
});

test('each new room connection receives refreshed relay configuration', async (t) => {
  let generation = 0;
  const { peer } = await fixture(t, {
    iceConfig: async () => ({
      iceServers: [
        {
          urls: 'turns:relay.test:443',
          username: 'session-' + ++generation,
          credential: 'temporary-client-credential',
        },
      ],
      relayAvailable: true,
    }),
  });
  const first = await peer();
  const firstJoin = await first.join();
  const second = await peer();
  const secondJoin = await second.join();
  assert.equal(firstJoin.iceServers[0].username, 'session-1');
  assert.equal(secondJoin.iceServers[0].username, 'session-2');
  assert.equal(secondJoin.relayAvailable, true);
});
