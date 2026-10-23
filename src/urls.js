export function invitationUrl(room, currentLocation = window.location) {
    // Deployment URLs may require the owner's hosting login. Invitations must
    // point to the public production site so anonymous guests can open them.
    const preview = /^meethub-[a-z0-9-]+-anujsoni1403-3449s-projects\.vercel\.app$/.test(currentLocation.hostname);
    const origin = preview ? 'https://meethub-pink.vercel.app' : currentLocation.origin;
    return new URL('/' + encodeURIComponent(room), origin).href;
}
