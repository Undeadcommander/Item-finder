let database;
function open() {
  if (!database)
    database = new Promise((resolve, reject) => {
      const req = indexedDB.open("haven-room-scans", 1);
      req.onupgradeneeded = () => req.result.createObjectStore("assets");
      req.onsuccess = () => resolve(req.result);
      req.onerror = () =>
        reject(
          Error(
            "Scan storage is unavailable. Allow browser storage and try again.",
          ),
        );
    }).catch((error) => {
      database = null;
      throw error;
    });
  return database;
}
async function transaction(mode, operation) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const tx = db.transaction("assets", mode),
      request = operation(tx.objectStore("assets"));
    tx.oncomplete = () => resolve(request?.result);
    tx.onerror = tx.onabort = () =>
      reject(
        Error(
          "Could not save the scan. Browser storage may be full or unavailable.",
        ),
      );
  });
}
export const getAsset = (id) => transaction("readonly", (s) => s.get(id));
export const putAsset = (id, blob) =>
  transaction("readwrite", (s) => s.put(blob, id));
export const deleteAsset = (id) =>
  transaction("readwrite", (s) => s.delete(id));
const toDataURL = (blob) =>
  new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(reader.result);
    reader.onerror = reject;
    reader.readAsDataURL(blob);
  });
export async function createBackup(inventory) {
  const assets = [];
  for (const scan of inventory.scans || []) {
    const blob = await getAsset(scan.assetId);
    if (!blob)
      throw Error(
        `The scan “${scan.name}” is missing. Re-import it or remove it before exporting a full backup.`,
      );
    assets.push({ id: scan.assetId, data: await toDataURL(blob) });
  }
  return { format: "haven-backup", version: 2, inventory, assets };
}
// Stage under new IDs so a failed restore never overwrites the active inventory's files.
export async function stageBackup(backup) {
  const inventory = structuredClone(backup.inventory),
    created = [];
  try {
    for (const scan of inventory.scans || []) {
      const asset = backup.assets.find((a) => a.id === scan.assetId);
      if (!asset || !/^data:[\w/+.-]*;base64,[A-Za-z0-9+/=]*$/.test(asset.data))
        throw Error("A scan file is missing or invalid in this backup.");
      const encoded = asset.data.slice(asset.data.indexOf(",") + 1);
      if (encoded.length > 45_000_000)
        throw Error("A scan in this backup exceeds the 30 MB limit.");
      const bytes = Uint8Array.from(atob(encoded), (c) => c.charCodeAt(0));
      if (bytes.byteLength > 30_000_000)
        throw Error("A scan in this backup is too large.");
      scan.assetId = crypto.randomUUID();
      await putAsset(scan.assetId, new Blob([bytes]));
      created.push(scan.assetId);
    }
    return { inventory, rollback: () => Promise.all(created.map(deleteAsset)) };
  } catch (error) {
    await Promise.all(created.map(deleteAsset));
    throw error;
  }
}
