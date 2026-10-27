const defaultIce = [{ urls: 'stun:stun.cloudflare.com:3478' }];
const buildEnv = import.meta.env || {};
function iceServers() {
  try {
    return buildEnv.VITE_ICE_SERVERS
      ? JSON.parse(buildEnv.VITE_ICE_SERVERS)
      : defaultIce;
  } catch {
    return defaultIce;
  }
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
    this.iceServers = iceServers();
    this.incoming = Promise.resolve();
    this.onOffline = () => {
      if (this.stopped || this.terminal) return;
      clearTimeout(this.retryTimer);
      clearTimeout(this.joinTimer);
      clearTimeout(this.pongTimer);
      clearInterval(this.heartbeat);
      const previous = this.socket;
      this.socket = null;
      previous?.close(4000, 'Browser offline');
      this.state = 'reconnecting';
      this.error =
        'You are offline. The meeting will reconnect when your network returns.';
      this.emit();
    };
    this.onOnline = () => {
      if (!this.stopped && !this.terminal) this.reconnect();
    };
  }
  snapshot() {
    return {
      state: this.state,
      error: this.error,
      self: this.self,
      title: this.title,
      messages: [...this.messages],
      peers: [...this.peers.values()].map((peer) => ({
        ...peer.info,
        stream: peer.stream,
        connection: peer.pc.connectionState,
        connectionError: peer.connectionError,
      })),
      maxParticipants: this.maxParticipants || 4,
    };
  }
  emit() {
    if (!this.stopped) this.onChange(this.snapshot());
  }
  send(message) {
    if (this.socket?.readyState === WebSocket.OPEN)
      this.socket.send(JSON.stringify(message));
  }
  start() {
    if (this.stopped) return;
    if (!this.watchingNetwork) {
      window.addEventListener?.('offline', this.onOffline);
      window.addEventListener?.('online', this.onOnline);
      this.watchingNetwork = true;
    }
    if (window.navigator?.onLine === false) {
      this.onOffline();
      return;
    }
    let endpoint;
    try {
      const hostedBackend = window.location.hostname.endsWith('.vercel.app')
        ? 'https://meethub.algoace-meethub.workers.dev/signal'
        : '/signal';
      endpoint = new URL(
        buildEnv.VITE_SIGNALING_URL || hostedBackend,
        window.location.href,
      );
      endpoint.protocol = ['https:', 'wss:'].includes(endpoint.protocol)
        ? 'wss:'
        : 'ws:';
      if (endpoint.pathname === '/') endpoint.pathname = '/signal';
      endpoint.searchParams.set('room', this.room);
    } catch {
      this.state = 'error';
      this.error = 'The meeting connection is not configured correctly.';
      this.emit();
      return;
    }
    this.state = this.self ? 'reconnecting' : 'connecting';
    this.emit();
    const socket = new WebSocket(endpoint);
    this.socket = socket;
    clearTimeout(this.joinTimer);
    this.joinTimer = setTimeout(() => {
      if (socket !== this.socket || this.state === 'joined' || this.stopped)
        return;
      this.error =
        'The meeting server is not responding. Check your connection and try reconnecting.';
      this.emit();
      socket.close(4000, 'Join timed out');
    }, 12000);
    socket.addEventListener('open', () => {
      this.send({
        type: 'join',
        room: this.room,
        title: this.title,
        name: this.name,
        status: this.status,
        resumeId: this.self?.id,
        resumeToken: this.resumeToken,
      });
    });
    socket.addEventListener('message', (event) => {
      if (socket !== this.socket || this.stopped) return;
      let message;
      try {
        message = JSON.parse(event.data);
      } catch {
        return;
      }
      this.incoming = this.incoming
        .then(() => {
          if (socket === this.socket && !this.stopped)
            return this.handle(message);
        })
        .catch((error) => {
          console.warn('Meet Hub connection update:', error.message);
          this.emit();
        });
    });
    socket.addEventListener('close', (event) => {
      if (this.stopped || this.terminal || socket !== this.socket) return;
      clearTimeout(this.joinTimer);
      clearInterval(this.heartbeat);
      clearTimeout(this.pongTimer);
      if (event.code === 4001) {
        this.state = 'error';
        this.error = 'This session is open in another tab.';
        this.emit();
        return;
      }
      this.state = 'reconnecting';
      if (this.retries > 3)
        this.error =
          'The room server is taking longer to respond. Check your network or reconnect.';
      this.emit();
      this.retryTimer = setTimeout(
        () => this.start(),
        Math.min(1000 * 2 ** this.retries++, 10000) + Math.random() * 300,
      );
    });
    socket.addEventListener('error', () => {});
  }
  reconnect() {
    if (this.stopped) return;
    clearTimeout(this.retryTimer);
    clearTimeout(this.joinTimer);
    clearTimeout(this.pongTimer);
    clearInterval(this.heartbeat);
    const previous = this.socket;
    this.socket = null;
    this.terminal = false;
    this.error = '';
    this.retries = 0;
    previous?.close(4000, 'Reconnecting');
    this.start();
  }
  watchPeer(peer) {
    clearTimeout(peer.connectionTimer);
    if (peer.pc.connectionState === 'connected') {
      peer.connectionError = '';
      peer.restarts = 0;
      return;
    }
    if (this.stopped || peer.pc.connectionState === 'closed') return;
    peer.connectionTimer = setTimeout(() => {
      if (
        this.stopped ||
        peer.pc.connectionState === 'connected' ||
        !this.peers.has(peer.info.id)
      )
        return;
      if ((peer.restarts || 0) < 2) {
        this.restartPeer(peer);
      } else {
        peer.connectionError = this.relayAvailable
          ? 'Audio and video could not connect. Try reconnecting or another network.'
          : 'This network needs a media relay to connect audio and video. Chat is still available.';
        this.emit();
      }
    }, 12000);
  }
  retryMedia() {
    for (const peer of [...this.peers.values()]) {
      if (peer.pc.connectionState === 'connected') continue;
      peer.restarts = 0;
      this.restartPeer(peer);
    }
    this.emit();
  }
  restartPeer(peer, notify = true) {
    const attempts = (peer.restarts || 0) + 1;
    if (notify) this.send({ type: 'signal', to: peer.info.id, restart: true });
    this.removePeer(peer.info.id);
    const replacement = this.addPeer(peer.info);
    replacement.restarts = attempts;
    this.emit();
  }
  async handle(message) {
    if (message.type === 'joined') {
      clearTimeout(this.joinTimer);
      if (Array.isArray(message.iceServers) && message.iceServers.length)
        this.iceServers = message.iceServers;
      this.relayAvailable = Boolean(
        message.relayAvailable ||
        this.iceServers.some((server) =>
          (Array.isArray(server.urls) ? server.urls : [server.urls]).some(
            (url) => /^turns?:/.test(url),
          ),
        ),
      );
      if (this.self && this.self.id !== message.self.id)
        for (const id of this.peers.keys()) this.removePeer(id);
      this.self = message.self;
      this.resumeToken = message.resumeToken;
      this.title = message.title;
      this.messages = message.messages;
      this.maxParticipants = message.maxParticipants;
      const present = new Set(message.peers.map((peer) => peer.id));
      for (const id of this.peers.keys())
        if (!present.has(id)) this.removePeer(id);
      for (const info of message.peers) this.addPeer(info);
      this.state = 'joined';
      this.error = '';
      this.retries = 0;
      this.send({ type: 'status', status: this.status });
      clearInterval(this.heartbeat);
      clearTimeout(this.pongTimer);
      this.heartbeat = setInterval(() => {
        this.send({ type: 'ping' });
        clearTimeout(this.pongTimer);
        this.pongTimer = setTimeout(
          () => this.socket?.close(4000, 'Connection check timed out'),
          10000,
        );
      }, 20000);
    } else if (message.type === 'pong') {
      clearTimeout(this.pongTimer);
    } else if (
      message.type === 'peer-joined' ||
      message.type === 'peer-updated'
    ) {
      if (message.peer.id === this.self?.id) this.self = message.peer;
      else this.addPeer(message.peer);
    } else if (message.type === 'peer-left') this.removePeer(message.id);
    else if (message.type === 'chat') {
      if (!this.messages.some((item) => item.id === message.message.id))
        this.messages = [...this.messages, message.message].slice(-50);
    } else if (message.type === 'signal') {
      const peer =
        this.peers.get(message.from) ||
        this.addPeer({ id: message.from, name: 'Guest', status: {} });
      if (message.restart === true) {
        this.restartPeer(peer, false);
        return;
      }
      await this.receiveSignal(peer, message);
    } else if (message.type === 'error') {
      if (message.code === 'peer-unavailable') return;
      this.error = message.message;
      if (
        [
          'room-full',
          'invalid-room',
          'busy',
          'invalid-session',
          'not-joined',
        ].includes(message.code)
      ) {
        this.terminal = true;
        this.state = 'error';
        this.socket.close();
      }
    }
    this.emit();
  }
  addPeer(info) {
    const existing = this.peers.get(info.id);
    if (existing) {
      existing.info = info;
      return existing;
    }
    const pc = new RTCPeerConnection({ iceServers: this.iceServers });
    const peer = {
      info,
      pc,
      generation: crypto.randomUUID(),
      stream: new MediaStream(),
      makingOffer: false,
      acceptingAnswer: false,
      ignoreOffer: false,
      candidates: [],
      polite: this.self.id > info.id,
      senders: {},
    };
    this.peers.set(info.id, peer);
    for (const kind of ['audio', 'video']) {
      const track = this.media.getTracks().find((value) => value.kind === kind);
      peer.senders[kind] = pc.addTransceiver(track || kind, {
        direction: 'sendrecv',
        streams: [this.media],
      }).sender;
    }
    pc.onicecandidate = (event) => {
      if (event.candidate)
        this.send({
          type: 'signal',
          to: info.id,
          candidate: event.candidate.toJSON(),
        });
    };
    pc.ontrack = (event) => {
      if (!peer.stream.getTracks().some((track) => track.id === event.track.id))
        peer.stream.addTrack(event.track);
      event.track.onunmute = () => this.emit();
      event.track.onended = () => {
        peer.stream.removeTrack(event.track);
        this.emit();
      };
      this.emit();
    };
    pc.onconnectionstatechange = () => {
      this.watchPeer(peer);
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
        this.send({
          type: 'signal',
          to: info.id,
          generation: peer.generation,
          description: pc.localDescription.toJSON(),
        });
      } catch (error) {
        if (!this.stopped) console.warn('Meet Hub negotiation:', error.message);
      } finally {
        peer.makingOffer = false;
      }
    };
    this.watchPeer(peer);
    return peer;
  }
  async receiveSignal(peer, message) {
    const pc = peer.pc;
    if (pc.signalingState === 'closed') return;
    if (message.description) {
      const description = message.description;
      if (
        description.type === 'answer' &&
        ((message.replyTo && message.replyTo !== peer.generation) ||
          (pc.signalingState === 'stable' && !peer.makingOffer))
      )
        return;
      const canAcceptOffer =
        !peer.makingOffer &&
        (pc.signalingState === 'stable' || peer.acceptingAnswer);
      const collision = description.type === 'offer' && !canAcceptOffer;
      peer.ignoreOffer = collision && !peer.polite;
      if (peer.ignoreOffer) return;
      peer.acceptingAnswer = description.type === 'answer';
      try {
        await pc.setRemoteDescription(description);
      } finally {
        peer.acceptingAnswer = false;
      }
      for (const candidate of peer.candidates.splice(0))
        await this.addCandidate(peer, candidate);
      if (description.type === 'offer') {
        await pc.setLocalDescription();
        this.send({
          type: 'signal',
          to: peer.info.id,
          generation: peer.generation,
          replyTo: message.generation,
          description: pc.localDescription.toJSON(),
        });
      }
    } else if (message.candidate && !peer.ignoreOffer) {
      if (pc.remoteDescription)
        await this.addCandidate(peer, message.candidate);
      else peer.candidates.push(message.candidate);
    }
  }
  async addCandidate(peer, candidate) {
    // An ICE restart can leave a candidate from the previous connection in
    // flight. It must not abort creation of the answer for the new one.
    const sdp = peer.pc.remoteDescription?.sdp || '';
    if (
      candidate.usernameFragment &&
      !sdp.split(/\r?\n/).includes('a=ice-ufrag:' + candidate.usernameFragment)
    )
      return;
    await peer.pc.addIceCandidate(candidate);
  }
  removePeer(id) {
    const peer = this.peers.get(id);
    if (!peer) return;
    clearTimeout(peer.connectionTimer);
    peer.pc.close();
    for (const track of peer.stream.getTracks()) track.stop();
    this.peers.delete(id);
  }
  updateStatus(status) {
    this.status = { ...this.status, ...status };
    this.send({ type: 'status', status: this.status });
  }
  async replaceTrack(kind, track) {
    await Promise.all(
      [...this.peers.values()].map((peer) =>
        peer.senders[kind].replaceTrack(track),
      ),
    );
  }
  chat(text) {
    this.send({ type: 'chat', text });
  }
  close() {
    this.stopped = true;
    window.removeEventListener?.('offline', this.onOffline);
    window.removeEventListener?.('online', this.onOnline);
    clearTimeout(this.retryTimer);
    clearTimeout(this.joinTimer);
    clearTimeout(this.pongTimer);
    clearInterval(this.heartbeat);
    this.send({ type: 'leave' });
    this.socket?.close(1000, 'Left meeting');
    for (const id of this.peers.keys()) this.removePeer(id);
  }
}
