import {
  doc, collection, query, limit, getDocsFromServer, deleteDoc,
  runTransaction, writeBatch, serverTimestamp,
} from "firebase/firestore";
import { deleteAccountData, isDeletingRecord } from "./delete-account-data.js";

export async function removeFirestoreAccount(db, uid, { assertOwner, deleteIdentity }) {
  const reference = doc(db, "users", uid);
  await deleteAccountData({
    markDeleting: () => runTransaction(db, async (tx) => {
      assertOwner();
      const snapshot = await tx.get(reference), record = snapshot.data();
      if (isDeletingRecord(record)) return;
      // Existing rules allow this revision marker; active clients stop syncing it.
      tx.set(reference, {
        revision: (record?.revision || 0) + 1,
        snapshotId: `deleting-${crypto.randomUUID()}`,
        chunkCount: 1,
        previous: record
          ? { snapshotId: record.snapshotId, chunkCount: record.chunkCount }
          : null,
        updatedAt: serverTimestamp(),
      });
    }),
    listChunks: async () => {
      assertOwner();
      return (await getDocsFromServer(
        query(collection(db, "users", uid, "chunks"), limit(400)),
      )).docs;
    },
    deleteChunks: async (chunks) => {
      assertOwner();
      const batch = writeBatch(db);
      chunks.forEach((chunk) => batch.delete(chunk.ref));
      await batch.commit();
    },
    deleteRecord: () => { assertOwner(); return deleteDoc(reference); },
    deleteIdentity: () => { assertOwner(); return deleteIdentity(); },
  });
}
