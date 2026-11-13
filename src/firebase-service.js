import { initializeApp } from "firebase/app";
import {
  getAuth,
  GoogleAuthProvider,
  signInWithPopup,
  onAuthStateChanged,
  signOut,
  setPersistence,
  browserLocalPersistence,
} from "firebase/auth";
import {
  getFirestore,
  doc,
  onSnapshot,
  runTransaction,
  serverTimestamp,
  getDoc,
  writeBatch,
} from "firebase/firestore";
import { encodeInventory, decodeInventory } from "./firestore-inventory.js";

export function friendlyAuthError(error) {
  const messages = {
    "auth/popup-closed-by-user":
      "Sign-in was cancelled. Your inventory has not changed.",
    "auth/popup-blocked":
      "Your browser blocked Google sign-in. Allow pop-ups for this site and try again.",
    "auth/unauthorized-domain":
      "Sign-in is not enabled for this website yet. Your device inventory is still available.",
    "auth/operation-not-allowed":
      "Google sign-in has not been enabled for this app yet.",
    "auth/network-request-failed":
      "Could not connect to Google. Check your connection and try again.",
    "permission-denied":
      "Account access was denied. Please sign in again; your local changes are safe.",
    "resource-exhausted":
      "The free database quota has been reached. Your changes remain saved on this device; retry when the quota resets.",
  };
  return (
    messages[error.code] ||
    "Could not connect to your account. Your changes remain on this device. Please try again."
  );
}
export async function createFirebaseService(config) {
  const app = initializeApp(config),
    auth = getAuth(app),
    db = getFirestore(app);
  await setPersistence(auth, browserLocalPersistence);
  const provider = new GoogleAuthProvider();
  provider.setCustomParameters({ prompt: "select_account" });
  const owned = (uid) => {
    if (!auth.currentUser || auth.currentUser.uid !== uid)
      throw Error("The account changed. Sign in again before syncing.");
  };
  const wrap = async (operation) => {
    try {
      return await operation();
    } catch (error) {
      if (error.code === "sync/conflict") throw error;
      throw Error(
        error.code
          ? friendlyAuthError(error)
          : error.message || "Could not sync your account.",
      );
    }
  };

  return {
    watchAuth: (callback) => onAuthStateChanged(auth, callback),
    login: () => wrap(() => signInWithPopup(auth, provider)),
    logout: () => signOut(auth),
    watch: (uid, onValue, onError) =>
      onSnapshot(
        doc(db, "users", uid),
        { includeMetadataChanges: true },
        (snapshot) => {
          // Do not treat an offline cache miss as a new, empty account.
          if (snapshot.metadata.fromCache) return;
          onValue(snapshot.exists() ? snapshot.data() : null);
        },
        (e) => onError(Error(friendlyAuthError(e))),
      ),
    read: (uid, record) =>
      wrap(async () => {
        owned(uid);
        if (
          !/^[A-Za-z0-9-]+$/.test(record.snapshotId || "") ||
          !Number.isInteger(record.chunkCount) ||
          record.chunkCount < 1 ||
          record.chunkCount > 64
        )
          throw Error("The account snapshot could not be read.");
        const snapshots = await Promise.all(
          Array.from({ length: record.chunkCount }, (_, i) =>
            getDoc(
              doc(db, "users", uid, "chunks", `${record.snapshotId}-${i}`),
            ),
          ),
        );
        return decodeInventory(
          record,
          snapshots.map((s) => (s.exists() ? s.data() : null)),
        );
      }),
    publish: (uid, inventory, revision) =>
      wrap(async () => {
        owned(uid);
        const chunks = encodeInventory(inventory),
          snapshotId = crypto.randomUUID();
        let obsolete = null;
        const result = await runTransaction(db, async (tx) => {
          owned(uid);
          const reference = doc(db, "users", uid),
            snapshot = await tx.get(reference),
            remote = snapshot.exists() ? snapshot.data() : null;
          if ((remote?.revision || 0) !== revision) {
            const error = Error("Another device updated this account.");
            error.code = "sync/conflict";
            error.remote = remote;
            throw error;
          }
          obsolete = remote?.previous || null;
          for (let index = 0; index < chunks.length; index++)
            tx.set(doc(db, "users", uid, "chunks", `${snapshotId}-${index}`), {
              snapshotId,
              index,
              payload: chunks[index],
            });
          tx.set(reference, {
            revision: revision + 1,
            snapshotId,
            chunkCount: chunks.length,
            previous: remote
              ? { snapshotId: remote.snapshotId, chunkCount: remote.chunkCount }
              : null,
            updatedAt: serverTimestamp(),
          });
          return revision + 1;
        });
        if (
          obsolete &&
          /^[A-Za-z0-9-]+$/.test(obsolete.snapshotId) &&
          Number.isInteger(obsolete.chunkCount) &&
          obsolete.chunkCount > 0 &&
          obsolete.chunkCount <= 64
        ) {
          const batch = writeBatch(db);
          for (let i = 0; i < obsolete.chunkCount; i++)
            batch.delete(
              doc(db, "users", uid, "chunks", `${obsolete.snapshotId}-${i}`),
            );
          batch.commit().catch(() => {});
        }
        return result;
      }),
  };
}
