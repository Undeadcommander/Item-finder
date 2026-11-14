import { test, expect } from "./fixture.js";
import { readFile } from "node:fs/promises";

const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("haven-inventory")));
const save = (page) => page.getByRole("button", { name: "Save", exact: true }).click();
const settings = (page, name) => page.getByRole("button", { name: `Settings for ${name}`, exact: true }).click();
const photo = {
  name: "photo.png", mimeType: "image/png",
  buffer: Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+aX1sAAAAASUVORK5CYII=", "base64"),
};

test("room and container images can be chosen at creation and changed through gears", async ({ page }) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Add room", exact: true }).first().click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Study");
  await page.getByRole("radio", { name: "Office", exact: true }).check();
  await save(page);
  expect((await saved(page)).locations.find(l => l.name === "Study").image).toBe("office");
  await settings(page, "Study");
  await page.getByRole("radio", { name: "Bedroom", exact: true }).check();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect((await saved(page)).locations.find(l => l.name === "Study").image).toBe("office");
  await page.getByRole("button", { name: "Open Study", exact: true }).click();
  await page.getByRole("button", { name: "Add a container" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Cabinet");
  await page.getByRole("radio", { name: "Drawers", exact: true }).check();
  await save(page);
  await settings(page, "Cabinet");
  await page.getByRole("radio", { name: "Shelves", exact: true }).check();
  await save(page);
  await page.reload();
  expect((await saved(page)).locations.find(l => l.name === "Cabinet").image).toBe("shelf");
  await settings(page, "Cabinet");
  await expect(page.getByRole("radio", { name: "Shelves", exact: true })).toBeChecked();
});

test("uploads persist, invalid files preserve the photo, and the living room preset replaces it", async ({ page }) => {
  await page.goto("/");
  await settings(page, "Living room");
  await page.getByLabel("Upload your own image").setInputFiles(photo);
  await expect(page.locator("[data-image-status]")).toContainText("Photo ready");
  await save(page);
  await page.reload();
  await expect(page.locator(".card-image img")).toBeVisible();
  const image = (await saved(page)).locations[0].image;
  expect(image).toMatch(/^data:image\/jpeg;base64,/);
  const downloadEvent = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export a backup", exact: true }).click();
  const download = await downloadEvent;
  const backup = JSON.parse(await readFile(await download.path(), "utf8"));
  expect(backup.inventory.locations[0].image).toBe(image);
  await page.setViewportSize({ width: 320, height: 740 });
  await settings(page, "Living room");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await expect(page.getByRole("radio", { name: "Your photo" })).toBeChecked();
  await page.getByLabel("Upload your own image").setInputFiles({ name: "broken.png", mimeType: "image/png", buffer: Buffer.from("bad image") });
  await expect(page.locator("[data-image-status]")).toContainText("could not be read");
  await save(page);
  expect((await saved(page)).locations[0].image).toBe(image);
  await settings(page, "Living room");
  await page.getByRole("radio", { name: "Living room", exact: true }).check();
  await save(page);
  await expect(page.locator(".card-image img")).toHaveCount(0);
  expect((await saved(page)).locations[0].image).toBe("living");
});

test("a custom photo can be uploaded when creating a container", async ({ page }) => {
  await page.goto("/#room/living-room");
  await page.getByRole("button", { name: "Add a container" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Photo box");
  await page.getByLabel("Upload your own image").setInputFiles(photo);
  await expect(page.locator("[data-image-status]")).toContainText("Photo ready");
  await save(page);
  await expect(page.locator(".card-image img")).toBeVisible();
  await page.reload();
  await expect(page.locator(".card-image img")).toBeVisible();
});
