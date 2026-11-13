// Inventory metadata stays small; binary room scans live in IndexedDB.
export function pruneScanLinks(state) {
  const locations = new Map(state.locations.map((l) => [l.id, l]));
  const items = new Map(state.items.map((i) => [i.id, i]));
  const scans = (state.scans || []).filter((s) => locations.has(s.locationId));
  const byId = new Map(scans.map((s) => [s.id, s]));
  const belongs = (id, ancestor) => {
    const seen = new Set();
    while (id && !seen.has(id)) {
      if (id === ancestor) return true;
      seen.add(id);
      id = locations.get(id)?.parentId;
    }
    return false;
  };
  const markers = (state.markers || []).filter((m) => {
    const scan = byId.get(m.scanId);
    const location =
      m.kind === "item"
        ? items.get(m.targetId)?.locationId
        : locations.get(m.targetId)?.id;
    return (
      scan &&
      location &&
      belongs(location, scan.locationId) &&
      (m.kind !== "container" || location !== scan.locationId)
    );
  });
  return { ...state, scans, markers };
}
export function transferItem(state, id, locationId) {
  if (!state.locations.some((l) => l.id === locationId))
    throw Error("Choose an existing destination.");
  const item = state.items.find((i) => i.id === id);
  if (!item) throw Error("This item no longer exists.");
  if (item.locationId === locationId) return state;
  return {
    ...state,
    items: state.items.map((i) => (i.id === id ? { ...i, locationId } : i)),
    markers: (state.markers || []).filter(
      (m) => !(m.kind === "item" && m.targetId === id),
    ),
  };
}
export function validScanData(state) {
  if (state.scans !== undefined && !Array.isArray(state.scans)) return false;
  if (state.markers !== undefined && !Array.isArray(state.markers))
    return false;
  const scans = state.scans || [],
    markers = state.markers || [];
  if (
    new Set(scans.map((s) => s?.id)).size !== scans.length ||
    new Set(scans.map((s) => s?.locationId)).size !== scans.length ||
    new Set(markers.map((m) => m?.id)).size !== markers.length
  )
    return false;
  if (
    !scans.every(
      (s) =>
        s &&
        typeof s.id === "string" &&
        typeof s.assetId === "string" &&
        typeof s.name === "string" &&
        typeof s.locationId === "string" &&
        ["glb", "obj", "points"].includes(s.format),
    )
  )
    return false;
  if (
    !markers.every(
      (m) =>
        m &&
        typeof m.id === "string" &&
        typeof m.scanId === "string" &&
        typeof m.targetId === "string" &&
        ["item", "container"].includes(m.kind) &&
        Array.isArray(m.position) &&
        m.position.length === 3 &&
        m.position.every(Number.isFinite),
    )
  )
    return false;
  const clean = pruneScanLinks(state);
  return (
    clean.scans.length === scans.length &&
    clean.markers.length === markers.length
  );
}
