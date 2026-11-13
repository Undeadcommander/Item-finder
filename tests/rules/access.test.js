import { test, before, after } from "node:test";
import { readFile } from "node:fs/promises";
import {
  initializeTestEnvironment,
  assertSucceeds,
  assertFails,
} from "@firebase/rules-unit-testing";
import { doc, setDoc, getDoc, serverTimestamp } from "firebase/firestore";
import { ref, uploadBytes, getBytes } from "firebase/storage";
let environment;
before(async () => {
  environment = await initializeTestEnvironment({
    projectId: "demo-haven",
    firestore: { rules: await readFile("firebase/firestore.rules", "utf8") },
    storage: { rules: await readFile("firebase/storage.rules", "utf8") },
  });
});
after(async () => environment?.cleanup());
test("inventory metadata is private and revisions cannot be overwritten", async () => {
  const alice = environment.authenticatedContext("alice").firestore(),
    bob = environment.authenticatedContext("bob").firestore(),
    guest = environment.unauthenticatedContext().firestore();
  const data = {
    revision: 1,
    inventoryPath: "users/alice/inventories/first.json",
    previousPath: null,
    updatedAt: serverTimestamp(),
  };
  await assertSucceeds(setDoc(doc(alice, "users", "alice"), data));
  await assertSucceeds(getDoc(doc(alice, "users", "alice")));
  await assertFails(getDoc(doc(bob, "users", "alice")));
  await assertFails(getDoc(doc(guest, "users", "alice")));
  await assertFails(setDoc(doc(bob, "users", "alice"), data));
  await assertFails(setDoc(doc(alice, "users", "alice"), data));
  await assertSucceeds(
    setDoc(doc(alice, "users", "alice"), {
      ...data,
      revision: 2,
      inventoryPath: "users/alice/inventories/second.json",
      previousPath: data.inventoryPath,
    }),
  );
  await assertFails(
    setDoc(doc(alice, "users", "alice"), {
      ...data,
      revision: 3,
      inventoryPath: "users/bob/inventories/private.json",
      previousPath: "users/alice/inventories/second.json",
    }),
  );
});
test("scan blobs are private and immutable", async () => {
  const alice = environment.authenticatedContext("alice").storage(),
    bob = environment.authenticatedContext("bob").storage(),
    guest = environment.unauthenticatedContext().storage();
  const path = "users/alice/scans/scan1",
    bytes = new Uint8Array([1, 2, 3]);
  await assertSucceeds(
    uploadBytes(ref(alice, path), bytes, {
      contentType: "application/octet-stream",
    }),
  );
  await assertSucceeds(getBytes(ref(alice, path)));
  await assertFails(getBytes(ref(bob, path)));
  await assertFails(getBytes(ref(guest, path)));
  await assertFails(uploadBytes(ref(bob, path), bytes));
  await assertFails(
    uploadBytes(ref(alice, path), bytes, {
      contentType: "application/octet-stream",
    }),
  );
  await assertFails(
    uploadBytes(ref(alice, "users/alice/scans/wrongtype"), bytes, {
      contentType: "text/html",
    }),
  );
  await assertSucceeds(
    uploadBytes(
      ref(alice, "users/alice/inventories/snapshot.json"),
      new TextEncoder().encode("{}"),
      { contentType: "application/json" },
    ),
  );
});
