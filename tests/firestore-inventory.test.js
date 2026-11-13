import { test } from "node:test";
import assert from "node:assert/strict";
import {
  encodeInventory,
  decodeInventory,
} from "../src/firestore-inventory.js";
test("large Unicode inventories round trip through bounded Firestore chunks", () => {
  const inventory = {
    version: 1,
    locations: [],
    items: Array.from({ length: 1500 }, (_, i) => ({
      id: String(i),
      name: "📦".repeat(100),
      notes: "本棚",
      locationId: "room",
    })),
  };
  const strings = encodeInventory(inventory);
  assert.ok(strings.length > 1);
  for (const s of strings) {
    assert.ok(new TextEncoder().encode(s).byteLength < 640000);
    assert.equal(new TextDecoder().decode(new TextEncoder().encode(s)),s);
  }
  assert.deepEqual(
    decodeInventory(
      { snapshotId: "sample", chunkCount: strings.length },
      strings.map((payload, index) => ({
        snapshotId: "sample",
        index,
        payload,
      })),
    ),
    inventory,
  );
});
test("incomplete or mixed snapshots are rejected", () => {
  assert.throws(() =>
    decodeInventory({ snapshotId: "one", chunkCount: 2 }, [
      { snapshotId: "one", index: 0, payload: "{}" },
    ]),
  );
  assert.throws(() =>
    decodeInventory({ snapshotId: "one", chunkCount: 1 }, [
      { snapshotId: "two", index: 0, payload: "{}" },
    ]),
  );
});
