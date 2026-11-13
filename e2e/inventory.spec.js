import { test, expect } from "@playwright/test";
test("nested inventory, exact-location search, persistence, editing and deletion", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await page.goto("/");
  await expect(page.locator(".room-card")).toHaveCount(1);
  await page
    .getByRole("button", { name: "Open Living room", exact: true })
    .click();
  for (const name of ["Cabinet", "Top drawer", "Blue box"]) {
    await page.getByRole("button", { name: "Add a container" }).click();
    await page.getByRole("textbox", { name: "Name", exact: true }).fill(name);
    await page.getByRole("button", { name: "Save", exact: true }).click();
    await page
      .getByRole("button", { name: `Open ${name}`, exact: true })
      .click();
  }
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .first()
    .click();
  await page.getByRole("textbox", { name: "Item name" }).fill("Spare keys");
  await page
    .getByRole("textbox", { name: "Where exactly?" })
    .fill("Inside the velvet pouch");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("button", { name: "My home", exact: true })
    .last()
    .click();
  await page.getByRole("searchbox").fill("velvet");
  await expect(page.locator(".search-result")).toContainText(
    "Living room / Cabinet / Top drawer / Blue box",
  );
  await page.locator(".search-result").click();
  await expect(page.locator("h1")).toHaveText("Blue box");
  await expect(page.locator(".highlight")).toContainText("Spare keys");
  await page.reload();
  await expect(page.locator(".item-row")).toContainText("Spare keys");
  await page
    .getByRole("button", { name: "Edit Spare keys", exact: true })
    .click();
  await page.getByRole("textbox", { name: "Item name" }).fill("Car keys");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".item-row")).toContainText("Car keys");
  await page
    .getByRole("button", { name: "Delete location", exact: true })
    .click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Top drawer");
  await page.getByRole("searchbox").fill("Car keys");
  await expect(page.locator(".no-results")).toBeVisible();
  expect(errors).toEqual([]);
});
test("mobile layout fits viewport and backup can be restored", async ({
  page,
}) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto("/");
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page
    .getByRole("button", { name: "Add room", exact: true })
    .first()
    .click();
  await page
    .getByRole("textbox", { name: "Name", exact: true })
    .fill("Kitchen");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await expect(page.locator(".room-card")).toHaveCount(2);
  await page.screenshot({
    path: "test-results/mobile.png",
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1000 });
  const download = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export a backup" }).first().click();
  const file = await download;
  await file.saveAs("/tmp/haven-test-backup.json");
  await page.getByRole("button", { name: "Open Kitchen", exact: true }).click();
  await page.getByRole("button", { name: "Delete location" }).click();
  await page.getByRole("button", { name: "Delete", exact: true }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Restore a backup" }).first().click();
  await (await chooser).setFiles("/tmp/haven-test-backup.json");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator(".room-card")).toHaveCount(2);
  await page.screenshot({
    path: "test-results/desktop.png",
    fullPage: true,
  });
});
