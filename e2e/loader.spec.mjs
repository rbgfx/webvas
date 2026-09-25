import { test, expect } from "@playwright/test";

async function pixelAt(page, selector, x, y) {
  const screenshot = await page.locator(selector).screenshot();
  return page.evaluate(async ({ bytes, x, y }) => {
    const bitmap = await createImageBitmap(new Blob([new Uint8Array(bytes)]));
    const canvas = new OffscreenCanvas(bitmap.width, bitmap.height);
    const context = canvas.getContext("2d");
    context.drawImage(bitmap, 0, 0);
    return Array.from(context.getImageData(x, y, 1, 1).data);
  }, { bytes: [...screenshot], x, y });
}

test("loads an RBGL sketch and forwards pointer and keyboard input", async ({ page }) => {
  await page.goto("/");
  const status = page.getByRole("status");
  await expect(status).toHaveText("Ruby sketch is running", { timeout: 120_000 });
  await expect(page.locator("#screen")).toHaveCSS("image-rendering", "pixelated");
  await expect.poll(() => pixelAt(page, "#screen", 5, 5)).toEqual([18, 52, 86, 255]);

  const canvas = page.locator("#screen");
  const bounds = await canvas.boundingBox();
  await page.mouse.move(bounds.x + bounds.width / 2, bounds.y + bounds.height / 2);
  await page.mouse.down();
  await expect.poll(() => pixelAt(page, "#screen", 5, 5)).toEqual([229, 179, 106, 255]);
  await page.mouse.up();
  await expect.poll(() => pixelAt(page, "#screen", 5, 5)).toEqual([18, 52, 86, 255]);

  await canvas.focus();
  await page.keyboard.press("Space");
  await expect.poll(() => pixelAt(page, "#screen", 5, 5)).toEqual([229, 179, 106, 255]);
});
