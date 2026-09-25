(() => {
  let nextId = 1;
  const canvases = new Map();
  const pendingEvents = [];
  const eventLimit = 2048;

  function queue(handle, event) {
    if (handle.events.length === eventLimit) handle.events.shift();
    handle.events.push(event);
  }

  globalThis.WebvasBridge = {
    attach(selector, width, height, pixelated) {
      const canvas = globalThis.WebvasCanvases[selector];
      if (!(canvas instanceof OffscreenCanvas)) throw new Error("Canvas not found: " + selector);
      canvas.width = width;
      canvas.height = height;
      const context = canvas.getContext("2d", { alpha: false });
      if (!context) throw new Error("Canvas 2D is unavailable");
      const handle = { id: nextId++, canvas, context, events: pendingEvents.splice(0) };
      globalThis.postMessage({ type: "webvas:pixelated", selector, enabled: pixelated });
      canvases.set(handle.id, handle);
      return handle.id;
    },

    present(id, encoded, width, height) {
      const handle = canvases.get(id);
      if (!handle) throw new Error("Canvas backend is closed");
      const { canvas, context } = handle;
      if (canvas.width !== width || canvas.height !== height) {
        canvas.width = width;
        canvas.height = height;
      }
      const binary = atob(encoded);
      if (binary.length !== width * height * 4) throw new Error("RGBA frame size mismatch");
      const pixels = new Uint8ClampedArray(binary.length);
      for (let index = 0; index < binary.length; index += 1) pixels[index] = binary.charCodeAt(index);
      context.putImageData(new ImageData(pixels, width, height), 0, 0);
      return true;
    },

    events(id) {
      const handle = canvases.get(id);
      return JSON.stringify(handle ? handle.events.splice(0) : []);
    },

    pushEvent(event) {
      if (!canvases.size) {
        if (pendingEvents.length === eventLimit) pendingEvents.shift();
        pendingEvents.push(event);
        return;
      }
      for (const handle of canvases.values()) queue(handle, event);
    },

    resize(id, width, height) {
      const handle = canvases.get(id);
      if (!handle) return false;
      handle.canvas.width = width;
      handle.canvas.height = height;
      return true;
    },

    close(id) {
      canvases.delete(id);
    },

    showError(message, backtrace) {
      globalThis.postMessage({ type: "webvas:error", message, backtrace });
    }
  };
})();
