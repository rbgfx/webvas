const editor = document.querySelector("#source");
const stage = document.querySelector("#stage");
const status = document.querySelector("#status");
const consoleBox = document.querySelector(".console");
const loading = document.querySelector("#loading");
const loadingLabel = document.querySelector("#loading-label");
const dirty = document.querySelector("#dirty");
let worker;
let pendingSource;
let screen;
let gpu;
let generation = 0;
let workerBlobUrl;
const PLAYGROUND_URL = "https://rbgfx.github.io/webvas/";

function shaderExample(label, name, fragment) {
  return {
    name: label,
    source: [
      'require "webvas"',
      'require "rlsl"',
      "",
      `builder = RLSL::ShaderBuilder.new(:${name})`,
      "builder.uniforms { float :time }",
      "builder.fragment_source <<~SHADER",
      ...fragment.trim().split("\n").map(line => "  " + line),
      "SHADER",
      "layout = RLSL::WGSL::UniformLayout.build({ resolution: :vec2, time: :float })",
      'shader = Webvas::Shader.new(builder.build_wgsl_shader, canvas: "#gpu", layout: layout)',
      "Webvas.run_shader(shader) { |time| { time: time } }",
      ""
    ].join("\n")
  };
}

const examples = [
  {
    name: "Gesso · animated orbit",
    source: [
      'require "gesso"',
      "",
      'Gesso.run(width: 480, height: 320, runner: :web) do',
      '  background "#171a18"',
      "  draw do",
      '    background "#171a18"',
      "    no_stroke",
      '    fill "#d38a62"',
      "    circle 240 + Math.cos(millis / 850.0) * 92, 160, 18",
      '    fill "#718b74"',
      "    circle 240 + Math.cos(millis / 850.0 + Math::PI) * 92, 160, 11",
      '    fill "#d9ddd5"',
      "    circle 240, 160, 4",
      "  end",
      "end",
      ""
    ].join("\n")
  },
  {
    name: "Gesso · orbiting bubbles",
    source: [
      'require "gesso"',
      "",
      'Gesso.run(width: 480, height: 320, runner: :web) do',
      '  background "#101820"',
      "  draw do",
      '    background "#101820"',
      "    no_stroke",
      "    12.times do |index|",
      "      angle = millis / 1100.0 + index * Math::PI * 2 / 12",
      '      fill index.even? ? "#79b4a8" : "#e6b566"',
      "      circle 240 + Math.cos(angle) * 110, 160 + Math.sin(angle * 1.3) * 72, 7 + index % 4 * 2",
      "    end",
      "  end",
      "end",
      ""
    ].join("\n")
  },
  {
    name: "Gesso · pointer light",
    source: [
      'require "gesso"',
      "",
      'Gesso.run(width: 480, height: 320, runner: :web) do',
      '  background "#111417"',
      "  draw do",
      '    background "#111417"',
      "    no_stroke",
      '    fill mouse_pressed? ? "#e5b36a" : "#84a99d"',
      "    circle mouse_x, mouse_y, mouse_pressed? ? 32 : 18",
      '    fill "#e5e6df"',
      "    circle mouse_x, mouse_y, 3",
      "  end",
      "end",
      ""
    ].join("\n")
  },
  {
    name: "RBGL · RGB triangle",
    source: [
      'require "webvas"',
      'require "rbgl"',
      "include Larb",
      "include RBGL::Engine",
      "",
      "backend = Webvas::Backend.new(width: 480, height: 320)",
      "window = RBGL::GUI::Window.new(width: 480, height: 320, backend: backend)",
      "pipeline = Pipeline.create do",
      "  vertex do |input, _uniforms, output|",
      "    output.position = input.position.to_vec4",
      "    output.color = input.color",
      "  end",
      "  fragment do |input, _uniforms, output|",
      "    output.color = input.color",
      "  end",
      "end",
      "pipeline.cull_mode = :none",
      "vertices = VertexBuffer.from_array(VertexLayout.position_color, [",
      "  { position: Vec3[0, 0.7, 0], color: Color.red },",
      "  { position: Vec3[-0.7, -0.7, 0], color: Color.green },",
      "  { position: Vec3[0.7, -0.7, 0], color: Color.blue }",
      "]) ",
      "Webvas.run(window) do |context, _delta|",
      '  context.clear(color: Color.from_hex("#101827"))',
      "  context.bind_pipeline(pipeline)",
      "  context.bind_vertex_buffer(vertices)",
      "  context.draw_arrays(:triangles, 0, 3)",
      "end",
      ""
    ].join("\n")
  },
  {
    name: "RBGL · clear color",
    source: [
      'require "webvas"',
      'require "rbgl"',
      "include Larb",
      "",
      "backend = Webvas::Backend.new(width: 480, height: 320)",
      "window = RBGL::GUI::Window.new(width: 480, height: 320, backend: backend)",
      "Webvas.run(window) do |context, _delta|",
      '  context.clear(color: Color.from_hex("#293b4a"))',
      "end",
      ""
    ].join("\n")
  },
  {
    name: "RBGL · pixel gradient",
    source: [
      'require "webvas"',
      'require "rbgl"',
      "width, height = 480, 320",
      'pixels = String.new(capacity: width * height * 4, encoding: Encoding::BINARY)',
      "height.times do |y|",
      '  width.times { |x| pixels << [x * 255 / width, y * 255 / height, 120, 255].pack("C4") }',
      "end",
      "backend = Webvas::Backend.new(width: width, height: height)",
      "window = RBGL::GUI::Window.new(width: width, height: height, backend: backend)",
      "Webvas.run(window) { window.set_pixels(pixels) }",
      ""
    ].join("\n")
  },
  shaderExample("RLSL · animated plasma", "webvas_plasma", `
    uv = frag_coord / resolution.y
    wave = sin(uv.x * 8.0 + u.time) * cos(uv.y * 7.0 - u.time)
    vec3(0.5 + wave * 0.25, 0.25 + uv.y * 0.5, 0.5 - wave * 0.3)
  `),
  shaderExample("RLSL · orbiting rings", "webvas_rings", `
    uv = (frag_coord - resolution * 0.5) / resolution.y
    radius = sqrt(uv.x * uv.x + uv.y * uv.y)
    wave = 0.5 + 0.5 * cos(radius * 42.0 - u.time * 2.0)
    vec3(wave * 0.8, 0.25 + uv.y * 0.3, 1.0 - wave * 0.6)
  `),
  shaderExample("RLSL · shifting gradient", "webvas_gradient", `
    uv = frag_coord / resolution
    vec3(0.15 + uv.x * 0.6, 0.2 + uv.y * 0.6, 0.45 + 0.2 * sin(u.time))
  `)
];

function setStatus(message, error = false) {
  status.textContent = message;
  consoleBox.classList.toggle("error", error);
}

function setSource(value, markDirty = true) {
  editor.value = value;
  dirty.classList.toggle("visible", markDirty);
}

function selectErrorLine(backtrace) {
  const line = Number(backtrace.match(/\beval:(\d+):/)?.[1]);
  if (!line) return;
  let start = 0;
  for (let index = 1; index < line; index += 1) {
    const newline = editor.value.indexOf("\n", start);
    if (newline < 0) return;
    start = newline + 1;
  }
  const newline = editor.value.indexOf("\n", start);
  editor.focus({ preventScroll: true });
  editor.setSelectionRange(start, newline < 0 ? editor.value.length : newline);
}

function mountCanvases() {
  screen = document.createElement("canvas");
  gpu = document.createElement("canvas");
  screen.id = "screen";
  gpu.id = "gpu";
  screen.width = gpu.width = 480;
  screen.height = gpu.height = 320;
  screen.tabIndex = gpu.tabIndex = 0;
  screen.setAttribute("aria-label", "Ruby 2D sketch canvas");
  gpu.setAttribute("aria-label", "Ruby WebGPU shader canvas");
  gpu.hidden = true;
  stage.replaceChildren(screen, gpu);
}

async function start(source) {
  const currentGeneration = ++generation;
  pendingSource = source;
  worker?.terminate();
  if (workerBlobUrl) URL.revokeObjectURL(workerBlobUrl);
  worker = null;
  mountCanvases();
  loading.classList.remove("hidden");
  loadingLabel.textContent = "Starting an isolated Ruby runtime…";
  document.querySelector("#runtime-state").textContent = "Starting worker";
  document.querySelector("#performance-state").textContent = "Frame timing warming up";
  setStatus("Starting Ruby runtime…");
  try {
    const workerUrl = new URL("./worker.js", import.meta.url);
    const response = await fetch(workerUrl, { credentials: "omit" });
    if (!response.ok) throw new Error("Worker download failed: " + response.status);
    if (generation !== currentGeneration) return;
    workerBlobUrl = URL.createObjectURL(new Blob([await response.text()], { type: "text/javascript" }));
    worker = new Worker(workerBlobUrl, { type: "module", name: "webvas" });
  } catch (error) {
    if (generation === currentGeneration) {
      loading.classList.add("hidden");
      setStatus(error.message || "Worker could not start", true);
    }
    return;
  }
  const active = worker;
  worker.addEventListener("message", event => {
    if (generation !== currentGeneration || worker !== active) return;
    const message = event.data || {};
    if (message.type === "webvas:loading") {
      loadingLabel.textContent = message.message;
      document.querySelector("#runtime-state").textContent = "Loading runtime";
    } else if (message.type === "webvas:ready") {
      if (workerBlobUrl) URL.revokeObjectURL(workerBlobUrl);
      workerBlobUrl = null;
      loading.classList.add("hidden");
      document.querySelector("#runtime-state").textContent = "Ruby ready";
      active.postMessage({ type: "webvas:run", source: pendingSource });
      pendingSource = null;
    } else if (message.type === "webvas:started") {
      dirty.classList.remove("visible");
      setStatus("Sketch is running");
    } else if (message.type === "webvas:mode") {
      screen.hidden = message.canvas === "#gpu";
      gpu.hidden = message.canvas !== "#gpu";
    } else if (message.type === "webvas:pixelated") {
      const canvas = message.selector === "#gpu" ? gpu : screen;
      canvas.style.imageRendering = message.enabled ? "pixelated" : "auto";
    } else if (message.type === "webvas:size") {
      document.querySelector("#canvas-size").textContent = message.width + " × " + message.height;
    } else if (message.type === "webvas:metrics") {
      document.querySelector("#performance-state").textContent =
        `${message.fps.toFixed(1)} fps · ${message.callbackMs.toFixed(2)} ms / frame`;
    } else if (message.type === "webvas:error") {
      loading.classList.add("hidden");
      selectErrorLine(message.backtrace || "");
      setStatus([message.message, message.backtrace].filter(Boolean).join("\n"), true);
    }
  });
  worker.addEventListener("error", event => {
    if (generation !== currentGeneration || worker !== active) return;
    loading.classList.add("hidden");
    const reason = event.error?.stack || event.error?.message || event.message;
    setStatus(reason || `Worker failed${event.filename ? `: ${event.filename}:${event.lineno}` : ""}`, true);
  });
  const screenCanvas = screen.transferControlToOffscreen();
  const gpuCanvas = gpu.transferControlToOffscreen();
  worker.postMessage({
    type: "webvas:init",
    screen: screenCanvas,
    gpu: gpuCanvas,
    bridgeUrl: new URL("./bridge.js", import.meta.url).href,
    shaderUrl: new URL("./wgsl-runner.js", import.meta.url).href,
    wasmUrl: new URL(document.querySelector('meta[name="webvas-runtime"]').content, document.baseURI).href
  }, [screenCanvas, gpuCanvas]);
}

function sendInput(event) {
  if (!worker || !["pointerdown", "pointerup", "pointermove", "pointercancel", "keydown", "keyup", "wheel"].includes(event.type)) return;
  const rect = event.target.getBoundingClientRect();
  if (event.type === "pointerdown") {
    event.target.focus({ preventScroll: true });
    event.target.setPointerCapture(event.pointerId);
  }
  if (event.type === "wheel") event.preventDefault();
  if (["keydown", "keyup"].includes(event.type) && ["ArrowUp", "ArrowDown", "ArrowLeft", "ArrowRight", " "].includes(event.key)) event.preventDefault();
  worker.postMessage({
    type: "webvas:input",
    event: {
      type: event.type === "pointercancel" ? "pointerup" : event.type,
      clientX: event.clientX || 0,
      clientY: event.clientY || 0,
      left: rect.left,
      top: rect.top,
      rectWidth: rect.width,
      rectHeight: rect.height,
      button: event.button,
      deltaX: event.deltaX,
      deltaY: event.deltaY,
      code: event.code,
      key: event.key,
      shiftKey: event.shiftKey,
      ctrlKey: event.ctrlKey,
      altKey: event.altKey,
      metaKey: event.metaKey
    }
  });
}

async function share() {
  try {
    if (!("CompressionStream" in window) || !navigator.clipboard) {
      throw new Error("Share links require a modern browser and clipboard permission.");
    }
    const source = new TextEncoder().encode(editor.value);
    if (source.length > 32768) throw new Error("Share links are limited to 32 KB of source.");
    const stream = new Blob([source]).stream().pipeThrough(new CompressionStream("deflate"));
    const compressed = new Uint8Array(await new Response(stream).arrayBuffer());
    let binary = "";
    compressed.forEach(byte => { binary += String.fromCharCode(byte); });
    const token = btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
    const url = new URL(location.href);
    url.searchParams.delete("source");
    url.hash = "code=" + token;
    await navigator.clipboard.writeText(url.href);
    setStatus("Share link copied");
  } catch (error) {
    setStatus(error.message || "Could not create a share link", true);
  }
}

function download() {
  const url = URL.createObjectURL(new Blob([editor.value], { type: "text/x-ruby;charset=utf-8" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: "sketch.rb" });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function downloadHtml() {
  if (new TextEncoder().encode(editor.value).length > 32768) {
    setStatus("HTML downloads are limited to 32 KB of source.", true);
    return;
  }
  const page = document.documentElement.cloneNode(true);
  page.querySelector("#source").textContent = editor.value;
  const stylesheet = page.querySelector('link[rel="stylesheet"]');
  stylesheet.href = new URL(stylesheet.getAttribute("href"), PLAYGROUND_URL).href;
  const entry = page.querySelector('script[type="module"]');
  entry.src = new URL(entry.getAttribute("src"), PLAYGROUND_URL).href;
  page.querySelector('meta[name="webvas-runtime"]').content = new URL("./assets/webvas.wasm", PLAYGROUND_URL).href;
  page.querySelector('meta[http-equiv="Content-Security-Policy"]').content =
    "default-src 'none'; script-src https://rbgfx.github.io https://cdn.jsdelivr.net 'wasm-unsafe-eval' 'unsafe-eval'; worker-src blob:; connect-src https://rbgfx.github.io data:; style-src https://rbgfx.github.io; img-src https://rbgfx.github.io data: blob:; font-src https://rbgfx.github.io; object-src 'none'; base-uri 'none'";
  const url = URL.createObjectURL(new Blob(["<!doctype html>\n", page.outerHTML], { type: "text/html" }));
  const link = Object.assign(document.createElement("a"), { href: url, download: "webvas-sketch.html" });
  link.click();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function loadSharedSource() {
  const token = new URLSearchParams(location.hash.slice(1)).get("code");
  if (!token) return;
  try {
    if (token.length > 65536) throw new Error("Shared link is too large.");
    const normalized = token.replaceAll("-", "+").replaceAll("_", "/");
    const binary = atob(normalized.padEnd(Math.ceil(normalized.length / 4) * 4, "="));
    const bytes = Uint8Array.from(binary, char => char.charCodeAt(0));
    const stream = new Blob([bytes]).stream().pipeThrough(new DecompressionStream("deflate"));
    const source = await readLimited(stream, 32768);
    setSource(source, false);
    history.replaceState(null, "", location.pathname + location.search);
  } catch (error) {
    setStatus(error.message || "Could not decode the shared sketch", true);
  }
}

async function readLimited(stream, limit) {
  const reader = stream.getReader();
  const chunks = [];
  let size = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    size += value.byteLength;
    if (size > limit) {
      await reader.cancel();
      throw new Error("Source exceeds 32 KB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(size);
  let offset = 0;
  for (const chunk of chunks) {
    bytes.set(chunk, offset);
    offset += chunk.byteLength;
  }
  return new TextDecoder().decode(bytes);
}

async function loadProjectSource() {
  const path = new URLSearchParams(location.search).get("source");
  if (!path) return;
  try {
    const base = new URL(".", location.href);
    const url = new URL(path, base);
    if (url.origin !== base.origin || !url.pathname.startsWith(base.pathname)) {
      throw new Error("Project source must be on this site.");
    }
    const response = await fetch(url, { credentials: "omit" });
    if (!response.ok) throw new Error("Project source could not be loaded.");
    const source = await readLimited(response.body, 32768);
    setSource(source, false);
  } catch (error) {
    setStatus(error.message || "Could not load project source", true);
  }
}

for (const [index, example] of examples.entries()) {
  const option = document.createElement("option");
  option.value = String(index);
  option.textContent = example.name;
  document.querySelector("#examples").append(option);
}
document.querySelector("#examples").addEventListener("change", event => {
  const example = examples[Number(event.target.value)];
  if (example) setSource(example.source);
  event.target.value = "";
});
document.querySelector("#run").addEventListener("click", () => start(editor.value));
document.querySelector("#share").addEventListener("click", share);
document.querySelector("#download").addEventListener("click", download);
document.querySelector("#download-html").addEventListener("click", downloadHtml);
editor.addEventListener("input", () => dirty.classList.add("visible"));
editor.addEventListener("keydown", event => {
  if ((event.metaKey || event.ctrlKey) && event.key === "Enter") {
    event.preventDefault();
    start(editor.value);
  }
});
stage.addEventListener("pointerdown", sendInput);
stage.addEventListener("pointerup", sendInput);
stage.addEventListener("pointermove", sendInput);
stage.addEventListener("pointercancel", sendInput);
stage.addEventListener("keydown", sendInput);
stage.addEventListener("keyup", sendInput);
stage.addEventListener("wheel", sendInput, { passive: false });
setSource(editor.value || examples[0].source, false);
await loadProjectSource();
await loadSharedSource();
start(editor.value);
