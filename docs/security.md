# Browser security

Ruby sketches execute in a module worker created from a Blob. The worker has no page DOM or storage API, but it can call JavaScript APIs available to workers. It is an isolation boundary for rendering work, not a sandbox for hostile code.

The playground does not auto-run code restored from a share URL. Users can inspect it before pressing Run. Ruby source and errors are displayed with `textContent`; downloaded HTML stores code in JSON with `<` escaped so a source string cannot close its script element. Share data stays in the URL fragment and is not sent in HTTP requests.

The page sets no cookies and has no analytics or source upload. The loader fetches source, worker code, and the runtime with `credentials: "omit"`. The Content Security Policy limits script and connection origins to the Webvas host and the pinned Ruby WASM CDN. Ruby can still call APIs permitted by that policy, so do not run untrusted sketches on pages that contain secrets or sensitive same-origin endpoints.

The current site is hosted at `https://rbgfx.github.io/webvas/`. GitHub Pages project sites share the `rbgfx.github.io` origin. A dedicated origin, as recommended for executing shared user code, needs a separate hostname/repository or domain assignment and is not established by this repository.

Embedding pages must permit the loader and runtime hosts in `script-src` and `connect-src`, Blob workers in `worker-src`, and JavaScript and WebAssembly evaluation (`unsafe-eval` and `wasm-unsafe-eval`). The `js` gem needs `unsafe-eval` to bridge Ruby and JavaScript inside the worker. This policy is required for RBGL and Gesso to run; it does not make user code safe. The loader and worker omit credentials when downloading external assets. Local `webvas serve` binds to loopback by default; do not bind it to a public interface for untrusted users.
