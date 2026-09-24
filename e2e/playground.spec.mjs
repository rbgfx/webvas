import { readFile } from "node:fs/promises";
import { test, expect } from "@playwright/test";

async function centerPixel(page, selector) {
  const image = await page.locator(selector).screenshot();
  return page.evaluate(async bytes => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    return Array.from(context.getImageData(bitmap.width >> 1, bitmap.height >> 1, 1, 1).data);
  }, [...image]);
}

test("renders Ruby pixels and exports the current sketch", async ({ page, context }) => {
  page.on("console", message => {
    if (message.type() === "error") console.error("[browser]", message.text());
  });
  page.on("pageerror", error => console.error("[page]", error.stack));
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  const status = page.locator("#status");
  await expect.poll(() => status.textContent(), { timeout: 120_000 }).not.toBe("Preparing the drawing machine…");
  await expect(status).toHaveText("Sketch is running");
  const timing = page.locator("#performance-state");
  await expect(timing).toContainText("ms / frame", { timeout: 30_000 });
  console.log("Ruby frame timing baseline:", await timing.textContent());

  const source = [
    'require "gesso"',
    'Gesso.run(width: 480, height: 320, runner: :web) do',
    "  draw { background \"#123456\" }",
    "end"
  ].join("\n");
  await page.locator("#source").fill(source);
  await page.locator("#run").click();
  await expect.poll(() => centerPixel(page, "#screen"), { timeout: 120_000 }).toEqual([18, 52, 86, 255]);

  await page.locator("#share").click();
  await expect(status).toHaveText("Share link copied");
  const sharedUrl = await page.evaluate(() => navigator.clipboard.readText());
  expect(sharedUrl).toContain("#code=");
  const sharedPage = await context.newPage();
  await sharedPage.goto(sharedUrl);
  await expect(sharedPage.locator("#source")).toHaveValue(source);

  const downloadReady = page.waitForEvent("download");
  await page.locator("#download-html").click();
  const download = await downloadReady;
  const html = await readFile(await download.path(), "utf8");
  expect(html).toContain("https://rbgfx.github.io/webvas/app.js");
  expect(html).toContain('Gesso.run(width: 480, height: 320, runner: :web)');
});

test("loads an HTML text/ruby sketch and forwards pointer input", async ({ page }) => {
  await page.goto("/loader-example.html");
  const status = page.getByRole("status");
  await expect(status).toHaveText("Ruby sketch is running", { timeout: 120_000 });
  await expect.poll(() => centerPixel(page, "#screen")).toEqual([18, 52, 86, 255]);
  const bounds = await page.locator("#screen").boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect.poll(() => centerPixel(page, "#screen")).toEqual([229, 179, 106, 255]);
  await page.mouse.up();
});

test("runs Larb and an RLSL shader in the browser runtime", async ({ page }) => {
  await page.goto("/");
  const status = page.locator("#status");
  await expect(status).toHaveText("Sketch is running", { timeout: 120_000 });

  await page.locator("#source").fill([
    'require "larb"',
    "vector = Larb::Vec3[1, 2, 3] + Larb::Vec3.one",
    'raise "Larb vector math failed" unless vector.x == 2.0'
  ].join("\n"));
  await page.locator("#run").click();
  await expect(status).toHaveText("Sketch is running");

  const examples = await page.locator("#examples option").evaluateAll(options =>
    options.filter(option => option.value).map(option => option.textContent));
  for (const example of examples) {
    await page.locator("#examples").selectOption({ label: example });
    await page.locator("#run").click();
    await expect(status).toHaveText("Sketch is running");
    if (example.startsWith("RLSL")) {
      await expect(page.locator("#gpu")).toBeVisible();
      await expect.poll(async () => {
        const [red, green, blue, alpha] = await centerPixel(page, "#gpu");
        return alpha === 255 && red + green + blue > 0;
      }, { timeout: 30_000 }).toBe(true);
    } else {
      await expect(page.locator("#screen")).toBeVisible();
    }
    await page.waitForTimeout(100);
    await expect(page.locator(".console")).not.toHaveClass(/error/);
  }
});

test("renders the built-in RBGL triangle example", async ({ page }) => {
  await page.goto("/");
  const status = page.locator("#status");
  await expect(status).toHaveText("Sketch is running", { timeout: 120_000 });
  await page.locator("#examples").selectOption({ label: "RBGL · RGB triangle" });
  await page.locator("#run").click();
  await expect(status).toHaveText("Sketch is running");
  await expect.poll(async () => {
    const [red, green, blue, alpha] = await centerPixel(page, "#screen");
    return alpha === 255 && red + green + blue > 100;
  }, { timeout: 30_000 }).toBe(true);
});

test("applies pixelated rendering to the transferred canvas", async ({ page }) => {
  await page.goto("/");
  const status = page.locator("#status");
  await expect(status).toHaveText("Sketch is running", { timeout: 120_000 });
  await page.locator("#source").fill([
    'require "gesso"',
    'Gesso.run(width: 80, height: 60, runner: :web, pixelated: true) do',
    '  background "#123456"',
    "end"
  ].join("\n"));
  await page.locator("#run").click();
  await expect(status).toHaveText("Sketch is running");
  await expect.poll(() => page.locator("#screen").evaluate(canvas => canvas.style.imageRendering)).toBe("pixelated");
});

test("selects the source line when Ruby raises an error", async ({ page }) => {
  await page.goto("/");
  const status = page.locator("#status");
  await expect(status).toHaveText("Sketch is running", { timeout: 120_000 });
  const source = ['require "gesso"', 'raise "sample failure"'].join("\n");
  await page.locator("#source").fill(source);
  await page.locator("#run").click();
  await expect(status).toContainText("sample failure");
  await expect.poll(() => page.locator("#source").evaluate(editor =>
    editor.value.slice(editor.selectionStart, editor.selectionEnd))).toBe('raise "sample failure"');
});

test("forwards pointer input to a running Gesso sketch", async ({ page }) => {
  await page.goto("/");
  const status = page.locator("#status");
  await expect(status).toHaveText("Sketch is running", { timeout: 120_000 });
  await page.locator("#source").fill([
    'require "gesso"',
    'Gesso.run(width: 480, height: 320, runner: :web) do',
    "  draw do",
    '    background "#111417"',
    "    no_stroke",
    '    fill mouse_pressed? ? "#e5b36a" : "#84a99d"',
    "    circle mouse_x, mouse_y, 32",
    "  end",
    "end"
  ].join("\n"));
  await page.locator("#run").click();
  await expect(status).toHaveText("Sketch is running");
  const canvas = page.locator("#screen");
  const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect.poll(() => centerPixel(page, "#screen")).toEqual([229, 179, 106, 255]);
  await page.mouse.up();
});

test("measures the 320 by 240 RGBA transfer path", async ({ page }) => {
  await page.goto("/");
  const status = page.locator("#status");
  await expect(status).toHaveText("Sketch is running", { timeout: 120_000 });
  await page.locator("#source").fill([
    'require "webvas"',
    'require "rbgl"',
    "width, height = 320, 240",
    'pixels = "\\x12\\x34\\x56\\xff".b * (width * height)',
    "backend = Webvas::Backend.new(width: width, height: height)",
    "window = RBGL::GUI::Window.new(width: width, height: height, backend: backend)",
    "Webvas.run(window) { window.set_pixels(pixels) }"
  ].join("\n"));
  await page.locator("#run").click();
  await expect(status).toHaveText("Sketch is running");
  const timing = page.locator("#performance-state");
  await expect(timing).toContainText("ms / frame", { timeout: 30_000 });
  console.log("320x240 RGBA base64 path:", await timing.textContent());
  await expect.poll(() => centerPixel(page, "#screen"), { timeout: 30_000 }).toEqual([18, 52, 86, 255]);
});

test("runs for one minute without unbounded Ruby heap growth", async ({ page }) => {
  await page.addInitScript(() => {
    globalThis.__heapSamples = [];
    const NativeWorker = globalThis.Worker;
    globalThis.Worker = class extends NativeWorker {
      constructor(...arguments_) {
        super(...arguments_);
        this.addEventListener("message", event => {
          const match = /^webvas:heap:(\d+)$/.exec(event.data);
          if (match) globalThis.__heapSamples.push(Number(match[1]));
        });
      }
    };
  });
  await page.goto("/");
  const status = page.locator("#status");
  await expect(status).toHaveText("Sketch is running", { timeout: 120_000 });
  await page.locator("#source").fill([
    'require "webvas"',
    'require "rbgl"',
    'require "js"',
    "backend = Webvas::Backend.new(width: 80, height: 60)",
    "window = RBGL::GUI::Window.new(width: 80, height: 60, backend: backend)",
    "frames = 0",
    "Webvas.run(window) do |context, _delta|",
    "  context.clear",
    "  frames += 1",
    '  JS.global.postMessage("webvas:heap:#{GC.stat[:heap_live_slots]}") if (frames % 30).zero?',
    "end"
  ].join("\n"));
  await page.locator("#run").click();
  await expect(status).toHaveText("Sketch is running");
  await page.waitForTimeout(60_000);
  const samples = await page.evaluate(() => globalThis.__heapSamples);
  expect(samples.length).toBeGreaterThanOrEqual(45);
  const median = values => values.sort((a, b) => a - b)[Math.floor(values.length / 2)];
  const initial = median(samples.slice(0, 5));
  const final = median(samples.slice(-5));
  console.log(`One-minute Ruby heap live slots: ${initial} → ${final} (${samples.length} samples)`);
  expect(final).toBeLessThan(initial * 2 + 5000);
});
