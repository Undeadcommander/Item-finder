import { test, expect } from "./fixture.js";
import { initialState } from "../src/store.js";

async function seed(page, destination = "office") {
  const inventory = initialState();
  for (const [id, parentId, name] of [
    ["office", null, "Office"],
    ["cabinet", "living-room", "Cabinet"],
    ["drawer", "cabinet", "Drawer"],
    ["shelf", "office", "Shelf"],
  ]) inventory.locations.push({ id, parentId, name, description: "", color: "sage" });
  inventory.items = [
    { id: "keys", locationId: "living-room", name: "Keys", notes: "Spare", color: "blue" },
    { id: "book", locationId: "drawer", name: "Book", notes: "First edition" },
    { id: "pen", locationId: "office", name: "Pen", notes: "" },
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
  await page.goto(`/#room/${destination}`);
  return inventory;
}
const saved = (page) => page.evaluate(() => JSON.parse(localStorage.getItem("haven-inventory")));
async function openImport(page, kind) {
  await page.getByRole("button", { name: kind === "item" ? "Add item" : "Add a container", exact: kind === "item" }).first().click();
  await page.getByRole("button", { name: `Import existing ${kind}`, exact: true }).click();
}

test("add item imports the original, preserves details, clears pins and persists", async ({ page }) => {
  const original = await seed(page);
  await openImport(page, "item");
  await expect(page.getByLabel("Choose item").locator("option")).toHaveText([
    "Select an existing item", "Living room / Cabinet / Drawer / Book", "Living room / Keys",
  ]);
  await expect(page.getByRole("button", { name: "Move item here" })).toBeDisabled();
  await page.getByLabel("Choose item").selectOption("keys");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  expect(await saved(page)).toEqual(original);
  await openImport(page, "item");
  await page.getByLabel("Choose item").selectOption("keys");
  await page.getByRole("button", { name: "Move item here" }).click();
  await expect(page.locator("#item-keys")).toContainText("Spare");
  await page.reload();
  await expect(page.locator("#item-keys")).toHaveClass(/blue/);
  const data = await saved(page);
  expect(data.items).toHaveLength(original.items.length);
  expect(data.items.find((i) => i.id === "keys").locationId).toBe("office");
  expect(data.markers.map((m) => m.id)).not.toContain("external-keys");
  await page.goto("/#room/living-room");
  await expect(page.locator("#item-keys")).toHaveCount(0);
});

test("add container imports nested contents and scans without duplicating them", async ({ page }) => {
  const original = await seed(page);
  await openImport(page, "container");
  await expect(page.getByLabel("Choose container").locator("option")).toHaveText([
    "Select an existing container", "Living room / Cabinet", "Living room / Cabinet / Drawer",
  ]);
  await page.getByLabel("Choose container").selectOption("cabinet");
  await page.getByRole("button", { name: "Move container here" }).click();
  await expect(page.getByRole("button", { name: "Open Cabinet", exact: true })).toBeVisible();
  await page.reload();
  const data = await saved(page);
  expect(data.locations).toHaveLength(original.locations.length);
  expect(data.locations.find((l) => l.id === "cabinet").parentId).toBe("office");
  expect(data.locations.find((l) => l.id === "drawer").parentId).toBe("cabinet");
  expect(data.items).toEqual(original.items);
  expect(data.scans).toEqual(original.scans);
  expect(data.markers.map((m) => m.id)).toEqual(["external-keys", "internal-book"]);
  await page.getByRole("searchbox").fill("Book");
  await expect(page.locator(".search-result")).toContainText("Office / Cabinet / Drawer");
});

test("container picker excludes ancestors and supports empty lists and creating new", async ({ page }) => {
  await seed(page, "drawer");
  await page.setViewportSize({ width: 390, height: 844 });
  await openImport(page, "container");
  await expect(page.getByLabel("Choose container").locator("option")).toHaveText([
    "Select an existing container", "Office / Shelf",
  ]);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(390);
  await page.getByRole("button", { name: "Create a new container" }).click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("New box");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open New box", exact: true })).toBeVisible();

  await page.evaluate(() => localStorage.setItem("haven-inventory", JSON.stringify({
    version: 1, locations: [{ id: "room", parentId: null, name: "Room", description: "", color: "sage" }], items: [],
  })));
  await page.goto("/#room/room");
  await page.reload();
  await openImport(page, "container");
  await expect(page.locator("#editor")).toContainText("No containers are available");
  await expect(page.getByRole("button", { name: "Move container here" })).toBeDisabled();
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Add your first item" }).click();
  await page.getByRole("button", { name: "Import existing item" }).click();
  await expect(page.locator("#editor")).toContainText("No items are available");
  await expect(page.getByRole("button", { name: "Move item here" })).toBeDisabled();
});

test("item import honors the selected destination and failed saves can be retried", async ({ page }) => {
  const original = await seed(page);
  // Exercise the section's Add item button as well as the heading's button.
  await page.locator(".items-section").getByRole("button", { name: "Add item", exact: true }).click();
  await page.getByRole("combobox", { name: "Location", exact: true }).selectOption("shelf");
  await page.getByRole("button", { name: "Import existing item" }).click();
  await expect(page.locator("#editor .modal-description").first()).toContainText("Office / Shelf");
  await page.getByLabel("Choose item").selectOption("keys");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "haven-inventory") throw Error("Storage full");
      return original.call(this, key, value);
    };
    window.restoreStorage = () => { Storage.prototype.setItem = original; };
  });
  await page.getByRole("button", { name: "Move item here" }).click();
  await expect(page.locator("#editor [role=alert]")).toContainText("Your item has not moved");
  expect(await saved(page)).toEqual(original);
  await page.evaluate(() => window.restoreStorage());
  await page.getByRole("button", { name: "Move item here" }).click();
  expect((await saved(page)).items.find((i) => i.id === "keys").locationId).toBe("shelf");
  await page.getByRole("button", { name: "Open Shelf", exact: true }).click();
  await expect(page.locator("#item-keys")).toBeVisible();
});
