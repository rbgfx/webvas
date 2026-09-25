<div align="center">

# Webvas

**Write Ruby graphics sketches and run them in a browser.**

[Playground](https://rbgfx.github.io/webvas/) · [Ruby API](#ruby-api) · [CLI](#cli) · [Security](#security)

</div>

Webvas connects RBGL's software renderer to an `OffscreenCanvas` and advances one frame at a time with `requestAnimationFrame`. The playground includes RBGL, Gesso, and RLSL examples, shareable source links, and single-file HTML downloads.

## Features

- RBGL canvas backend with pointer, keyboard, and wheel input
- Gesso sketch runner and RLSL WGSL compute shaders
- Fresh Ruby worker for each playground run, with visible errors and frame measurements
- Deflate-compressed source in URL fragments; source is not sent to a Webvas service
- `webvas new`, `serve`, and `build` for standalone sketch projects
- Browser runtime built with Webvas, RBGL, Tessel, Gesso, Glyphic, and RLSL

## Quick start

Add the loader and a Ruby source file to an HTML page:

~~~html
<canvas id="screen" width="320" height="240"></canvas>
<script type="text/ruby" data-webvas data-canvas="#screen" src="app.rb"></script>
<script src="https://rbgfx.github.io/webvas/loader.js"
        data-runtime="https://rbgfx.github.io/webvas/assets/webvas.wasm"></script>
~~~

In `app.rb`:

~~~ruby
require "gesso"

Gesso.run(width: 320, height: 240, runner: :web) do
  draw do
    background "#101827"
    no_stroke
    fill "#f07850"
    circle width / 2, height / 2, 36
  end
end
~~~

The official runtime is built with these gems already included. A runtime URL can be set with `data-runtime`; use the same URL for sketches that bundle their own dependencies.

## Ruby API

Create an `RBGL::GUI::Window` with `Webvas::Backend.new`, then call `Webvas.run(window)` with a frame block. The block receives the RBGL context and delta time. `Webvas.run` reuses one animation callback, closes the window on stop or error, and reports exceptions through the bridge.

`Webvas::Backend` accepts `width`, `height`, `canvas`, `title`, and `pixelated`. Canvas drawing dimensions set render resolution; CSS scales its display. Pointer coordinates are mapped from CSS pixels to render pixels. Focus the canvas to send keyboard input.

RLSL can generate the WGSL source for WebGPU:

~~~ruby
require "rlsl"
require "webvas"

wgsl = RLSL.to_wgsl(:plasma) do
  uniforms { float :time }
  fragment do |frag_coord, resolution, uniforms|
    uv = frag_coord / resolution.y
    vec3(sin(uv.x + uniforms.time), uv.y, 0.6)
  end
end
Webvas.run_shader(Webvas::Shader.new(wgsl))
~~~

WebGPU requires a supported browser, secure context, and GPU adapter. The shader runner updates the `resolution` and `time` uniforms automatically.

## CLI

~~~sh
gem install webvas
webvas new my-sketch
cd my-sketch
webvas serve
webvas build -o dist
~~~

`serve` binds to `127.0.0.1:8000`, serves `.wasm` as `application/wasm`, and reloads when project files change. Use `--host`, `--port`, or `--root` to change its defaults. `build` writes a static site that loads the official runtime. To bundle a custom runtime, add `ruby_wasm` and `js` to the project's `Gemfile`, install it, then run `webvas build --runtime custom`; the project's bundle is passed to `rbwasm build`.

## Playground

Open the [Webvas playground](https://rbgfx.github.io/webvas/). Choose a mode and example, edit the Ruby, then press **Run** or **Ctrl/Cmd + Enter**. Each run starts a fresh worker and canvas. **Share** compresses the source with `CompressionStream` into the URL fragment; **Download HTML** embeds the source as escaped JSON and keeps the runtime on its CDN URL.

## Security and limitations

- Ruby runs in a worker, but the worker is not a security sandbox. Sketches can call browser APIs and make network requests allowed by the page's Content Security Policy. Inspect shared code before running it.
- Webvas does not set cookies, store source, or send code to a Webvas service. The GitHub Pages project URL shares the `rbgfx.github.io` origin; a dedicated hostname requires a separate hosting or domain decision.
- Runtime downloads omit browser credentials. Pages need to allow the chosen loader, worker, and runtime in their Content Security Policy.
- The `js` gem evaluates Ruby-to-JavaScript bridge code, so the playground policy requires `unsafe-eval` and `wasm-unsafe-eval`. This weakens script restrictions; use a dedicated origin for untrusted sketches.
- The 0.3.0 candidate was verified locally in Chromium 153 on macOS arm64. Firefox, Safari, and mobile browsers are not verified; the software renderer needs `OffscreenCanvas` and module workers, and RLSL also needs WebGPU.
- Blocking loops and `sleep` stop browser frame progress. WebAssembly threads and compiling native extensions in the browser are unsupported.
- Ruby source is limited to 32 KiB. RGBA frames use base64 transfer; a 320×240 frame is 307,200 bytes before encoding.
- RLSL mode requires WebGPU; RBGL and Gesso modes use the software renderer.

See [browser security notes](docs/security.md) and [runtime/performance records](docs/performance.md).

## Development

The repository expects adjacent checkouts of Larb, RBGL, Tessel, Gesso, Glyphic, and RLSL. Ruby unit tests run under CRuby; the browser integration tests use Chromium and the locally built runtime.

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

## License

MIT. See [LICENSE.txt](LICENSE.txt).
