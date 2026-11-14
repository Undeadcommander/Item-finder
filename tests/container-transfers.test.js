import { test } from "node:test";
import assert from "node:assert/strict";
import { initialState, createIndex, validState } from "../src/store.js";
import { transferContainer } from "../src/scan-data.js";

function fixture() {
  const state = initialState();
  for (const [id, parentId, name] of [
    ["office", null, "Office"],
    ["cabinet", "living-room", "Cabinet"],
    ["drawer", "cabinet", "Drawer"],
    ["box", "drawer", "Box"],
    ["shelf", "living-room", "Shelf"],
    ["closet", "office", "Closet"],
  ]) state.locations.push({ id, parentId, name, description: "", color: "sage" });
  state.items = [
    { id: "keys", locationId: "box", name: "Keys", notes: "Spare keys" },
    { id: "book", locationId: "cabinet", name: "Book", notes: "" },
    { id: "lamp", locationId: "living-room", name: "Lamp", notes: "" },
  ];
  state.scans = ["living-room", "cabinet", "drawer"].map((locationId) => ({
    id: `scan-${locationId}`, assetId: `asset-${locationId}`, locationId,
    name: "scan.obj", format: "obj",
  }));
  state.markers = [
    ["external-container", "living-room", "container", "cabinet"],
    ["external-nested", "living-room", "container", "box"],
    ["external-item", "living-room", "item", "keys"],
    ["unrelated", "living-room", "item", "lamp"],
    ["internal-container", "cabinet", "container", "drawer"],
    ["internal-item", "cabinet", "item", "book"],
    ["internal-nested-item", "drawer", "item", "keys"],
  ].map(([id, scan, kind, targetId]) => ({
    id, scanId: `scan-${scan}`, kind, targetId, position: [1, 2, 3],
  }));
  return state;
}

test("container moves preserve the subtree and scans, clear external pins, and rebuild paths and counts", () => {
  for (const destination of ["office", "shelf", "closet"]) {
    const state = fixture();
    const snapshot = structuredClone(state);
    const next = transferContainer(state, "cabinet", destination);
    assert.equal(validState(next), true);
    assert.deepEqual(state, snapshot, "the input inventory is not mutated");
    assert.deepEqual(next.items, state.items);
    assert.deepEqual(next.scans, state.scans);
    assert.deepEqual(next.locations.filter((l) => l.id !== "cabinet"),
      state.locations.filter((l) => l.id !== "cabinet"));
    assert.deepEqual(next.markers.map((m) => m.id), [
      "unrelated", "internal-container", "internal-item", "internal-nested-item",
    ]);
    const index = createIndex(next);
    assert.equal(index.path("box"), `${index.path(destination)} / Cabinet / Drawer / Box`);
    assert.equal(index.search.find((i) => i.id === "keys").path, index.path("box"));
    assert.equal(index.summaries.get("living-room").count, destination === "shelf" ? 3 : 1);
    assert.equal(index.summaries.get("office").count, destination === "shelf" ? 0 : 2);
    assert.equal(validState(JSON.parse(JSON.stringify(next))), true);
  }
});

test("moving out of a nested container into an ancestor is allowed", () => {
  const next = transferContainer(fixture(), "box", "living-room");
  assert.equal(validState(next), true);
  assert.equal(createIndex(next).path("box"), "Living room / Box");
  assert.equal(next.items.find((i) => i.id === "keys").locationId, "box");
  assert.ok(!next.markers.some((m) => m.targetId === "keys" || m.targetId === "box"));
});

test("cycles, missing destinations, and moving rooms are rejected; unchanged moves preserve pins", () => {
  const state = fixture();
  for (const destination of ["cabinet", "drawer", "box"])
    assert.throws(() => transferContainer(state, "cabinet", destination), /itself or anything inside/);
  for (const destination of ["missing", null])
    assert.throws(() => transferContainer(state, "cabinet", destination), /existing destination/);
  assert.throws(() => transferContainer(state, "missing", "office"), /no longer exists/);
  assert.throws(() => transferContainer(state, "living-room", "office"), /Choose a container/);
  assert.equal(transferContainer(state, "cabinet", "living-room"), state);
  assert.equal(validState(state), true);
});
