# Browser worker security

Ruby executes in a module worker created from a Blob. The worker receives a transferred canvas and input events; it has no page DOM or storage access. The loader passes Ruby source as worker data and displays errors with `textContent`.

The `js` gem can call JavaScript APIs available inside the worker. Worker isolation does not make arbitrary Ruby safe to run. Do not use Webvas as a sandbox for hostile code.

The sample page's Content Security Policy permits the worker Blob, the pinned Ruby WASM module on jsDelivr, same-origin assets, and WebAssembly compilation. Pages embedding the loader need a policy that allows their chosen runtime and worker URLs.
