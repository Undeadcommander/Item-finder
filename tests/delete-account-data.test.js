import { test } from "node:test";
import assert from "node:assert/strict";
import { deleteAccountData } from "../src/delete-account-data.js";

test("deletion drains every chunk batch before deleting the profile and identity", async () => {
  const calls = [], pages = [["current", "previous"], ["orphan"], []];
  await deleteAccountData({
    markDeleting: async () => calls.push("pause"),
    listChunks: async () => pages.shift(),
    deleteChunks: async (chunks) => calls.push(...chunks),
    deleteRecord: async () => calls.push("profile"),
    deleteIdentity: async () => calls.push("identity"),
  });
  assert.deepEqual(calls, ["pause", "current", "previous", "orphan", "profile", "identity"]);
});

for (const phase of ["markDeleting", "listChunks", "deleteChunks", "deleteRecord"]) {
  test(`a ${phase} failure never deletes authentication or claims success`, async () => {
    let identities = 0;
    const operations = {
      markDeleting: async () => {}, listChunks: async () => ["chunk"],
      deleteChunks: async () => {}, deleteRecord: async () => {},
      deleteIdentity: async () => identities++,
    };
    // Avoid an endless list when testing a failure at the final record deletion.
    if (phase === "deleteRecord") operations.listChunks = async () => [];
    operations[phase] = async () => { throw Error("Offline"); };
    await assert.rejects(deleteAccountData(operations), /Offline/);
    assert.equal(identities, 0);
  });
}
