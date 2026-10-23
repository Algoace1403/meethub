const defaultIce = [{ urls: 'stun:stun.cloudflare.com:3478' }];
function iceServers() {
    try { return import.meta.env.VITE_ICE_SERVERS ? JSON.parse(import.meta.env.VITE_ICE_SERVERS) : defaultIce; }
    catch { return defaultIce; }
}

export class MeetingClient {
    constructor({ room, title, name, media, status, onChange }) {
        Object.assign(this, { room, title, name, media, status, onChange });
        this.peers = new Map();
        this.messages = [];
        this.state = 'connecting';
        this.error = '';
        this.retries = 0;
        this.stopped = false;
    }
    snapshot() {
        return { state: this.state, error: this.error, self: this.self, title: this.title, messages: [...this.messages], peers: [...this.peers.values()].map(peer => ({ ...peer.info, stream: peer.stream, connection: peer.pc.connectionState })), maxParticipants: this.maxParticipants || 4 };
    }
    emit() { if (!this.stopped) this.onChange(this.snapshot()); }
    send(message) { if (this.socket?.readyState === WebSocket.OPEN) this.socket.send(JSON.stringify(message)); }
    start() {
        if (this.stopped) return;
        let endpoint;
        try {
            endpoint = new URL(import.meta.env.VITE_SIGNALING_URL || '/signal', window.location.href);
            endpoint.protocol = ['https:', 'wss:'].includes(endpoint.protocol) ? 'wss:' : 'ws:';
            if (endpoint.pathname === '/') endpoint.pathname = '/signal';
            endpoint.searchParams.set('room', this.room);
        } catch { this.state = 'error'; this.error = 'The meeting connection is not configured correctly.'; this.emit(); return; }
        this.state = this.self ? 'reconnecting' : 'connecting';
        this.emit();
        const socket = new WebSocket(endpoint);
        this.socket = socket;
        socket.addEventListener('open', () => {
            this.send({ type: 'join', room: this.room, title: this.title, name: this.name, status: this.status, resumeId: this.self?.id, resumeToken: this.resumeToken });
        });
        socket.addEventListener('message', event => {
            let message;
            try { message = JSON.parse(event.data); } catch { return; }
            this.handle(message).catch(error => {
                console.warn('Meet Hub connection update:', error.message);
                this.emit();
            });
        });
        socket.addEventListener('close', event => {
            if (this.stopped || this.terminal || socket !== this.socket) return;
            if (event.code === 4001) { this.state = 'error'; this.error = 'This session is open in another tab.'; this.emit(); return; }
            this.state = 'reconnecting';
            this.error = this.retries > 3 ? 'The room server is taking longer to respond. We’re still trying.' : '';
            this.emit();
            this.retryTimer = setTimeout(() => this.start(), Math.min(1000 * 2 ** this.retries++, 10000) + Math.random() * 300);
        });
        socket.addEventListener('error', () => {});
    }
    async handle(message) {
        if (message.type === 'joined') {
            if (this.self && this.self.id !== message.self.id) for (const id of this.peers.keys()) this.removePeer(id);
            this.self = message.self;
            this.resumeToken = message.resumeToken;
            this.title = message.title;
            this.messages = message.messages;
            this.maxParticipants = message.maxParticipants;
            const present = new Set(message.peers.map(peer => peer.id));
            for (const id of this.peers.keys()) if (!present.has(id)) this.removePeer(id);
            for (const info of message.peers) this.addPeer(info);
            this.state = 'joined'; this.error = ''; this.retries = 0;
            this.send({ type: 'status', status: this.status });
        } else if (message.type === 'peer-joined' || message.type === 'peer-updated') {
            if (message.peer.id === this.self?.id) this.self = message.peer;
            else this.addPeer(message.peer);
        } else if (message.type === 'peer-left') this.removePeer(message.id);
        else if (message.type === 'chat') {
            if (!this.messages.some(item => item.id === message.message.id)) this.messages = [...this.messages, message.message].slice(-50);
        } else if (message.type === 'signal') {
            const peer = this.peers.get(message.from) || this.addPeer({ id: message.from, name: 'Guest', status: {} });
            await this.receiveSignal(peer, message);
        } else if (message.type === 'error') {
            if (message.code === 'peer-unavailable') return;
            this.error = message.message;
            if (['room-full', 'invalid-room', 'busy', 'invalid-session', 'not-joined'].includes(message.code)) {
                this.terminal = true; this.state = 'error'; this.socket.close();
            }
        }
        this.emit();
    }
    addPeer(info) {
        const existing = this.peers.get(info.id);
        if (existing) { existing.info = info; return existing; }
        const pc = new RTCPeerConnection({ iceServers: iceServers() });
        const peer = { info, pc, stream: new MediaStream(), makingOffer: false, acceptingAnswer: false, ignoreOffer: false, candidates: [], polite: this.self.id.localeCompare(info.id) > 0, senders: {} };
        this.peers.set(info.id, peer);
        for (const kind of ['audio', 'video']) {
            const track = this.media.getTracks().find(value => value.kind === kind);
            peer.senders[kind] = pc.addTransceiver(track || kind, { direction: 'sendrecv', streams: [this.media] }).sender;
        }
        pc.onicecandidate = event => { if (event.candidate) this.send({ type: 'signal', to: info.id, candidate: event.candidate.toJSON() }); };
        pc.ontrack = event => {
            if (!peer.stream.getTracks().some(track => track.id === event.track.id)) peer.stream.addTrack(event.track);
            event.track.onunmute = () => this.emit();
            event.track.onended = () => { peer.stream.removeTrack(event.track); this.emit(); };
            this.emit();
        };
        pc.onconnectionstatechange = () => {
            if (pc.connectionState === 'failed') pc.restartIce();
            this.emit();
        };
        pc.onnegotiationneeded = async () => {
            // Elect one initial offerer so simultaneous room joins do not race
            // two sets of initial ICE candidates. Later changes use polite
            // negotiation on either side, including ICE restarts.
            if (!pc.remoteDescription && peer.polite) return;
            try {
                peer.makingOffer = true;
                await pc.setLocalDescription();
                this.send({ type: 'signal', to: info.id, description: pc.localDescription.toJSON() });
            } catch (error) { if (!this.stopped) console.warn('Meet Hub negotiation:', error.message); }
            finally { peer.makingOffer = false; }
        };
        return peer;
    }
    async receiveSignal(peer, message) {
        const pc = peer.pc;
        if (pc.signalingState === 'closed') return;
        if (message.description) {
            const description = message.description;
            const canAcceptOffer = !peer.makingOffer && (pc.signalingState === 'stable' || peer.acceptingAnswer);
            const collision = description.type === 'offer' && !canAcceptOffer;
            peer.ignoreOffer = collision && !peer.polite;
            if (peer.ignoreOffer) return;
            peer.acceptingAnswer = description.type === 'answer';
            try { await pc.setRemoteDescription(description); }
            finally { peer.acceptingAnswer = false; }
            for (const candidate of peer.candidates.splice(0)) await pc.addIceCandidate(candidate);
            if (description.type === 'offer') {
                await pc.setLocalDescription();
                this.send({ type: 'signal', to: peer.info.id, description: pc.localDescription.toJSON() });
            }
        } else if (message.candidate && !peer.ignoreOffer) {
            if (pc.remoteDescription) await pc.addIceCandidate(message.candidate);
            else peer.candidates.push(message.candidate);
        }
    }
    removePeer(id) {
        const peer = this.peers.get(id);
        if (!peer) return;
        peer.pc.close();
        for (const track of peer.stream.getTracks()) track.stop();
        this.peers.delete(id);
    }
    updateStatus(status) {
        this.status = { ...this.status, ...status };
        this.send({ type: 'status', status: this.status });
    }
    async replaceTrack(kind, track) {
        await Promise.all([...this.peers.values()].map(peer => peer.senders[kind].replaceTrack(track)));
    }
    chat(text) { this.send({ type: 'chat', text }); }
    close() {
        this.stopped = true;
        clearTimeout(this.retryTimer);
        this.send({ type: 'leave' });
        this.socket?.close(1000, 'Left meeting');
        for (const id of this.peers.keys()) this.removePeer(id);
    }
}
