import * as THREE from "three";
import { OrbitControls } from "three/addons/controls/OrbitControls.js";
import { GLTFLoader } from "three/addons/loaders/GLTFLoader.js";
import { OBJLoader } from "three/addons/loaders/OBJLoader.js";
import { getAsset, putAsset, deleteAsset } from "./scan-storage.js";
import { createIndex, descendants } from "./store.js";
import { captureDepth } from "./capture-depth.js";
import "./scan.css";

export function disposeObject(object) {
  const textures = new Set(),
    materials = new Set(),
    geometries = new Set();
  object?.traverse((child) => {
    if (child.geometry) geometries.add(child.geometry);
    for (const material of (Array.isArray(child.material)
      ? child.material
      : [child.material]
    ).filter(Boolean)) {
      materials.add(material);
      for (const value of Object.values(material))
        if (value?.isTexture) textures.add(value);
    }
  });
  for (const texture of textures) {
    texture.source?.data?.close?.();
    texture.dispose();
  }
  for (const material of materials) material.dispose();
  for (const geometry of geometries) geometry.dispose();
}
async function readObject(blob, format) {
  let object;
  try {
    if (format === "obj") object = new OBJLoader().parse(await blob.text());
    else if (format === "points") {
      const buffer = await blob.arrayBuffer();
      if (buffer.byteLength % 12 !== 0 || buffer.byteLength < 12)
        throw Error("Invalid depth scan.");
      const geometry = new THREE.BufferGeometry();
      geometry.setAttribute(
        "position",
        new THREE.BufferAttribute(new Float32Array(buffer), 3),
      );
      object = new THREE.Points(
        geometry,
        new THREE.PointsMaterial({
          color: 0x9abda5,
          size: 0.035,
          sizeAttenuation: true,
        }),
      );
    } else {
      const manager = new THREE.LoadingManager();
      manager.setURLModifier((url) => {
        if (!url.startsWith("blob:") && !url.startsWith("data:"))
          throw Error(
            "Export a self-contained GLB with embedded textures. External scan resources are not loaded.",
          );
        return url;
      });
      object = (
        await new GLTFLoader(manager).parseAsync(await blob.arrayBuffer(), "")
      ).scene;
    }
    let vertices = 0;
    object.traverse((child) => {
      const positions = child.geometry?.getAttribute("position");
      if (positions) {
        vertices += positions.count;
        for (let n = 0; n < positions.array.length; n++)
          if (!Number.isFinite(positions.array[n]))
            throw Error("This scan contains invalid coordinates.");
      }
      if (child.isMesh) {
        for (const m of Array.isArray(child.material)
          ? child.material
          : [child.material])
          m.side = THREE.DoubleSide;
      }
    });
    if (!vertices)
      throw Error("This file does not contain a 3D surface or depth points.");
    if (vertices > 2_000_000)
      throw Error(
        "This scan is too detailed. Export a simplified model with fewer than two million vertices.",
      );
    object.updateMatrixWorld(true);
    const bounds = new THREE.Box3().setFromObject(object),
      size = bounds.getSize(new THREE.Vector3());
    if (
      bounds.isEmpty() ||
      !Number.isFinite(size.length()) ||
      size.length() < 0.00001
    )
      throw Error("This scan has no usable dimensions.");
    return object;
  } catch (error) {
    disposeObject(object);
    throw Error(
      error.message?.includes("DRACO")
        ? "This scan uses Draco compression. Export an uncompressed GLB or OBJ."
        : error.message ||
            "Could not read this scan. Export a GLB or OBJ and try again.",
    );
  }
}

export async function openScanViewer(locationId, api) {
  const openScope = api.getScope?.() || null;
  const { esc } = api,
    location = api.getState().locations.find((l) => l.id === locationId);
  if (!location) return;
  const dialog = document.createElement("dialog");
  dialog.className = "scan-dialog";
  dialog.setAttribute("aria-label", `3D scan of ${location.name}`);
  dialog.innerHTML = `<div class="scan-heading"><div><div class="eyebrow">YOUR SPACE, IN THREE DIMENSIONS</div><h2>${esc(location.name)}</h2></div><button class="secondary" data-close-scan>Close scan</button></div><div class="scan-toolbar"><button class="primary" data-import-scan>Import scan</button><button class="secondary" data-capture-scan>Scan with camera</button><button class="secondary" data-place-marker disabled>Place marker</button><button class="secondary" data-reset-camera disabled>Reset view</button><button class="text-button" data-remove-scan hidden>Remove scan</button></div><p class="scan-help">Drag to orbit · Scroll or pinch to zoom · Shift-drag to pan · Right-click a surface to add an item or container. On touch screens, choose Place marker, then tap a surface.</p><p class="scan-help camera-note">Camera capture creates an untextured depth point cloud and requires a WebXR depth-enabled phone. For a textured room, import a GLB scan.</p><div class="scan-status" role="status"></div><div class="scan-workspace"><div class="scan-stage"><div class="scan-empty"><span class="scan-empty-symbol">◇</span><h3>Put your things on the map.</h3><p>Import a room scan as a self-contained GLB or OBJ (up to 30 MB). Or capture a depth scan using a compatible WebXR phone.</p><p>Scans stay on this device. Export a backup to keep a copy.</p></div><div class="scan-dots"></div><div class="scan-context" hidden></div></div><aside class="scan-panel"></aside></div><input type="file" accept=".glb,.obj" data-scan-file hidden>`;
  document.body.append(dialog);
  dialog.showModal();
  const stage = dialog.querySelector(".scan-stage"),
    panel = dialog.querySelector(".scan-panel"),
    dots = dialog.querySelector(".scan-dots"),
    menu = dialog.querySelector(".scan-context"),
    status = dialog.querySelector(".scan-status");
  let renderer,
    scene,
    camera,
    controls,
    model,
    observer,
    closed = false,
    busy = false,
    placement = false,
    epoch = 0;
  const scan = () =>
    api.getState().scans?.find((s) => s.locationId === locationId);
  const markers = () =>
    api.getState().markers?.filter((m) => m.scanId === scan()?.id) || [];
  const tell = (message, error = false) => {
    status.textContent = message;
    status.classList.toggle("scan-error", error);
  };
  const persist = (next) => {
    if ((api.getScope?.() || null) !== openScope) {
      tell(
        "The account changed. Reopen this scan in the current account.",
        true,
      );
      return false;
    }
    const saved = api.save(next);
    if (!saved)
      tell(
        "Could not save this change. Browser storage may be full or unavailable.",
        true,
      );
    return saved;
  };
  const snapshot = () => {
    const s = api.getState();
    return { state: s, index: createIndex(s) };
  };
  const targetOf = (m) =>
    m.kind === "item"
      ? api.getState().items.find((i) => i.id === m.targetId)
      : api.getState().locations.find((l) => l.id === m.targetId);
  const markerButtons = new Map();
  const close = () => {
    if (busy) {
      tell(
        "Please wait for the scan operation to finish, or cancel the camera capture.",
      );
      return;
    }
    dialog.close();
  };
  function cleanup() {
    closed = true;
    epoch++;
    observer?.disconnect();
    controls?.dispose();
    disposeObject(model);
    renderer?.dispose();
    renderer?.forceContextLoss();
    dialog.remove();
    window.removeEventListener("hashchange", close);
    window.removeEventListener("popstate", close);
    api.onClose?.();
  }
  dialog.addEventListener("close", cleanup, { once: true });
  dialog.addEventListener("cancel", (e) => {
    if (busy) {
      e.preventDefault();
      tell("Finish or cancel the current scan operation first.");
    }
  });
  dialog.querySelector("[data-close-scan]").onclick = close;
  window.addEventListener("hashchange", close);
  window.addEventListener("popstate", close);
  function setBusy(value) {
    busy = value;
    for (const key of ["import-scan", "capture-scan", "remove-scan"])
      dialog.querySelector(`[data-${key}]`).disabled = value;
  }
  function paint() {
    if (!renderer || closed) return;
    renderer.render(scene, camera);
    for (const m of markers()) {
      const b = markerButtons.get(m.id);
      if (!b) continue;
      const p = new THREE.Vector3(...m.position).project(camera);
      b.hidden = p.z < -1 || p.z > 1 || Math.abs(p.x) > 1 || Math.abs(p.y) > 1;
      b.style.left = `${(p.x + 1) * 50}%`;
      b.style.top = `${(1 - p.y) * 50}%`;
    }
  }
  function init() {
    if (renderer) return;
    renderer = new THREE.WebGLRenderer({ antialias: true, alpha: true });
    renderer.setPixelRatio(Math.min(devicePixelRatio, 2));
    renderer.domElement.setAttribute("aria-label", "Interactive room scan");
    renderer.domElement.tabIndex = 0;
    stage.prepend(renderer.domElement);
    scene = new THREE.Scene();
    camera = new THREE.PerspectiveCamera(50, 1, 0.001, 1000);
    scene.add(new THREE.HemisphereLight(0xffffff, 0x667766, 2));
    const light = new THREE.DirectionalLight(0xffffff, 2);
    light.position.set(4, 8, 5);
    scene.add(light);
    controls = new OrbitControls(camera, renderer.domElement);
    controls.mouseButtons.RIGHT = null;
    controls.addEventListener("change", paint);
    observer = new ResizeObserver(() => {
      if (!renderer || closed) return;
      const { width, height } = stage.getBoundingClientRect();
      renderer.setSize(width, height);
      camera.aspect = width / height;
      camera.updateProjectionMatrix();
      paint();
    });
    observer.observe(stage);
    renderer.domElement.addEventListener("webglcontextlost", (e) => {
      e.preventDefault();
      tell(
        "3D graphics were interrupted. Close and reopen the scan to reload it. Your markers are saved.",
        true,
      );
    });
    stage.addEventListener("contextmenu", (e) => {
      e.preventDefault();
      pick(e);
    });
    renderer.domElement.addEventListener("click", (e) => {
      if (placement) pick(e);
    });
    renderer.domElement.addEventListener("pointerdown", () => {
      menu.hidden = true;
    });
  }
  function fit() {
    if (!model) return;
    const bounds = new THREE.Box3().setFromObject(model),
      center = bounds.getCenter(new THREE.Vector3()),
      radius = bounds.getSize(new THREE.Vector3()).length() / 2;
    camera.near = Math.max(radius / 10000, 0.0001);
    camera.far = radius * 100;
    camera.updateProjectionMatrix();
    camera.position
      .copy(center)
      .add(
        new THREE.Vector3(1, 0.8, 1.2).normalize().multiplyScalar(radius * 2.5),
      );
    controls.target.copy(center);
    controls.minDistance = radius * 0.015;
    controls.maxDistance = radius * 12;
    controls.update();
    paint();
  }
  function showObject(object) {
    init();
    if (model) {
      scene.remove(model);
      disposeObject(model);
    }
    model = object;
    scene.add(model);
    stage.querySelector(".scan-empty").hidden = true;
    dialog.querySelector("[data-place-marker]").disabled = false;
    dialog.querySelector("[data-reset-camera]").disabled = false;
    dialog.querySelector("[data-remove-scan]").hidden = false;
    fit();
    refreshMarkers();
  }
  function refreshMarkers() {
    dots.replaceChildren();
    markerButtons.clear();
    for (const m of markers()) {
      const target = targetOf(m);
      if (!target) continue;
      const b = document.createElement("button");
      b.className = `scan-dot ${m.kind}`;
      b.setAttribute(
        "aria-label",
        `${m.kind === "container" ? "Container" : "Item"} marker: ${target.name}`,
      );
      b.title = target.name;
      b.textContent = m.kind === "container" ? "▣" : "•";
      b.onclick = () => showDetails(m.id);
      dots.append(b);
      markerButtons.set(m.id, b);
    }
    listMarkers();
    paint();
  }
  function listMarkers() {
    panel.innerHTML = `<div class="eyebrow">PINNED IN THIS SPACE</div><h3>On the map <span>${markers().length}</span></h3><div class="marker-list">${
      markers()
        .map(
          (m) =>
            `<button data-marker-id="${esc(m.id)}"><span class="marker-key ${m.kind}">${m.kind === "container" ? "▣" : "●"}</span><span>${esc(targetOf(m)?.name || "Missing item")}<small>${m.kind === "container" ? "Container" : "Item"}</small></span></button>`,
        )
        .join("") ||
      '<p class="scan-muted">Right-click a surface to place your first marker. Each dot opens the details of an item or container.</p>'
    }</div><div class="scan-privacy">Stored in your browser · Included in full backups</div>`;
    panel
      .querySelectorAll("[data-marker-id]")
      .forEach((b) => (b.onclick = () => showDetails(b.dataset.markerId)));
  }
  function showDetails(id) {
    const m = markers().find((m) => m.id === id),
      target = m && targetOf(m);
    if (!target) {
      refreshMarkers();
      return;
    }
    const { index } = snapshot();
    const path = index.path(m.kind === "item" ? target.locationId : target.id);
    panel.innerHTML = `<button class="text-button" data-back-markers>← All markers</button><div class="eyebrow marker-kind">${m.kind === "container" ? "CONTAINER" : "ITEM"}</div><h3>${esc(target.name)}</h3><p class="scan-detail">${esc(m.kind === "item" ? target.notes || "No extra details" : target.description || "A space for your things.")}</p><p class="scan-path">${esc(path)}</p>${m.kind === "container" ? `<p class="scan-muted">${index.summaries.get(target.id)?.count || 0} items · ${(index.children.get(target.id) || []).length} containers</p>` : ""}<button class="primary" data-open-marker>${m.kind === "container" ? "Open container" : "Open item location"}</button><button class="text-button marker-remove" data-unpin>Remove marker</button><p class="scan-muted">Removing a marker keeps the ${m.kind === "container" ? "container and its contents" : "item"} in your inventory.</p>`;
    panel.querySelector("[data-back-markers]").onclick = listMarkers;
    panel.querySelector("[data-open-marker]").onclick = () => {
      close();
      api.navigate(
        m.kind === "container" ? target.id : target.locationId,
        m.kind === "item" ? target.id : null,
      );
    };
    panel.querySelector("[data-unpin]").onclick = () => {
      const s = api.getState();
      if (persist({ ...s, markers: s.markers.filter((x) => x.id !== id) }))
        refreshMarkers();
    };
  }
  function pick(e) {
    if (!model || busy) return;
    const rect = stage.getBoundingClientRect(),
      ray = new THREE.Raycaster();
    ray.params.Points.threshold =
      new THREE.Box3()
        .setFromObject(model)
        .getSize(new THREE.Vector3())
        .length() * 0.008;
    ray.setFromCamera(
      new THREE.Vector2(
        ((e.clientX - rect.left) / rect.width) * 2 - 1,
        (-(e.clientY - rect.top) / rect.height) * 2 + 1,
      ),
      camera,
    );
    const hit = ray.intersectObject(model, true)[0];
    if (!hit) {
      tell("Choose a visible surface or depth point in the scan.");
      return;
    }
    placement = false;
    dialog
      .querySelector("[data-place-marker]")
      .setAttribute("aria-pressed", "false");
    const point = (
      hit.object.isPoints
        ? hit.object.localToWorld(
            new THREE.Vector3().fromBufferAttribute(
              hit.object.geometry.attributes.position,
              hit.index,
            ),
          )
        : hit.point
    ).toArray();
    menu.innerHTML =
      "<button data-add-scan-item>Add item</button><button data-add-scan-container>Mark container</button><button data-dismiss-menu>Cancel</button>";
    menu.hidden = false;
    menu.style.left = `${Math.max(0, Math.min(e.clientX - rect.left, rect.width - 190))}px`;
    menu.style.top = `${Math.max(0, Math.min(e.clientY - rect.top, rect.height - 135))}px`;
    menu.querySelector("[data-add-scan-item]").onclick = () =>
      markerForm("item", point);
    menu.querySelector("[data-add-scan-container]").onclick = () =>
      markerForm("container", point);
    menu.querySelector("[data-dismiss-menu]").onclick = () =>
      (menu.hidden = true);
    menu.querySelector("button").focus();
    tell("Choose what belongs at this point.");
  }
  function markerForm(kind, position) {
    menu.hidden = true;
    const { state, index } = snapshot(),
      ids = descendants(index, locationId);
    const candidates =
      kind === "item"
        ? state.items.filter((i) => ids.has(i.locationId))
        : state.locations.filter((l) => l.id !== locationId && ids.has(l.id));
    panel.innerHTML = `<button class="text-button" data-back-markers>← Cancel placement</button><h3>${kind === "item" ? "Add item marker" : "Mark a container"}</h3><form class="marker-form"><label>Choose an option<select name="mode"><option value="existing" ${candidates.length ? "" : "disabled"}>Link existing ${kind}</option><option value="new" ${candidates.length ? "" : "selected"}>Create new ${kind}</option></select></label><label data-existing>Existing ${kind}<select name="target">${candidates.map((t) => `<option value="${esc(t.id)}">${esc(t.name)} — ${esc(index.path(kind === "item" ? t.locationId : t.id))}</option>`).join("")}</select></label><div data-new><label>${kind === "item" ? "Item" : "Container"} name<input name="name" maxlength="150"></label><label>${kind === "item" ? "Details" : "Description"}<textarea name="details" maxlength="1000"></textarea></label></div><p class="scan-muted">${kind === "item" ? "New items are added to this space. Existing items keep their current container." : "New containers are created inside this space. Open a container marker to add items or nested containers."}</p><button class="primary" type="submit">Save marker</button></form>`;
    const form = panel.querySelector("form"),
      mode = form.elements.mode;
    const toggle = () => {
      const isNew = mode.value === "new";
      panel.querySelector("[data-new]").hidden = !isNew;
      panel.querySelector("[data-existing]").hidden = isNew;
      form.elements.name.required = isNew;
    };
    toggle();
    mode.onchange = toggle;
    panel.querySelector("[data-back-markers]").onclick = listMarkers;
    form.onsubmit = (e) => {
      e.preventDefault();
      const s = api.getState(),
        active = scan();
      if (!active) {
        tell("The scan no longer exists.", true);
        return;
      }
      let targetId = form.elements.target.value,
        next = { ...s };
      if (mode.value === "new") {
        const name = form.elements.name.value.trim();
        if (!name) {
          form.elements.name.focus();
          return;
        }
        targetId = crypto.randomUUID();
        if (kind === "item")
          next.items = [
            ...s.items,
            {
              id: targetId,
              name,
              notes: form.elements.details.value.trim(),
              locationId,
            },
          ];
        else
          next.locations = [
            ...s.locations,
            {
              id: targetId,
              name,
              description: form.elements.details.value.trim(),
              parentId: locationId,
              color: "sage",
            },
          ];
      } else {
        const currentIndex = createIndex(s),
          allowed = descendants(currentIndex, locationId);
        const stillValid =
          kind === "item"
            ? s.items.some(
                (i) => i.id === targetId && allowed.has(i.locationId),
              )
            : s.locations.some(
                (l) =>
                  l.id === targetId && l.id !== locationId && allowed.has(l.id),
              );
        if (!stillValid) {
          tell("This target has moved or been deleted. Choose another.", true);
          return;
        }
      }
      const marker = {
        id: crypto.randomUUID(),
        scanId: active.id,
        kind,
        targetId,
        position,
      };
      next.markers = [
        ...(s.markers || []).filter(
          (m) =>
            !(
              m.scanId === active.id &&
              m.kind === kind &&
              m.targetId === targetId
            ),
        ),
        marker,
      ];
      if (persist(next)) {
        refreshMarkers();
        showDetails(marker.id);
        tell("Marker saved. Click its dot to see the details.");
      }
    };
  }
  async function importBlob(blob, name, format) {
    let object, assetId;
    try {
      if (blob.size > 30_000_000)
        throw Error("Choose a scan smaller than 30 MB.");
      tell("Reading your scan…");
      object = await readObject(blob, format);
      if (closed) {
        disposeObject(object);
        return;
      }
      init(); // Confirm graphics support before replacing a previous scan.
      assetId = crypto.randomUUID();
      await putAsset(assetId, blob, openScope);
      const s = api.getState(),
        previous = scan(),
        entry = { id: crypto.randomUUID(), assetId, locationId, name, format };
      const next = {
        ...s,
        scans: [
          ...(s.scans || []).filter((x) => x.locationId !== locationId),
          entry,
        ],
        markers: (s.markers || []).filter((m) => m.scanId !== previous?.id),
      };
      if (!persist(next))
        throw Error(
          "Scan metadata could not be saved. The previous scan is unchanged.",
        );
      showObject(object);
      object = null;
      if (previous) deleteAsset(previous.assetId, openScope).catch(() => {});
      tell(`Loaded ${name}. Right-click a surface to place a marker.`);
    } catch (error) {
      disposeObject(object);
      if (assetId && !api.getState().scans?.some((s) => s.assetId === assetId))
        await deleteAsset(assetId, openScope).catch(() => {});
      tell(error.message, true);
    }
  }
  dialog.querySelector("[data-import-scan]").onclick = () => {
    if (
      scan() &&
      !confirm(
        "Replace this scan? Existing markers will be removed; inventory items and containers will stay.",
      )
    )
      return;
    dialog.querySelector("[data-scan-file]").click();
  };
  dialog.querySelector("[data-scan-file]").onchange = async (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const ext = file.name.split(".").pop().toLowerCase();
    e.target.value = "";
    if (!["glb", "obj"].includes(ext)) {
      tell("Choose a self-contained GLB or OBJ file.", true);
      return;
    }
    setBusy(true);
    await importBlob(file, file.name, ext);
    setBusy(false);
  };
  dialog.querySelector("[data-place-marker]").onclick = () => {
    placement = !placement;
    dialog
      .querySelector("[data-place-marker]")
      .setAttribute("aria-pressed", String(placement));
    tell(
      placement
        ? "Tap or click a surface to place a marker."
        : "Placement cancelled.",
    );
  };
  dialog.querySelector("[data-reset-camera]").onclick = fit;
  dialog.querySelector("[data-remove-scan]").onclick = () => {
    const previous = scan();
    if (
      !previous ||
      !confirm(
        "Remove this scan and its markers? Your items and containers will remain.",
      )
    )
      return;
    const s = api.getState();
    if (
      persist({
        ...s,
        scans: s.scans.filter((x) => x.id !== previous.id),
        markers: (s.markers || []).filter((m) => m.scanId !== previous.id),
      })
    ) {
      deleteAsset(previous.assetId, openScope).catch(() => {});
      close();
    }
  };
  dialog.querySelector("[data-capture-scan]").onclick = async () => {
    if (
      scan() &&
      !confirm(
        "Capture a replacement scan? Existing markers will be removed only after the new scan is saved.",
      )
    )
      return;
    const overlay = document.createElement("div");
    overlay.className = "capture-overlay";
    overlay.innerHTML =
      '<h2>Scan your room</h2><p>Move slowly around the room. Point the camera at walls, furniture, and storage areas. Stay aware of your surroundings.</p><p data-progress>Starting camera depth capture…</p><button class="primary" data-finish-capture>Finish scan</button><button class="secondary" data-cancel-capture>Cancel</button>';
    dialog.append(overlay);
    setBusy(true);
    try {
      const blob = await captureDepth(
        overlay,
        (count) =>
          (overlay.querySelector("[data-progress]").textContent =
            `${count.toLocaleString()} depth points captured`),
      );
      if (blob) await importBlob(blob, "Camera depth scan", "points");
      else tell("Capture cancelled.");
    } catch (error) {
      tell(error.message, true);
    } finally {
      overlay.remove();
      setBusy(false);
    }
  };
  listMarkers();
  const active = scan();
  if (active) {
    setBusy(true);
    const load = ++epoch;
    try {
      tell("Loading saved scan…");
      const blob = await getAsset(active.assetId, openScope);
      if (!blob)
        throw Error(
          "The scan file is missing on this device. Import the scan again or restore a full backup.",
        );
      const object = await readObject(blob, active.format);
      if (closed || load !== epoch) {
        disposeObject(object);
        return;
      }
      showObject(object);
      tell(`Loaded ${active.name}.`);
    } catch (error) {
      tell(error.message, true);
      dialog.querySelector("[data-remove-scan]").hidden = false;
    } finally {
      setBusy(false);
    }
  } else
    tell(
      "Import a scan, or use Scan with camera on a depth-enabled WebXR device.",
    );
  return { close };
}
