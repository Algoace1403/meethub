import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';

function initials(name = 'Guest') {
  return name
    .trim()
    .split(/\s+/)
    .slice(0, 2)
    .map((value) => value[0])
    .join('')
    .toUpperCase();
}

export default function VideoTile({
  stream,
  name,
  local,
  status,
  connection,
  connectionError,
  onRetry,
  count,
}) {
  const video = useRef(null);
  const [audioBlocked, setAudioBlocked] = useState(false);
  const showVideo = Boolean(status?.camera || status?.sharing);
  useEffect(() => {
    const element = video.current;
    element.srcObject = stream || null;
    if (stream)
      element
        .play()
        .then(() => setAudioBlocked(false))
        .catch(() => setAudioBlocked(true));
    return () => {
      element.srcObject = null;
    };
  }, [stream]);
  return (
    <article
      className={`video-tile ${local ? 'local-tile' : ''} ${status?.sharing ? 'screen-tile' : ''}`}
      data-peer={local ? 'self' : name}
      data-connection={connection || 'local'}
    >
      <video
        ref={video}
        autoPlay
        playsInline
        muted={local}
        className={`${showVideo ? '' : 'video-hidden'} ${local && !status?.sharing ? 'mirror' : ''}`}
      />
      {!showVideo && (
        <div
          className="person-avatar"
          data-color={(name.charCodeAt(0) || 0) % 4}
        >
          {initials(name)}
        </div>
      )}
      {audioBlocked && !local && (
        <button
          className="enable-audio"
          onClick={() =>
            video.current.play().then(() => setAudioBlocked(false))
          }
        >
          Tap to play audio
        </button>
      )}
      <div className="tile-label">
        <span>
          {name}
          {local ? ' (you)' : ''}
        </span>
        {!status?.mic && <Icon name="mic" off size={15} />}
      </div>
      {status?.hand && (
        <div className="raised-hand">
          <Icon name="hand" size={20} />
          <span className="sr-only">Hand raised</span>
        </div>
      )}
      {!local && connection && connection !== 'connected' && (
        <div className="peer-connecting" role="status">
          {connectionError ||
            (connection === 'failed'
              ? 'Connection interrupted'
              : 'Connecting audio and video…')}
          {connectionError && (
            <button className="retry-media" onClick={onRetry}>
              Retry connection
            </button>
          )}
        </div>
      )}
      {count === 1 && (
        <span className="tile-watermark">A little closer, from anywhere.</span>
      )}
    </article>
  );
}
