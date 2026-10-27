import React, { useEffect, useState } from 'react';
import { Brand } from './icons.jsx';
import Room from './Room.jsx';
import Home from './pages/Home.jsx';
import Help from './pages/Help.jsx';

export default function App() {
  const [pathname, setPathname] = useState(location.pathname);
  useEffect(() => {
    const update = () => setPathname(location.pathname);
    addEventListener('popstate', update);
    return () => removeEventListener('popstate', update);
  }, []);
  useEffect(() => {
    if (pathname === '/') document.title = 'Meet Hub';
    else if (pathname === '/help') document.title = 'A little help | Meet Hub';
  }, [pathname]);
  function navigate(path) {
    history.pushState(null, '', path);
    setPathname(path);
    window.scrollTo(0, 0);
  }
  if (pathname === '/') return <Home navigate={navigate} />;
  if (pathname === '/help') return <Help navigate={navigate} />;
  let room;
  try {
    room = decodeURIComponent(pathname.replace(/^\/+|\/+$/g, ''));
  } catch {}
  if (!room || !/^[a-zA-Z0-9_-]{3,80}$/.test(room))
    return (
      <div className="left-page">
        <Brand />
        <div className="left-card">
          <h1>This room link looks incomplete.</h1>
          <p>Open the full invitation, or start a new room.</p>
          <button className="primary" onClick={() => navigate('/')}>
            Go to Meet Hub
          </button>
        </div>
      </div>
    );
  return <Room key={room} room={room} navigate={navigate} />;
}
