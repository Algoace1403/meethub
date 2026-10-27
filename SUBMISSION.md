# End-term project submission

- **Project name:** Meet Hub
- **Student name:** Anuj Kumar Soni
- **Roll number:** 25bcs10611
- **Group / batch:** A
- **GitHub repository:** https://github.com/Algoace1403/meethub
- **Deployed application:** https://meethub.algoace-meethub.workers.dev
- **Alternative frontend:** https://meethub-pink.vercel.app
- **Demo video:** https://meethub.algoace-meethub.workers.dev/demo/index.html

## Problem statement

Students need a quick way to bring a small study or project group into a browser conversation without installing an app or creating an account. Meet Hub provides a shared room link, a device-check and guest-join flow, real-time audio/video, screen sharing and room chat for up to four people, with clear permission and connection recovery states.

## Tech stack

React, JavaScript, CSS, Vite, browser WebRTC and Media Capture APIs, WebSockets, Cloudflare Workers, SQLite-backed Durable Objects, Node.js and `ws`. Verification uses Node's test runner, Playwright and Prettier.

## Major features

1. Unique room creation and same-site invitation links.
2. Device preview, anonymous joining and later camera/microphone enablement.
3. Native WebRTC audio/video, screen sharing and optional TURN relay.
4. Room chat, participant status and raised hands.
5. Network recovery, room isolation, capacity limits and temporary room persistence.

## Evaluation notes

The current implementation owns its room protocol and WebRTC client. Earlier work included a Jitsi customization that was replaced; custom Meet Hub design assets were retained. Initial implementation commits were retrospectively organized, not a record of separate work sessions. See [provenance](docs/PROVENANCE.md).

Recorded demonstration and browser tests use synthetic media. See [testing](docs/TESTING.md) for exact verified scope and physical-device checks. No permanent recordings, private accounts, host moderation or large-room support are claimed.

## Official submission

Form: https://forms.gle/sBy4sfqyiRG2Zpom9

Deadline: **27 October 2026, 11:59 PM IST**. Filling a repository document is not equivalent to submitting the official form. Submission confirmation must be retained separately; this document does not assert that the form has been submitted.
