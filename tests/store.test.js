import { test } from "node:test";
import assert from "node:assert/strict";
import {
  initialState,
  validState,
  createIndex,
  descendants,
} from "../src/store.js";
test("nested location indexing and search preserve the exact item path", () => {
  const s = initialState();
  s.locations.push(
    {
      id: "drawer",
      parentId: "living-room",
      name: "Drawer",
      description: "",
      color: "sage",
    },
    {
      id: "box",
      parentId: "drawer",
      name: "Blue box",
      description: "",
      color: "blue",
    },
  );
  s.items.push({
    id: "keys",
    locationId: "box",
    name: "Keys",
    notes: "Spare car keys",
  });
  assert.equal(validState(s), true);
  const idx = createIndex(s);
  assert.equal(idx.search[0].path, "Living room / Drawer / Blue box");
  assert.match(idx.search[0].text, /spare car keys/);
  assert.equal(idx.summaries.get("living-room").count, 1);
  assert.equal(idx.summaries.get("living-room").preview[0].name, "Keys");
  assert.deepEqual([...descendants(idx, "drawer")], ["drawer", "box"]);
});
test("backup validation rejects cycles, orphan items, and duplicate IDs", () => {
  const s = initialState();
  s.locations[0].parentId = "living-room";
  assert.equal(validState(s), false);
  s.locations[0].parentId = null;
  s.items.push({ id: "a", name: "a", notes: "", locationId: "missing" });
  assert.equal(validState(s), false);
  s.items = [];
  s.locations.push({ ...s.locations[0] });
  assert.equal(validState(s), false);
});
