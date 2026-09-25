import { examples } from "./examples.js";

const editor = document.querySelector("#editor");
const mode = document.querySelector("#mode");
const example = document.querySelector("#example");
const runButton = document.querySelector("#run");
const status = document.querySelector("#status");
const metrics = document.querySelector("#metrics");
const backtrace = document.querySelector("#backtrace");
const shareUrl = document.querySelector("#share-url");
const sourceLimit = 32768;

function setStatus(message, state = "") {
  status.textContent = message;
  status.dataset.state = state;
}

function selectMode(source) {
  if (/require\s+["']rlsl/.test(source) || /RLSL\.to_wgsl/.test(source)) return "rlsl";
  if (/require\s+["']gesso/.test(source) || /Gesso\.run/.test(source)) return "gesso";
  return "rbgl";
}

function showError(detail) {
  setStatus(detail.message || "Sketch failed.", "error");
  backtrace.textContent = detail.backtrace || "";
  backtrace.hidden = !backtrace.textContent;
  const location = `${detail.message || ""}\n${detail.backtrace || ""}`;
  const line = location.match(/(?:\(eval\)|eval|app\.rb|<main>):(\d+)(?::|\))/)?.[1];
  if (!line) return;
  const start = editor.value.split("\n").slice(0, Number(line) - 1).join("\n").length + (Number(line) > 1 ? 1 : 0);
  const end = editor.value.indexOf("\n", start);
  editor.focus();
  editor.setSelectionRange(start, end < 0 ? editor.value.length : end);
}

function showExamples() {
  example.replaceChildren(new Option("Custom source", ""));
  examples[mode.value].forEach((item, index) => example.add(new Option(item.name, String(index))));
  example.value = "0";
  editor.value = examples[mode.value][0].source;
}

function useExample() {
  if (example.value === "") return;
  const item = examples[mode.value][Number(example.value)];
  if (item) editor.value = item.source;
}

function validateSource(source) {
  if (new TextEncoder().encode(source).length > sourceLimit) throw new Error("Ruby source exceeds 32 KB.");
}

async function run() {
  backtrace.textContent = "";
  backtrace.hidden = true;
  metrics.textContent = "";
  try {
    validateSource(editor.value);
    runButton.disabled = true;
    setStatus("Starting a fresh Ruby worker…", "loading");
    if (!globalThis.WebvasPlayground) throw new Error("Webvas loader is unavailable.");
    await WebvasPlayground.run(editor.value, {
      canvas: "#screen",
      statusElement: status,
      onStatus(detail) {
        if (detail.state === "metrics") {
          metrics.textContent = `${detail.frames} frames · ${detail.fps.toFixed(1)} fps · ${detail.averagePresentMs.toFixed(2)} ms present/dispatch`;
        } else if (detail.state === "error") showError(detail);
        else setStatus(detail.message || "", detail.state);
        runButton.disabled = detail.state === "loading";
      }
    });
  } catch (error) {
    runButton.disabled = false;
    showError({ message: error.message || String(error) });
  }
}

function decodeBase64Url(encoded) {
  if (!/^[A-Za-z0-9_-]+$/.test(encoded)) throw new Error("The share URL has an invalid code payload.");
  const binary = atob(encoded.replaceAll("-", "+").replaceAll("_", "/") + "=".repeat((4 - encoded.length % 4) % 4));
  return Uint8Array.from(binary, character => character.charCodeAt(0));
}

function encodeBase64Url(bytes) {
  let binary = "";
  for (let offset = 0; offset < bytes.length; offset += 0x8000) {
    binary += String.fromCharCode(...bytes.subarray(offset, offset + 0x8000));
  }
  return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

async function decompressSource(encoded) {
  if (encoded.length > 64 * 1024) throw new Error("The shared source is too large.");
  if (typeof DecompressionStream !== "function") throw new Error("This browser cannot open compressed Webvas share links.");
  const stream = new Blob([decodeBase64Url(encoded)]).stream().pipeThrough(new DecompressionStream("deflate"));
  const reader = stream.getReader();
  const chunks = [];
  let length = 0;
  while (true) {
    const { done, value } = await reader.read();
    if (done) break;
    length += value.length;
    if (length > sourceLimit) {
      await reader.cancel();
      throw new Error("Shared Ruby source exceeds 32 KB.");
    }
    chunks.push(value);
  }
  const bytes = new Uint8Array(length);
  let offset = 0;
  chunks.forEach(chunk => { bytes.set(chunk, offset); offset += chunk.length; });
  return new TextDecoder("utf-8", { fatal: true }).decode(bytes);
}

async function share() {
  try {
    validateSource(editor.value);
    if (typeof CompressionStream !== "function") throw new Error("This browser cannot create compressed share links.");
    const compressed = await new Response(new Blob([editor.value]).stream().pipeThrough(new CompressionStream("deflate"))).arrayBuffer();
    const code = encodeBase64Url(new Uint8Array(compressed));
    const url = `${location.origin}${location.pathname}${location.search}#code=${code}`;
    history.replaceState(null, "", url);
    shareUrl.value = url;
    shareUrl.hidden = false;
    try {
      await navigator.clipboard.writeText(url);
      setStatus("Share URL copied. The Ruby source is stored in the URL fragment.");
    } catch {
      shareUrl.focus();
      shareUrl.select();
      setStatus("Share URL ready. Copy it from the field below; the source stays in the URL fragment.");
    }
  } catch (error) {
    showError({ message: error.message || String(error) });
  }
}

function download() {
  try {
    validateSource(editor.value);
    const runtime = "https://rbgfx.github.io/webvas/assets/webvas.wasm";
    const loaderUrl = "https://rbgfx.github.io/webvas/loader.js";
    const policy = "default-src 'self'; script-src 'self' https://rbgfx.github.io https://cdn.jsdelivr.net 'unsafe-eval' 'wasm-unsafe-eval'; worker-src 'self' blob:; connect-src 'self' https://rbgfx.github.io https://cdn.jsdelivr.net; style-src 'self' 'unsafe-inline'; object-src 'none'; base-uri 'self'";
    const payload = JSON.stringify({ source: editor.value }).replaceAll("<", "\\u003c");
    const html = `<!doctype html>
<html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta http-equiv="Content-Security-Policy" content="${policy}"><title>Webvas sketch</title><style>body{margin:2rem auto;max-width:760px;padding:0 1rem;background:#101312;color:#e7e9e2;font:16px/1.5 system-ui}canvas{display:block;width:min(100%,640px);height:auto;aspect-ratio:4/3;background:#101827;image-rendering:pixelated}output{display:block;white-space:pre-wrap;overflow-wrap:anywhere}</style></head>
<body><h1>Webvas sketch</h1><canvas id="screen" width="320" height="240" aria-label="Ruby sketch"></canvas><output role="status" aria-live="polite">Loading Ruby runtime…</output><script type="application/json" data-webvas-source data-canvas="#screen">${payload}</script><script data-webvas-loader src="${loaderUrl}" data-runtime="${runtime}"></script></body></html>`;
    const url = URL.createObjectURL(new Blob([html], { type: "text/html;charset=utf-8" }));
    const link = document.createElement("a");
    link.href = url;
    link.download = "webvas-sketch.html";
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
    setStatus("Single HTML downloaded. It loads the Ruby runtime from its configured URL.");
  } catch (error) {
    showError({ message: error.message || String(error) });
  }
}

async function restoreShare() {
  const match = location.hash.match(/^#code=(.*)$/);
  if (!match) return;
  try {
    const source = await decompressSource(match[1]);
    editor.value = source;
    mode.value = selectMode(source);
    showExamples();
    example.value = "";
    editor.value = source;
    setStatus("Shared code loaded for inspection. Press Run when you trust it.");
  } catch (error) {
    showError({ message: error.message || String(error) });
  }
}

mode.addEventListener("change", showExamples);
example.addEventListener("change", useExample);
editor.addEventListener("input", () => { example.value = ""; });
runButton.addEventListener("click", run);
document.querySelector("#share").addEventListener("click", share);
document.querySelector("#download").addEventListener("click", download);
editor.addEventListener("keydown", event => {
  if (event.key === "Enter" && (event.metaKey || event.ctrlKey)) {
    event.preventDefault();
    run();
  }
});

showExamples();
restoreShare();
window.addEventListener("hashchange", restoreShare);
