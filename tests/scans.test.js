import { test } from "node:test";
import assert from "node:assert/strict";
import { Matrix4 } from "three";
import { initialState, validState } from "../src/store.js";
import { pruneScanLinks, transferItem } from "../src/scan-data.js";
import { depthPoint } from "../src/capture-depth.js";
function fixture() {
  const s = initialState();
  s.locations.push(
    {
      id: "other",
      parentId: null,
      name: "Kitchen",
      description: "",
      color: "sage",
    },
    {
      id: "drawer",
      parentId: "living-room",
      name: "Drawer",
      description: "",
      color: "sage",
    },
  );
  s.items.push({ id: "keys", name: "Keys", notes: "", locationId: "drawer" });
  s.scans = [
    {
      id: "scan",
      assetId: "asset",
      locationId: "living-room",
      name: "room.obj",
      format: "obj",
    },
  ];
  s.markers = [
    {
      id: "pin",
      scanId: "scan",
      kind: "item",
      targetId: "keys",
      position: [0, 0, 0],
    },
    {
      id: "container-pin",
      scanId: "scan",
      kind: "container",
      targetId: "drawer",
      position: [1, 0, 0],
    },
  ];
  return s;
}
test("old inventories remain valid; malformed and dangling scan references are rejected", () => {
  assert.equal(validState(initialState()), true);
  const s = fixture();
  assert.equal(validState(s), true);
  s.markers[0].position = [Infinity, 0, 0];
  assert.equal(validState(s), false);
  s.markers[0].position = [0, 0, 0];
  s.markers[0].targetId = "missing";
  assert.equal(validState(s), false);
  assert.equal(validState({ ...initialState(), locations: [null] }), false);
});
test("moving an item changes its location and clears old coordinates without deleting container markers", () => {
  const s = fixture(),
    next = transferItem(s, "keys", "other");
  assert.equal(next.items[0].locationId, "other");
  assert.equal(next.markers.length, 1);
  assert.equal(next.markers[0].kind, "container");
  assert.equal(s.items[0].locationId, "drawer");
  assert.throws(() => transferItem(s, "keys", "missing"));
  assert.equal(transferItem(s, "keys", "drawer"), s);
});
test("deleting a subtree removes its scan and linked markers without affecting inventory elsewhere", () => {
  const s = fixture();
  s.locations = s.locations.filter((l) => l.id !== "drawer");
  s.items = [];
  const pruned = pruneScanLinks(s);
  assert.equal(pruned.scans.length, 1);
  assert.equal(pruned.markers.length, 0);
  s.locations = s.locations.filter((l) => l.id !== "living-room");
  assert.equal(pruneScanLinks(s).scans.length, 0);
});
test("camera depth projects a center sample into world coordinates", () => {
  const projection = new Matrix4()
      .makePerspective(-1, 1, 1, -1, 1, 10)
      .invert(),
    transform = new Matrix4().makeTranslation(5, 1, 0);
  const point = depthPoint(0.5, 0.5, 2, new Matrix4(), projection, transform);
  assert.ok(Math.abs(point.x - 5) < 1e-8);
  assert.ok(Math.abs(point.y - 1) < 1e-8);
  assert.ok(Math.abs(point.z + 2) < 1e-8);
});
