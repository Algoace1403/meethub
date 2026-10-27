# Provenance and development history

An early Meet Hub experiment customized the Jitsi Meet frontend. That experiment used Jitsi conferencing, and its original attribution remains in the historical snapshot. It was subsequently replaced by the current application with a separate React interface, browser-native WebRTC client and project-owned WebSocket room protocol.

The current application does not depend on `lib-jitsi-meet`, embed Jitsi, or route meetings through Jitsi services. Custom Meet Hub icons, illustration, colors and product copy from the earlier design work were carried forward. Generic technologies such as React, WebRTC and WebSockets are used normally; their use is not a claim that those technologies were invented for this project.

The first 15 commits in the current implementation were reorganized into topic commits on 23 October 2026 after the initial work existed. They should be read as an organized implementation snapshot, not a chronological record of 15 separate development sessions. Subsequent commits record actual fixes, testing, documentation and refactoring as they occur. No backdated development chronology is claimed.

AI tools assisted with implementation, debugging, documentation, refactoring and testing. The submission owner is responsible for understanding the architecture, defending its decisions and demonstrating the product.

Dependencies retain their own licenses and notices; see `public/THIRD_PARTY_NOTICES.txt` and the installed packages. Historical experiments are not presented as current independent application code. Marker searches and exact-file comparisons are useful audit evidence but cannot independently prove authorship of every source line.
