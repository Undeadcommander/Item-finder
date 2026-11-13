import { test, expect } from "./fixture.js";

const themes = ["light", "dark", "oled", "grey", "rose", "aqua"];

test("themes persist and keep add tiles in sync across navigation and hover", async ({ page }) => {
  await page.goto("/");
  const picker = page.getByRole("combobox", { name: "Color theme" });
  for (const theme of [...themes, "dark", "light"]) {
    await picker.selectOption(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    const colors = await page.evaluate(() => {
      const style = (selector) => getComputedStyle(document.querySelector(selector));
      return {
        card: style(".room-card").backgroundColor,
        add: style(".add-card").backgroundColor,
        title: style(".add-card h3").color,
        cardTitle: style(".card-title h3").color,
        page: style("body").backgroundColor,
      };
    });
    expect(colors.add).toBe(colors.card);
    expect(colors.title).toBe(colors.cardTitle);
    if (theme === "oled") expect(colors.page).toBe("rgb(0, 0, 0)");
    await page.locator(".add-card").hover();
    const hover = await page.locator(".add-card").evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      expected: getComputedStyle(document.querySelector(".sidebar")).backgroundColor,
    }));
    expect(hover.background).toBe(hover.expected);
    await page.mouse.move(0, 0);
    await page.reload();
    await expect(picker).toHaveValue(theme);
    await expect(page.locator("html")).toHaveAttribute("data-theme", theme);
    await page.getByRole("button", { name: "Open Living room", exact: true }).click();
    await expect(picker).toHaveValue(theme);
    await expect(page.getByRole("button", { name: "Add a container" })).toBeVisible();
    await page.getByRole("button", { name: "Add a container" }).click();
    const dialogColors = await page.locator("#editor").evaluate((el) => ({
      background: getComputedStyle(el).backgroundColor,
      tile: getComputedStyle(document.querySelector(".add-card")).backgroundColor,
    }));
    expect(dialogColors.background).toBe(dialogColors.tile);
    await page.getByRole("button", { name: "Cancel", exact: true }).click();
    await page.getByRole("button", { name: "My home", exact: true }).last().click();
  }
});

test("system preference, invalid saved values, and blocked storage have a usable fallback", async ({ page }) => {
  await page.emulateMedia({ colorScheme: "dark" });
  await page.goto("/");
  await expect(page.getByRole("combobox", { name: "Color theme" })).toHaveValue("dark");
  await page.evaluate(() => localStorage.setItem("haven-theme", "invalid"));
  await page.reload();
  await expect(page.getByRole("combobox", { name: "Color theme" })).toHaveValue("dark");
  await page.addInitScript(() => {
    Storage.prototype.getItem = () => { throw new Error("Storage blocked"); };
    Storage.prototype.setItem = () => { throw new Error("Storage blocked"); };
  });
  await page.reload();
  await page.getByRole("combobox", { name: "Color theme" }).selectOption("rose");
  await expect(page.locator("html")).toHaveAttribute("data-theme", "rose");
  await expect(page.getByRole("status")).toContainText("Theme changed for this session");
});

test("all themes fit a narrow mobile screen", async ({ page }) => {
  await page.setViewportSize({ width: 320, height: 740 });
  await page.goto("/");
  for (const theme of themes) {
    await page.getByRole("combobox", { name: "Color theme" }).selectOption(theme);
    expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(320);
    await expect(page.getByRole("combobox", { name: "Color theme" })).toBeVisible();
  }
});
