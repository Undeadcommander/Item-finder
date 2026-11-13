import { test, before, after } from "node:test";
import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import {
  doc,
  setDoc,
  getDoc,
  writeBatch,
  serverTimestamp,
  collection,
  getDocs,
  deleteDoc,
} from "firebase/firestore";
import { removeFirestoreAccount } from "../../src/firestore-delete-account.js";
let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-haven",
    firestore: { rules: await readFile("firebase/firestore.rules", "utf8") },
  });
});
after(async () => environment?.cleanup());
function snapshot(db, uid, revision, id, previous) {
  const batch = writeBatch(db);
  batch.set(doc(db, "users", uid), {
    revision,
    snapshotId: id,
    chunkCount: 1,
    previous,
    updatedAt: serverTimestamp(),
  });
  batch.set(doc(db, "users", uid, "chunks", `${id}-0`), {
    snapshotId: id,
    index: 0,
    payload: '{"version":1,"locations":[],"items":[]}',
  });
  return batch.commit();
}
test("account snapshots commit atomically and other users cannot read or write them", async () => {
  const alice = environment.authenticatedContext("alice").firestore(),
    bob = environment.authenticatedContext("bob").firestore(),
    guest = environment.unauthenticatedContext().firestore();
  await assertSucceeds(snapshot(alice, "alice", 1, "first", null));
  await assertSucceeds(getDoc(doc(alice, "users", "alice")));
  await assertSucceeds(
    getDoc(doc(alice, "users", "alice", "chunks", "first-0")),
  );
  await assertFails(getDoc(doc(bob, "users", "alice")));
  await assertFails(getDoc(doc(guest, "users", "alice")));
  await assertFails(getDoc(doc(bob, "users", "alice", "chunks", "first-0")));
  await assertFails(getDoc(doc(guest, "users", "alice", "chunks", "first-0")));
  await assertFails(
    snapshot(bob, "alice", 2, "second", { snapshotId: "first", chunkCount: 1 }),
  );
  await assertFails(
    snapshot(guest, "alice", 2, "second", {
      snapshotId: "first",
      chunkCount: 1,
    }),
  );
  await assertFails(snapshot(alice, "alice", 1, "stale", null));
  await assertSucceeds(
    snapshot(alice, "alice", 2, "second", {
      snapshotId: "first",
      chunkCount: 1,
    }),
  );
});
test("chunks are immutable and must belong to the committed account snapshot", async () => {
  const db = environment.authenticatedContext("owner").firestore();
  await assertSucceeds(snapshot(db, "owner", 1, "original", null));
  await assertFails(
    setDoc(doc(db, "users", "owner", "chunks", "original-0"), {
      snapshotId: "original",
      index: 0,
      payload: "changed",
    }),
  );
  await assertFails(
    setDoc(doc(db, "users", "owner", "chunks", "uncommitted-0"), {
      snapshotId: "uncommitted",
      index: 0,
      payload: "{}",
    }),
  );
  await assertFails(
    setDoc(doc(db, "users", "owner", "chunks", "original-1"), {
      snapshotId: "original",
      index: 1,
      payload: "{}",
    }),
  );
});

test('a maximum-sized snapshot can commit without exceeding rule access limits',async()=>{
 const db=environment.authenticatedContext('many-chunks').firestore(),batch=writeBatch(db);
 batch.set(doc(db,'users','many-chunks'),{revision:1,snapshotId:'large',chunkCount:64,previous:null,updatedAt:serverTimestamp()});
 for(let index=0;index<64;index++)batch.set(doc(db,'users','many-chunks','chunks',`large-${index}`),{snapshotId:'large',index,payload:'{}'});
 await assertSucceeds(batch.commit());
});

test("account deletion removes current, previous, and orphan chunks with the existing owner rules", async () => {
  const uid = "delete-owner", db = environment.authenticatedContext(uid).firestore();
  await snapshot(db, uid, 1, "first-delete", null);
  await snapshot(db, uid, 2, "second-delete", { snapshotId: "first-delete", chunkCount: 1 });
  await environment.withSecurityRulesDisabled(async (context) => {
    // More than one batch, including historical chunks not referenced by the profile.
    const admin = context.firestore(), batch = writeBatch(admin);
    for (let i = 0; i < 401; i++) batch.set(doc(admin, "users", uid, "chunks", `orphan-${i}`), { payload: "old" });
    await batch.commit();
  });
  let deletedIdentity = false;
  await removeFirestoreAccount(db, uid, {
    assertOwner: () => {},
    deleteIdentity: async () => {
      assert.equal((await getDoc(doc(db, "users", uid))).exists(), false);
      assert.equal((await getDocs(collection(db, "users", uid, "chunks"))).empty, true);
      deletedIdentity = true;
    },
  });
  assert.equal(deletedIdentity, true);
});

test("another user cannot delete an account or its chunks", async () => {
  const uid = "delete-private", owner = environment.authenticatedContext(uid).firestore();
  const other = environment.authenticatedContext("other-delete").firestore();
  await snapshot(owner, uid, 1, "private", null);
  await assertFails(deleteDoc(doc(other, "users", uid)));
  await assertFails(deleteDoc(doc(other, "users", uid, "chunks", "private-0")));
  await assertFails(removeFirestoreAccount(other, uid, {
    assertOwner: () => {},
    deleteIdentity: async () => { throw Error("Must not reach identity deletion"); },
  }));
  await assertSucceeds(getDoc(doc(owner, "users", uid, "chunks", "private-0")));
});
