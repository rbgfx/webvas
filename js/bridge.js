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
      globalThis.postMessage({ type: "webvas:size", width, height });
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
      const canvas = canvases.values().next().value?.canvas || globalThis.WebvasCanvases?.["#screen"];
      if (canvas && event.clientX !== undefined) {
        const width = Number(event.rectWidth);
        const height = Number(event.rectHeight);
        const x = width > 0 ? Math.floor((event.clientX - event.left) * canvas.width / width) : 0;
        const y = height > 0 ? Math.floor((event.clientY - event.top) * canvas.height / height) : 0;
        const mouse = globalThis.WebvasMouse || [0, 0, 0, 0];
        mouse[0] = Math.max(0, Math.min(canvas.width - 1, x));
        mouse[1] = canvas.height - 1 - Math.max(0, Math.min(canvas.height - 1, y));
        if (event.type === "pointerdown") [mouse[2], mouse[3]] = [mouse[0], mouse[1]];
        if (event.type === "pointerup") [mouse[2], mouse[3]] = [-Math.abs(mouse[2]), -Math.abs(mouse[3])];
        globalThis.WebvasMouse = mouse;
      }
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

    shaderMode(canvas) {
      globalThis.postMessage({ type: "webvas:mode", canvas });
    },

    showError(message, backtrace) {
      globalThis.postMessage({ type: "webvas:error", message, backtrace });
    }
  };
})();
