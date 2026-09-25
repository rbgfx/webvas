import { test, expect } from "@playwright/test";
import { readFile } from "node:fs/promises";

async function pixelAt(page, x, y) {
  const screenshot = await page.locator("#screen").screenshot();
  return page.evaluate(async ({ bytes, x, y }) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    return Array.from(context.getImageData(x, y, 1, 1).data);
  }, { bytes: [...screenshot], x, y });
}

test("runs RBGL, forwards input, and reports frame measurements", async ({ page }) => {
  await page.goto("/");
  await page.selectOption("#mode", "rbgl");
  await page.selectOption("#example", "2");
  await expect(page.locator("#editor")).toHaveValue(/pixelated: true/);
  const runStartedAt = Date.now();
  await page.getByRole("button", { name: "Run" }).click();
  const status = page.getByRole("status");
  await expect(status).toHaveText("Ruby sketch is running", { timeout: 120_000 });
  await expect(page.locator("#screen")).toHaveAttribute("data-pixelated", "true");
  await expect(page.locator("#screen")).toHaveCSS("image-rendering", "pixelated");
  await expect.poll(() => pixelAt(page, 5, 5)).toEqual([18, 52, 86, 255]);
  const firstPixelMs = Date.now() - runStartedAt;
  console.log(`Playwright run-to-first-pixel: ${firstPixelMs} ms`);

  const canvas = page.locator("#screen");
  const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect.poll(() => pixelAt(page, 5, 5)).toEqual([229, 179, 106, 255]);
  await page.mouse.up();
  await expect.poll(() => pixelAt(page, 5, 5)).toEqual([18, 52, 86, 255]);
  await canvas.focus();
  await page.keyboard.press("Space");
  await expect.poll(() => pixelAt(page, 5, 5)).toEqual([229, 179, 106, 255]);
  await page.selectOption("#example", "1");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(status).toHaveText("Ruby sketch is running", { timeout: 120_000 });
  await expect.poll(() => pixelAt(page, 5, 5)).toEqual([49, 95, 88, 255]);
});

test("records frame measurements without screenshot polling", async ({ page }) => {
  await page.goto("/");
  await page.selectOption("#mode", "rbgl");
  await page.selectOption("#example", "1");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("status")).toHaveText("Ruby sketch is running", { timeout: 120_000 });
  const sample = page.locator("#metrics");
  await expect(sample).toContainText("60 frames", { timeout: 120_000 });
  await expect(sample).toContainText(/fps · .* ms present\/dispatch/);
  await expect.poll(() => pixelAt(page, 5, 5)).toEqual([49, 95, 88, 255]);
  console.log(`Playwright 60-frame sample: ${await sample.textContent()}`);
});

test("runs a Gesso example in a new worker", async ({ page }) => {
  await page.goto("/");
  await page.selectOption("#mode", "gesso");
  await expect.poll(() => page.locator("#editor").inputValue()).toContain("Gesso.run");
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.getByRole("status")).toHaveText("Ruby sketch is running", { timeout: 120_000 });
  await expect.poll(() => pixelAt(page, 2, 2)).not.toEqual([16, 24, 39, 255]);
  const sample = page.locator("#metrics");
  await expect(sample).toContainText("60 frames", { timeout: 120_000 });
  console.log(`Gesso 50-circle sample: ${await sample.textContent()}`);
});

test("reports unsupported WebGPU instead of hanging", async ({ page }) => {
  await page.goto("/");
  await page.selectOption("#mode", "rlsl");
  await page.getByRole("button", { name: "Run" }).click();
  await expect.poll(async () => {
    const state = await page.locator("#status").getAttribute("data-state");
    return state === "error" || (await page.locator("#metrics").textContent()).includes("60 frames");
  }, { timeout: 120_000 }).toBe(true);
  const state = await page.locator("#status").getAttribute("data-state");
  if (state === "error") {
    await expect(page.locator("#status")).toContainText(/WebGPU|WGSL|shader/i);
  } else {
    await expect(page.locator("#screen")).toBeVisible();
  }
});

test("share restores compressed source without auto-running it", async ({ page, context }) => {
  await page.goto("/");
  const source = 'puts "shared <ruby> source"\n';
  await page.locator("#editor").fill(source);
  await page.getByRole("button", { name: "Share" }).click();
  const input = page.getByRole("textbox", { name: "Share URL" });
  await expect(input).toBeVisible();
  const url = await input.inputValue();
  expect(url).toContain("#code=");

  const sharedPage = await context.newPage();
  await sharedPage.goto(url);
  await expect(sharedPage.locator("#editor")).toHaveValue(source);
  await expect(sharedPage.locator("#status")).toContainText("Press Run when you trust it.");
  await expect(sharedPage.locator("#status")).not.toHaveText("Ruby sketch is running");
});

test("rejects malformed share fragments", async ({ page }) => {
  await page.goto("/#code=%%%not-base64%%%");
  await expect(page.locator("#status")).toContainText("invalid code payload");
  await expect(page.locator("#status")).toHaveAttribute("data-state", "error");
});

test("downloaded HTML safely embeds source and keeps runtime external", async ({ page }) => {
  await page.goto("/");
  await page.locator("#editor").fill('puts "</script><img src=x>"');
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Download HTML" }).click();
  const download = await downloadPromise;
  const html = await readFile(await download.path(), "utf8");
  expect(html).toContain("\\u003c/script>");
  expect(html).not.toContain("</script><img src=x>");
  expect(html).toContain("https://rbgfx.github.io/webvas/assets/webvas.wasm");
  expect(html).toContain("application/json");
});

test("Ruby errors are rendered as text and highlight their source line", async ({ page }) => {
  await page.goto("/");
  await page.locator("#editor").fill('raise "<img src=x onerror=alert(1)>"');
  await page.getByRole("button", { name: "Run" }).click();
  await expect(page.locator("#status")).toContainText("<img src=x onerror=alert(1)>", { timeout: 120_000 });
  await expect(page.locator("#status")).toHaveAttribute("data-state", "error");
  await expect(page.locator("#status img")).toHaveCount(0);
  await expect.poll(() => page.locator("#editor").evaluate(editor => editor.value.slice(editor.selectionStart, editor.selectionEnd)))
    .toContain('raise "<img src=x onerror=alert(1)>"');
});
