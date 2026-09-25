# Implementation notes

## Runtime and browser path

- The checked browser runtime uses Ruby 4.0, `ruby_wasm` 2.10.1, and `js` 2.10.1.
- Larb's native extension builds for WASI when compiled before `rbwasm build`; the Pages workflow runs `rake compile` first.
- The loader fetches the worker and WebAssembly runtime, reports loading/errors, and evaluates source from a `text/ruby` script in a module worker.
- The browser integration test exercises the RBGL framebuffer, pointer events, keyboard events, and `pixelated` display in Chromium.

## Pixel transfer

The release uses base64 (method A): Ruby encodes each RGBA frame, JavaScript decodes it into `ImageData`, then presents it to the transferred canvas. A 320×240 frame contains 307,200 bytes and encodes to 409,600 bytes. The browser test checks exact pixel colors.

The linear-memory method (B) is not included. A supported way to view the active Ruby WASI memory from JavaScript has not been established. Revisit it after measuring a real bottleneck and confirming the runtime's memory-view API. Per-byte JS interop is also excluded.

The 0.1.0 runtime built on 2026-09-25 is 54,471,317 bytes raw and 17,612,737 bytes after zlib DEFLATE level 9. The Playwright Chromium test rendered the triangle and verified pointer and Space-key input. Firefox, Safari, and mobile browsers have not been verified.
