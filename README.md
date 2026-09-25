<div align="center">

# Webvas

**Run RBGL sketches in a browser with Ruby.**

Webvas connects RBGL's software renderer to an `OffscreenCanvas` and drives one frame at a time with `requestAnimationFrame`.

[Live example](https://rbgfx.github.io/webvas/) · [Ruby API](#ruby-api) · [Browser requirements](#browser-requirements)

</div>

## Features

- RBGL browser backend for RGBA frames and pointer, keyboard, and wheel events
- Frame scheduling through `RBGL::GUI::Window#step`
- Standalone loader for `<script type="text/ruby" data-webvas>`
- Runtime published with the example site; no local WebAssembly build is needed to use it

## Install

Add Webvas to the Ruby bundle used to prepare your WebAssembly runtime:

~~~ruby
gem "webvas"
~~~

The browser runtime must also include `rbgl` and its dependencies. When using the runtime distributed with the Webvas example, no local build is required.

## Quick start

Add a canvas, a Ruby script, and the loader to an HTML page:

~~~html
<canvas id="screen" width="320" height="240"></canvas>
<script type="text/ruby" data-webvas>
  require "rbgl"
  require "webvas"

  window = RBGL::GUI::Window.new(
    width: 320,
    height: 240,
    backend: Webvas::Backend.new(width: 320, height: 240)
  )

  Webvas.run(window) do |context, _delta_time|
    context.clear
    # Bind an RBGL pipeline and draw here.
  end
</script>
<script src="https://rbgfx.github.io/webvas/loader.js"></script>
~~~

The loader reads `assets/webvas.wasm` beside itself by default. Set `data-runtime` on the loader script to use another HTTPS or same-origin runtime URL. Set `data-canvas` on the Ruby script and use the same selector in `Webvas::Backend` when the canvas is not `#screen`.

## Ruby API

Create an `RBGL::GUI::Window` with a `Webvas::Backend`, then pass it to `Webvas.run`. The callback receives the RBGL context and elapsed seconds. `Webvas.run` reuses one callback for each animation frame and closes the window when it stops or raises an exception.

`Webvas::Backend` accepts `width`, `height`, `canvas`, `title`, and `pixelated`. The canvas size sets the rendering resolution; CSS can scale its display size. With `pixelated: true`, scaled output uses nearest-neighbor display.

Pointer coordinates are mapped from the canvas display bounds to rendering pixels. Pointer buttons, keyboard keys, modifier keys, and wheel deltas are converted to RBGL events. Focus the canvas to send keyboard events.

## Browser requirements

- WebAssembly, module workers, and `OffscreenCanvas`
- A secure context when loading the page over the network
- A Ruby runtime built with Webvas, RBGL, and RBGL's dependencies

Ruby runs in a worker without access to the page DOM. The `js` gem exposes APIs available to that worker, so this worker should not be treated as a security sandbox for hostile code. The page's Content Security Policy must allow the worker, runtime URL, and WebAssembly compilation.

Blocking frame loops and `sleep` cannot drive animation in the browser. Use `Webvas.run` to advance the window one frame at a time. WebAssembly threads and compiling native extensions in the browser are not supported.

Ruby source is limited to 32 KiB. Frame pixels use base64 between Ruby and JavaScript; a 320×240 RGBA frame is 307,200 bytes before encoding and 409,600 bytes after encoding.

## Development

The repository expects adjacent checkouts of `larb`, `rbgl`, and `tessel`.

~~~sh
bundle install
BUNDLE_GEMFILE=runtime/Gemfile bundle install
BUNDLE_GEMFILE=runtime/Gemfile bundle exec rbwasm build \
  --ruby-version 4.0 --target wasm32-unknown-wasip1 \
  --build-profile full --patch "$(pwd)/patches/psych-wasi.patch" -o build/webvas.wasm
ruby script/build_site
bundle exec rake verify
npm ci
npx playwright install chromium
npm run test:browser
~~~

The Pages workflow builds the WebAssembly runtime, checks the browser loader in Chromium, and deploys the static example.

## License

MIT. See [LICENSE.txt](LICENSE.txt).
