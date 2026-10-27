import React, { useEffect, useRef, useState } from 'react';
import { Brand, Icon } from './icons.jsx';
import { MeetingClient } from './meeting.js';
import { invitationUrl } from './urls.js';
import { roomTitle, initials } from './rooms.js';
import VideoTile from './components/VideoTile.jsx';
import InviteDialog from './components/InviteDialog.jsx';

export default function Room({ room, navigate }) {
  const [name, setName] = useState(() => {
    try {
      return localStorage.getItem('meethub-name') || '';
    } catch {
      return '';
    }
  });
  const [phase, setPhase] = useState('prejoin');
  const [stream, setStream] = useState(null);
  const [screen, setScreen] = useState(null);
  const [mic, setMic] = useState(true);
  const [camera, setCamera] = useState(true);
  const [hand, setHand] = useState(false);
  const [snapshot, setSnapshot] = useState({
    state: 'connecting',
    peers: [],
    messages: [],
    title: roomTitle(room),
  });
  const [mediaBusy, setMediaBusy] = useState(false);
  const [error, setError] = useState('');
  const [toast, setToast] = useState('');
  const [invite, setInvite] = useState(false);
  const [drawer, setDrawer] = useState(null);
  const [chat, setChat] = useState('');
  const [unread, setUnread] = useState(0);
  const [elapsed, setElapsed] = useState(0);
  const client = useRef(null);
  const media = useRef(null);
  const screenMedia = useRef(null);
  const nameInput = useRef(null);
  const previousMessages = useRef(0);
  const chatBottom = useRef(null);
  const url = invitationUrl(room);
  const title = snapshot.title || roomTitle(room);

  useEffect(() => {
    document.title = title + ' | Meet Hub';
    return () => {
      client.current?.close();
      media.current?.getTracks().forEach((track) => track.stop());
      screenMedia.current?.getTracks().forEach((track) => track.stop());
    };
  }, []);
  useEffect(() => {
    if (phase !== 'meeting') return;
    const start = Date.now();
    const timer = setInterval(
      () => setElapsed(Math.floor((Date.now() - start) / 1000)),
      1000,
    );
    return () => clearInterval(timer);
  }, [phase]);
  useEffect(() => {
    if (!toast) return;
    const timer = setTimeout(() => setToast(''), 3500);
    return () => clearTimeout(timer);
  }, [toast]);
  useEffect(() => {
    const length = snapshot.messages.length;
    if (drawer === 'chat') {
      setUnread(0);
      chatBottom.current?.scrollIntoView({ block: 'end' });
    } else if (length > previousMessages.current)
      setUnread((value) => value + length - previousMessages.current);
    previousMessages.current = length;
  }, [snapshot.messages, drawer]);

  async function getMedia(withoutDevices = false) {
    if (withoutDevices || (!mic && !camera)) {
      media.current?.getTracks().forEach((track) => track.stop());
      const empty = new MediaStream();
      media.current = empty;
      setStream(empty);
      return empty;
    }
    const current = media.current;
    const ready =
      current &&
      (!mic ||
        current
          .getAudioTracks()
          .some((track) => track.readyState === 'live')) &&
      (!camera ||
        current.getVideoTracks().some((track) => track.readyState === 'live'));
    if (ready) return current;
    setMediaBusy(true);
    setError('');
    try {
      if (!navigator.mediaDevices?.getUserMedia)
        throw new Error(
          'This browser cannot access media. Open the same Meet Hub link in a supported browser.',
        );
      const next = await navigator.mediaDevices.getUserMedia({
        audio: mic ? { echoCancellation: true, noiseSuppression: true } : false,
        video: camera
          ? {
              width: { ideal: 1280 },
              height: { ideal: 720 },
              facingMode: 'user',
            }
          : false,
      });
      current?.getTracks().forEach((track) => track.stop());
      media.current = next;
      setStream(next);
      return next;
    } catch (e) {
      setError(
        e.name === 'NotAllowedError'
          ? 'Camera or microphone permission was declined. You can change browser permissions or join with both off.'
          : e.name === 'NotFoundError'
            ? 'A camera or microphone was not found. Turn off the missing device, or join with both off.'
            : e.message || 'Your devices could not be started.',
      );
      return null;
    } finally {
      setMediaBusy(false);
    }
  }
  async function join(withoutDevices = false) {
    if (!name.trim()) {
      setError('Enter your name to join.');
      nameInput.current?.focus();
      return;
    }
    const next = await getMedia(withoutDevices);
    if (!next) return;
    const flags = {
      mic: withoutDevices ? false : mic,
      camera: withoutDevices ? false : camera,
      sharing: false,
      hand: false,
    };
    if (withoutDevices) {
      setMic(false);
      setCamera(false);
    }
    try {
      localStorage.setItem('meethub-name', name.trim());
      const recent = JSON.parse(
        localStorage.getItem('meethub-recent') || '[]',
      ).filter((item) => item.room !== room);
      localStorage.setItem(
        'meethub-recent',
        JSON.stringify(
          [{ room, title: roomTitle(room), at: Date.now() }, ...recent].slice(
            0,
            5,
          ),
        ),
      );
    } catch {}
    client.current = new MeetingClient({
      room,
      title: roomTitle(room),
      name: name.trim(),
      media: next,
      status: flags,
      onChange: setSnapshot,
    });
    setPhase('meeting');
    client.current.start();
  }
  async function toggle(kind) {
    const isMic = kind === 'audio';
    const enabled = isMic ? mic : camera;
    let track = media.current
      ?.getTracks()
      .find((value) => value.kind === kind && value.readyState === 'live');
    if (!enabled && !track && phase === 'meeting') {
      try {
        const capture = await navigator.mediaDevices.getUserMedia({
          audio: isMic,
          video: !isMic,
        });
        track = capture.getTracks()[0];
        media.current.addTrack(track);
        setStream(new MediaStream(media.current.getTracks()));
        if (isMic || !screenMedia.current)
          await client.current.replaceTrack(kind, track);
      } catch {
        setToast(
          `Allow ${isMic ? 'microphone' : 'camera'} access in your browser first.`,
        );
        return;
      }
    }
    if (track) track.enabled = !enabled;
    if (isMic) setMic(!enabled);
    else setCamera(!enabled);
    client.current?.updateStatus({ [isMic ? 'mic' : 'camera']: !enabled });
  }
  async function stopSharing() {
    if (!screenMedia.current) return;
    screenMedia.current.getTracks().forEach((track) => track.stop());
    screenMedia.current = null;
    setScreen(null);
    await client.current?.replaceTrack(
      'video',
      media.current?.getVideoTracks()[0] || null,
    );
    client.current?.updateStatus({ sharing: false });
  }
  async function shareScreen() {
    if (screenMedia.current) {
      await stopSharing();
      return;
    }
    try {
      const capture = await navigator.mediaDevices.getDisplayMedia({
        video: true,
        audio: false,
      });
      screenMedia.current = capture;
      setScreen(capture);
      await client.current.replaceTrack('video', capture.getVideoTracks()[0]);
      client.current.updateStatus({ sharing: true });
      capture.getVideoTracks()[0].onended = stopSharing;
    } catch (e) {
      if (e.name !== 'NotAllowedError')
        setToast('Screen sharing is unavailable in this browser.');
    }
  }
  function leave() {
    client.current?.close();
    client.current = null;
    media.current?.getTracks().forEach((track) => track.stop());
    screenMedia.current?.getTracks().forEach((track) => track.stop());
    media.current = null;
    screenMedia.current = null;
    setStream(null);
    setScreen(null);
    setPhase('left');
    setDrawer(null);
  }
  function sendChat(event) {
    event.preventDefault();
    if (chat.trim()) {
      client.current?.chat(chat);
      setChat('');
    }
  }
  const selfStatus = { mic, camera, sharing: Boolean(screen), hand };
  const statusLabel =
    snapshot.state === 'joined'
      ? 'In room'
      : snapshot.state === 'reconnecting'
        ? 'Reconnecting…'
        : snapshot.state === 'error'
          ? 'Unable to join'
          : 'Connecting room…';
  const time = `${Math.floor(elapsed / 60)
    .toString()
    .padStart(2, '0')}:${(elapsed % 60).toString().padStart(2, '0')}`;

  if (phase === 'left')
    return (
      <div className="left-page">
        <Brand />
        <div className="left-card">
          <div className="dialog-symbol">
            <Icon name="check" size={30} />
          </div>
          <p className="eyebrow">UNTIL NEXT TIME</p>
          <h1>Good to see you.</h1>
          <p>
            You’ve left the meeting. Your room link is still yours to share.
          </p>
          <div className="left-actions">
            <button
              className="primary"
              onClick={() => {
                setError('');
                setPhase('prejoin');
                setMic(true);
                setCamera(true);
              }}
            >
              Rejoin meeting
            </button>
            <button className="secondary" onClick={() => navigate('/')}>
              Back to home
            </button>
          </div>
        </div>
      </div>
    );
  if (phase === 'prejoin')
    return (
      <div className="prejoin-page">
        <header className="prejoin-header">
          <Brand light />
          <button className="quiet-button" onClick={() => setInvite(true)}>
            <Icon name="link" />
            Invite people
          </button>
        </header>
        <main className="prejoin-layout">
          <div className="preview-panel">
            <VideoTile
              stream={stream}
              name={name || 'Your preview'}
              local
              status={selfStatus}
            />
            <span className="preview-caption">
              Your camera preview. A moment to get comfortable.
            </span>
          </div>
          <section className="join-panel">
            <span className="eyebrow">YOUR PEOPLE ARE A LINK AWAY</span>
            <h1>Ready when you are.</h1>
            <p className="join-room-name" title={roomTitle(room)}>
              {roomTitle(room)}
            </p>
            <form
              onSubmit={(event) => {
                event.preventDefault();
                join();
              }}
            >
              <label htmlFor="guest-name">Your name</label>
              <input
                id="guest-name"
                ref={nameInput}
                value={name}
                maxLength={48}
                onChange={(event) => setName(event.target.value)}
                placeholder="How should we call you?"
                autoComplete="name"
              />
              <div className="prejoin-devices">
                <button
                  type="button"
                  className={!mic ? 'device-off' : ''}
                  onClick={() => toggle('audio')}
                  aria-label={mic ? 'Mute microphone' : 'Unmute microphone'}
                  aria-pressed={!mic}
                >
                  <Icon name="mic" off={!mic} />
                </button>
                <button
                  type="button"
                  className={!camera ? 'device-off' : ''}
                  onClick={() => toggle('video')}
                  aria-label={camera ? 'Stop camera' : 'Start camera'}
                  aria-pressed={!camera}
                >
                  <Icon name="camera" off={!camera} />
                </button>
                <button
                  type="button"
                  className="check-devices"
                  onClick={() => getMedia()}
                  disabled={mediaBusy || (!mic && !camera)}
                >
                  {mediaBusy ? 'Checking…' : 'Check devices'}
                </button>
              </div>
              {error && (
                <p className="inline-error" role="alert">
                  {error}
                </p>
              )}
              <button
                type="submit"
                className="primary wide"
                disabled={mediaBusy}
              >
                {mediaBusy ? 'Starting devices…' : 'Join meeting'}
                <Icon name="arrow" />
              </button>
              <button
                type="button"
                className="text-button"
                onClick={() => join(true)}
                disabled={mediaBusy}
              >
                Join with camera and microphone off
              </button>
            </form>
            <p className="join-note">
              Stay right here in Meet Hub. No account or app installation
              needed.
            </p>
            <a
              className="help-inline"
              href="/help"
              target="_blank"
              rel="noreferrer"
            >
              <Icon name="help" size={16} />
              Need a hand?
            </a>
          </section>
        </main>
        {invite && <InviteDialog url={url} onClose={() => setInvite(false)} />}
      </div>
    );

  return (
    <div className="meeting-page">
      <header className="meeting-header">
        <Brand light />
        <div className="meeting-title">
          <strong title={title}>{title}</strong>
          <span>
            {time}
            <i />
            Up to {snapshot.maxParticipants || 4} people
          </span>
        </div>
        <div
          className={`connection-pill ${snapshot.state === 'joined' ? 'online' : ''}`}
          role="status"
        >
          <i />
          {statusLabel}
        </div>
        <button
          className="invite-top"
          aria-label="Invite people"
          onClick={() => setInvite(true)}
        >
          <Icon name="link" />
          <span>Invite people</span>
        </button>
      </header>
      {(snapshot.error || snapshot.state === 'error') && (
        <div className="room-notice" role="alert">
          {snapshot.error || 'The room could not be joined.'}
          <button onClick={() => client.current?.reconnect()}>
            Reconnect to meeting
          </button>
          {snapshot.state === 'error' && (
            <button onClick={leave}>Back to join screen</button>
          )}
        </div>
      )}
      <div className={`meeting-layout ${drawer ? 'drawer-open' : ''}`}>
        <main className="meeting-stage">
          <div className="video-grid" data-count={snapshot.peers.length + 1}>
            <VideoTile
              stream={screen || stream}
              name={name}
              local
              status={selfStatus}
              count={snapshot.peers.length + 1}
            />
            {snapshot.peers.map((peer) => (
              <VideoTile
                key={peer.id}
                {...peer}
                connection={peer.connection}
                onRetry={() => client.current?.retryMedia()}
              />
            ))}
          </div>
          {snapshot.peers.length === 0 && (
            <div className="waiting-note">
              <Icon name="users" />
              <div>
                <strong>You’re the first one here.</strong>
                <span>
                  Send the room link and bring someone a little closer.
                </span>
              </div>
              <button onClick={() => setInvite(true)}>
                Copy invite
                <Icon name="arrow" size={18} />
              </button>
            </div>
          )}
        </main>
        {drawer && (
          <aside
            className="meeting-drawer"
            aria-label={drawer === 'chat' ? 'Meeting chat' : 'Participants'}
          >
            <div className="drawer-heading">
              <h2>
                {drawer === 'chat' ? 'Conversation' : 'Your people'}
                <span>
                  {drawer === 'chat' ? '' : snapshot.peers.length + 1}
                </span>
              </h2>
              <button
                className="icon-button"
                aria-label="Close panel"
                onClick={() => setDrawer(null)}
              >
                <Icon name="close" />
              </button>
            </div>
            {drawer === 'chat' ? (
              <>
                <div className="messages">
                  {!snapshot.messages.length && (
                    <div className="chat-empty">
                      <Icon name="chat" size={35} />
                      <p>A little hello goes a long way.</p>
                      <span>
                        Messages are shared with everyone in this room.
                      </span>
                    </div>
                  )}
                  {snapshot.messages.map((item) => (
                    <article
                      key={item.id}
                      className={`chat-message ${item.from === snapshot.self?.id ? 'mine' : ''}`}
                    >
                      <header>
                        <strong>
                          {item.from === snapshot.self?.id ? 'You' : item.name}
                        </strong>
                        <time>
                          {new Date(item.timestamp).toLocaleTimeString([], {
                            hour: '2-digit',
                            minute: '2-digit',
                          })}
                        </time>
                      </header>
                      <p>{item.text}</p>
                    </article>
                  ))}
                  <div ref={chatBottom} />
                </div>
                <form className="chat-compose" onSubmit={sendChat}>
                  <label className="sr-only" htmlFor="message">
                    Message everyone
                  </label>
                  <input
                    id="message"
                    value={chat}
                    onChange={(event) => setChat(event.target.value)}
                    maxLength={2000}
                    placeholder="Say something…"
                  />
                  <button
                    type="submit"
                    aria-label="Send message"
                    disabled={!chat.trim() || snapshot.state !== 'joined'}
                  >
                    <Icon name="send" />
                  </button>
                </form>
              </>
            ) : (
              <div className="people-list">
                {[
                  { id: 'you', name: name + ' (you)', status: selfStatus },
                  ...snapshot.peers,
                ].map((person) => (
                  <div className="person-row" key={person.id}>
                    <div className="small-avatar">{initials(person.name)}</div>
                    <strong>{person.name}</strong>
                    {person.status?.hand && <Icon name="hand" size={18} />}
                    <Icon name="mic" size={18} off={!person.status?.mic} />
                  </div>
                ))}
                <button
                  className="secondary wide"
                  onClick={() => setInvite(true)}
                >
                  <Icon name="link" />
                  Invite someone
                </button>
              </div>
            )}
          </aside>
        )}
      </div>
      <footer className="meeting-controls">
        <div className="controls-caption">
          Different places.
          <br />
          <em>Same room.</em>
        </div>
        <div className="control-buttons">
          <Control
            name="mic"
            off={!mic}
            active={!mic}
            label={mic ? 'Mute microphone' : 'Unmute microphone'}
            onClick={() => toggle('audio')}
          />
          <Control
            name="camera"
            off={!camera}
            active={!camera}
            label={camera ? 'Stop camera' : 'Start camera'}
            onClick={() => toggle('video')}
          />
          <Control
            name="screen"
            active={Boolean(screen)}
            label={screen ? 'Stop sharing screen' : 'Share screen'}
            onClick={shareScreen}
            disabled={!navigator.mediaDevices?.getDisplayMedia}
          />
          <span className="control-divider" />
          <Control
            name="chat"
            active={drawer === 'chat'}
            label="Open chat"
            onClick={() => setDrawer(drawer === 'chat' ? null : 'chat')}
            badge={unread}
          />
          <Control
            name="users"
            active={drawer === 'people'}
            label={`Participants, ${snapshot.peers.length + 1} people`}
            onClick={() => setDrawer(drawer === 'people' ? null : 'people')}
            badge={snapshot.peers.length + 1}
          />
          <Control
            name="hand"
            active={hand}
            label={hand ? 'Lower hand' : 'Raise hand'}
            onClick={() => {
              setHand(!hand);
              client.current?.updateStatus({ hand: !hand });
            }}
          />
          <button
            className="leave-button"
            aria-label="Leave meeting"
            title="Leave meeting"
            onClick={leave}
          >
            <Icon name="leave" />
            <span>Leave</span>
          </button>
        </div>
        <a
          href="/help"
          className="meeting-help"
          target="_blank"
          rel="noreferrer"
          aria-label="Meet Hub help"
        >
          <Icon name="help" />
        </a>
      </footer>
      {invite && <InviteDialog url={url} onClose={() => setInvite(false)} />}
      <div className="toast" role="status">
        {toast}
      </div>
    </div>
  );
}
function Control({ name, label, active, off, onClick, disabled, badge }) {
  return (
    <button
      className={`control ${active ? 'active' : ''}`}
      aria-label={label}
      title={label}
      aria-pressed={Boolean(active)}
      onClick={onClick}
      disabled={disabled}
    >
      <Icon name={name} off={off} />
      {Boolean(badge) && <span className="control-badge">{badge}</span>}
    </button>
  );
}
