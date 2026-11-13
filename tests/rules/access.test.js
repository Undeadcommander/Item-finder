import { test, before, after } from "node:test";
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
} from "firebase/firestore";
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
