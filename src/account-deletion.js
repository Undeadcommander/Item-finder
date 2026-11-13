// A separate dialog keeps sync notifications from resetting the confirmation steps.
export function openAccountDeletion({ email, remove, cancelled, completed }) {
  const dialog = document.createElement("dialog");
  dialog.className = "account-dialog deletion-dialog";
  dialog.setAttribute("aria-labelledby", "deletion-title");
  let step = 1, timer, deadline = 0, busy = false, finished = false;
  const stopTimer = () => clearInterval(timer);
  const close = () => {
    stopTimer();
    dialog.close();
  };
  dialog.addEventListener("cancel", (event) => {
    if (busy) event.preventDefault();
  });
  dialog.addEventListener("close", () => {
    stopTimer();
    dialog.remove();
    if (!finished) cancelled?.();
  }, { once: true });
  function paint(error = "") {
    stopTimer();
    dialog.innerHTML = `<div class="eyebrow">STEP ${step} OF 3</div>
      <h2 id="deletion-title">${step === 1 ? "Delete your Haven account?" : step === 2 ? "Slide to continue" : "Permanently delete this account?"}</h2>
      <p class="account-email" data-email></p>
      <p>This permanently removes your Haven account, its cloud inventory, and its account inventory and scan files on this browser. Your Google account and separate guest inventory are kept. Downloaded backups and copies on other devices are not erased remotely.</p>
      <p class="deletion-error" role="alert"></p>
      <div data-step></div>
      <button class="primary deletion-cancel" data-cancel>Cancel</button>
      <div data-action></div>`;
    dialog.querySelector("[data-email]").textContent = email;
    dialog.querySelector(".deletion-error").textContent = error;
    const cancel = dialog.querySelector("[data-cancel]");
    cancel.onclick = close;
    const content = dialog.querySelector("[data-step]");
    const action = dialog.querySelector("[data-action]");
    if (step === 1) {
      action.innerHTML = '<button class="secondary deletion-danger" data-continue>Continue to delete account</button>';
      action.querySelector("button").onclick = () => { step = 2; paint(); };
    } else if (step === 2) {
      content.innerHTML = `<p id="slide-help">Drag the handle all the way from right to left. With a keyboard, use Left Arrow, then Enter.</p>
        <div class="deletion-track"><span aria-hidden="true">← Slide to continue</span><button type="button" class="deletion-handle" role="slider" aria-label="Slide right to left to confirm" aria-describedby="slide-help" aria-valuemin="0" aria-valuemax="100" aria-valuenow="0">←</button></div>`;
      const track = content.querySelector(".deletion-track");
      const handle = content.querySelector(".deletion-handle");
      let progress = 0, startX = 0, pointer = null;
      const setProgress = (value) => {
        progress = Math.max(0, Math.min(100, value));
        handle.style.right = `${progress / 100 * (track.clientWidth - handle.offsetWidth)}px`;
        handle.setAttribute("aria-valuenow", String(Math.round(progress)));
        handle.setAttribute("aria-valuetext", `${Math.round(progress)} percent confirmed`);
      };
      const advance = () => { step = 3; deadline = Date.now() + 5000; paint(); };
      handle.onpointerdown = (event) => {
        if (!event.isPrimary || event.button !== 0) return;
        pointer = event.pointerId;
        startX = event.clientX;
        setProgress(0);
        handle.setPointerCapture(pointer);
      };
      handle.onpointermove = (event) => {
        if (event.pointerId === pointer)
          setProgress((startX - event.clientX) / (track.clientWidth - handle.offsetWidth) * 100);
      };
      handle.onpointerup = (event) => {
        if (event.pointerId !== pointer) return;
        pointer = null;
        if (progress >= 98) advance();
        else setProgress(0);
      };
      handle.onpointercancel = handle.onlostpointercapture = () => { pointer = null; setProgress(0); };
      handle.onkeydown = (event) => {
        if (!["ArrowLeft", "ArrowRight", "Home", "End", "Enter", " "].includes(event.key)) return;
        event.preventDefault();
        if (event.key === "ArrowLeft") setProgress(progress + 10);
        if (event.key === "ArrowRight") setProgress(progress - 10);
        if (event.key === "Home") setProgress(0);
        if (event.key === "End") setProgress(100);
        if ((event.key === "Enter" || event.key === " ") && progress === 100) advance();
      };
    } else {
      action.className = "deletion-final-action";
      content.innerHTML = '<p>You cannot undo this. Google will ask you to verify your identity before deletion starts.</p><p class="deletion-countdown" role="status"></p>';
      action.innerHTML = '<button class="secondary deletion-danger" data-delete hidden disabled>Permanently delete account</button>';
      const button = action.querySelector("button"), countdown = content.querySelector(".deletion-countdown");
      const tick = () => {
        const remaining = Math.max(0, Math.ceil((deadline - Date.now()) / 1000));
        countdown.textContent = remaining ? `Delete will be available in ${remaining} seconds.` : "You can still cancel and keep your account.";
        button.hidden = remaining > 0;
        button.disabled = remaining > 0;
        if (!remaining) stopTimer();
      };
      timer = setInterval(tick, 200);
      tick();
      button.onclick = async () => {
        if (busy || step !== 3 || Date.now() < deadline) return;
        busy = true;
        stopTimer();
        button.disabled = cancel.disabled = true;
        countdown.textContent = "Verifying and deleting your account…";
        try {
          await remove();
          finished = true;
          close();
          completed?.();
        } catch (error) {
          busy = false;
          deadline = Date.now() + 5000;
          paint(error.message || "Deletion did not finish. Please try again.");
        }
      };
    }
    cancel.focus();
  }
  document.body.append(dialog);
  dialog.showModal();
  paint();
  return { close };
}
