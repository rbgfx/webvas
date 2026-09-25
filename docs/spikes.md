# Implementation notes

## Runtime and browser path

- The checked browser runtime uses Ruby 4.0, `ruby_wasm` 2.10.1, and `js` 2.10.1.
- `rbwasm build` packages Larb's native extension for WASI; the checked local build and browser test run without a separate `rake compile` step.
- The loader fetches the worker and WebAssembly runtime, reports loading/errors, and evaluates source from a `text/ruby` script in a module worker.
- The browser integration test exercises the RBGL framebuffer, pointer events, keyboard events, and `pixelated` display in Chromium.

## Pixel transfer

The release uses base64 (method A): Ruby encodes each RGBA frame, JavaScript decodes it into `ImageData`, then presents it to the transferred canvas. A 320×240 frame contains 307,200 bytes and encodes to 409,600 bytes. The browser test checks exact pixel colors.

The linear-memory method (B) is not included. A supported way to view the active Ruby WASI memory from JavaScript has not been established. Revisit it after measuring a real bottleneck and confirming the runtime's memory-view API. Per-byte JS interop is also excluded.

The measured base64 path spent about 0.50 ms per frame in JavaScript decoding and canvas upload in the local 320×240 Gesso sample. There is no supported memory view to benchmark method B, so method A remains the implemented path.

The 0.1.0 runtime built on 2026-09-25 was 54,471,317 bytes raw and 17,612,737 bytes after zlib DEFLATE level 9.

The 0.3.0 candidate runtime was built locally on 2026-09-25 with Gesso, Glyphic, and RLSL included. Chromium verified RBGL and Gesso rendering, input, worker reset, and playground actions. WebGPU rendering reports its unsupported state in this environment; actual GPU shader output was not verified. Firefox, Safari, and mobile browsers have not been verified.

Playwright verified repeated frame callbacks, including 60-frame windows. A one-minute Chromium run measured a 34,928 KiB increase in the combined RSS of four browser processes; V8 heap usage was 1,772 KiB both before and after forced collection. This does not isolate WebAssembly linear memory or prove a leak; see `performance.md` for the method and limits. A same-machine 60-frame comparison of the Gesso 50-circle sketch measured 28.6 fps on Ruby WASM and 185.0 fps on CRuby 4.0.6 with YJIT disabled.

Glaze keeps its self-contained WebGPU exporter separate from Webvas's worker bridge. The two use different canvas lifecycles and Glaze additionally owns image textures and parameter controls. Webvas implements the RLSL compute shader path without adding a runtime dependency on Glaze; extracting a shared module would require a separately packaged browser asset and is deferred until that packaging exists.
