import { test as base, expect } from "@playwright/test";
// Browser tests never contact the production Firebase project or Google accounts.
export const test = base.extend({
  accountConfig: [
    async ({ page }, use) => {
      await page.route("**/src/firebase-config.json*", (route) =>
        route.fulfill({
          contentType: "application/javascript",
          body: "export default {enabled:false};",
        }),
      );
      await use();
    },
    { auto: true },
  ],
});
export { expect };
