# Testing and verification

## Repeatable commands

```sh
npm ci
npx playwright install ffmpeg
npm run verify
npm run test:e2e
WORKER_TEST_URL=https://meethub.algoace-meethub.workers.dev npm run test:worker
```

The browser suite expects installed Google Chrome, uses synthetic camera/microphone devices and an isolated local backend on port 4178, and does not contact real users. Build before running it. For the bundled Chromium browser, install it with `npx playwright install chromium` and use `PLAYWRIGHT_CHANNEL=chromium npm run test:e2e`.

To check a public deployment instead of the local backend:

```sh
E2E_BASE_URL=https://meethub.algoace-meethub.workers.dev npm run test:e2e
```

Live integration tests open temporary room sessions, bounded to four people, and close their sockets afterward. Run them against a deployment you own. They are intentionally skipped by `npm test` unless `WORKER_TEST_URL` is set. A skipped integration test is not a passing integration test.

The GitHub Actions workflow runs formatting, standard tests, production build, the dependency audit and browser workflows on pushes and pull requests. Live service tests remain an explicit command.

## Verified on 27 October 2026

| Verification                              | Result                                         | What it establishes                                                                                                                                                                                 |
| ----------------------------------------- | ---------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| Production build                          | Passed                                         | Current frontend compiles                                                                                                                                                                           |
| Standard Node tests                       | 26 passed; 5 cloud tests intentionally skipped | Local signaling, room isolation/capacity, sender identity, validation, tokens, ICE providers and client recovery                                                                                    |
| Live Worker integration                   | 5 passed during initial audit                  | Hosted protocol routing, isolation, capacity, session resume, chat and origin checks                                                                                                                |
| Browser workflow suite                    | 4 passed locally                               | Invitations, real remote frames, chat text escaping, later device enablement, controls, leaving, mobile layout, screen sharing, permission failure and actual reconnect after offline/online events |
| Three-participant live audit              | Passed                                         | Three isolated sessions exchanged real media and chat; joining with devices off worked                                                                                                              |
| Forced TLS TURN audit                     | Passed                                         | Actual remote video on both sides, with selected candidate type `relay`; not merely a health flag                                                                                                   |
| Dependency audit after compatible updates | Zero known vulnerabilities reported            | npm advisory database scan of locked dependencies at verification time                                                                                                                              |

The initial offline browser test found that the UI could remain "In room" after an offline event. The client now detaches that socket, reports offline status, waits without connection churn and reconnects when the online event arrives. Unit tests cover waiting and listener cleanup; a browser test verifies subsequent chat across real room sockets.

Screen-sharing verification starts capture, checks remote screen state and frames, stops sharing and restores the camera, then repeats with the camera switched off. Permission-denial testing injects a browser permission rejection specifically to exercise the error path; it is not used to fake a successful media call.

Reports/traces are generated under ignored `playwright-report/` and `test-results/`. Use `npx playwright show-report` to inspect failures. The demo recording is separate from test reports.

## Physical-device acceptance checklist

These require actual devices/networks. Student-reported results are identified separately and must not be presented as automated observations:

- [x] Student reported the requested laptop/phone call working on 27 October 2026; this result was supplied by the student, not observed by the automated runner.
- [ ] Real microphone mute/unmute affects what the other participant hears.
- [ ] Real camera toggles and denied operating-system permissions behave correctly.
- [ ] A real desktop screen share arrives legibly and restores camera video when stopped.
- [ ] Intended Safari/Firefox versions complete the main workflows, if those browsers are claimed as supported.
- [ ] Relay quota and availability are adequate for the evaluator's demonstration.

The automated mobile check uses a narrow browser viewport and touch emulation. It does not certify a physical iPhone or Android device. A successful relay test exercises the relay path but does not certify every firewall or network.
