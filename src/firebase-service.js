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
} from "firebase/firestore";
import {
  getStorage,
  ref,
  uploadBytes,
  getBytes,
  getMetadata,
  deleteObject,
} from "firebase/storage";
import { getAsset } from "./scan-storage.js";

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
    "storage/unauthorized":
      "Your account cannot access this file. Please sign in again.",
    "storage/quota-exceeded":
      "Account storage is currently full. Your changes are still saved on this device.",
  };
  return (
    messages[error.code] ||
    "Could not connect to your account. Your changes remain on this device. Please try again."
  );
}
export async function createFirebaseService(config) {
  const app = initializeApp(config),
    auth = getAuth(app),
    db = getFirestore(app),
    storage = getStorage(app);
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
  const uploaded = new Set();
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
        if (!record.inventoryPath?.startsWith(`users/${uid}/inventories/`))
          throw Error("Invalid inventory path.");
        return JSON.parse(
          new TextDecoder().decode(
            await getBytes(ref(storage, record.inventoryPath), 10_000_000),
          ),
        );
      }),
    getScan: (uid, id) =>
      wrap(async () => {
        owned(uid);
        return new Blob(
          [
            await getBytes(
              ref(storage, `users/${uid}/scans/${id}`),
              30_000_000,
            ),
          ],
          { type: "application/octet-stream" },
        );
      }),
    publish: (uid, inventory, revision) =>
      wrap(async () => {
        owned(uid);
        for (const scan of inventory.scans || []) {
          const path = `users/${uid}/scans/${scan.assetId}`;
          if (uploaded.has(path)) continue;
          const target = ref(storage, path);
          try {
            await getMetadata(target);
          } catch (error) {
            if (error.code !== "storage/object-not-found") throw error;
            const blob = await getAsset(scan.assetId, uid);
            if (!blob)
              throw Error(
                "A room scan is missing from this device. Restore it before syncing.",
              );
            owned(uid);
            await uploadBytes(target, blob, {
              contentType: "application/octet-stream",
            });
          }
          uploaded.add(path);
        }
        const blob = new Blob([JSON.stringify(inventory)], {
          type: "application/json",
        });
        if (blob.size > 10_000_000)
          throw Error(
            "This inventory exceeds the 10 MB account limit. Export a backup before reducing its size.",
          );
        const inventoryPath = `users/${uid}/inventories/${crypto.randomUUID()}.json`,
          target = ref(storage, inventoryPath);
        owned(uid);
        await uploadBytes(target, blob, { contentType: "application/json" });
        try {
          let obsoletePath = null;
          const next = await runTransaction(db, async (tx) => {
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
            obsoletePath = remote?.previousPath || null;
            tx.set(reference, {
              revision: revision + 1,
              inventoryPath,
              previousPath: remote?.inventoryPath || null,
              updatedAt: serverTimestamp(),
            });
            return revision + 1;
          });
          // Keep the immediate previous snapshot; older metadata snapshots are disposable.
          if (obsoletePath?.startsWith(`users/${uid}/inventories/`))
            deleteObject(ref(storage, obsoletePath)).catch(() => {});
          return next;
        } catch (error) {
          await deleteObject(target).catch(() => {});
          throw error;
        }
      }),
  };
}
