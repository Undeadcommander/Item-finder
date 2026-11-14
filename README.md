# Haven · Item finder

A lightweight home inventory app. Start with one room, add rooms and nested containers, and record exactly where each item belongs. Search by item name, notes, or location; a result opens and highlights the item in its container.

## Development - for users ignore this and Checks

Requires Node.js 20.19+ or 22.12+ (validated with Node 24).

```sh
npm ci
npm run dev
```

Vite serves the app on port 5173. `npm run build` produces the static site in `dist/`; `npm run preview` serves that build. Deploy `dist/` to any static host. Hash-based navigation needs no server rewrite rules.

## Checks

```sh
npm test
npm run build
npm run test:e2e
```

Browser tests start the dev server automatically (or reuse a running local server). Locally they use `/usr/bin/chromium`; CI installs Playwright Chromium. Set `CHROMIUM_PATH` to another Chromium executable if needed. Tests cover nested containers, search, reload persistence, editing, deletion, backup restore, and mobile overflow.

## Storage and performance

Inventory and marker metadata are stored in this browser's localStorage; binary scans are stored in IndexedDB, on this site's origin. Optional Google accounts sync inventory and scan markers through Firestore when the project owner enables the backend. Guest mode stays local. Export JSON backups from the sidebar (or footer on mobile); restoring replaces the current inventory after confirmation. Clearing browser data removes the inventory. Storage failures are reported and changes are not silently accepted.

Navigation runs locally without network requests. Location and item lookup maps and card summaries are rebuilt only when data changes; search text is precomputed and displayed results are capped at 30. Container depth has no application limit, subject to browser memory and storage limits. A room's tile summarizes items in all of its nested containers; its page lists directly stored items separately from child containers. Large inventories remain subject to browser rendering and localStorage limits.

The 3D viewer uses Three.js, loaded only when a scan is opened. Room scanning needs no external scanning service or remote fonts. Optional account sync uses Firebase Authentication and Firestore.

## GitHub Pages

The `Deploy Haven to GitHub Pages` workflow builds and deploys every push to `main`.
The production build uses `/Item-finder/` as its asset base path.
In repository **Settings → Pages**, set **Source** to **GitHub Actions** once.
The deployment URL is `https://undeadcommander.github.io/Item-finder/` after a successful Pages deployment.
Inventory saved on a local preview does not automatically transfer to this URL; export and restore a backup to move it.


## Themes and moving items

Choose **Add item → Import existing item** or **Add a container → Import existing container** to move an existing entry into the current space. The picker shows full location paths. For items, you can change **Location** before opening the picker. Import moves the original; containers bring their nested contents and scans. Entries already directly in the destination are hidden, as are rooms and containers that would create a nesting loop. You can still create a new entry using the usual form.

Use the color theme picker in the header to choose Light, Dark, OLED black, Dark grey, Rose, or Aqua. OLED black uses a pure black page and card background. The initial theme follows the device setting; an explicit choice is remembered. Each item has a Move button that can transfer it into any room or nested container. Moving an item clears its scan markers because the old coordinates no longer describe its position.

Use the **gear** on any container card or item row to change its name, description, color, and destination without opening the container. Container destinations show the full path and exclude the container itself and everything inside it. The **Move container** button is also available inside a container.

With a mouse, drag a container card or item row onto another container, a room card, or a room under **MY ROOMS** in the sidebar. Breadcrumbs also accept drops into an ancestor. Valid destinations highlight during the drag; dropping elsewhere or pressing Escape cancels it. Gear settings provide the same moves for keyboard and touch users.

All items, nested containers, and their scans move together. Pins in scans outside the moved container are cleared because they describe its old position; pins in its own scans are preserved. Moving an item clears that item's scan pins. Item colors are saved with the inventory and included in backups and account sync; older inventories without item colors remain supported.

## 3D room scans

Open a room or container and choose **Add 3D scan**.

- **Import scan** accepts self-contained GLB (embedded textures, without Draco/KTX2 compression) and OBJ geometry. OBJ material sidecar files are not imported. Maximum file size: 30 MB; maximum geometry: two million vertices. One scan is stored per location.
- **Scan with camera** requests an immersive WebXR AR session with CPU depth sensing and DOM overlay. It requires HTTPS, camera permission, and a compatible phone/browser that exposes those capabilities. Ordinary desktop webcams and browsers without WebXR depth sensing cannot create a depth scan. Import remains available on those devices.
- Move slowly around the room, then choose **Finish scan**. Capture collects an untextured point cloud, with 3 cm sampling and a 200,000-point cap. This is experimental depth capture, not photogrammetry or a textured mesh reconstruction service. Tracking drift and device depth quality affect accuracy.
- Drag to orbit, scroll/pinch to zoom, Shift-drag to pan. Right-click a surface to **Add item** or **Mark container**. On touch screens, select **Place marker**, then tap a surface. Select an existing item/container in this location's subtree or create a new one.
- Click a dot to read details. Container markers open the actual container page, where more items and nested containers can be created. Removing a marker never deletes its inventory target. Replacing a scan clears that scan's old markers after the new file saves successfully.
- Full JSON backups include scan files and markers. Old inventory-only backups still restore. Restore stages scan files under new IDs before replacing inventory, so a failed restore does not overwrite the active scan files. Backup restore limit: 250 MB.

The renderer draws on camera/size changes rather than running a permanent animation loop, caps pixel density at 2, and releases graphics resources when closed. Normal room navigation does not download the 3D engine or read scan files.

Validation includes GLB and OBJ loading, mouse/touch placement, linking existing targets, container navigation, transfer cleanup, IndexedDB persistence, full backup restore, unsupported camera handling, and simulated WebXR capture. Physical depth capture has not been verified on real AR hardware in this cloud environment.


## Google sign-in and account sync

See [Firebase account setup](firebase/SETUP.md). The integration requires a real Firebase project with Google Authentication, Firestore, and private access rules. The public configuration is in `src/firebase-config.json`; it now contains the public configuration for `sign-in-for-haven`. Authentication, Firestore setup, and rules must also be enabled in that project. Never commit a service-account key.

Use **Sign in → Continue with Google** to create or access an account. Existing guest data is copied only through the explicit **Copy device inventory to account** action. Account status reports pending, saving, saved, failed, and conflicting changes. Each account has a separate local cache; scan files remain on the originating device and can be transferred through backups. 
### Account deletion

Under **Account → Delete account**, review the consequences, slide the handle from right to left, and confirm after the five-second wait. Every confirmation has Cancel; the final Cancel is prominent and focused by default. Keyboard users can move the slider with Left Arrow and confirm with Enter. Deletion requires a fresh Google verification and removes the Haven authentication account, all Firestore inventory chunks (including older snapshots), the profile, and that account's local cache, recovery copy, and scan files on this browser. The Google account, separate guest inventory, other accounts, downloaded backups, and local copies on other devices are not deleted.

Sync pauses before deletion and waits for any submitted upload to settle. A temporary Firestore revision marker tells active clients to pause too. If cleanup fails, authentication is retained until cloud cleanup succeeds, and the deletion remains paused across reloads; use **Delete account** again to finish. This is a client-driven flow, so keep the page open until it completes.
