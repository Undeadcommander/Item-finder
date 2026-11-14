import { test, expect } from "./fixture.js";
import { initialState } from "../src/store.js";

async function seed(page) {
  const state = initialState();
  for (const [id, parentId, name] of [
    ["office", null, "Office"],
    ["cabinet", "living-room", "Cabinet"],
    ["drawer", "cabinet", "Drawer"],
    ["box", "drawer", "Box"],
    ["shelf", "living-room", "Shelf"],
    ["closet", "office", "Closet"],
  ]) state.locations.push({ id, parentId, name, description: "", color: "sage" });
  state.items.push(
    { id: "keys", locationId: "box", name: "Spare keys", notes: "" },
    { id: "book", locationId: "cabinet", name: "Book", notes: "" },
  );
  await page.addInitScript((inventory) => {
    if (!localStorage.getItem("haven-inventory"))
      localStorage.setItem("haven-inventory", JSON.stringify(inventory));
  }, state);
  await page.goto("/#room/cabinet");
}

test("move containers within and across rooms, preserving nested contents and search paths", async ({ page }) => {
  await seed(page);
  const move = page.getByRole("button", { name: "Move container", exact: true });
  await move.click();
  const destination = page.getByLabel("Destination");
  await expect(destination.locator("option")).toHaveText([
    "Living room (current)", "Living room / Shelf", "Office", "Office / Closet",
  ]);
  await expect(page.locator('#editor [type="submit"]')).toBeDisabled();
  await destination.selectOption("office");
  await page.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.locator(".breadcrumb")).toHaveText("My home/Living room/Cabinet");

  for (const [target, path] of [
    ["shelf", "Living room / Shelf"],
    ["closet", "Office / Closet"],
    ["office", "Office"],
  ]) {
    await move.click();
    await destination.selectOption(target);
    await page.locator("#editor").getByRole("button", { name: "Move container", exact: true }).click();
    await expect(page.locator("h1")).toHaveText("Cabinet");
    await expect(page.getByRole("button", { name: "Open Drawer", exact: true })).toBeVisible();
    await expect(page.locator(".item-row")).toContainText("Book");
    await page.reload();
    await page.getByRole("searchbox").fill("Spare keys");
    await expect(page.locator(".search-result")).toContainText(`${path} / Cabinet / Drawer / Box`);
    await page.getByRole("searchbox").fill("");
  }
  await page.getByRole("button", { name: "My home", exact: true }).last().click();
  await expect(page.getByRole("button", { name: "Open Office", exact: true })).toContainText("2 items");
  await expect(page.getByRole("button", { name: "Open Living room", exact: true })).toContainText("0 items");
  await page.getByRole("button", { name: "Open Living room", exact: true }).click();
  await expect(move).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Open Cabinet", exact: true })).toHaveCount(0);
  await page.getByRole("button", { name: "Open Shelf", exact: true }).click();
  await expect(page.getByRole("button", { name: "Open Cabinet", exact: true })).toHaveCount(0);

  await page.goto("/#room/cabinet");
  await page.setViewportSize({ width: 320, height: 740 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
  await move.click();
  await destination.selectOption("living-room");
  await page.locator("#editor").getByRole("button", { name: "Move container", exact: true }).click();
  await expect(page.locator(".breadcrumb")).toHaveText("My home/Living room/Cabinet");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
});

test("failed persistence keeps the container at its old location and allows retry", async ({ page }) => {
  await seed(page);
  await page.getByRole("button", { name: "Move container", exact: true }).click();
  await page.getByLabel("Destination").selectOption("office");
  await page.evaluate(() => {
    const original = Storage.prototype.setItem;
    Storage.prototype.setItem = function (key, value) {
      if (key === "haven-inventory") throw new Error("Storage full");
      return original.call(this, key, value);
    };
    window.restoreStorage = () => { Storage.prototype.setItem = original; };
  });
  await page.locator("#editor").getByRole("button", { name: "Move container", exact: true }).click();
  await expect(page.locator("#editor [role=alert]")).toContainText("Your container has not moved");
  expect(await page.evaluate(() => JSON.parse(localStorage.getItem("haven-inventory"))
    .locations.find((l) => l.id === "cabinet").parentId)).toBe("living-room");
  await page.evaluate(() => window.restoreStorage());
  await page.locator("#editor").getByRole("button", { name: "Move container", exact: true }).click();
  await expect(page.locator(".breadcrumb")).toHaveText("My home/Office/Cabinet");
});
