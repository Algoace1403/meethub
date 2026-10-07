/* global interfaceConfig */

// Apply this fork's UI branding, including when the development HTML comes from the proxy.
interfaceConfig.APP_NAME = 'Meet Hub';
interfaceConfig.PROVIDER_NAME = 'Meet Hub';
document.title = interfaceConfig.APP_NAME;
document.querySelectorAll('meta[property="og:title"], meta[itemprop="name"]').forEach(meta => {
    meta.setAttribute('content', interfaceConfig.APP_NAME);
});
document.querySelector('link[rel="manifest"]')?.setAttribute('href', 'static/meet-hub.webmanifest');
