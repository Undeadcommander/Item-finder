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
 async reauthenticate(){window.reauthCalls=(window.reauthCalls||0)+1;if(window.rejectReauth)throw Error('Google verification was cancelled.');},
 async deleteAccount(){window.deleteCalls=(window.deleteCalls||0)+1;if(window.failDelete)throw Error('Deletion failed offline.');inventory=undefined;revision=0;callback(null);},
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

async function openDeletion(page) {
  await fakeFirebase(page);
  await page.goto("/");
  await page.getByRole("button", { name: "Sign in", exact: true }).click();
  await page.getByRole("button", { name: "Continue with Google" }).click();
  await page.getByRole("button", { name: "Account", exact: true }).click();
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  return page.locator(".deletion-dialog");
}
async function slideLeft(page, dialog) {
  const handle = await dialog.getByRole("slider").boundingBox();
  const track = await dialog.locator(".deletion-track").boundingBox();
  await page.mouse.move(handle.x + handle.width / 2, handle.y + handle.height / 2);
  await page.mouse.down();
  await page.mouse.move(track.x + handle.width / 2, handle.y + handle.height / 2, { steps: 12 });
  await page.mouse.up();
}
async function freezeClock(page) {
  await page.clock.install({ time: new Date("2030-01-01T00:00:00Z") });
  await page.clock.pauseAt(new Date("2030-01-01T00:00:10Z"));
}

test("each deletion step can be cancelled, the slider requires a full leftward drag, and reopening resets the wait", async ({ page }) => {
  const dialog = await openDeletion(page);
  await freezeClock(page);
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(dialog).toHaveCount(0);
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await dialog.getByRole("button", { name: "Continue to delete account" }).click();
  // Clicking the track must not count as sliding the handle.
  await dialog.locator(".deletion-track").click({ position: { x: 10, y: 28 } });
  await expect(dialog.getByRole("slider")).toBeVisible();
  const handle = await dialog.getByRole("slider").boundingBox();
  await page.mouse.move(handle.x + 27, handle.y + 27);
  await page.mouse.down();
  await page.mouse.move(handle.x - 35, handle.y + 27);
  await page.mouse.up();
  await expect(dialog.getByRole("slider")).toHaveAttribute("aria-valuenow", "0");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await dialog.getByRole("button", { name: "Continue to delete account" }).click();
  await slideLeft(page, dialog);
  const final = dialog.locator("[data-delete]");
  await expect(final).toBeHidden();
  await expect(final).toBeDisabled();
  const cancelBefore = await dialog.getByRole("button", { name: "Cancel", exact: true }).boundingBox();
  await page.clock.runFor(4900);
  await expect(final).toBeHidden();
  await page.clock.runFor(100);
  await expect(final).toBeVisible();
  await expect(final).toBeEnabled();
  const cancelAfter = await dialog.getByRole("button", { name: "Cancel", exact: true }).boundingBox();
  expect(cancelAfter.y).toBe(cancelBefore.y);
  await expect(dialog.getByRole("button", { name: "Cancel", exact: true })).toBeFocused();
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await dialog.getByRole("button", { name: "Continue to delete account" }).click();
  await slideLeft(page, dialog);
  await expect(final).toBeHidden();
  await page.keyboard.press("Escape");
  await expect(dialog).toHaveCount(0);
  expect(await page.evaluate(() => window.deleteCalls || 0)).toBe(0);
});

test("confirmed deletion clears only this account's local data and scans and returns to guest mode", async ({ page }) => {
  const dialog = await openDeletion(page);
  await freezeClock(page);
  await page.evaluate(async () => {
    const { putAsset } = await import("/src/scan-storage.js");
    const { initialState } = await import("/src/store.js");
    localStorage.setItem("haven-inventory", JSON.stringify(initialState()));
    localStorage.setItem("haven-account:test-alice", JSON.stringify({ inventory: initialState(), revision: 0, dirty: false }));
    localStorage.setItem("haven-recovery:test-alice", JSON.stringify(initialState()));
    localStorage.setItem("haven-account:bob", "keep");
    await putAsset("scan", new Blob(["alice"]), "test-alice");
    await putAsset("orphan", new Blob(["unreferenced"]), "test-alice");
    await putAsset("scan", new Blob(["bob"]), "bob");
    await putAsset("scan", new Blob(["guest"]), null);
  });
  await dialog.getByRole("button", { name: "Continue to delete account" }).click();
  // Keyboard access follows the same confirmation and delay as dragging.
  const slider = dialog.getByRole("slider");
  await slider.focus();
  for (let i = 0; i < 10; i++) await page.keyboard.press("ArrowLeft");
  await page.keyboard.press("Enter");
  await page.clock.runFor(5000);
  await dialog.getByRole("button", { name: "Permanently delete account" }).click();
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
  await expect(dialog).toHaveCount(0);
  const result = await page.evaluate(async () => {
    const { getAsset } = await import("/src/scan-storage.js");
    return {
      account: localStorage.getItem("haven-account:test-alice"),
      recovery: localStorage.getItem("haven-recovery:test-alice"),
      pending: localStorage.getItem("haven-deleting:test-alice"),
      guest: !!localStorage.getItem("haven-inventory"),
      bob: localStorage.getItem("haven-account:bob"),
      aliceScan: !!await getAsset("scan", "test-alice"),
      orphanScan: !!await getAsset("orphan", "test-alice"),
      bobScan: !!await getAsset("scan", "bob"),
      guestScan: !!await getAsset("scan", null),
      calls: window.deleteCalls, reauth: window.reauthCalls,
    };
  });
  expect(result).toEqual({ account: null, recovery: null, pending: null, guest: true, bob: "keep", aliceScan: false, orphanScan: false, bobScan: true, guestScan: true, calls: 1, reauth: 1 });
});

test("cancelled Google verification deletes nothing; an interrupted deletion stays paused and can be retried", async ({ page }) => {
  const dialog = await openDeletion(page);
  await freezeClock(page);
  await dialog.getByRole("button", { name: "Continue to delete account" }).click();
  await slideLeft(page, dialog);
  await page.evaluate(() => { window.rejectReauth = true; });
  await page.clock.runFor(5000);
  await dialog.getByRole("button", { name: "Permanently delete account" }).click();
  await expect(dialog.getByRole("alert")).toContainText("verification was cancelled");
  expect(await page.evaluate(() => window.deleteCalls || 0)).toBe(0);
  expect(await page.evaluate(() => localStorage.getItem("haven-deleting:test-alice"))).toBeNull();
  await page.evaluate(() => { window.rejectReauth = false; window.failDelete = true; });
  await page.clock.runFor(5000);
  await dialog.getByRole("button", { name: "Permanently delete account" }).click();
  await expect(dialog.getByRole("alert")).toContainText("Deletion did not finish");
  await dialog.getByRole("button", { name: "Cancel", exact: true }).click();
  await expect(page.getByRole("button", { name: "Sync now" })).toBeDisabled();
  expect(await page.evaluate(() => localStorage.getItem("haven-deleting:test-alice"))).toBe("pending");
  await page.getByRole("button", { name: "Delete account", exact: true }).click();
  await dialog.getByRole("button", { name: "Continue to delete account" }).click();
  await slideLeft(page, dialog);
  await page.evaluate(() => { window.failDelete = false; });
  await page.clock.runFor(5000);
  await dialog.getByRole("button", { name: "Permanently delete account" }).click();
  await expect(dialog).toHaveCount(0);
  await expect(page.getByRole("button", { name: "Sign in", exact: true })).toBeVisible();
});

test("the right-to-left confirmation works with a phone touch gesture", async ({ browser }) => {
  const context = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true, hasTouch: true });
  const page = await context.newPage();
  try {
    const dialog = await openDeletion(page);
    await dialog.getByRole("button", { name: "Continue to delete account" }).tap();
    const handle = await dialog.getByRole("slider").boundingBox(), track = await dialog.locator(".deletion-track").boundingBox();
    const session = await context.newCDPSession(page);
    const start = handle.x + handle.width / 2, end = track.x + handle.width / 2, y = handle.y + handle.height / 2;
    await session.send("Input.dispatchTouchEvent", { type: "touchStart", touchPoints: [{ x: start, y }] });
    for (let i = 1; i <= 10; i++)
      await session.send("Input.dispatchTouchEvent", { type: "touchMove", touchPoints: [{ x: start + (end - start) * i / 10, y }] });
    await session.send("Input.dispatchTouchEvent", { type: "touchEnd", touchPoints: [] });
    await expect(dialog.getByRole("heading", { name: "Permanently delete this account?" })).toBeVisible();
    await expect(dialog.locator("[data-delete]")).toBeHidden();
    await dialog.getByRole("button", { name: "Cancel", exact: true }).tap();
    await expect(dialog).toHaveCount(0);
  } finally { await context.close(); }
});
