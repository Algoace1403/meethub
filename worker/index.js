import { DurableObject } from 'cloudflare:workers';

const validRoom = value => typeof value === 'string' && /^[a-zA-Z0-9_-]{3,80}$/.test(value);
const cleanText = (value, limit) => typeof value === 'string' ? value.replace(/[\u0000-\u0008\u000b\u000c\u000e-\u001f]/g, '').trim().slice(0, limit) : '';
const statusView = value => ({ mic: Boolean(value?.mic), camera: Boolean(value?.camera), sharing: Boolean(value?.sharing), hand: Boolean(value?.hand) });
const memberView = member => ({ id: member.id, name: member.name, status: member.status, joinedAt: member.joinedAt });
const token = () => [...crypto.getRandomValues(new Uint8Array(24))].map(value => value.toString(16).padStart(2, '0')).join('');
function sameToken(a, b) {
    if (typeof b !== 'string' || !/^[a-f0-9]{48}$/.test(b) || !a || a.length !== b.length) return false;
    let difference = 0;
    for (let i = 0; i < a.length; i++) difference |= a.charCodeAt(i) ^ b.charCodeAt(i);
    return difference === 0;
}
const send = (socket, message) => { if (socket.readyState === WebSocket.OPEN) socket.send(JSON.stringify(message)); };
const fail = (socket, code, message) => send(socket, { type: 'error', code, message });
const capacity = env => Math.max(2, Math.min(4, Number(env.MAX_PARTICIPANTS) || 4));

export default {
    async fetch(request, env) {
        const url = new URL(request.url);
        if (url.pathname === '/health') return Response.json({ status: 'ok', service: 'Meet Hub', maxParticipants: capacity(env) }, { headers: { 'Cache-Control': 'no-store' } });
        if (url.pathname !== '/signal') return env.ASSETS.fetch(request);
        if (request.headers.get('Upgrade')?.toLowerCase() !== 'websocket') return new Response('WebSocket required', { status: 426 });
        const origin = request.headers.get('Origin');
        const allowed = (env.ALLOWED_ORIGINS || '').split(',').map(value => value.trim());
        if (!origin || (origin !== url.origin && !allowed.includes(origin))) return new Response('Origin not allowed', { status: 403 });
        const room = url.searchParams.get('room');
        if (!validRoom(room)) return new Response('Invalid Meet Hub room', { status: 400 });
        return env.ROOMS.get(env.ROOMS.idFromName(room)).fetch(request);
    }
};

// The edge keeps sockets connected while the room hibernates. Attachments restore
// member identity after wake-up; SQLite-backed storage restores the bounded chat.
export class MeetingRoom extends DurableObject {
    constructor(ctx, env) {
        super(ctx, env);
        this.maxParticipants = capacity(env);
        ctx.blockConcurrencyWhile(async () => {
            const saved = await ctx.storage.get('room');
            this.title = saved?.title || '';
            this.messages = saved?.messages || [];
        });
    }
    members(except) {
        return this.ctx.getWebSockets().filter(socket => socket !== except && socket.readyState === WebSocket.OPEN)
            .map(socket => ({ socket, ...socket.deserializeAttachment() })).filter(member => member.id);
    }
    broadcast(message, except) { for (const member of this.members(except)) send(member.socket, message); }
    async persist() { await this.ctx.storage.put('room', { title: this.title, messages: this.messages }); }
    async fetch(request) {
        if (this.ctx.getWebSockets().length >= 16) return new Response('Room busy', { status: 429 });
        const room = new URL(request.url).searchParams.get('room');
        if (!validRoom(room)) return new Response('Invalid room', { status: 400 });
        const [client, server] = Object.values(new WebSocketPair());
        this.ctx.acceptWebSocket(server);
        server.serializeAttachment({ room, connectedAt: Date.now(), rateStart: Date.now(), messageCount: 0 });
        return new Response(null, { status: 101, webSocket: client });
    }
    async webSocketMessage(socket, raw) {
        const attachment = socket.deserializeAttachment();
        if (typeof raw !== 'string' || new TextEncoder().encode(raw).byteLength > 131072) { socket.close(1009, 'Message too large'); return; }
        if (Date.now() - attachment.rateStart > 10000) { attachment.rateStart = Date.now(); attachment.messageCount = 0; }
        if (++attachment.messageCount > 200) { socket.close(4008, 'Message limit'); return; }
        socket.serializeAttachment(attachment);
        if (!attachment.id && Date.now() - attachment.connectedAt > 20000) { socket.close(4000, 'Join a room first'); return; }
        let message;
        try { message = JSON.parse(raw); } catch { fail(socket, 'invalid-message', 'That message could not be read.'); return; }
        if (!message || typeof message !== 'object' || Array.isArray(message)) { fail(socket, 'invalid-message', 'Invalid room message.'); return; }
        if (message.type === 'join') {
            if (attachment.id) { fail(socket, 'already-joined', 'You are already in a room.'); return; }
            if (message.room !== attachment.room) { fail(socket, 'invalid-room', 'Use a valid Meet Hub room link.'); return; }
            const members = this.members(socket);
            const previous = members.find(member => member.id === message.resumeId);
            const canResume = previous && sameToken(previous.token, message.resumeToken);
            if (previous && !canResume) { fail(socket, 'invalid-session', 'Please open the meeting in a new tab.'); return; }
            if (!canResume && members.length >= this.maxParticipants) { fail(socket, 'room-full', `This prototype supports up to ${this.maxParticipants} people in a room.`); return; }
            const member = { ...attachment, id: canResume ? previous.id : crypto.randomUUID(), token: canResume ? previous.token : token(), name: cleanText(message.name, 48) || 'Guest', status: statusView(message.status), joinedAt: canResume ? previous.joinedAt : Date.now() };
            socket.serializeAttachment(member);
            if (canResume) {
                // Retire the old attachment before closing, so its close event
                // cannot remove the replacement session from other browsers.
                previous.socket.serializeAttachment({ ...previous.socket.deserializeAttachment(), id: null });
                previous.socket.close(4001, 'Session resumed');
            }
            if (!members.length) { this.title = cleanText(message.title, 80) || 'Meet Hub room'; this.messages = []; }
            send(socket, { type: 'joined', self: memberView(member), resumeToken: member.token, title: this.title, peers: this.members(socket).map(memberView), messages: this.messages, maxParticipants: this.maxParticipants });
            this.broadcast({ type: canResume ? 'peer-updated' : 'peer-joined', peer: memberView(member) }, socket);
            await this.persist();
            return;
        }
        if (!attachment.id) { fail(socket, 'not-joined', 'Join the room before sending messages.'); return; }
        if (message.type === 'signal') {
            const target = this.members(socket).find(member => member.id === message.to);
            if (!target) { fail(socket, 'peer-unavailable', 'That person has left the meeting.'); return; }
            const { description, candidate } = message;
            if (description && ['offer', 'answer'].includes(description.type) && typeof description.sdp === 'string' && description.sdp.length <= 110000) {
                send(target.socket, { type: 'signal', from: attachment.id, description: { type: description.type, sdp: description.sdp } });
            } else if (candidate && typeof candidate.candidate === 'string' && candidate.candidate.length < 5000) {
                send(target.socket, { type: 'signal', from: attachment.id, candidate: { candidate: candidate.candidate, sdpMid: typeof candidate.sdpMid === 'string' ? candidate.sdpMid.slice(0, 256) : null, sdpMLineIndex: Number.isInteger(candidate.sdpMLineIndex) ? candidate.sdpMLineIndex : null, usernameFragment: typeof candidate.usernameFragment === 'string' ? candidate.usernameFragment.slice(0, 256) : null } });
            } else fail(socket, 'invalid-signal', 'The connection update could not be read.');
        } else if (message.type === 'status') {
            attachment.status = statusView(message.status);
            socket.serializeAttachment(attachment);
            this.broadcast({ type: 'peer-updated', peer: memberView(attachment) });
        } else if (message.type === 'chat') {
            const text = cleanText(message.text, 2000);
            if (!text) return;
            const item = { id: crypto.randomUUID(), from: attachment.id, name: attachment.name, text, timestamp: Date.now() };
            this.messages = [...this.messages, item].slice(-50);
            this.broadcast({ type: 'chat', message: item });
            await this.persist();
        } else if (message.type === 'leave') socket.close(1000, 'Left meeting');
        else if (message.type === 'ping') send(socket, { type: 'pong' });
        else fail(socket, 'unknown-message', 'That room action is unavailable.');
    }
    async webSocketClose(socket, code) {
        const member = socket.deserializeAttachment();
        socket.serializeAttachment({ ...member, id: null });
        const replyCode = [1005, 1006, 1015].includes(code) ? 1000 : code;
        socket.close(replyCode, 'Connection closed');
        if (member.id) this.broadcast({ type: 'peer-left', id: member.id }, socket);
        if (!this.members(socket).length) {
            this.messages = []; this.title = '';
            await this.ctx.storage.deleteAll();
        }
    }
    async webSocketError(socket) { socket.close(1011, 'Please reconnect'); }
}
