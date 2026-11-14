// Only drags started in this inventory may move records. External text/files
// and cross-tab payloads are never interpreted as inventory commands.
export function setupInventoryDrag(root, { getState, getIndex, onMove }) {
  let source = null;
  const destination = (event) => event.target.closest?.("[data-drop-location]");
  const allowed = (target) => source && target &&
    getIndex().byId.has(target.dataset.dropLocation) &&
    target.dataset.dropLocation !== source.parentId &&
    !source.excluded.has(target.dataset.dropLocation);
  function clear() {
    source = null;
    root.classList.remove("inventory-dragging");
    root.querySelectorAll(".drag-source, .drop-ready, .drop-over").forEach((el) =>
      el.classList.remove("drag-source", "drop-ready", "drop-over"),
    );
  }
  root.addEventListener("dragstart", (event) => {
    const element = event.target.closest?.("[data-drag-kind]");
    if (!element || !event.dataTransfer) return;
    const { dragKind: kind, dragId: id } = element.dataset;
    const state = getState();
    const record = kind === "container"
      ? state.locations.find((l) => l.id === id && l.parentId !== null)
      : state.items.find((i) => i.id === id);
    if (!record) { event.preventDefault(); return; }
    const excluded = new Set();
    if (kind === "container") {
      const stack = [id], index = getIndex();
      while (stack.length) {
        const next = stack.pop();
        if (excluded.has(next)) continue;
        excluded.add(next);
        for (const child of index.children.get(next) || []) stack.push(child.id);
      }
    }
    source = { kind, id, parentId: kind === "container" ? record.parentId : record.locationId, excluded };
    event.dataTransfer.effectAllowed = "move";
    event.dataTransfer.setData("application/x-haven-inventory", JSON.stringify({ kind, id }));
    element.classList.add("drag-source");
    root.classList.add("inventory-dragging");
    root.querySelectorAll("[data-drop-location]").forEach((target) =>
      target.classList.toggle("drop-ready", Boolean(allowed(target))),
    );
  });
  root.addEventListener("dragover", (event) => {
    if (!source) return;
    const target = destination(event);
    root.querySelectorAll(".drop-over").forEach((el) => {
      if (el !== target) el.classList.remove("drop-over");
    });
    if (!allowed(target)) {
      event.dataTransfer.dropEffect = "none";
      return;
    }
    event.preventDefault();
    event.dataTransfer.dropEffect = "move";
    target.classList.add("drop-over");
  });
  root.addEventListener("dragleave", (event) => {
    const target = destination(event);
    if (target && !target.contains(event.relatedTarget)) target.classList.remove("drop-over");
  });
  root.addEventListener("drop", (event) => {
    if (!source) return;
    const target = destination(event), moving = source;
    const accepted = allowed(target);
    event.preventDefault();
    clear();
    if (accepted) onMove(moving.kind, moving.id, target.dataset.dropLocation);
  });
  document.addEventListener("dragend", clear);
  window.addEventListener("blur", clear);
  return clear;
}
