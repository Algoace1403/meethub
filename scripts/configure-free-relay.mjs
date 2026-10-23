import http from 'node:http';
import { randomBytes } from 'node:crypto';
import { spawn } from 'node:child_process';
import { getIceConfig } from '../server/ice-config.mjs';
import { fileURLToPath } from 'node:url';
import path from 'node:path';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const session = '/' + randomBytes(24).toString('hex');
let origin, busy = false, configured = false;
const html = `<!doctype html><meta charset="utf-8"><meta name="viewport" content="width=device-width"><title>Connect Meet Hub’s free relay</title>
<style>body{font:16px/1.7 system-ui;background:#f6f5ef;color:#244231;margin:60px auto;padding:24px;max-width:610px}h1{line-height:1.2}label{display:block;margin:20px 0}input:not([type=checkbox]){display:block;box-sizing:border-box;width:100%;padding:12px;border:1px solid #b5c2a5;border-radius:6px}button{padding:13px 20px;background:#244231;color:white;border:0;border-radius:6px;font:inherit}a{color:inherit}#status{white-space:pre-wrap}</style>
<h1>Connect Meet Hub’s free media relay</h1><p>This enables calls when friends use mobile data or restrictive Wi-Fi. The Meet Hub site and room backend remain on Cloudflare.</p>
<p>Create a <a href="https://dashboard.metered.ca/signup" target="_blank" rel="noreferrer">Metered Free account</a>. Choose TURN, stay on the no-card Free trial (use the allowance shown in your dashboard), and do not add a payment method or enable top-ups. Create one client credential under TURN → Credentials. Use Get credential → Show API Key on that credential row; use that credential-scoped key, not the workspace secret or a messaging key.</p>
<form><label>Application name<input name="app" placeholder="your-app-name" pattern="[a-z0-9-]{1,63}" required autocomplete="off"></label><label>TURN API key<input name="key" type="password" required autocomplete="off"></label><label><input type="checkbox" name="free" required> I selected Free and did not add a payment method or enable top-ups.</label><button>Connect free relay</button></form><p id="status" role="status">Credentials are sent only to this local setup tool, then stored as private Cloudflare secrets. Never paste them into a chat or GitHub.</p>
<script>document.querySelector('form').onsubmit=async e=>{e.preventDefault();const f=e.target,b=f.querySelector('button'),s=document.querySelector('#status');b.disabled=true;s.textContent='Checking the relay and saving private Cloudflare settings…';try{const r=await fetch(location.pathname,{method:'POST',headers:{'Content-Type':'application/json'},body:JSON.stringify({app:f.app.value.trim(),key:f.key.value.trim(),free:f.free.checked})});const v=await r.json();if(!r.ok)throw Error(v.message);f.remove();s.textContent=v.message;}catch(e){s.textContent=e.message;b.disabled=false;}};</script>`;

function saveSecrets(values) {
    return new Promise((resolve, reject) => {
        const child = spawn(process.execPath, [path.join(root, 'node_modules/wrangler/bin/wrangler.js'), 'secret', 'bulk'], { cwd: root, stdio: ['pipe', 'pipe', 'pipe'] });
        child.stdout.on('data', chunk => process.stdout.write(chunk));
        child.stderr.on('data', chunk => process.stderr.write(chunk));
        child.on('error', reject);
        child.on('exit', code => code === 0 ? resolve() : reject(new Error('Cloudflare could not save the relay settings. Check the local terminal and try again.')));
        child.stdin.end(JSON.stringify(values));
    });
}

const server = http.createServer(async (request, response) => {
    response.setHeader('Cache-Control', 'no-store');
    response.setHeader('X-Content-Type-Options', 'nosniff');
    response.setHeader('Referrer-Policy', 'no-referrer');
    if (request.url !== session || request.headers.host !== new URL(origin).host) { response.writeHead(404); response.end(); return; }
    if (request.method === 'GET') { response.setHeader('Content-Type', 'text/html; charset=utf-8'); response.end(configured ? '<p>The free relay has been configured. Return to Meet Hub.</p>' : html); return; }
    if (request.method !== 'POST' || request.headers.origin !== origin || request.headers['content-type'] !== 'application/json') { response.writeHead(403); response.end(); return; }
    response.setHeader('Content-Type', 'application/json');
    if (busy || configured) { response.writeHead(409); response.end(JSON.stringify({ message: 'Setup is already running or complete.' })); return; }
    busy = true;
    try {
        let body = '';
        for await (const chunk of request) { body += chunk; if (body.length > 8192) throw new Error('Invalid setup request.'); }
        const value = JSON.parse(body);
        if (value.free !== true || !/^[a-z0-9-]{1,63}$/.test(value.app) || typeof value.key !== 'string' || value.key.length < 10 || value.key.length > 4096) throw new Error('Enter your Free-plan application name and TURN API key.');
        const secrets = { METERED_APP_NAME: value.app, METERED_API_KEY: value.key };
        await getIceConfig(secrets);
        await saveSecrets(secrets);
        configured = true;
        response.end(JSON.stringify({ message: 'Free relay connected. Return to Meet Hub, reload both devices, and rejoin using the same meeting link.' }));
        console.log('Meet Hub free relay connected. Credentials were not saved in the repository.');
    } catch (error) { response.writeHead(400); response.end(JSON.stringify({ message: error.message.startsWith('Cloudflare') ? error.message : 'The relay settings could not be verified. Check the application name and TURN API key, then try again.' })); }
    finally { busy = false; }
});
server.listen(0, '127.0.0.1', () => {
    origin = 'http://127.0.0.1:' + server.address().port;
    console.log('Open this private local setup page: ' + origin + session);
});
for (const signal of ['SIGINT', 'SIGTERM']) process.on(signal, () => server.close(() => process.exit(0)));
