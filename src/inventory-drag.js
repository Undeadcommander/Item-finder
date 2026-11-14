// Only drags started in this inventory may move records. External text/files
// and cross-tab payloads are never interpreted as inventory commands.
export function setupInventoryDrag(root, { getState, getIndex, onMove }) {
  let source = null;
  const destination = (event) => {
    const target = event.target.closest?.("[data-drop-location]");
    return target && root.contains(target) ? target : null;
  };
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
    clear();
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
    // Use the browser-owned drag image. A separate DOM preview can outlive
    // an interrupted native drag and appear frozen over the application.
    element.classList.add("drag-source");
    root.classList.add("inventory-dragging");
    root.querySelectorAll("[data-drop-location]").forEach((target) =>
      target.classList.toggle("drop-ready", Boolean(allowed(target))),
    );
  });
  document.addEventListener("dragover", (event) => {
    if (!source) return;
    const target = destination(event);
    const valid = Boolean(allowed(target));
    root.querySelectorAll(".drop-over").forEach((el) => {
      if (el !== target) el.classList.remove("drop-over");
    });
    if (!valid) {
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
    if (accepted && onMove(moving.kind, moving.id, target.dataset.dropLocation)) {
      // A successful move renders fresh elements; animate the destination there.
      root.querySelectorAll("[data-drop-location]").forEach((element) => {
        if (element.dataset.dropLocation !== target.dataset.dropLocation) return;
        element.classList.add("drop-received");
        setTimeout(() => element.classList.remove("drop-received"), 750);
      });
    }
  });
  document.addEventListener("dragend", clear);
  document.addEventListener("drop", clear);
  // dragend may be lost when the source is detached or a native drag is
  // cancelled. Ordinary pointer input resumes only after that drag ends.
  document.addEventListener("pointerdown", clear, true);
  document.addEventListener("pointerup", clear, true);
  document.addEventListener("pointermove", (event) => {
    if (source && event.buttons === 0) clear();
  }, true);
  document.addEventListener("keydown", (event) => {
    if (event.key === "Escape") clear();
  });
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) clear();
  });
  window.addEventListener("blur", clear);
  return clear;
}
