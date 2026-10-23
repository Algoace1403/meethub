import http from 'node:http';
import { randomBytes, randomUUID, timingSafeEqual } from 'node:crypto';
import { readFile, stat } from 'node:fs/promises';
import path from 'node:path';
import { WebSocket, WebSocketServer } from 'ws';

const mime = { '.html': 'text/html; charset=utf-8', '.js': 'text/javascript; charset=utf-8', '.css': 'text/css; charset=utf-8', '.svg': 'image/svg+xml', '.png': 'image/png', '.webmanifest': 'application/manifest+json', '.ico': 'image/x-icon' };
const cleanText = (value, limit) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, limit) : '';
const sameToken = (a, b) => typeof a === 'string' && typeof b === 'string' && /^[a-f0-9]{48}$/.test(b) && a.length === b.length && timingSafeEqual(Buffer.from(a), Buffer.from(b));
const memberView = member => ({ id: member.id, name: member.name, status: member.status, joinedAt: member.joinedAt });
const statusView = value => ({ mic: Boolean(value?.mic), camera: Boolean(value?.camera), sharing: Boolean(value?.sharing), hand: Boolean(value?.hand) });

export function createMeetingServer({ origins = [], maxParticipants = 4, maxRooms = 50, staticDirectory, heartbeatMs = 25000 } = {}) {
    const rooms = new Map();
    const allowedOrigins = new Set(origins);
    const sockets = new WebSocketServer({ noServer: true, maxPayload: 131072, perMessageDeflate: false });
    const send = (socket, message) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
    const fail = (socket, code, message) => send(socket, { type: 'error', code, message });
    const broadcast = (room, message, except) => { for (const member of room.members.values()) if (member.id !== except) send(member.socket, message); };

    const server = http.createServer(async (request, response) => {
        response.setHeader('X-Content-Type-Options', 'nosniff');
        response.setHeader('Referrer-Policy', 'strict-origin-when-cross-origin');
        let pathname;
        try { pathname = decodeURIComponent(new URL(request.url, 'http://localhost').pathname); }
        catch { response.writeHead(400); response.end('Invalid address'); return; }
        if (pathname === '/health') {
            response.writeHead(200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' });
            response.end(JSON.stringify({ status: 'ok', service: 'Meet Hub', maxParticipants })); return;
        }
        if (!['GET', 'HEAD'].includes(request.method)) { response.writeHead(405); response.end(); return; }
        if (!staticDirectory || pathname.startsWith('/signal')) { response.writeHead(404); response.end('Not found'); return; }
        const root = path.resolve(staticDirectory);
        let file = path.resolve(root, '.' + pathname);
        if (!file.startsWith(root + path.sep) && file !== root) { response.writeHead(403); response.end(); return; }
        if (pathname.split('/').some(segment => segment.startsWith('.'))) { response.writeHead(404); response.end(); return; }
        try {
            const info = await stat(file).catch(() => null);
            if (!info?.isFile()) {
                if (path.extname(pathname)) { response.writeHead(404); response.end('Not found'); return; }
                file = path.join(root, 'index.html');
            }
            const body = await readFile(file);
            response.writeHead(200, { 'Content-Type': mime[path.extname(file)] || 'application/octet-stream', 'Cache-Control': pathname.startsWith('/assets/') ? 'public, max-age=31536000, immutable' : 'no-cache' });
            response.end(request.method === 'HEAD' ? undefined : body);
        } catch { response.writeHead(404); response.end('Build the Meet Hub frontend first.'); }
    });

    server.on('upgrade', (request, socket, head) => {
        let pathname;
        try { pathname = new URL(request.url, 'http://localhost').pathname; } catch { socket.destroy(); return; }
        const origin = request.headers.origin;
        let sameOrigin = false;
        try { sameOrigin = Boolean(origin && new URL(origin).host === request.headers.host); } catch {}
        if (pathname !== '/signal' || !origin || (!allowedOrigins.has(origin) && !sameOrigin) || sockets.clients.size >= 200) {
            socket.write('HTTP/1.1 403 Forbidden\r\nConnection: close\r\n\r\n'); socket.destroy(); return;
        }
        sockets.handleUpgrade(request, socket, head, ws => sockets.emit('connection', ws));
    });

    sockets.on('connection', socket => {
        let roomId = null;
        let identity = null;
        let rateStart = Date.now();
        let messageCount = 0;
        socket.alive = true;
        socket.on('pong', () => { socket.alive = true; });
        const joinTimer = setTimeout(() => { if (!identity) socket.close(4000, 'Join a room first'); }, 20000);
        joinTimer.unref();

        socket.on('message', raw => {
            if (Date.now() - rateStart > 10000) { rateStart = Date.now(); messageCount = 0; }
            if (++messageCount > 200) { fail(socket, 'rate-limit', 'Please wait a moment before trying again.'); socket.close(4008, 'Message limit'); return; }
            let message;
            try { message = JSON.parse(raw.toString()); } catch { fail(socket, 'invalid-message', 'That message could not be read.'); return; }
            if (!message || typeof message !== 'object' || Array.isArray(message)) { fail(socket, 'invalid-message', 'Invalid room message.'); return; }
            if (message.type === 'join') {
                if (identity) { fail(socket, 'already-joined', 'You are already in a room.'); return; }
                if (typeof message.room !== 'string' || !/^[a-zA-Z0-9_-]{3,80}$/.test(message.room)) { fail(socket, 'invalid-room', 'Use a valid Meet Hub room link.'); return; }
                roomId = message.room;
                let room = rooms.get(roomId);
                if (!room) {
                    if (rooms.size >= maxRooms) { fail(socket, 'busy', 'Meet Hub is busy. Please try again shortly.'); return; }
                    room = { title: cleanText(message.title, 80) || 'Meet Hub room', members: new Map(), messages: [] };
                    rooms.set(roomId, room);
                }
                const previous = room.members.get(message.resumeId);
                const canResume = previous && sameToken(previous.token, message.resumeToken);
                if (previous && !canResume) { fail(socket, 'invalid-session', 'Please open the meeting in a new tab.'); return; }
                if (!canResume && room.members.size >= maxParticipants) { fail(socket, 'room-full', `This prototype supports up to ${maxParticipants} people in a room.`); return; }
                identity = canResume ? previous.id : randomUUID();
                const member = { id: identity, token: canResume ? previous.token : randomBytes(24).toString('hex'), socket, name: cleanText(message.name, 48) || 'Guest', status: statusView(message.status), joinedAt: previous?.joinedAt || Date.now() };
                room.members.set(identity, member);
                if (canResume) previous.socket.close(4001, 'Session resumed');
                clearTimeout(joinTimer);
                send(socket, { type: 'joined', self: memberView(member), resumeToken: member.token, title: room.title, peers: [...room.members.values()].filter(value => value.id !== identity).map(memberView), messages: room.messages, maxParticipants });
                broadcast(room, { type: canResume ? 'peer-updated' : 'peer-joined', peer: memberView(member) }, identity);
                return;
            }
            const room = rooms.get(roomId);
            const member = room?.members.get(identity);
            if (!member || member.socket !== socket) { fail(socket, 'not-joined', 'Join the room before sending messages.'); return; }
            if (message.type === 'signal') {
                const target = room.members.get(message.to);
                if (!target || target.id === identity) { fail(socket, 'peer-unavailable', 'That person has left the meeting.'); return; }
                const description = message.description;
                const candidate = message.candidate;
                if (description && ['offer', 'answer'].includes(description.type) && typeof description.sdp === 'string' && description.sdp.length <= 110000) {
                    send(target.socket, { type: 'signal', from: identity, description: { type: description.type, sdp: description.sdp } });
                } else if (candidate && typeof candidate.candidate === 'string' && candidate.candidate.length < 5000) {
                    send(target.socket, { type: 'signal', from: identity, candidate: { candidate: candidate.candidate, sdpMid: candidate.sdpMid ?? null, sdpMLineIndex: candidate.sdpMLineIndex ?? null, usernameFragment: candidate.usernameFragment ?? null } });
                } else fail(socket, 'invalid-signal', 'The connection update could not be read.');
            } else if (message.type === 'status') {
                member.status = statusView(message.status);
                broadcast(room, { type: 'peer-updated', peer: memberView(member) });
            } else if (message.type === 'chat') {
                const text = cleanText(message.text, 2000);
                if (!text) return;
                const item = { id: randomUUID(), from: identity, name: member.name, text, timestamp: Date.now() };
                room.messages.push(item); room.messages = room.messages.slice(-50);
                broadcast(room, { type: 'chat', message: item });
            } else if (message.type === 'leave') socket.close(1000, 'Left meeting');
            else if (message.type === 'ping') send(socket, { type: 'pong' });
            else fail(socket, 'unknown-message', 'That room action is unavailable.');
        });
        socket.on('close', () => {
            clearTimeout(joinTimer);
            const room = rooms.get(roomId);
            if (room?.members.get(identity)?.socket !== socket) return;
            room.members.delete(identity);
            broadcast(room, { type: 'peer-left', id: identity });
            if (!room.members.size) rooms.delete(roomId);
        });
        socket.on('error', () => socket.terminate());
    });

    const heartbeat = setInterval(() => {
        for (const socket of sockets.clients) {
            if (!socket.alive) { socket.terminate(); continue; }
            socket.alive = false; socket.ping();
        }
    }, heartbeatMs);
    heartbeat.unref();
    return {
        server,
        async close() {
            clearInterval(heartbeat);
            for (const socket of sockets.clients) socket.terminate();
            await new Promise(resolve => sockets.close(resolve));
            if (server.listening) await new Promise(resolve => server.close(resolve));
        }
    };
}
