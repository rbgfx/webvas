(() => {
  let nextId = 1;
  const canvases = new Map();
  const pendingEvents = [];
  const eventLimit = 2048;

  function uniformLayout(wgsl) {
    const source = wgsl.match(/struct\s+Uniforms\s*\{([\s\S]*?)\}/)?.[1];
    if (!source) throw new Error("WGSL must define a Uniforms struct");
    const fields = [...source.matchAll(/\b(\w+)\s*:\s*(f32|i32|u32|vec[234]<f32>)\s*,/g)];
    let offset = 0;
    const layout = fields.map(([, name, type]) => {
      const components = Number(type.match(/^vec(\d)/)?.[1] || 1);
      const align = components === 1 ? 4 : components === 2 ? 8 : 16;
      const size = components === 3 ? 12 : components * 4;
      offset = Math.ceil(offset / align) * align;
      const field = { name, type, offset, components };
      offset += size;
      return field;
    });
    if (!layout.length) throw new Error("WGSL Uniforms must contain supported numeric fields");
    return { fields: layout, size: Math.ceil(offset / 16) * 16 };
  }

  function startShader(selector, wgsl, initialUniforms) {
    const canvas = globalThis.WebvasCanvases?.[selector];
    if (!(canvas instanceof OffscreenCanvas)) throw new Error("Canvas not found: " + selector);
    if (!navigator.gpu) throw new Error("WebGPU is unavailable. Try a browser with WebGPU enabled.");
    if (!canvas.width || !canvas.height) throw new Error("Shader canvas size must be positive");

    const startTime = performance.now();
    let metricFrames = 0;
    let metricStart = startTime;
    let metricDispatchMs = 0;
    const uniforms = JSON.parse(initialUniforms);
    const layout = uniformLayout(wgsl);
    const frame = async () => {
      try {
        const adapter = await navigator.gpu.requestAdapter();
        if (!adapter) throw new Error("WebGPU could not find an adapter.");
        const device = await adapter.requestDevice();
        const context = canvas.getContext("webgpu");
        if (!context) throw new Error("WebGPU canvas is unavailable.");
        context.configure({ device, format: "rgba8unorm", usage: GPUTextureUsage.STORAGE_BINDING, alphaMode: "opaque" });
        const module = device.createShaderModule({ code: wgsl });
        const info = await module.getCompilationInfo();
        const errors = info.messages.filter(message => message.type === "error");
        if (errors.length) throw new Error(errors.map(error => error.message).join("\n"));
        const pipeline = await device.createComputePipelineAsync({
          layout: "auto", compute: { module, entryPoint: "main" }
        });
        const buffer = device.createBuffer({ size: layout.size, usage: GPUBufferUsage.UNIFORM | GPUBufferUsage.COPY_DST });
        const draw = () => {
          try {
            const started = performance.now();
            const data = new DataView(new ArrayBuffer(layout.size));
            for (const field of layout.fields) {
              let value = uniforms[field.name];
              if (field.name === "resolution") value = [canvas.width, canvas.height];
              if (field.name === "time" && value === undefined) value = (performance.now() - startTime) / 1000;
              const values = field.components === 1 ? [value ?? 0] : Array.isArray(value) ? value : [];
              for (let index = 0; index < field.components; index += 1) {
                const at = field.offset + index * 4;
                if (field.type === "i32") data.setInt32(at, Number(values[index] || 0), true);
                else if (field.type === "u32") data.setUint32(at, Number(values[index] || 0), true);
                else data.setFloat32(at, Number(values[index] || 0), true);
              }
            }
            device.queue.writeBuffer(buffer, 0, data);
            const bindGroup = device.createBindGroup({
              layout: pipeline.getBindGroupLayout(0),
              entries: [
                { binding: 0, resource: { buffer } },
                { binding: 1, resource: context.getCurrentTexture().createView() }
              ]
            });
            const encoder = device.createCommandEncoder();
            const pass = encoder.beginComputePass();
            pass.setPipeline(pipeline);
            pass.setBindGroup(0, bindGroup);
            pass.dispatchWorkgroups(Math.ceil(canvas.width / 8), Math.ceil(canvas.height / 8));
            pass.end();
            device.queue.submit([encoder.finish()]);
            metricDispatchMs += performance.now() - started;
            metricFrames += 1;
            if (metricFrames === 60) {
              const elapsed = performance.now() - metricStart;
              globalThis.postMessage({ type: "webvas:metrics", frames: metricFrames, elapsedMs: elapsed,
                fps: metricFrames * 1000 / elapsed, averagePresentMs: metricDispatchMs / metricFrames });
              metricFrames = 0;
              metricStart = performance.now();
              metricDispatchMs = 0;
            }
            globalThis.window.requestAnimationFrame(draw);
          } catch (error) {
            globalThis.WebvasBridge.showError(error.message || String(error), "");
          }
        };
        globalThis.window.requestAnimationFrame(draw);
      } catch (error) {
        globalThis.WebvasBridge.showError(error.message || String(error), "");
      }
    };
    frame();
    return true;
  }

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
      const handle = { id: nextId++, canvas, context, events: pendingEvents.splice(0), metricStart: performance.now(), metricFrames: 0, metricPresentMs: 0 };
      globalThis.postMessage({ type: "webvas:pixelated", selector, enabled: pixelated });
      canvases.set(handle.id, handle);
      return handle.id;
    },

    present(id, encoded, width, height) {
      const handle = canvases.get(id);
      if (!handle) throw new Error("Canvas backend is closed");
      const started = performance.now();
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
      handle.metricFrames += 1;
      handle.metricPresentMs += performance.now() - started;
      if (handle.metricFrames === 60) {
        const elapsed = performance.now() - handle.metricStart;
        globalThis.postMessage({ type: "webvas:metrics", frames: handle.metricFrames, elapsedMs: elapsed,
          fps: handle.metricFrames * 1000 / elapsed, averagePresentMs: handle.metricPresentMs / handle.metricFrames });
        handle.metricStart = performance.now();
        handle.metricFrames = 0;
        handle.metricPresentMs = 0;
      }
      return true;
    },

    runShader(selector, wgsl, uniforms) {
      return startShader(selector, wgsl, uniforms);
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
