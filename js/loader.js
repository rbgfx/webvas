(() => {
  const loader = document.currentScript;
  if (!loader) return;

  const base = new URL(".", loader.src);
  const defaultRuntime = loader.dataset.runtime || new URL("./assets/webvas.wasm", base).href;
  const sessions = new Map();
  const sourceLimit = 32768;

  function textSource(element) {
    if (element.matches('script[type="application/json"][data-webvas-source]')) {
      const payload = JSON.parse(element.textContent);
      if (typeof payload.source !== "string") throw new Error("Embedded Ruby source is missing.");
      return payload.source;
    }
    return element.textContent;
  }

  async function readSource(element) {
    if (!element.src) return textSource(element);
    const response = await fetch(element.src, { credentials: "omit" });
    if (!response.ok) throw new Error(`Ruby source download failed: ${response.status}`);
    return response.text();
  }

  function dispose(selector, replaceCanvas) {
    const old = sessions.get(selector);
    if (!old) return;
    old.worker.terminate();
    URL.revokeObjectURL(old.workerBlobUrl);
    old.listeners.forEach(([target, type, listener, options]) => target.removeEventListener(type, listener, options));
    if (replaceCanvas && old.canvas.isConnected) {
      const canvas = old.canvas.cloneNode(false);
      canvas.style.imageRendering = "";
      old.canvas.replaceWith(canvas);
    }
    sessions.delete(selector);
  }

  async function start(source, { canvas: selector = "#screen", runtime, statusElement, onStatus } = {}) {
    if (typeof source !== "string") throw new TypeError("Ruby source must be a string.");
    if (new TextEncoder().encode(source).length > sourceLimit) throw new Error("Ruby source exceeds 32 KB.");
    dispose(selector, true);

    const canvas = document.querySelector(selector);
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Canvas not found: ${selector}`);
    const status = statusElement || document.createElement("output");
    if (!statusElement) {
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      canvas.insertAdjacentElement("afterend", status);
    }
    const report = detail => {
      if (onStatus) onStatus(detail);
      else status.textContent = detail.message || "";
    };
    report({ state: "loading", message: "Loading Ruby runtime…" });
    if (canvas.tabIndex < 0) canvas.tabIndex = 0;

    const response = await fetch(new URL("./worker.js", base), { credentials: "omit" });
    if (!response.ok) throw new Error(`Worker download failed: ${response.status}`);
    const workerBlobUrl = URL.createObjectURL(new Blob([await response.text()], { type: "text/javascript" }));
    const worker = new Worker(workerBlobUrl, { type: "module", name: "webvas" });
    const listeners = [];
    const session = { canvas, worker, workerBlobUrl, listeners };
    sessions.set(selector, session);

    const listen = (target, type, callback, options) => {
      target.addEventListener(type, callback, options);
      listeners.push([target, type, callback, options]);
    };
    listen(worker, "message", event => {
      const message = event.data || {};
      if (message.type === "webvas:loading") report({ state: "loading", message: message.message || "Loading Ruby runtime…" });
      else if (message.type === "webvas:ready") {
        URL.revokeObjectURL(workerBlobUrl);
        worker.postMessage({ type: "webvas:run", source });
      } else if (message.type === "webvas:started") report({ state: "running", message: "Ruby sketch is running" });
      else if (message.type === "webvas:error") report({ state: "error", message: message.message || "Ruby sketch failed", backtrace: message.backtrace || "" });
      else if (message.type === "webvas:metrics") report({ state: "metrics", ...message });
      else if (message.type === "webvas:pixelated" && message.selector === selector) {
        const enabled = message.enabled === true || message.enabled === "true";
        canvas.dataset.pixelated = String(enabled);
        canvas.style.imageRendering = enabled ? "pixelated" : "auto";
      }
    });
    listen(worker, "error", event => {
      URL.revokeObjectURL(workerBlobUrl);
      report({ state: "error", message: event.message || "Webvas worker failed" });
    });
    listen(worker, "messageerror", () => report({ state: "error", message: "Webvas worker sent an unreadable message." }));

    const forward = event => {
      if (event.type === "wheel") event.preventDefault();
      if (event.type === "keydown" && event.code === "Space") event.preventDefault();
      if (event.type === "pointerdown") {
        canvas.focus({ preventScroll: true });
        canvas.setPointerCapture(event.pointerId);
      }
      const rect = canvas.getBoundingClientRect();
      worker.postMessage({
        type: "webvas:input",
        event: {
          type: event.type === "pointercancel" ? "pointerup" : event.type,
          clientX: event.clientX ?? 0, clientY: event.clientY ?? 0,
          left: rect.left, top: rect.top, rectWidth: rect.width, rectHeight: rect.height,
          button: event.button, deltaX: event.deltaX, deltaY: event.deltaY,
          code: event.code, key: event.key, shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey, altKey: event.altKey, metaKey: event.metaKey
        }
      });
    };
    for (const type of ["pointerdown", "pointerup", "pointermove", "pointercancel", "keydown", "keyup", "wheel"]) {
      listen(canvas, type, forward, type === "wheel" ? { passive: false } : undefined);
    }

    if (typeof canvas.transferControlToOffscreen !== "function") throw new Error("OffscreenCanvas is unavailable in this browser.");
    const offscreen = canvas.transferControlToOffscreen();
    worker.postMessage({
      type: "webvas:init", canvas: offscreen, selector,
      bridgeUrl: new URL("./bridge.js", base).href,
      wasmUrl: new URL(runtime || defaultRuntime, document.baseURI).href
    }, [offscreen]);
    return session;
  }

  async function run(source, options = {}) {
    try {
      return await start(source, options);
    } catch (error) {
      const detail = { state: "error", message: error.message || String(error) };
      dispose(options.canvas || "#screen", true);
      if (options.onStatus) options.onStatus(detail);
      else if (options.statusElement) options.statusElement.textContent = detail.message;
      else throw error;
    }
  }

  globalThis.WebvasPlayground = {
    run,
    stop(canvas = "#screen") { dispose(canvas, true); }
  };

  const startEmbedded = () => {
    for (const element of document.querySelectorAll('script[type="text/ruby"][data-webvas],script[type="application/json"][data-webvas-source]')) {
      const status = document.createElement("output");
      status.setAttribute("role", "status");
      status.setAttribute("aria-live", "polite");
      element.insertAdjacentElement("afterend", status);
      readSource(element).then(source => run(source, {
        canvas: element.dataset.canvas || "#screen",
        runtime: element.dataset.runtime,
        statusElement: status
      })).catch(error => {
        status.setAttribute("role", "alert");
        status.textContent = error.message || String(error);
      });
    }
  };
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", startEmbedded, { once: true });
  else startEmbedded();
})();
