import config from "./firebase-config.json";
import { AccountSync, mergeGuestInventory } from "./account-sync.js";
import { initialState, validState } from "./store.js";
import {
  getAsset,
  putAsset,
  setAssetScope,
  createBackup,
} from "./scan-storage.js";
const configured = !!(
  config.apiKey &&
  config.authDomain &&
  config.projectId &&
  config.appId &&
  config.enabled !== false
);
const escape = (s) =>
  String(s).replace(
    /[&<>"']/g,
    (c) =>
      ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[
        c
      ],
  );
export function setupAccount(api) {
  let user = null,
    service = null,
    ready = !configured,
    problem = "",
    dialog = null,
    authEpoch = 0;
  const sync = new AccountSync({
    storage: localStorage,
    remote: {},
    replace: (inventory, uid) => {
      setAssetScope(uid);
      api.replace(inventory);
    },
    notify: update,
  });
  const guest = () => {
    const raw = localStorage.getItem("haven-inventory");
    if (!raw) return initialState();
    const parsed = JSON.parse(raw);
    if (!validState(parsed))
      throw Error(
        "Device inventory cannot be read. Restore a backup before copying.",
      );
    return parsed;
  };
  function update() {
    document.querySelectorAll("[data-account]").forEach((b) => {
      b.textContent = user ? "Account" : "Sign in";
      b.title = user ? "Manage your account" : "Sign up or sign in with Google";
    });
    document
      .querySelectorAll("[data-save-status]")
      .forEach(
        (el) =>
          (el.textContent = user
            ? sync.message || "Account connected"
            : "Saved on this device"),
      );
    document.querySelectorAll("[data-account-status]").forEach((el) => {
      el.hidden = !user && !problem;
      el.className = `account-status ${sync.status}`;
      el.textContent =
        problem ||
        (user
          ? `${user.displayName || "Your account"} · ${sync.message || "Connected"}`
          : "");
    });
    if (dialog?.open) paintDialog();
  }
  async function authChanged(next) {
    const epoch = ++authEpoch;
    ready = false;
    problem = "";
    dialog?.close();
    document.querySelector(".scan-dialog")?.close();
    document.querySelector("#editor")?.close();
    user = next;
    if (user) {
      const uid = user.uid;
      await sync.select(uid);
      if (epoch !== authEpoch) return;
      setAssetScope(uid);
    } else {
      await sync.select(null);
      setAssetScope(null);
      try {
        api.replace(guest());
      } catch (error) {
        problem = error.message;
        api.replace(initialState());
      }
    }
    if (epoch !== authEpoch) return;
    ready = true;
    update();
  }
  const initialize = configured
    ? (async () => {
        try {
          const { createFirebaseService } =
            await import("./firebase-service.js");
          service = await createFirebaseService(config);
          sync.remote = service;
          service.watchAuth(authChanged);
        } catch {
          ready = true;
          problem =
            "Account connection is unavailable. You can continue using this device.";
          update();
        }
      })()
    : Promise.resolve();
  function paintDialog() {
    if (!dialog?.open) return;
    if (!user) {
      dialog.innerHTML = `<div class="modal-heading"><div><div class="eyebrow">YOUR HOME, WHEREVER YOU ARE</div><h2>Welcome to Haven</h2></div><button class="icon-button" data-account-close aria-label="Close account">✕</button></div><p class="modal-description">Sign up or sign in with Google to access your rooms, items, containers, and markers on your other devices.</p><button class="google-signin" data-google ${!configured || !ready || !service ? "disabled" : ""}><span aria-hidden="true">G</span> Continue with Google</button><p class="account-message" role="status">${escape(!configured ? "Account sign-in is not available yet. You can keep using this device and export backups." : !ready ? "Connecting…" : problem || "Your device inventory stays separate. Scan files stay on this device; rooms, items, and markers sync.")}</p><button class="text-button" data-account-close>Continue on this device</button>`;
      dialog.querySelector("[data-google]").onclick = async () => {
        problem = "";
        const b = dialog.querySelector("[data-google]");
        b.disabled = true;
        try {
          await service.login();
        } catch (error) {
          problem = error.message;
          update();
        }
      };
    } else {
      dialog.innerHTML = `<div class="modal-heading"><div><div class="eyebrow">YOUR HAVEN ACCOUNT</div><h2>${escape(user.displayName || "Your account")}</h2></div><button class="icon-button" data-account-close aria-label="Close account">✕</button></div><p class="account-email">${escape(user.email || "")}</p><p class="account-message ${sync.status}" role="status">${escape(problem || sync.message || "Connected")}</p>${sync.status === "conflict" ? '<div class="conflict-options"><p>Both versions are safe. Choosing one replaces the other account version. A recovery copy of this device’s inventory will be kept here.</p><button class="secondary" data-use-cloud>Use account version</button><button class="secondary" data-use-local>Use this device’s version</button></div>' : '<button class="secondary" data-retry>Sync now</button>'}<div class="account-actions"><button class="secondary" data-copy-guest>Copy device inventory to account</button><button class="text-button" data-recovery>Export recovery copy</button><button class="text-button" data-signout>Sign out</button></div><p class="scan-muted">Rooms, items, and markers sync privately with your Google account. Large scan files stay on this device. Signing out returns to your guest inventory.</p>`;
      dialog
        .querySelector("[data-retry]")
        ?.addEventListener("click", () => sync.retry());
      for (const [selector, choice] of [
        ["data-use-cloud", "cloud"],
        ["data-use-local", "local"],
      ])
        dialog
          .querySelector(`[${selector}]`)
          ?.addEventListener("click", async () => {
            if (
              !confirm(
                "Use this version for your account? A local recovery copy will be kept.",
              )
            )
              return;
            try {
              await sync.resolve(choice);
            } catch (error) {
              problem = error.message;
              update();
            }
          });
      dialog.querySelector("[data-signout]").onclick = async () => {
        if (
          sync.record?.dirty &&
          !confirm(
            "Some changes have not synced. They will stay on this device for this account. Sign out anyway?",
          )
        )
          return;
        try {
          await service.logout();
        } catch {
          problem = "Could not sign out. Please try again.";
          update();
        }
      };
      dialog.querySelector("[data-copy-guest]").onclick = async () => {
        if (sync.status === "connecting" || sync.status === "conflict") {
          problem =
            "Finish loading or resolve the account conflict before copying.";
          update();
          return;
        }
        if (
          !confirm(
            "Copy this device’s guest rooms, items, and scans into your account? Existing account data stays. Repeating this creates another copy.",
          )
        )
          return;
        const uid = user.uid;
        try {
          const source = guest(),
            merged = mergeGuestInventory(sync.record.inventory, source);
          for (const [oldId, newId] of merged.assets) {
            const blob = await getAsset(oldId, null);
            if (!blob)
              throw Error(
                "A device scan is missing. Restore its backup before copying.",
              );
            await putAsset(newId, blob, uid);
          }
          if (user?.uid !== uid)
            throw Error("The account changed. Please try again.");
          sync.saveLocal(merged.inventory);
          api.replace(merged.inventory);
          problem = "";
          update();
        } catch (error) {
          problem = error.message;
          update();
        }
      };
      dialog.querySelector("[data-recovery]").onclick = async () => {
        try {
          const raw = localStorage.getItem(`haven-recovery:${user.uid}`);
          if (!raw) throw Error("There is no recovery copy on this device.");
          const backup = await createBackup(JSON.parse(raw), user.uid);
          const url = URL.createObjectURL(
            new Blob([JSON.stringify(backup)], { type: "application/json" }),
          );
          const a = document.createElement("a");
          a.href = url;
          a.download = "haven-recovery.json";
          a.click();
          setTimeout(() => URL.revokeObjectURL(url), 1000);
        } catch (error) {
          problem = error.message;
          update();
        }
      };
    }
    dialog
      .querySelectorAll("[data-account-close]")
      .forEach((b) => (b.onclick = () => dialog.close()));
  }
  function openDialog() {
    if (dialog?.open) return;
    dialog = document.createElement("dialog");
    dialog.className = "account-dialog";
    dialog.setAttribute("aria-label", "Haven account");
    document.body.append(dialog);
    const closingDialog = dialog;
    dialog.addEventListener(
      "close",
      () => {
        closingDialog.remove();
        if (dialog === closingDialog) dialog = null;
      },
      { once: true },
    );
    dialog.showModal();
    paintDialog();
  }
  window.addEventListener("online", () => {
    if (user) sync.retry();
  });
  window.addEventListener("beforeunload", (e) => {
    if (user && sync.record?.dirty) {
      e.preventDefault();
      e.returnValue = "";
    }
  });
  return {
    bind() {
      document
        .querySelectorAll("[data-account]")
        .forEach((b) => (b.onclick = openDialog));
      update();
    },
    get uid() {
      return user?.uid || null;
    },
    get ready() {
      return ready;
    },
    get sync() {
      return sync;
    },
    initialize,
    save(inventory) {
      if (!ready)
        throw Error(
          "Your account is still loading. Please try again in a moment.",
        );
      if (user) sync.saveLocal(inventory);
      else localStorage.setItem("haven-inventory", JSON.stringify(inventory));
    },
    externalChange(key) {
      if (user) {
        if (key === `haven-account:${user.uid}`) {
          problem =
            "This account changed in another tab. Reload this tab before editing further.";
          ready = false;
          update();
        }
        return;
      }
      if (key === "haven-inventory") api.replace(guest());
    },
  };
}
