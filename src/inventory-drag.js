// Only drags started in this inventory may move records. External text/files
// and cross-tab payloads are never interpreted as inventory commands.
export function setupInventoryDrag(root, { getState, getIndex, onMove }) {
  let source = null, preview = null, dragImage = null;
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
    preview?.remove();
    dragImage?.remove();
    preview = dragImage = null;
    root.classList.remove("inventory-dragging");
    root.querySelectorAll(".drag-source, .drop-ready, .drop-over").forEach((el) =>
      el.classList.remove("drag-source", "drop-ready", "drop-over"),
    );
  }
  function positionPreview(event) {
    if (!preview) return;
    const x = Math.max(8, Math.min(event.clientX + 18, innerWidth - preview.offsetWidth - 8));
    const y = Math.max(8, Math.min(event.clientY + 18, innerHeight - preview.offsetHeight - 8));
    preview.style.transform = `translate3d(${x}px, ${y}px, 0)`;
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
    // The browser's drag image is a frozen bitmap. Replace it with a DOM
    // preview so it can visibly animate and report the current destination.
    dragImage = document.createElement("canvas");
    dragImage.width = dragImage.height = 1;
    dragImage.className = "inventory-drag-image";
    document.body.append(dragImage);
    event.dataTransfer.setDragImage(dragImage, 0, 0);
    preview = document.createElement("div");
    preview.className = "inventory-drag-preview";
    preview.setAttribute("aria-hidden", "true");
    preview.innerHTML = '<div class="drag-preview-content"><span class="drag-preview-symbol"><svg width="20" height="20" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="1.8" stroke-linecap="round" stroke-linejoin="round"><path d="M5 12h14m-6-6 6 6-6 6"/></svg></span><div><strong></strong><span class="drag-preview-hint">Drag to a container or room</span></div></div>';
    preview.querySelector("strong").textContent = record.name;
    document.body.append(preview);
    positionPreview(event);
    element.classList.add("drag-source");
    root.classList.add("inventory-dragging");
    root.querySelectorAll("[data-drop-location]").forEach((target) =>
      target.classList.toggle("drop-ready", Boolean(allowed(target))),
    );
  });
  document.addEventListener("dragover", (event) => {
    if (!source) return;
    const target = destination(event);
    positionPreview(event);
    const valid = Boolean(allowed(target));
    preview.classList.toggle("has-destination", valid);
    preview.querySelector(".drag-preview-hint").textContent = valid
      ? `Release into ${getIndex().byId.get(target.dataset.dropLocation).name}`
      : "Drag to a container or room";
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
  window.addEventListener("blur", clear);
  return clear;
}
