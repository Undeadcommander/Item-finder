import { test } from "node:test";
import assert from "node:assert/strict";
import {
  AccountSync,
  accountKey,
  mergeGuestInventory,
} from "../src/account-sync.js";
import { initialState, validState } from "../src/store.js";
const storage = () => {
  const map = new Map();
  return {
    getItem: (k) => map.get(k) || null,
    setItem: (k, v) => map.set(k, v),
  };
};
const edited = (name) => ({
  ...initialState(),
  items: [{ id: "key", name, notes: "", locationId: "living-room" }],
});
const deferred = () => {
  let resolve, reject;
  const promise = new Promise((a, b) => {
    resolve = a;
    reject = b;
  });
  return { promise, resolve, reject };
};
function controller(remote, store = storage()) {
  let visible;
  const sync = new AccountSync({
    storage: store,
    remote,
    replace: (s) => {
      visible = s;
    },
    notify() {},
    delay: 100000,
  });
  return { sync, store, visible: () => visible };
}
const baseRemote = () => ({
  watch: () => () => {},
  read: async () => initialState(),
  publish: async (_uid, _inventory, revision) => revision + 1,
});
test("successful sync stores revision and clears dirty only after remote commit", async () => {
  const { sync, store } = controller(baseRemote());
  await sync.select("alice");
  await sync.receive(null);
  sync.saveLocal(edited("Keys"));
  assert.equal(sync.record.dirty, true);
  await sync.flush();
  assert.equal(sync.record.revision, 1);
  assert.equal(sync.record.dirty, false);
  assert.equal(
    JSON.parse(store.getItem(accountKey("alice"))).inventory.items[0].name,
    "Keys",
  );
  await sync.select(null);
});
test("failed cloud upload keeps edits and allows explicit retry", async () => {
  const remote = baseRemote();
  remote.publish = async () => {
    throw Error("Offline");
  };
  const { sync } = controller(remote);
  await sync.select("alice");
  await sync.receive(null);
  sync.saveLocal(edited("Offline item"));
  await sync.flush();
  assert.equal(sync.status, "error");
  assert.equal(sync.record.dirty, true);
  remote.publish = async () => 1;
  await sync.flush();
  assert.equal(sync.status, "synced");
  await sync.select(null);
});
test("stale cloud reads cannot replace a different account or edits made during download", async () => {
  const pending = deferred(),
    remote = baseRemote();
  remote.read = () => pending.promise;
  const { sync, visible } = controller(remote);
  await sync.select("alice");
  const load = sync.receive({ revision: 1 });
  await sync.select("bob");
  pending.resolve(edited("Alice private"));
  await load;
  assert.equal(sync.uid, "bob");
  assert.equal(visible().items.length, 0);
  await sync.select(null);
});
test("conflicting edits require a choice and preserve a recovery copy", async () => {
  const { sync, store, visible } = controller({
    ...baseRemote(),
    read: async () => edited("Cloud version"),
  });
  await sync.select("alice");
  await sync.receive(null);
  sync.saveLocal(edited("Device version"));
  await sync.receive({ revision: 2 });
  assert.equal(sync.status, "conflict");
  assert.equal(sync.record.inventory.items[0].name, "Device version");
  await sync.resolve("cloud");
  assert.equal(visible().items[0].name, "Cloud version");
  assert.equal(
    JSON.parse(store.getItem("haven-recovery:alice")).items[0].name,
    "Device version",
  );
  await sync.select(null);
});
test("edits made during upload stay pending and subsequent upload uses new revision", async () => {
  const pending = deferred(),
    remote = baseRemote();
  remote.publish = () => pending.promise;
  const { sync } = controller(remote);
  await sync.select("alice");
  await sync.receive(null);
  sync.saveLocal(edited("First"));
  const upload = sync.flush();
  sync.saveLocal(edited("Second"));
  pending.resolve(1);
  await upload;
  assert.equal(sync.record.dirty, true);
  assert.equal(sync.record.revision, 1);
  assert.equal(sync.record.inventory.items[0].name, "Second");
  remote.publish = async (_uid, inventory, revision) => {
    assert.equal(revision, 1);
    assert.equal(inventory.items[0].name, "Second");
    return 2;
  };
  await sync.flush();
  assert.equal(sync.record.dirty, false);
  await sync.select(null);
});
test("own watch notification arriving before commit acknowledgement does not create a false conflict", async () => {
  const pending = deferred(),
    remote = baseRemote();
  remote.publish = () => pending.promise;
  const { sync } = controller(remote);
  await sync.select("alice");
  await sync.receive(null);
  sync.saveLocal(edited("Own change"));
  const upload = sync.flush();
  await sync.receive({ revision: 1 });
  pending.resolve(1);
  await upload;
  assert.equal(sync.status, "synced");
  await sync.select(null);
});
test("copying guest data remaps all links and never replaces the account inventory", () => {
  const guest = edited("Guest key");
  guest.locations.push({
    id: "box",
    parentId: "living-room",
    name: "Box",
    description: "",
    color: "sage",
  });
  guest.scans = [
    {
      id: "scan",
      assetId: "asset",
      locationId: "living-room",
      name: "Room",
      format: "obj",
    },
  ];
  guest.markers = [
    {
      id: "pin",
      scanId: "scan",
      kind: "item",
      targetId: "key",
      position: [0, 1, 0],
    },
    {
      id: "box-pin",
      scanId: "scan",
      kind: "container",
      targetId: "box",
      position: [1, 1, 0],
    },
  ];
  let id = 0;
  const { inventory, assets } = mergeGuestInventory(
    edited("Account key"),
    guest,
    () => `new-${++id}`,
  );
  assert.equal(validState(inventory), true);
  assert.equal(inventory.items.length, 2);
  assert.equal(inventory.items[0].name, "Account key");
  assert.notEqual(inventory.items[1].id, "key");
  assert.equal(inventory.markers[0].targetId, inventory.items[1].id);
  assert.equal(assets.size, 1);
  assert.equal(guest.items[0].id, "key");
});

test('a slower older download cannot replace a newer account revision',async()=>{
 const first=deferred(),second=deferred();const {sync,visible}=controller({...baseRemote(),read:async(_uid,record)=>record.revision===1?first.promise:second.promise});
 await sync.select('alice');const one=sync.receive({revision:1}),two=sync.receive({revision:2});second.resolve(edited('Newest'));await two;first.resolve(edited('Older'));await one;
 assert.equal(visible().items[0].name,'Newest');assert.equal(sync.record.revision,2);await sync.select(null);
});

test("retry checks the server even when there are no local changes", async () => {
  const remote = baseRemote();
  const listeners = [];
  let stopped = 0;
  remote.watch = (_uid, value, error) => {
    listeners.push({ value, error });
    return () => stopped++;
  };
  remote.read = async () => edited("From another device");
  const { sync, visible } = controller(remote);
  try {
    await sync.select("alice");
    await sync.receive(null);
    sync.retry();
    assert.equal(listeners.length, 2);
    assert.equal(stopped, 1);
    await listeners[1].value(null);
    assert.equal(sync.status, "synced");
    listeners[1].error(Error("Connection lost"));
    sync.retry();
    assert.equal(listeners.length, 3);
    await listeners[2].value({ revision: 1 });
    assert.equal(sync.status, "synced");
    assert.equal(visible().items[0].name, "From another device");
    listeners[0].error(Error("Stale error"));
    assert.equal(sync.status, "synced");
  } finally {
    await sync.select(null);
  }
});

test("retry recovers a failed download without claiming the cached version is synced", async () => {
  const remote = baseRemote();
  let onValue;
  remote.watch = (_uid, value) => {
    onValue = value;
    return () => {};
  };
  remote.read = async () => { throw Error("Download failed"); };
  const { sync, visible } = controller(remote);
  try {
    await sync.select("alice");
    await sync.receive({ revision: 1 });
    assert.equal(sync.status, "error");
    remote.read = async () => edited("Recovered item");
    sync.retry();
    assert.equal(sync.remoteKnown, false);
    await onValue({ revision: 1 });
    assert.equal(sync.status, "synced");
    assert.equal(visible().items[0].name, "Recovered item");
  } finally {
    await sync.select(null);
  }
});

test("retry preserves pending edits and waits for the server revision before upload", async () => {
  const remote = baseRemote();
  let onValue;
  remote.watch = (_uid, value) => {
    onValue = value;
    return () => {};
  };
  remote.publish = async () => { throw Error("Offline"); };
  const { sync, store } = controller(remote);
  try {
    await sync.select("alice");
    await sync.receive(null);
    sync.saveLocal(edited("Unsaved keys"));
    await sync.flush();
    sync.retry();
    assert.equal(sync.remoteKnown, false);
    assert.equal(sync.record.dirty, true);
    assert.equal(JSON.parse(store.getItem(accountKey("alice"))).inventory.items[0].name, "Unsaved keys");
    await onValue({ revision: 2 });
    assert.equal(sync.status, "conflict");
    assert.equal(sync.record.inventory.items[0].name, "Unsaved keys");
  } finally {
    await sync.select(null);
  }
});

test("retry during an upload does not interrupt or duplicate the commit", async () => {
  const pending = deferred(), remote = baseRemote();
  let uploads = 0;
  remote.publish = () => { uploads++; return pending.promise; };
  const { sync } = controller(remote);
  await sync.select("alice");
  await sync.receive(null);
  sync.saveLocal(edited("Keys"));
  const upload = sync.flush();
  sync.retry();
  assert.equal(sync.status, "saving");
  assert.equal(uploads, 1);
  pending.resolve(1);
  await upload;
  assert.equal(sync.status, "synced");
  assert.equal(sync.record.dirty, false);
  await sync.select(null);
});
