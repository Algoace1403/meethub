import test from 'node:test';
import assert from 'node:assert/strict';
import { invitationUrl } from '../src/urls.js';

test('private deployment invites use the public site without changing the room', () => {
    const current = new URL('https://meethub-deploy123-anujsoni1403-3449s-projects.vercel.app/demo');
    assert.equal(invitationUrl('our-room-abcdef123456', current), 'https://meethub-pink.vercel.app/our-room-abcdef123456');
});
test('public Cloudflare, Vercel and local invites retain their own origins', () => {
    for (const origin of ['https://meethub-pink.vercel.app', 'https://meethub.algoace-meethub.workers.dev', 'http://localhost:8788']) {
        assert.equal(invitationUrl('our-room', new URL(origin)), origin + '/our-room');
    }
});
