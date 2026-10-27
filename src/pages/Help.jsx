import React from 'react';
import { Brand, Icon } from '../icons.jsx';

export default function Help({ navigate }) {
  return (
    <div className="help-page">
      <header>
        <Brand />
        <button className="secondary" onClick={() => navigate('/')}>
          Back to Meet Hub
          <Icon name="arrow" size={17} />
        </button>
      </header>
      <main>
        <p className="eyebrow">A LITTLE HELP</p>
        <h1>
          Let’s get you
          <br />
          <em>connected.</em>
        </h1>
        <div className="help-grid">
          {[
            [
              'How do I invite someone?',
              'Start a meeting, choose Invite people, and copy the link. Send it in a message or paste it in WhatsApp. Guests stay on Meet Hub and join in their browser.',
            ],
            [
              'Do I need an app or an account?',
              'No. Open the room link, enter your name, allow your camera and microphone if you want to use them, and choose Join meeting.',
            ],
            [
              'How many people can join?',
              'This small prototype supports up to four people in a room. Each participant needs a modern browser and a stable internet connection.',
            ],
            [
              'My camera or microphone won’t start.',
              'Check the browser’s site permissions and make sure another app isn’t using the device. You can also join with both off. If a messaging app limits media access, open the same link in your usual browser.',
            ],
            [
              'Someone’s video is still connecting.',
              'Use Retry connection to restart audio and video. Meet Hub can use a media relay when a direct connection is blocked. Try reconnecting, then check your network and browser permissions. Room chat can still work while video is unavailable.',
            ],
            [
              'What happens to messages?',
              'The hosted service keeps the latest 50 messages while the room is active, including through idle periods. Messages are deleted when the last person leaves. Recent room links and your display name stay in this browser. Meet Hub does not record calls.',
            ],
          ].map(([question, answer]) => (
            <article key={question}>
              <h2>{question}</h2>
              <p>{answer}</p>
            </article>
          ))}
        </div>
        <button className="primary" onClick={() => navigate('/')}>
          Make a little room
          <Icon name="arrow" />
        </button>
      </main>
    </div>
  );
}
