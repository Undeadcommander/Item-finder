// Firestore documents are capped at 1 MiB. Small JSON chunks keep large inventories
// below that limit without putting binary 3D models in the database.
export function encodeInventory(inventory) {
  const text = JSON.stringify(inventory);
  if (new TextEncoder().encode(text).byteLength > 10_000_000)
    throw Error(
      "This account inventory exceeds 10 MB. Export a backup before reducing its size.",
    );
  const chunks = [];
  for (let i = 0; i < text.length;) {
    let end = Math.min(i + 160_000, text.length);
    // Firestore encodes each chunk independently as UTF-8; do not split an emoji.
    const last = text.charCodeAt(end - 1), next = text.charCodeAt(end);
    if (last >= 0xD800 && last <= 0xDBFF && next >= 0xDC00 && next <= 0xDFFF) end--;
    chunks.push(text.slice(i, end));i=end;
  }
  if (chunks.length > 64)
    throw Error("This inventory has too many chunks to sync.");
  return chunks;
}
export function decodeInventory(record, chunks) {
  if (
    !Number.isInteger(record.chunkCount) ||
    record.chunkCount < 1 ||
    record.chunkCount > 64 ||
    chunks.length !== record.chunkCount
  )
    throw Error("The account snapshot is incomplete. Please retry sync.");
  for (let i = 0; i < chunks.length; i++)
    if (
      !chunks[i] ||
      chunks[i].index !== i ||
      chunks[i].snapshotId !== record.snapshotId ||
      typeof chunks[i].payload !== "string"
    )
      throw Error("The account snapshot is incomplete. Please retry sync.");
  return JSON.parse(chunks.map((c) => c.payload).join(""));
}
