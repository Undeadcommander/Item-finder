import test from "node:test";
import assert from "node:assert/strict";
import { initialState, validState } from "../src/store.js";
import { encodeInventory, decodeInventory } from "../src/firestore-inventory.js";

test("location images validate and survive account snapshot encoding", () => {
  const state = initialState();
  assert.equal(validState(state), true);
  for (const image of [null, "bedroom", "box", "data:image/jpeg;base64,/9j/AA=="]) {
    state.locations[0].image = image;
    assert.equal(validState(state), true);
    const payloads = encodeInventory(state);
    assert.deepEqual(decodeInventory({ chunkCount: payloads.length, snapshotId: "test" },
      payloads.map((payload, index) => ({ payload, index, snapshotId: "test" }))), state);
  }
  for (const image of ["unknown", "https://example.com/photo.jpg", 'data:image/svg+xml,<svg/>', {}, "data:image/jpeg;base64," + "a".repeat(180_000)]) {
    state.locations[0].image = image;
    assert.equal(validState(state), false);
  }
});
