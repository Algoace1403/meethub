import React, { useEffect, useRef, useState } from 'react';
import { Icon } from '../icons.jsx';

async function copyLink(text) {
  if (navigator.clipboard?.writeText)
    return navigator.clipboard.writeText(text);
  const area = document.createElement('textarea');
  area.value = text;
  area.style.position = 'fixed';
  area.style.opacity = '0';
  document.body.append(area);
  area.select();
  const copied = document.execCommand('copy');
  area.remove();
  if (!copied) throw new Error('Select and copy the link above.');
}
export default function InviteDialog({ url, onClose }) {
  const dialog = useRef(null);
  const [message, setMessage] = useState('');
  useEffect(() => {
    dialog.current.showModal();
    return () => dialog.current?.close();
  }, []);
  return (
    <dialog
      ref={dialog}
      className="invite-dialog"
      aria-label="Invite people"
      onCancel={onClose}
    >
      <button
        className="dialog-close"
        onClick={onClose}
        aria-label="Close invitation"
      >
        <Icon name="close" />
      </button>
      <div className="dialog-symbol">
        <Icon name="link" size={27} />
      </div>
      <h2>Make room for your people.</h2>
      <p>Share this link. Guests join here in their browser.</p>
      <label className="sr-only" htmlFor="invite-url">
        Meeting link
      </label>
      <input
        id="invite-url"
        value={url}
        readOnly
        onFocus={(e) => e.target.select()}
      />
      <button
        className="primary wide"
        onClick={() =>
          copyLink(url)
            .then(() => setMessage('Link copied'))
            .catch((e) => setMessage(e.message))
        }
      >
        <Icon name={message === 'Link copied' ? 'check' : 'copy'} />
        {message === 'Link copied' ? 'Link copied' : 'Copy meeting link'}
      </button>
      {navigator.share && (
        <button
          className="text-button"
          onClick={() =>
            navigator
              .share({
                title: 'Meet Hub',
                text: 'Join my Meet Hub meeting',
                url,
              })
              .catch(() => {})
          }
        >
          Share invitation
        </button>
      )}
      <p className="dialog-hint">
        Anyone with this link can join, up to four people.
      </p>
      <span className="sr-only" role="status">
        {message}
      </span>
    </dialog>
  );
}
