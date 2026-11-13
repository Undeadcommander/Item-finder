import { test, expect } from "./fixture.js";
async function fakeFirebase(page) {
  await page.route("**/src/firebase-config.json*", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: 'export default {apiKey:"test",authDomain:"test.invalid",projectId:"test",storageBucket:"test",appId:"test"};',
    }),
  );
  await page.route("**/src/firebase-service.js*", (r) =>
    r.fulfill({
      contentType: "application/javascript",
      body: `
 export async function createFirebaseService(){
 let callback,listener,revision=0,inventory;
 return {
 watchAuth(cb){callback=cb;queueMicrotask(()=>cb(null));return ()=>{};},
 async login(){if(window.rejectLogin)throw Error('Google sign-in was cancelled.');callback({uid:'test-alice',displayName:'Test Alice',email:'alice@example.test'});},
 async logout(){callback(null);},
 watch(uid,onValue){listener=onValue;queueMicrotask(()=>onValue(revision?{revision}:null));return ()=>{listener=null;};},
 async read(){return inventory;},
 async publish(uid,value,base){if(window.failSync)throw Error('Network unavailable. Changes remain on this device.');if(base!==revision){const e=Error('Conflict');e.code='sync/conflict';e.remote={revision};throw e;}inventory=value;revision++;queueMicrotask(()=>listener?.({revision}));return revision;},
 async getScan(){throw Error('Missing scan');}
 };
 }`,
    }),
  );
}
test("unconfigured sign-in is honest and leaves guest inventory available", async ({
  page,
}) => {
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeDisabled();
  await expect(page.locator(".account-message")).toContainText(
    "not available yet",
  );
  await page.getByRole("button", { name: "Continue on this device" }).click();
  await expect(page.locator(".room-card")).toHaveCount(1);
});
test("Google account flow keeps guest data separate and copies it only on request", async ({
  page,
}) => {
  await fakeFirebase(page);
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Living room", exact: true })
    .click();
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .first()
    .click();
  await page.getByRole("textbox", { name: "Item name" }).fill("Guest keys");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Continue with Google" }),
  ).toBeEnabled();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(
    page.getByRole("button", { name: "Account", exact: true }),
  ).toBeVisible();
  await expect(page.locator("[data-account-status]")).toContainText(
    "up to date",
  );
  expect(
    await page.evaluate(
      () => JSON.parse(localStorage.getItem("haven-inventory")).items[0].name,
    ),
  ).toBe("Guest keys");
  await expect(
    page.getByRole("button", { name: "All items 0", exact: true }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  page.once("dialog", (d) => d.accept());
  await page
    .getByRole("button", { name: "Copy device inventory to account" })
    .click();
  await expect(page.locator("[data-save-status]")).toContainText(
    "Account is up to date",
  );
  expect(
    await page.evaluate(
      () =>
        JSON.parse(localStorage.getItem("haven-account:test-alice")).inventory
          .items[0].name,
    ),
  ).toBe("Guest keys");
  await page.getByRole("button", { name: "Sync now", exact: true }).click();
  await expect(page.locator("[data-save-status]")).toContainText(
    "Account is up to date",
  );
  await page.getByRole("button", { name: "Sign out", exact: true }).click();
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
  await expect(
    page.getByRole("button", { name: "All items 1", exact: true }),
  ).toBeVisible();
});
test("cancelled Google popup keeps the user in guest mode", async ({
  page,
}) => {
  await fakeFirebase(page);
  await page.goto("/");
  await page.evaluate(() => (window.rejectLogin = true));
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await expect(page.locator(".account-message")).toContainText("cancelled");
  await expect(
    page.getByRole("button", { name: "Sign in", exact: true }),
  ).toBeVisible();
});
