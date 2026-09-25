(() => {
  const loader = document.currentScript;
  if (!loader) return;

  const base = new URL(".", loader.src);
  const runtimeUrl = loader.dataset.runtime || new URL("./assets/webvas.wasm", base).href;
  const workerUrl = new URL("./worker.js", base).href;
  const bridgeUrl = new URL("./bridge.js", base).href;

  async function run(sourceElement) {
    const selector = sourceElement.dataset.canvas || "#screen";
    const canvas = document.querySelector(selector);
    if (!(canvas instanceof HTMLCanvasElement)) throw new Error(`Canvas not found: ${selector}`);
    if (new TextEncoder().encode(sourceElement.textContent).length > 32768) throw new Error("Ruby source exceeds 32 KB.");

    const status = document.createElement("output");
    status.setAttribute("role", "status");
    status.setAttribute("aria-live", "polite");
    canvas.insertAdjacentElement("afterend", status);
    const report = message => { status.textContent = message; };
    report("Loading Ruby runtime…");
    if (canvas.tabIndex < 0) canvas.tabIndex = 0;

    const response = await fetch(workerUrl, { credentials: "omit" });
    if (!response.ok) throw new Error(`Worker download failed: ${response.status}`);
    const workerBlobUrl = URL.createObjectURL(new Blob([await response.text()], { type: "text/javascript" }));
    const worker = new Worker(workerBlobUrl, { type: "module", name: "webvas" });
    worker.addEventListener("message", event => {
      const message = event.data || {};
      if (message.type === "webvas:loading") report(message.message || "Loading Ruby runtime…");
      else if (message.type === "webvas:ready") {
        URL.revokeObjectURL(workerBlobUrl);
        worker.postMessage({ type: "webvas:run", source: sourceElement.textContent });
      } else if (message.type === "webvas:started") report("Ruby sketch is running");
      else if (message.type === "webvas:error") report([message.message, message.backtrace].filter(Boolean).join("\n"));
      else if (message.type === "webvas:pixelated" && message.selector === selector) {
        canvas.style.imageRendering = message.enabled ? "pixelated" : "auto";
      }
    });
    worker.addEventListener("error", event => {
      URL.revokeObjectURL(workerBlobUrl);
      report(event.message || "Webvas worker failed");
    });

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
          clientX: event.clientX || 0, clientY: event.clientY || 0,
          left: rect.left, top: rect.top, rectWidth: rect.width, rectHeight: rect.height,
          button: event.button, deltaX: event.deltaX, deltaY: event.deltaY,
          code: event.code, key: event.key, shiftKey: event.shiftKey,
          ctrlKey: event.ctrlKey, altKey: event.altKey, metaKey: event.metaKey
        }
      });
    };
    for (const type of ["pointerdown", "pointerup", "pointermove", "pointercancel", "keydown", "keyup", "wheel"]) {
      canvas.addEventListener(type, forward, type === "wheel" ? { passive: false } : undefined);
    }

    const offscreen = canvas.transferControlToOffscreen();
    worker.postMessage({
      type: "webvas:init", canvas: offscreen, selector,
      bridgeUrl, wasmUrl: new URL(runtimeUrl, document.baseURI).href
    }, [offscreen]);
  }

  const start = () => document.querySelectorAll('script[type="text/ruby"][data-webvas]').forEach(element => {
    run(element).catch(error => {
      const status = document.createElement("output");
      status.setAttribute("role", "alert");
      status.textContent = error.message || String(error);
      element.insertAdjacentElement("afterend", status);
    });
  });
  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", start, { once: true });
  else start();
})();
