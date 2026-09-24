# Browser performance

Baseline collected on 2026-09-25 with the full Ruby 4.0 WASI runtime, Playwright 1.63.0, and Chromium 1243 on macOS. Run `npm run test:browser` to print the current measurements in the E2E log.

| Workload | Mean frame rate | Synchronous callback time |
|---|---:|---:|
| Default Gesso orbit | 44.0–45.2 fps | 4.29–4.71 ms |
| 320×240 RGBA base64 transfer + canvas presentation (three runs) | 52.7–53.3 fps | 1.17–1.31 ms |

The callback timer covers Ruby frame work, the base64 bridge call, and synchronous canvas presentation. It excludes GPU execution and network/runtime startup. These are single local Chromium runs, not cross-device performance guarantees. The transfer uses 307,200 raw bytes per frame and 409,600 base64 bytes.

Runtime artifact: 62,127,849 bytes raw, 18,842,812 bytes DEFLATE level 9, and 13,368,588 bytes Brotli quality 11. In a one-minute Chromium run, Ruby `GC.stat[:heap_live_slots]` rose from 18,228 to 33,275 across 81 samples and stayed below the test's 2× growth bound. This records Ruby live slots, not browser or JavaScript heap bytes, and is one local run. Startup, Firefox/Safari, and CRuby-versus-WASM timings remain unmeasured.
