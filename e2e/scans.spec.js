import { test, expect } from "./fixture.js";
const fixture = "e2e/fixtures/room.obj";
async function openRoom(page) {
  await page.goto("/");
  await page
    .getByRole("button", { name: "Open Living room", exact: true })
    .click();
}
async function openViewer(page) {
  await page.getByRole("button", { name: /^(Add|Open) 3D scan$/ }).click();
  await expect(page.locator(".scan-dialog")).toBeVisible();
}
async function importScan(page) {
  await page.locator("[data-scan-file]").setInputFiles(fixture);
  await expect(page.locator(".scan-status")).toContainText("Loaded room.obj");
}
async function place(page, kind) {
  const box = await page.locator(".scan-stage canvas").boundingBox();
  await page.mouse.click(box.x + box.width / 2, box.y + box.height / 2, {
    button: "right",
  });
  await page
    .locator(".scan-context")
    .getByRole("button", {
      name: kind === "item" ? "Add item" : "Mark container",
      exact: true,
    })
    .click();
}

test("dark mode persists and item transfer updates search and room contents", async ({
  page,
}) => {
  await page.emulateMedia({ colorScheme: "light" });
  await openRoom(page);
  await page.getByRole("button", { name: "Toggle dark mode" }).click();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page.reload();
  await expect(page.locator("html")).toHaveAttribute("data-theme", "dark");
  await page
    .getByRole("button", { name: "Add item", exact: true })
    .first()
    .click();
  await page.getByRole("textbox", { name: "Item name" }).fill("Camera");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.locator("[data-add-root]").first().click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Office");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page.getByRole("button", { name: "Move Camera", exact: true }).click();
  await page.getByLabel("Destination").selectOption({ label: "Office" });
  await page.getByRole("button", { name: "Move item", exact: true }).click();
  await expect(page.locator(".item-row")).toHaveCount(0);
  await page.getByRole("searchbox").fill("Camera");
  await expect(page.locator(".search-result")).toContainText("Office");
  await page.locator(".search-result").click();
  await expect(page.locator("h1")).toHaveText("Office");
  await expect(page.locator(".item-row")).toContainText("Camera");
  await page.screenshot({ path: "test-results/dark-mode.png", fullPage: true });
});

test("imported scan supports item and container markers, persistence, backup and move cleanup", async ({
  page,
}) => {
  const errors = [];
  page.on("pageerror", (e) => errors.push(e.message));
  await openRoom(page);
  await openViewer(page);
  await importScan(page);
  await place(page, "item");
  await page
    .getByRole("textbox", { name: "Item name", exact: true })
    .fill("Spare keys");
  await page
    .getByRole("textbox", { name: "Details", exact: true })
    .fill("By the door");
  await page.getByRole("button", { name: "Save marker" }).click();
  await expect(
    page.getByRole("button", { name: "Item marker: Spare keys", exact: true }),
  ).toBeVisible();
  await page
    .getByRole("button", { name: "Item marker: Spare keys", exact: true })
    .click();
  await expect(page.locator(".scan-detail")).toHaveText("By the door");
  await place(page, "container");
  await page
    .getByRole("textbox", { name: "Container name", exact: true })
    .fill("Tool cabinet");
  await page.getByRole("button", { name: "Save marker" }).click();
  await page
    .getByRole("button", { name: "Open container", exact: true })
    .click();
  await expect(page.locator("h1")).toHaveText("Tool cabinet");
  await expect(
    page.getByRole("button", { name: "Add a container" }),
  ).toBeVisible();
  await page
    .locator(".breadcrumb")
    .getByRole("button", { name: "Living room", exact: true })
    .click();
  await openViewer(page);
  await expect(page.locator(".scan-status")).toContainText("Loaded room.obj");
  await expect(page.locator(".scan-dot")).toHaveCount(2);
  await place(page, "item");
  await page.getByLabel("Choose an option").selectOption("existing");
  await page.getByRole("button", { name: "Save marker" }).click();
  await expect(page.locator(".scan-dot")).toHaveCount(2);
  await page.screenshot({
    path: "test-results/scan-markers.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "Close scan" }).click();
  await page.reload();
  await openViewer(page);
  await expect(page.locator(".scan-dot")).toHaveCount(2);
  await page.getByRole("button", { name: "Close scan" }).click();
  const downloadPromise = page.waitForEvent("download");
  await page.getByRole("button", { name: "Export a backup" }).first().click();
  const download = await downloadPromise;
  await download.saveAs("/tmp/haven-scans-backup.json");
  await page.locator("[data-add-root]").first().click();
  await page.getByRole("textbox", { name: "Name", exact: true }).fill("Garage");
  await page.getByRole("button", { name: "Save", exact: true }).click();
  await page
    .getByRole("button", { name: "Move Spare keys", exact: true })
    .click();
  await page.getByLabel("Destination").selectOption({ label: "Garage" });
  await page.getByRole("button", { name: "Move item", exact: true }).click();
  await openViewer(page);
  await expect(page.locator(".scan-dot")).toHaveCount(1);
  await expect(
    page.getByRole("button", { name: "Container marker: Tool cabinet" }),
  ).toBeVisible();
  await page.getByRole("button", { name: "Close scan" }).click();
  const chooser = page.waitForEvent("filechooser");
  await page.getByRole("button", { name: "Restore a backup" }).first().click();
  await (await chooser).setFiles("/tmp/haven-scans-backup.json");
  await page.getByRole("button", { name: "Restore", exact: true }).click();
  await expect(page.locator("h1")).toHaveText("Home, organized.");
  await page
    .getByRole("button", { name: "Open Living room", exact: true })
    .click();
  await openViewer(page);
  await expect(page.locator(".scan-dot")).toHaveCount(2);
  expect(errors).toEqual([]);
});

test("unsupported camera scanning explains import fallback; mobile supports tap placement", async ({
  page,
}) => {
  await page.addInitScript(() =>
    Object.defineProperty(navigator, "xr", {
      value: undefined,
      configurable: true,
    }),
  );
  await page.setViewportSize({ width: 390, height: 844 });
  await openRoom(page);
  await openViewer(page);
  await page.getByRole("button", { name: "Scan with camera" }).click();
  await expect(page.locator(".scan-error")).toContainText("WebXR");
  await expect(page.locator(".scan-dialog")).toBeVisible();
  await importScan(page);
  await page.getByRole("button", { name: "Place marker", exact: true }).click();
  await page
    .locator(".scan-stage canvas")
    .click({ position: { x: 160, y: 160 } });
  await page
    .locator(".scan-context")
    .getByRole("button", { name: "Add item", exact: true })
    .click();
  await page
    .getByRole("textbox", { name: "Item name", exact: true })
    .fill("Book");
  await page.getByRole("button", { name: "Save marker" }).click();
  await expect(page.locator(".scan-dot")).toHaveCount(1);
  expect(await page.evaluate(() => document.documentElement.scrollWidth)).toBe(
    390,
  );
  await page.screenshot({
    path: "test-results/mobile-scan.png",
    fullPage: true,
  });
});

test("GLB import and invalid replacement preserve the previous scan", async ({
  page,
}) => {
  await openRoom(page);
  await openViewer(page);
  const geometry = Buffer.alloc(36);
  [0, 0, 0, 1, 0, 0, 0, 1, 0].forEach((n, i) =>
    geometry.writeFloatLE(n, i * 4),
  );
  const json = Buffer.from(
    JSON.stringify({
      asset: { version: "2.0" },
      scene: 0,
      scenes: [{ nodes: [0] }],
      nodes: [{ mesh: 0 }],
      meshes: [{ primitives: [{ attributes: { POSITION: 0 } }] }],
      buffers: [{ byteLength: 36 }],
      bufferViews: [{ buffer: 0, byteLength: 36 }],
      accessors: [
        {
          bufferView: 0,
          componentType: 5126,
          count: 3,
          type: "VEC3",
          min: [0, 0, 0],
          max: [1, 1, 0],
        },
      ],
    }),
  );
  const padded = Buffer.alloc(Math.ceil(json.length / 4) * 4, 0x20);
  json.copy(padded);
  const glb = Buffer.alloc(12 + 8 + padded.length + 8 + geometry.length);
  glb.writeUInt32LE(0x46546c67, 0);
  glb.writeUInt32LE(2, 4);
  glb.writeUInt32LE(glb.length, 8);
  glb.writeUInt32LE(padded.length, 12);
  glb.writeUInt32LE(0x4e4f534a, 16);
  padded.copy(glb, 20);
  const offset = 20 + padded.length;
  glb.writeUInt32LE(geometry.length, offset);
  glb.writeUInt32LE(0x004e4942, offset + 4);
  geometry.copy(glb, offset + 8);
  await page
    .locator("[data-scan-file]")
    .setInputFiles({
      name: "triangle.glb",
      mimeType: "model/gltf-binary",
      buffer: glb,
    });
  await expect(page.locator(".scan-status")).toContainText(
    "Loaded triangle.glb",
  );
  await page
    .locator("[data-scan-file]")
    .setInputFiles({
      name: "broken.obj",
      mimeType: "text/plain",
      buffer: Buffer.from("not a model"),
    });
  await expect(page.locator(".scan-error")).toContainText("does not contain");
  await page.getByRole("button", { name: "Close scan" }).click();
  await page.reload();
  await openViewer(page);
  await expect(page.locator(".scan-status")).toContainText(
    "Loaded triangle.glb",
  );
});

async function fakeDepthCapture(page) {
  await page.addInitScript(() => {
    const getContext = HTMLCanvasElement.prototype.getContext;
    HTMLCanvasElement.prototype.getContext = function (type, options) {
      if (options?.xrCompatible)
        return {
          makeXRCompatible: async () => {},
          bindFramebuffer() {},
          clearColor() {},
          clear() {},
          getExtension() {
            return null;
          },
        };
      return getContext.call(this, type, options);
    };
    window.XRWebGLLayer = class {
      constructor() {
        this.framebuffer = {};
      }
    };
    const identity = [1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1, 0, 0, 0, 0, 1];
    class Session extends EventTarget {
      renderState = {};
      ended = false;
      updateRenderState(s) {
        this.renderState = s;
      }
      async requestReferenceSpace() {
        return {};
      }
      requestAnimationFrame(cb) {
        if (!this.ended)
          requestAnimationFrame((t) => {
            if (!this.ended)
              cb(t, {
                getViewerPose: () => ({
                  views: [
                    {
                      projectionMatrix: [
                        1,
                        0,
                        0,
                        0,
                        0,
                        1,
                        0,
                        0,
                        0,
                        0,
                        -11 / 9,
                        -1,
                        0,
                        0,
                        -20 / 9,
                        0,
                      ],
                      transform: { matrix: identity },
                    },
                  ],
                }),
                getDepthInformation: () => ({
                  width: 64,
                  height: 64,
                  normDepthBufferFromNormView: { matrix: identity },
                  getDepthInMeters: (x, y) => {
                    if (!Number.isFinite(x) || !Number.isFinite(y) || x < 0 || x > 1 || y < 0 || y > 1)
                      throw new RangeError("Depth coordinates must be normalized view coordinates.");
                    if (window.depthFailureName)
                      throw new DOMException("Simulated depth failure", window.depthFailureName);
                    return 2;
                  },
                }),
              });
          });
      }
      async end() {
        this.ended = true;
        this.dispatchEvent(new Event("end"));
      }
    }
    Object.defineProperty(navigator, "xr", {
      configurable: true,
      value: { requestSession: async () => new Session() },
    });
  });
}

test("simulated WebXR depth frames save a reloadable point cloud", async ({ page }) => {
  await fakeDepthCapture(page);
  await openRoom(page);
  await openViewer(page);
  await page.getByRole("button", { name: "Scan with camera" }).click();
  await expect(page.locator("[data-progress]")).toContainText(
    "depth points captured",
  );
  await page.getByRole("button", { name: "Finish scan", exact: true }).click();
  await expect(page.locator(".scan-status")).toContainText(
    "Loaded Camera depth scan",
  );
  await page.getByRole("button", { name: "Close scan" }).click();
  await page.reload();
  await openViewer(page);
  await expect(page.locator(".scan-status")).toContainText(
    "Loaded Camera depth scan",
  );
});

test("depth failures explain recovery and keep the existing scan and its markers", async ({ page }) => {
  await fakeDepthCapture(page);
  await openRoom(page);
  await openViewer(page);
  await importScan(page);
  await place(page, "item");
  await page.getByRole("textbox", { name: "Item name", exact: true }).fill("Keep these keys");
  await page.getByRole("button", { name: "Save marker" }).click();
  const inventory = await page.evaluate(() => localStorage.getItem("haven-inventory"));
  for (const [name, message] of [
    ["InvalidStateError", "Keep the browser in the foreground"],
    ["NotSupportedError", "cannot provide the depth data needed for room scanning"],
    ["RangeError", "Camera depth capture failed (RangeError)"],
  ]) {
    await page.evaluate((name) => { window.depthFailureName = name; }, name);
    page.once("dialog", (d) => d.accept());
    await page.getByRole("button", { name: "Scan with camera" }).click();
    await expect(page.locator(".scan-status")).toContainText(message);
    await expect(page.locator(".scan-status")).toContainText("The existing scan has not changed");
    expect(await page.evaluate(() => localStorage.getItem("haven-inventory"))).toBe(inventory);
    await expect(page.getByRole("button", { name: "Item marker: Keep these keys", exact: true })).toBeVisible();
  }
  await page.getByRole("button", { name: "Close scan" }).click();
  await page.reload();
  await openViewer(page);
  await expect(page.locator(".scan-status")).toContainText("Loaded room.obj");
  await expect(page.getByRole("button", { name: "Item marker: Keep these keys", exact: true })).toBeVisible();
});
