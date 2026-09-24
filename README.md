<div align="center">

# Webvas

**A small drawing machine for Ruby.**

Run RBGL and Gesso sketches in a browser with CRuby compiled to WebAssembly.

[Play with Webvas](https://rbgfx.github.io/webvas/) · [Ruby API](#ruby-api) · [Build the playground](#build-the-playground)

</div>

## What it does

Webvas connects RBGL's framebuffer to an <code>OffscreenCanvas</code>, schedules frames on a worker, and maps browser pointer and keyboard input to RBGL events. Gesso can use the same backend with <code>runner: :web</code>; Glaze shaders use the shared WebGPU runner.

The public playground runs user Ruby in a dedicated worker. The worker has no document or storage APIs; the page transfers only the canvases and input events. It receives the edited source through <code>postMessage</code>.

## Install

The `0.3.0` gem is not on RubyGems yet. Add the repository to a Gemfile:

~~~ruby
gem "webvas", git: "https://github.com/rbgfx/webvas"
~~~

Gesso is an optional companion. Add <code>gem "gesso"</code> if you want its 2D sketch DSL.

## Ruby API

~~~ruby
require "webvas"
require "rbgl"

backend = Webvas::Backend.new(width: 480, height: 320)
window = RBGL::GUI::Window.new(width: 480, height: 320, backend: backend)

Webvas.run(window) do |context, delta_time|
  context.clear
  # Bind an RBGL pipeline and draw here.
end
~~~

<code>Webvas.run</code> uses one reusable <code>Proc</code> with <code>requestAnimationFrame</code>. The callback receives RBGL's context and the elapsed seconds. Call <code>window.stop</code> to end the loop.

Gesso's browser runner is selected per sketch:

~~~ruby
require "gesso"

Gesso.run(width: 480, height: 320, runner: :web, pixelated: false) do
  background "#171a18"
  draw do
    background "#171a18"
    fill "#d38a62"
    circle 240, 160, 48
  end
end
~~~

To run a WGSL shader, provide its generated source and uniform layout:

~~~ruby
shader = Webvas::Shader.new(wgsl_source, layout: uniform_layout)
shader.run { |time| { gain: 0.75, time: time } }
# shader.stop when it is no longer needed
~~~

The WebGPU helper is shared with Glaze's standalone HTML exporter. WebGPU is optional; browsers without a usable adapter report an error in the playground.

## Playground

The editor supports examples, Ctrl/⌘ + Enter, compressed share links, and Ruby or standalone HTML downloads. The HTML includes the sketch and UI; it loads the runtime and playground assets from the Webvas Pages site. The source limit for a run or share link is 32 KiB.

The footer reports the recent frame rate and average synchronous callback time. It measures Ruby-side work through command submission; it does not include GPU execution time. See [the runtime measurements](docs/spikes.md) for the tested environment and limits.

### Run Ruby from an HTML page

Add a canvas, a Ruby script, and the loader. The loader defaults to `#screen`, reads the official WASM runtime beside itself, and reports startup or runtime errors in an `<output>` element. Set `data-canvas` on the Ruby script and pass the same selector to `Webvas::Backend` or Gesso when the canvas has another ID.

~~~html
<canvas id="screen" width="320" height="240"></canvas>
<script type="text/ruby" data-webvas>
  require "gesso"
  Gesso.run(width: 320, height: 240, runner: :web) do
    draw { background "#123456" }
  end
</script>
<script src="https://rbgfx.github.io/webvas/loader.js"></script>
~~~

See the [loader example](https://rbgfx.github.io/webvas/loader-example.html) for pointer input.

## CLI

`webvas new mysketch` creates an `index.html` and `app.rb` that use the official runtime from Webvas Pages. Run `webvas serve` in that directory for gzip and live reload, or export it with `webvas build -o dist/`. The default build keeps the runtime on the CDN. Add gems to the project bundle and use `webvas build --runtime custom -o dist/` to compile a custom WASM runtime.

To compile and serve the playground from this checkout:

~~~sh
bundle install
BUNDLE_GEMFILE=runtime/Gemfile bundle install
mkdir -p build
BUNDLE_GEMFILE=runtime/Gemfile bundle exec rbwasm build \
  --ruby-version 4.0 --target wasm32-unknown-wasip1 \
  --build-profile full --patch "$(pwd)/patches/psych-wasi.patch" -o build/webvas.wasm
ruby script/build_site
ruby exe/webvas serve public
~~~

The runtime Gemfile uses the adjacent rbgfx source checkouts because Larb contains a native extension that the WASI build must compile. The build prints raw and deflate sizes so the deployed payload can be checked.

## Requirements

- CRuby 3.1 or later for the gem and CLI.
- WebAssembly, module workers, and <code>OffscreenCanvas</code> for the playground.
- A secure context for WebGPU. GPU support depends on the browser and device.

The browser worker does not expose the page DOM or browser storage to Ruby. Source typed in the editor is passed to the worker with a message; a project build can explicitly load a same-site sketch with the <code>?source=sketch.rb</code> query. Share links include compressed source in the URL fragment.

## Development

~~~sh
bundle exec rake verify
~~~

This runs RuboCop, the test-unit suite with an 85% coverage floor, RBS validation, and JavaScript syntax checks. The Pages workflow builds the WASI runtime and deploys the static editor.

## License

MIT. See [LICENSE.txt](LICENSE.txt).
