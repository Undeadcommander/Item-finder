import { test, expect } from "./fixture.js";
import { initialState } from "../src/store.js";

async function seed(page) {
  const inventory = initialState();
  for (const [id, parentId, name] of [
    ["office", null, "Office"],
    ["cabinet", "living-room", "Cabinet"],
    ["drawer", "cabinet", "Drawer"],
    ["shelf", "living-room", "Shelf"],
    ["closet", "office", "Closet"],
  ]) inventory.locations.push({ id, parentId, name, description: "", color: "sage" });
  inventory.items = [
    { id: "keys", locationId: "living-room", name: "Keys", notes: "Spare keys" },
    { id: "book", locationId: "drawer", name: "Book", notes: "" },
  ];
  inventory.scans = ["living-room", "cabinet"].map((locationId) => ({
    id: `scan-${locationId}`, assetId: `asset-${locationId}`, locationId, name: "scan.obj", format: "obj",
  }));
  inventory.markers = [
    ["external-container", "living-room", "container", "cabinet"],
    ["external-book", "living-room", "item", "book"],
    ["external-keys", "living-room", "item", "keys"],
    ["internal-book", "cabinet", "item", "book"],
  ].map(([id, scan, kind, targetId]) => ({ id, scanId: `scan-${scan}`, kind, targetId, position: [0, 0, 0] }));
  await page.addInitScript((data) => {
    if (!localStorage.getItem("haven-inventory")) localStorage.setItem("haven-inventory", JSON.stringify(data));
  }, inventory);
  await page.goto("/#room/living-room");
}
const inventory = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("haven-inventory")));
const card = (page, id) => page.locator(`.room-card[data-drop-location="${id}"]`);
const room = (page, id) => page.locator(`.room-nav [data-drop-location="${id}"]`);

test("gear edits container details and destination without entering it, and item color persists", async ({ page }) => {
  await seed(page);
  await page.getByRole("button", { name: "Settings for Cabinet", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Living room");
  await expect(page.getByLabel("Destination").locator("option")).toHaveText([
    "Living room (current)", "Living room / Shelf", "Office", "Office / Closet",
  ]);
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Media cabinet");
  await page.getByRole("textbox", { name: "Description" }).fill("Games and movies");
  await page.getByRole("radio", { name: "rose" }).check();
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(card(page, "cabinet")).toContainText("Media cabinet");
  await expect(card(page, "cabinet")).toContainText("Games and movies");
  await expect(card(page, "cabinet")).toHaveClass(/rose/);
  expect((await inventory(page)).markers).toHaveLength(4);
  await page.getByRole("button", { name: "Settings for Media cabinet", exact: true }).click();
  await page.getByLabel("Destination").selectOption("closet");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Living room");
  await expect(card(page, "cabinet")).toHaveCount(0);
  await page.getByRole("button", { name: "Settings for Keys", exact: true }).click();
  await page.getByRole("textbox", { name: "Item name" }).fill("Car keys");
  await page.getByRole("textbox", { name: "Description" }).fill("In the blue pouch");
  await page.getByRole("radio", { name: "blue" }).check();
  await page.getByRole("combobox", { name: "Location", exact: true }).selectOption("cabinet");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.reload();
  await page.getByRole("button", { name: /All items/ }).click();
  await expect(page.locator("#item-keys")).toHaveClass(/blue/);
  await expect(page.locator("#item-keys")).toContainText("In the blue pouch");
  await expect(page.locator("#item-keys")).toContainText("Office / Closet / Media cabinet");
  const data = await inventory(page);
  expect(data.locations.find((l) => l.id === "drawer").parentId).toBe("cabinet");
  expect(data.items.find((i) => i.id === "keys")).toMatchObject({ name: "Car keys", color: "blue", notes: "In the blue pouch" });
  expect(data.markers.map((m) => m.id)).toEqual(["internal-book"]);
});

test("native dragging moves containers and items to cards and sidebar rooms", async ({ page }) => {
  await seed(page);
  await card(page, "cabinet").dragTo(card(page, "shelf"));
  await expect(card(page, "cabinet")).toHaveCount(0);
  await expect(page.locator("h1")).toHaveText("Living room");
  expect((await inventory(page)).locations.find((l) => l.id === "cabinet").parentId).toBe("shelf");
  await page.locator("#item-keys").dragTo(card(page, "shelf"));
  await expect(page.locator("#item-keys")).toHaveCount(0);
  await page.getByRole("button", { name: "Open Shelf", exact: true }).click();
  await card(page, "cabinet").dragTo(room(page, "office"));
  await expect(card(page, "cabinet")).toHaveCount(0);
  await page.locator("#item-keys").dragTo(room(page, "office"));
  await expect(page.locator("#item-keys")).toHaveCount(0);
  expect((await inventory(page)).markers.map((m) => m.id)).toEqual(["internal-book"]);
  await room(page, "office").click();
  await expect(card(page, "cabinet")).toBeVisible();
  await card(page, "cabinet").dragTo(card(page, "closet"));
  await page.reload();
  await page.getByRole("searchbox").fill("Book");
  await expect(page.locator(".search-result")).toContainText("Office / Closet / Cabinet / Drawer");
  await page.getByRole("searchbox").fill("");
  await page.getByRole("button", { name: /All items/ }).click();
  await page.locator("#item-keys").dragTo(room(page, "living-room"));
  expect((await inventory(page)).items.find((i) => i.id === "keys").locationId).toBe("living-room");
});

test("drag highlights, cancellation, invalid targets, and external payloads never corrupt inventory", async ({ page }) => {
  await seed(page);
  const original = await inventory(page);
  const dataTransfer = await page.evaluateHandle(() => new DataTransfer());
  await card(page, "cabinet").dispatchEvent("dragstart", { dataTransfer });
  await expect(page.locator(".inventory-drag-preview")).toContainText("Cabinet");
  await room(page, "office").dispatchEvent("dragover", { dataTransfer, clientX: 100, clientY: 300 });
  await expect(page.locator(".inventory-drag-preview")).toContainText("Release into Office");
  await expect(card(page, "shelf")).toHaveClass(/drop-ready/);
  await expect(room(page, "office")).toHaveClass(/drop-ready/);
  await expect(card(page, "cabinet")).not.toHaveClass(/drop-ready/);
  await expect(room(page, "living-room")).not.toHaveClass(/drop-ready/);
  await card(page, "cabinet").dispatchEvent("drop", { dataTransfer });
  expect(await inventory(page)).toEqual(original);
  await card(page, "cabinet").dispatchEvent("dragstart", { dataTransfer });
  await card(page, "cabinet").dispatchEvent("dragend", { dataTransfer });
  await expect(page.locator(".drop-ready, .drag-source, .drop-over")).toHaveCount(0);
  await expect(page.locator(".inventory-drag-preview, .inventory-drag-image")).toHaveCount(0);
  await room(page, "office").dispatchEvent("drop", { dataTransfer });
  expect(await inventory(page)).toEqual(original);
  await card(page, "cabinet").dispatchEvent("dragstart", { dataTransfer });
  await room(page, "living-room").dispatchEvent("drop", { dataTransfer });
  expect(await inventory(page)).toEqual(original);
});

test("failed drag saves leave the source in place, and mobile gear settings fit", async ({ page }) => {
  await seed(page);
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "haven-inventory") throw Error("Storage full");
      return original.call(this, key, value);
    };
  });
  await card(page, "cabinet").dragTo(room(page, "office"));
  await expect(card(page, "cabinet")).toBeVisible();
  expect((await inventory(page)).locations.find((l) => l.id === "cabinet").parentId).toBe("living-room");
  await expect(page.getByRole("status")).toContainText("Storage full");
  await expect(page.locator(".drop-ready, .drag-source, .drop-over")).toHaveCount(0);
  await page.setViewportSize({ width: 320, height: 740 });
  await page.getByRole("button", { name: "Settings for Cabinet", exact: true }).click();
  await expect(page.getByLabel("Destination")).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Settings for Keys", exact: true }).click();
  await expect(page.getByRole("radio", { name: "blue" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});
