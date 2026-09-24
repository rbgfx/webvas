# Playground security boundary

Ruby runs in a module worker created from a Blob. This makes the worker inherit the page's Content Security Policy. The worker receives only two transferred canvases and user input events; it has no DOM, cookie, or storage APIs. The policy allows the worker to connect only to the same site and embedded image data. `'unsafe-eval'` is required by the `js` gem's Ruby-to-JavaScript bridge; WebAssembly compilation separately requires `'wasm-unsafe-eval'`.

The public playground is hosted at `rbgfx.github.io/webvas`, which shares the `rbgfx.github.io` origin with other GitHub Pages projects owned by that account. A separate repository does not create a separate browser origin. Use a separately controlled domain if sketches need origin isolation from other hosted projects.

The parent validates that status messages come from its active worker and renders messages with textContent. User source is passed as worker data and is never inserted into HTML or JavaScript source. Share links are explicit and keep compressed source in the URL fragment. The loader rejects source over 32 KiB and caps decompressed data before allocation. The worker is an isolation boundary, not a hardened sandbox: Ruby code can use the `js` gem to execute JavaScript with the worker's available APIs. Do not use it to run hostile code when a security sandbox is required.

WebGPU is optional. The W3C API exposes it in secure Window and Worker contexts; browser support and hardware availability still vary. The playground reports adapter, device, and shader errors without granting the worker access to the page DOM.
