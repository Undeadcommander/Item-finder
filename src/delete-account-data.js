export const deletionKey = (uid) => `haven-deleting:${uid}`;
export const isDeletingRecord = (record) => record?.snapshotId?.startsWith("deleting-");

// Keep authentication until private documents are gone. Failed attempts are retryable.
export async function deleteAccountData({ markDeleting, listChunks, deleteChunks, deleteRecord, deleteIdentity }) {
  await markDeleting();
  for (;;) {
    const chunks = await listChunks();
    if (!chunks.length) break;
    await deleteChunks(chunks);
  }
  await deleteRecord();
  await deleteIdentity();
}
