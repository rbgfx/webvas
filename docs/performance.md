# Performance records

## Browser runtime 0.1.0

Recorded 2026-09-25 from the checked WebAssembly artifact:

| Measure | Result | Method |
|---|---:|---|
| Runtime size | 54,471,317 bytes | Raw `webvas.wasm` |
| DEFLATE size | 17,612,737 bytes | zlib level 9; hosting compression can differ |
| Browser rendering | Chromium passed | Playwright verified RBGL pixels and pointer/keyboard input |

## Browser runtime 0.3.0 candidate

Built locally on 2026-09-25 with Gesso, Glyphic, and RLSL:

| Measure | Result | Method |
|---|---:|---|
| Runtime size | 62,100,858 bytes | Raw `webvas.wasm` |
| DEFLATE size | 18,836,781 bytes | zlib level 9 |
| Brotli size | 15,750,381 bytes | Node.js Brotli quality 5 |
| First verified pixel | 925 ms | Run click to screenshot verification, local Chromium server |
| RBGL frame rate | 16.1 fps | One 60-frame window, 320×240 solid sketch, no screenshot polling during the window |
| Gesso frame rate | 28.6 fps | One 60-frame window, 320×240 sketch with 50 circles |
| Gesso on CRuby | 185.0 fps | Same 50-circle sketch, 60 frames, Ruby 4.0.6 with YJIT disabled; one local run |
| JS present/dispatch | 0.50 ms/frame RBGL; 0.50 ms/frame Gesso | Mean of each 60-frame window |
| Browser integration | 8 Playwright tests passed | Chromium 153, macOS arm64 |
| One-minute memory sample | 1,026,208 → 1,061,136 KiB process RSS (+34,928 KiB); JS heap after GC 1,772 → 1,772 KiB | One active RBGL run; RSS summed across four Chromium processes |

The playground reports each 60-frame window's wall-clock FPS and average synchronous JavaScript canvas upload time. The upload figure includes base64 decoding and `putImageData`; it excludes Ruby frame work and GPU completion. WebGPU's value measures CPU-side command submission only; a GPU adapter was unavailable for this run.

These are single-run local diagnostics, not CI performance thresholds. The Gesso result is below the initial 30 fps target; the target is not an absolute pass/fail condition. The first-pixel measurement includes local serving and screenshot verification; hosted cold-start latency will differ. Use the same browser, machine, canvas size, and sketch when comparing runs. Firefox, Safari, and mobile browsers remain unverified here.

The one-minute process RSS sample includes Chromium and WebAssembly memory. V8 heap usage returned to the same value after forced garbage collection, but this does not identify the RSS increase as a leak or show WebAssembly linear memory separately. The browser exposes no supported view of that WASM memory in this setup; treat the result as a baseline for later comparisons.

The Gesso sample ran about 6.5× faster on CRuby in this comparison. These single runs are indicative only; they are not a stable benchmark or a guarantee for other sketches.
