import React, { useEffect, useState } from 'react';
import { Brand, Icon } from './icons.jsx';
import Room, {roomTitle} from './Room.jsx';

function newRoom(value) {
    const slug=value.trim().toLowerCase().replace(/[^a-z0-9]+/g,'-').replace(/^-|-$/g,'').slice(0,40)||'catch-up';
    const random=[...crypto.getRandomValues(new Uint8Array(6))].map(number=>number.toString(16).padStart(2,'0')).join('');
    return slug+'-'+random;
}
function Home({navigate}) {
    const [value,setValue]=useState('');const [error,setError]=useState('');
    const [recent]=useState(()=>{try{return JSON.parse(localStorage.getItem('meethub-recent')||'[]');}catch{return [];}});
    function submit(event){
        event.preventDefault();setError('');
        if(/^https?:\/\//i.test(value.trim())){
            try{const link=new URL(value.trim());if(link.origin!==location.origin)throw new Error('Use a meeting link from this Meet Hub website.');const room=decodeURIComponent(link.pathname.replace(/^\/+|\/+$/g,''));if(!/^[a-zA-Z0-9_-]{3,80}$/.test(room))throw new Error('Paste a valid Meet Hub room link.');navigate('/'+room);}catch(e){setError(e.message);}return;
        }
        navigate('/'+newRoom(value));
    }
    return <div className="home-page"><nav className="home-nav" aria-label="Main navigation"><Brand/><div><a className="nav-active" href="#start">Meet</a><a href="#how-it-works">How it works</a><a href="/help" onClick={event=>{event.preventDefault();navigate('/help');}}>Help<Icon name="help" size={16}/></a></div></nav>
        <main className="home-main"><section className="hero"><div className="hero-intro"><p className="eyebrow"><i className="status-dot"/>LESS DISTANCE. MORE CONNECTION.</p><h1>Good conversations<br/><em>start here.</em></h1><p className="hero-description">Bring your people together. A quick catch-up, a big idea, or just a hello — make room for what matters.</p><form id="start" onSubmit={submit}><label htmlFor="room-name">Give your meeting a name, or paste a Meet Hub link</label><div className="start-form"><Icon name="camera"/><input id="room-name" value={value} onChange={event=>setValue(event.target.value)} placeholder="e.g. Friday catch-up" maxLength={300} autoComplete="off"/><button type="submit" className="primary">Start meeting<Icon name="arrow" size={19}/></button></div>{error&&<p className="home-error" role="alert">{error}</p>}<p className="form-hint">We’ll make a unique room link for you to share.</p></form></div>
            <div className="hero-art" aria-hidden="true"><div className="art-eyebrow">YOUR PEOPLE, A LITTLE CLOSER<span>✳</span></div><img src="/conversation.svg" alt=""/><div className="art-caption"><em>Different places. Same room.</em><div className="art-avatars"><i>A</i><i>M</i><i>+1</i></div></div></div></section>
            <div className="benefits"><span><Icon name="camera" size={18}/>Right in your browser</span><span><Icon name="link" size={18}/>Your own room link</span><span><Icon name="users" size={18}/>Bring up to four people together</span></div>
            <section className="how-section" id="how-it-works"><div><p className="eyebrow">A SMALL LINK. A BIG CONNECTION.</p><h2>From “hello” to here.<br/>In three steps.</h2></div><div className="steps">{[['Make a little room.','Choose a name. We’ll create a unique meeting link, ready when you are.'],['Send an invitation.','Copy the link and share it with the people you want to bring together.'],['Be there, together.','Check your camera and mic, join in your browser, and let the good ideas flow.']].map(([title,text],index)=><article key={title}><span>0{index+1}</span><h3>{title}</h3><p>{text}</p></article>)}</div></section>
            {recent.length>0&&<section className="recent-section"><h2>Pick up where you left off.</h2><div>{recent.map(item=><button key={item.room} onClick={()=>navigate('/'+item.room)}><span className="recent-symbol"><Icon name="camera"/></span><span><strong>{item.title||roomTitle(item.room)}</strong><small>{new Date(item.at).toLocaleDateString([],{month:'short',day:'numeric'})}</small></span><Icon name="arrow" size={18}/></button>)}</div></section>}
        </main><footer className="home-footer"><span>Made for connection. Made by Meet Hub.</span><a href="/help" onClick={event=>{event.preventDefault();navigate('/help');}}>A little help<Icon name="arrow" size={14}/></a></footer></div>;
}
function Help({navigate}){return <div className="help-page"><header><Brand/><button className="secondary" onClick={()=>navigate('/')}>Back to Meet Hub<Icon name="arrow" size={17}/></button></header><main><p className="eyebrow">A LITTLE HELP</p><h1>Let’s get you<br/><em>connected.</em></h1><div className="help-grid">{[['How do I invite someone?','Start a meeting, choose Invite people, and copy the link. Send it in a message or paste it in WhatsApp. Guests stay on Meet Hub and join in their browser.'],['Do I need an app or an account?','No. Open the room link, enter your name, allow your camera and microphone if you want to use them, and choose Join meeting.'],['How many people can join?','This small prototype supports up to four people in a room. Each participant needs a modern browser and a stable internet connection.'],['My camera or microphone won’t start.','Check the browser’s site permissions and make sure another app isn’t using the device. You can also join with both off. If a messaging app limits media access, open the same link in your usual browser.'],['Someone’s video is still connecting.','Use Retry connection to restart audio and video. Some mobile and restricted Wi-Fi networks need the meeting owner to configure a media relay. Room chat can still work while video is unavailable.'],['What happens to messages?','The room server keeps the latest messages in memory while the room is active. They are cleared when the room becomes empty or the server restarts. There are no recordings or paid upgrades in this prototype.']].map(([question,answer])=><article key={question}><h2>{question}</h2><p>{answer}</p></article>)}</div><button className="primary" onClick={()=>navigate('/')}>Make a little room<Icon name="arrow"/></button></main></div>;}
export default function App(){
    const [pathname,setPathname]=useState(location.pathname);
    useEffect(()=>{const update=()=>setPathname(location.pathname);addEventListener('popstate',update);return()=>removeEventListener('popstate',update);},[]);
    useEffect(()=>{if(pathname==='/')document.title='Meet Hub';else if(pathname==='/help')document.title='A little help | Meet Hub';},[pathname]);
    function navigate(path){history.pushState(null,'',path);setPathname(path);window.scrollTo(0,0);}
    if(pathname==='/')return <Home navigate={navigate}/>;
    if(pathname==='/help')return <Help navigate={navigate}/>;
    let room;
    try{room=decodeURIComponent(pathname.replace(/^\/+|\/+$/g,''));}catch{}
    if(!room||!/^[a-zA-Z0-9_-]{3,80}$/.test(room))return <div className="left-page"><Brand/><div className="left-card"><h1>This room link looks incomplete.</h1><p>Open the full invitation, or start a new room.</p><button className="primary" onClick={()=>navigate('/')}>Go to Meet Hub</button></div></div>;
    return <Room key={room} room={room} navigate={navigate}/>;
}
