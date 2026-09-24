# Browser runtime measurements

Measured on 2026-09-25 from the local `wasm32-unknown-wasip1` full-profile build. The runtime uses Ruby 4.0, `ruby_wasm` 2.10.1, and `js` 2.10.1.

| Check | Result |
|---|---|
| `webvas` name availability | RubyGems API returned HTTP 404 on the measurement date. |
| Larb native extension | Builds into the WASI runtime; browser test verifies `Larb::Vec3` arithmetic. |
| Prism and RLSL | RLSL compiles in the WASM runtime; all three WGSL examples render through WebGPU in Chromium. |
| Pixel transfer | The base64 path renders exact RGBA samples (`[18, 52, 86, 255]`) at 320×240 and 480×320. A 320×240 frame is 307,200 bytes and its base64 representation is 409,600 bytes. Chromium reports per-frame synchronous callback time in the E2E log; see `performance.md` for the recorded run. |
| Frame scheduling | The reusable `requestAnimationFrame` callback runs the Gesso and RBGL examples. A one-minute Chromium run collected 81 Ruby `GC.stat[:heap_live_slots]` samples; the median rose from 18,228 at the start to 33,275 at the end. |
| Ruby speed | CRuby-versus-WASM rendering and math timings were not measured. |
| Runtime size | 62,127,849 bytes raw; 18,842,812 bytes with zlib DEFLATE level 9; 13,368,588 bytes with Brotli quality 11. |
| Startup/network time | Not isolated from browser setup, cache state, and the local server; no loading-time claim is made. |

The implementation uses transfer method A (base64). Method B (reading Ruby's linear memory from JavaScript through a native extension) remains unimplemented and unmeasured; a supported memory-view path has not been established. The measured runtime size is large, so Pages and the development server should keep compression enabled. The absolute size still exceeds the plan's original five-second first-load target on slower connections.

The one-minute result measures Ruby live slots, not JavaScript or process heap bytes, and is a single local run; it does not establish a bound for every workload. The browser checks used Playwright 1.63.0 and Chromium. Firefox, Safari, and mobile browsers were not manually verified. SwiftShader is enabled for Linux CI; the local macOS run used the host GPU. These results confirm functionality, not the plan's frame-rate targets.
