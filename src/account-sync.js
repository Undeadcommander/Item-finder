import { initialState, validState } from "./store.js";
import { deletionKey, isDeletingRecord } from "./delete-account-data.js";
export const accountKey = (uid) => `haven-account:${uid}`;

// Sync is transport-independent so races, retries and account isolation can be tested.
export class AccountSync {
  constructor({ storage, remote, replace, notify, delay = 700 }) {
    Object.assign(this, { storage, remote, replace, notify, delay });
    this.uid = null;
    this.generation = 0;
    this.status = "guest";
    this.record = null;
    this.timer = null;
    this.inFlight = null;
    this.remoteKnown = false;
    this.edit = 0;
    this.readSequence = 0;
  }
  signal(status, message = "") {
    this.status = status;
    this.message = message;
    this.notify?.();
  }
  cache(record = this.record, uid = this.uid) {
    this.storage.setItem(accountKey(uid), JSON.stringify(record));
  }
  disconnect() {
    this.generation++;
    clearTimeout(this.timer);
    this.unsubscribe?.();
    this.unsubscribe = null;
    this.pendingRemote = undefined;
    this.remoteKnown = false;
  }
  async select(uid) {
    this.disconnect();
    this.uid = uid;
    this.inFlight = null;
    this.conflictRecord = undefined;
    if (!uid) {
      this.record = null;
      this.signal("guest");
      return;
    }
    let cached;
    try {
      cached = JSON.parse(this.storage.getItem(accountKey(uid)));
    } catch {}
    this.record =
      cached &&
      validState(cached.inventory) &&
      Number.isInteger(cached.revision) &&
      cached.revision >= 0
        ? cached
        : { inventory: initialState(), revision: 0, dirty: false };
    this.replace(this.record.inventory, uid);
    if (this.storage.getItem(deletionKey(uid))) {
      this.signal("deleting", "Account deletion is unfinished. Sync is paused; open Account to finish deletion.");
      return;
    }
    this.connect();
  }
  connect() {
    const generation = this.generation;
    this.signal("connecting", "Connecting to your account…");
    this.unsubscribe = this.remote.watch(
      this.uid,
      (record) => {
        if (generation === this.generation) return this.receive(record, generation);
      },
      (error) => {
        if (generation === this.generation) {
          this.remoteKnown = false;
          clearTimeout(this.timer);
          this.signal(
            "error",
            error.message ||
              "Could not connect. Changes remain on this device.",
          );
        }
      },
    );
  }
  saveLocal(inventory) {
    if (this.status === "deleting" || this.storage.getItem(deletionKey(this.uid)))
      throw Error("Account deletion is in progress. Editing and sync are paused.");
    const next = { ...this.record, inventory, dirty: true };
    this.cache(next);
    this.record = next;
    this.edit++;
    if (this.status !== "conflict")
      this.signal("pending", "Saved on this device · waiting to sync");
    this.schedule();
  }
  schedule() {
    clearTimeout(this.timer);
    if (this.uid && this.remoteKnown && !["conflict", "deleting"].includes(this.status))
      this.timer = setTimeout(() => this.flush(), this.delay);
  }
  async receive(remote, generation = this.generation) {
    if (generation !== this.generation || !this.uid) return;
    if (isDeletingRecord(remote)) {
      this.disconnect();
      this.signal("deleting", "Account deletion has started. Editing and sync are paused.");
      this.storage.setItem(deletionKey(this.uid), "pending");
      return;
    }
    this.remoteKnown = true;
    if (this.inFlight) {
      this.pendingRemote = remote;
      return;
    }
    const sequence = ++this.readSequence;
    const revision = remote?.revision || 0;
    if (revision && revision < this.record.revision) return;
    if (revision === this.record.revision) {
      if (this.record.dirty) this.schedule();
      else this.signal("synced", "Account is up to date");
      return;
    }
    if (this.record.dirty) {
      this.conflictRecord = remote;
      this.signal(
        "conflict",
        "Another device changed this inventory. Choose which version to keep.",
      );
      return;
    }
    const edit = this.edit;
    this.signal("connecting", "Loading your account inventory…");
    try {
      const inventory = remote
        ? await this.remote.read(this.uid, remote)
        : initialState();
      if (generation !== this.generation || sequence !== this.readSequence) return;
      if (edit !== this.edit || this.record.dirty) {
        this.conflictRecord = remote;
        this.signal("conflict", "Local and account changes need your review.");
        return;
      }
      if (!validState(inventory))
        throw Error(
          "The account inventory could not be read. Your local copy is unchanged.",
        );
      const record = { inventory, revision, dirty: false };
      this.cache(record);
      this.record = record;
      this.replace(inventory, this.uid);
      this.signal("synced", "Account is up to date");
    } catch (error) {
      if (generation === this.generation && sequence === this.readSequence)
        this.signal("error", error.message || "Could not load your account.");
    }
  }
  async flush() {
    if (
      !this.uid ||
      !this.record?.dirty ||
      !this.remoteKnown ||
      this.status === "conflict" ||
      this.status === "deleting" ||
      this.inFlight
    )
      return;
    const generation = this.generation,
      uid = this.uid,
      record = this.record,
      edit = this.edit;
    this.signal("saving", "Saving to your account…");
    const task = this.remote.publish(uid, record.inventory, record.revision);
    this.inFlight = task;
    try {
      const revision = await task;
      if (generation !== this.generation) return;
      const next = { ...this.record, revision, dirty: this.edit !== edit };
      this.cache(next);
      this.record = next;
      this.signal(
        next.dirty ? "pending" : "synced",
        next.dirty ? "New changes waiting to sync" : "Saved to your account",
      );
    } catch (error) {
      if (generation !== this.generation) return;
      if (error.code === "sync/conflict") {
        this.conflictRecord = error.remote;
        this.signal(
          "conflict",
          "Another device saved changes first. Choose which version to keep.",
        );
      } else
        this.signal(
          "error",
          error.message ||
            "Sync failed. Your changes are saved on this device.",
        );
    } finally {
      if (generation === this.generation) {
        this.inFlight = null;
        if (this.pendingRemote !== undefined) {
          const pending = this.pendingRemote;
          this.pendingRemote = undefined;
          await this.receive(pending, generation);
        }
        if (this.record?.dirty && this.status === "pending") this.schedule();
      }
    }
  }
  retry() {
    if (!this.uid || ["conflict", "deleting"].includes(this.status) || this.inFlight) return;
    // Recheck the server even for a clean local copy or a failed download.
    // Keep the current inventory and let receive() reconcile revisions before writing.
    this.disconnect();
    this.connect();
  }
  async pauseForDeletion() {
    const pending = this.inFlight;
    this.disconnect();
    const generation = this.generation;
    this.signal("deleting", "Deleting your account · sync is paused");
    // A previously submitted write must settle before its documents are removed.
    try { await pending; } catch {}
    if (generation === this.generation) this.inFlight = null;
  }
  async resolve(choice) {
    if (this.status !== "conflict") return;
    // Preserve the rejected local version before either conflict resolution choice.
    this.storage.setItem(
      `haven-recovery:${this.uid}`,
      JSON.stringify(this.record.inventory),
    );
    if (choice === "local") {
      this.record = {
        ...this.record,
        revision: this.conflictRecord?.revision || 0,
        dirty: true,
      };
      this.cache();
      this.signal("pending", "Saving your chosen version…");
      await this.flush();
    } else {
      this.record = { ...this.record, dirty: false };
      await this.receive(this.conflictRecord);
      if (this.status === "error") {
        this.record = { ...this.record, dirty: true };
        this.cache();
      }
    }
  }
}

export function mergeGuestInventory(
  account,
  guest,
  id = () => crypto.randomUUID(),
) {
  const locations = new Map(guest.locations.map((l) => [l.id, id()])),
    items = new Map(guest.items.map((i) => [i.id, id()])),
    scans = new Map((guest.scans || []).map((s) => [s.id, id()])),
    assets = new Map((guest.scans || []).map((s) => [s.assetId, id()]));
  return {
    inventory: {
      ...account,
      locations: [
        ...account.locations,
        ...guest.locations.map((l) => ({
          ...l,
          id: locations.get(l.id),
          parentId: l.parentId === null ? null : locations.get(l.parentId),
        })),
      ],
      items: [
        ...account.items,
        ...guest.items.map((i) => ({
          ...i,
          id: items.get(i.id),
          locationId: locations.get(i.locationId),
        })),
      ],
      scans: [
        ...(account.scans || []),
        ...(guest.scans || []).map((s) => ({
          ...s,
          id: scans.get(s.id),
          assetId: assets.get(s.assetId),
          locationId: locations.get(s.locationId),
        })),
      ],
      markers: [
        ...(account.markers || []),
        ...(guest.markers || []).map((m) => ({
          ...m,
          id: id(),
          scanId: scans.get(m.scanId),
          targetId: (m.kind === "item" ? items : locations).get(m.targetId),
        })),
      ],
    },
    assets,
  };
}
