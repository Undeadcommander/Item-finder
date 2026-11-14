import { validLocationImage, validItemImage } from "./location-images.js";
import { validScanData } from "./scan-data.js";
export function initialState() {
  return {
    version: 1,
    locations: [
      {
        id: "living-room",
        parentId: null,
        name: "Living room",
        description:
          "The heart of the home. Keep track of the little things that make it yours.",
        color: "sage",
      },
    ],
    items: [],
  };
}
export function validState(s) {
  if (
    !s ||
    s.version !== 1 ||
    !Array.isArray(s.locations) ||
    !Array.isArray(s.items)
  )
    return false;
  if (
    !s.locations.every((l) => l && typeof l === "object") ||
    !s.items.every((i) => i && typeof i === "object")
  )
    return false;
  const ids = new Set(s.locations.map((l) => l.id));
  if (ids.size !== s.locations.length) return false;
  const byId = new Map(s.locations.map((l) => [l.id, l]));
  for (const l of s.locations) {
    if (
      !validLocationImage(l.image) ||
      typeof l.id !== "string" ||
      typeof l.name !== "string" ||
      typeof l.description !== "string" ||
      !["sage", "sand", "blue", "rose"].includes(l.color)
    )
      return false;
    const seen = new Set([l.id]);
    let p = l.parentId;
    while (p !== null) {
      if (!ids.has(p) || seen.has(p)) return false;
      seen.add(p);
      p = byId.get(p).parentId;
    }
  }
  return (
    validScanData(s) &&
    new Set(s.items.map((i) => i.id)).size === s.items.length &&
    s.items.every(
      (i) =>
        validItemImage(i.image) &&
        typeof i.id === "string" &&
        typeof i.name === "string" &&
        typeof i.notes === "string" &&
        (i.color === undefined || ["sage", "sand", "blue", "rose"].includes(i.color)) &&
        ids.has(i.locationId),
    )
  );
}
export function createIndex(state) {
  const byId = new Map(state.locations.map((l) => [l.id, l]));
  const children = new Map(),
    items = new Map();
  for (const l of state.locations) {
    if (!children.has(l.parentId)) children.set(l.parentId, []);
    children.get(l.parentId).push(l);
  }
  for (const i of state.items) {
    if (!items.has(i.locationId)) items.set(i.locationId, []);
    items.get(i.locationId).push(i);
  }
  const paths = new Map();
  function path(id) {
    if (paths.has(id)) return paths.get(id);
    const parts = [];
    let cur = byId.get(id);
    while (cur) {
      parts.push(cur.name);
      cur = byId.get(cur.parentId);
    }
    const value = parts.reverse().join(" / ");
    paths.set(id, value);
    return value;
  }
  const search = state.items.map((i) => ({
    ...i,
    path: path(i.locationId),
    text: `${i.name} ${i.notes} ${path(i.locationId)}`.toLowerCase(),
  }));
  const summaries = new Map(),
    order = [],
    stack = [...(children.get(null) || [])];
  while (stack.length) {
    const l = stack.pop();
    order.push(l);
    stack.push(...(children.get(l.id) || []));
  }
  for (let n = order.length - 1; n >= 0; n--) {
    const l = order[n],
      direct = items.get(l.id) || [];
    let count = direct.length;
    const preview = direct.slice(0, 3);
    for (const child of children.get(l.id) || []) {
      const summary = summaries.get(child.id);
      count += summary.count;
      preview.push(...summary.preview.slice(0, 3 - preview.length));
    }
    summaries.set(l.id, { count, preview });
  }
  return { byId, children, items, path, search, summaries };
}
export function descendants(index, id) {
  const found = new Set(),
    stack = [id];
  while (stack.length) {
    const cur = stack.pop();
    found.add(cur);
    for (const c of index.children.get(cur) || []) stack.push(c.id);
  }
  return found;
}
