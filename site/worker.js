let vm;
let busy = false;
const pendingEvents = [];

globalThis.window = {
  requestAnimationFrame(callback) {
    return setTimeout(() => {
      const now = performance.now();
      const started = now;
      callback(now);
      frameMetrics(now, performance.now() - started);
    }, 1000 / 60);
  }
};
globalThis.requestAnimationFrame ||= callback => globalThis.window.requestAnimationFrame(callback);

let metricFrames = 0;
let metricStarted;
let callbackTime = 0;

function frameMetrics(now, elapsed) {
  metricStarted ??= now;
  metricFrames += 1;
  callbackTime += elapsed;
  if (metricFrames < 60) return;
  const duration = now - metricStarted;
  send("metrics", {
    fps: (metricFrames - 1) * 1000 / duration,
    callbackMs: callbackTime / metricFrames
  });
  metricFrames = 0;
  callbackTime = 0;
  metricStarted = now;
}

function send(type, payload = {}) {
  globalThis.postMessage({ type: "webvas:" + type, ...payload });
}

globalThis.addEventListener("message", async event => {
  const message = event.data;
  try {
    if (message?.type === "webvas:init") {
      await import(message.bridgeUrl);
      await import(message.shaderUrl);
      globalThis.WebvasCanvases = {
        [message.screenSelector || "#screen"]: message.screen,
        [message.gpuSelector || "#gpu"]: message.gpu
      };
      pendingEvents.splice(0).forEach(input => globalThis.WebvasBridge.pushEvent(input));
      send("loading", { message: "Downloading the Ruby drawing machine…" });
      const { DefaultRubyVM } = await import("https://cdn.jsdelivr.net/npm/@ruby/wasm-wasi@2.10.1/dist/browser/+esm");
      const response = await fetch(message.wasmUrl, { credentials: "omit" });
      if (!response.ok) throw new Error("Ruby runtime download failed: " + response.status);
      const module = await WebAssembly.compile(await response.arrayBuffer());
      send("loading", { message: "Starting Ruby and graphics libraries…" });
      ({ vm } = await DefaultRubyVM(module));
      send("ready");
    } else if (message?.type === "webvas:input") {
      if (globalThis.WebvasBridge) globalThis.WebvasBridge.pushEvent(message.event);
      else if (pendingEvents.length < 2048) pendingEvents.push(message.event);
    } else if (message?.type === "webvas:run" && vm && !busy && typeof message.source === "string") {
      if (new TextEncoder().encode(message.source).length > 32768) throw new Error("Source exceeds 32 KB.");
      busy = true;
      vm.eval(message.source);
      send("started");
      busy = false;
    }
  } catch (error) {
    busy = false;
    send("error", { message: error.message || String(error), backtrace: error.stack || "" });
  }
});

globalThis.addEventListener("error", event => send("error", { message: event.message || "Worker error" }));
