export const imageChoices = [
  ["living", "Living room"], ["bedroom", "Bedroom"], ["kitchen", "Kitchen"],
  ["office", "Office"], ["box", "Box"], ["drawers", "Drawers"],
  ["shelf", "Shelves"], ["wardrobe", "Wardrobe"],
];

const drawings = {
  living: '<rect x="65" y="65" width="230" height="65" rx="15"/><path d="M55 100h250v45H55zM75 145v12m210-12v12M180 65v65"/>',
  bedroom: '<path d="M65 140V50h230v90M55 140v17m250-17v17"/><rect x="75" y="65" width="95" height="30" rx="8"/><rect x="190" y="65" width="95" height="30" rx="8"/><path d="M55 100h250v40H55z"/>',
  kitchen: '<path d="M55 80h250v65H55zM55 90h250M140 90v55m80-55v55M75 110h40m45 0h40m40 0h40M60 30h95v35H60zm145 0h95v35h-95z"/><path d="M175 80V55q0-20 20-10"/>',
  office: '<path d="M55 100h250M70 100v55m220-55v55"/><rect x="125" y="30" width="110" height="55" rx="5"/><path d="M180 85v15m-35-10h70M80 100V70m-15 0h30l-5-25H70z"/>',
  box: '<path d="m85 65 95-35 95 35v70l-95 30-95-30zm0 0 95 35 95-35M180 100v65M130 48l95 35v27"/>',
  drawers: '<rect x="95" y="25" width="170" height="125" rx="5"/><path d="M95 65h170M95 105h170M165 45h30m-30 40h30m-30 40h30M110 150v10m140-10v10"/>',
  shelf: '<path d="M85 20v140M275 20v140M85 70h190M85 140h190M105 70V30h25v40m10 0V25h20v45m10 0-5-35 20-3 5 38M110 140v-45h65v45m30 0v-30h50v30"/>',
  wardrobe: '<rect x="100" y="20" width="160" height="135" rx="5"/><path d="M180 20v135M165 80v20m30-20v20M115 155v7m130-7v7"/>',
};

export function validLocationImage(value) {
  return value === undefined || value === null || imageChoices.some(([id]) => id === value)
    || (typeof value === "string" && value.length <= 180_000
      && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value));
}

export function locationImage(value) {
  if (!validLocationImage(value) || !value) return "";
  if (value.startsWith("data:")) return `<img class="location-photo" src="${value}" alt="" draggable="false">`;
  return `<svg class="room-art" viewBox="0 0 360 180" aria-hidden="true" fill="currentColor" fill-opacity=".16" stroke="currentColor" stroke-width="3" stroke-linejoin="round" stroke-linecap="round">${drawings[value]}</svg>`;
}

export async function prepareLocationPhoto(file) {
  if (!["image/jpeg", "image/png", "image/webp"].includes(file.type))
    throw Error("Choose a JPG, PNG, or WebP image.");
  if (file.size > 10_000_000) throw Error("Choose an image smaller than 10 MB.");
  const url = URL.createObjectURL(file);
  try {
    const image = new Image();
    image.src = url;
    await image.decode();
    const scale = Math.min(1, 800 / Math.max(image.naturalWidth, image.naturalHeight));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(image.naturalWidth * scale));
    canvas.height = Math.max(1, Math.round(image.naturalHeight * scale));
    const ctx = canvas.getContext("2d");
    ctx.fillStyle = "#ffffff";
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    ctx.drawImage(image, 0, 0, canvas.width, canvas.height);
    for (const quality of [.8, .65, .45, .25]) {
      const result = canvas.toDataURL("image/jpeg", quality);
      if (validLocationImage(result)) return result;
    }
    throw Error("This image is too detailed. Try a smaller image.");
  } catch (error) {
    throw Error(error.message?.startsWith("This image") ? error.message : "This image could not be read. Try another JPG, PNG, or WebP.");
  } finally {
    URL.revokeObjectURL(url);
  }
}

export function imageFields(isRoom) {
  const containerPresets = new Set(["box", "drawers", "shelf", "wardrobe"]);
  const choices = imageChoices.filter(([id]) => isRoom ? !containerPresets.has(id) : containerPresets.has(id));
  return `<fieldset class="location-image-picker"><legend>Image</legend><div class="location-image-preview" data-image-preview></div><div class="image-options"><label class="image-option"><input type="radio" name="image-choice" value="default"><span>Default</span></label>${choices.map(([id, name]) => `<label class="image-option"><input type="radio" name="image-choice" value="${id}">${locationImage(id)}<span>${name}</span></label>`).join("")}<label class="image-option" data-custom-choice hidden><input type="radio" name="image-choice" value="custom"><span>Your photo</span></label></div><label>Upload your own image<input type="file" data-image-upload accept="image/jpeg,image/png,image/webp" aria-describedby="image-help"></label><p id="image-help" class="modal-description">JPG, PNG, or WebP, up to 10 MB. Photos are resized to save space.</p><p data-image-status role="status"></p></fieldset>`;
}

export function bindImagePicker(dialog, initial, fallback) {
  let selected = initial || null, custom = initial?.startsWith("data:") ? initial : null;
  let pending = false;
  const picker = dialog.querySelector(".location-image-picker");
  const preview = picker.querySelector("[data-image-preview]");
  const status = picker.querySelector("[data-image-status]");
  const submit = dialog.querySelector('[type="submit"]');
  const refresh = () => {
    preview.innerHTML = locationImage(selected) || fallback;
    picker.querySelector("[data-custom-choice]").hidden = !custom;
    const choice = selected === custom && custom ? "custom" : selected || "default";
    picker.querySelectorAll('[name="image-choice"]').forEach((input) => { input.checked = input.value === choice; });
  };
  picker.querySelectorAll('[name="image-choice"]').forEach((input) => {
    input.onchange = () => {
      selected = input.value === "default" ? null : input.value === "custom" ? custom : input.value;
      refresh();
    };
  });
  picker.querySelector("[data-image-upload]").onchange = async (event) => {
    const file = event.target.files[0];
    if (!file) return;
    pending = true;
    picker.disabled = true;
    submit.disabled = true;
    status.textContent = "Preparing your image…";
    try {
      custom = await prepareLocationPhoto(file);
      selected = custom;
      refresh();
      status.textContent = "Photo ready. Save to apply your changes.";
    } catch (error) {
      status.textContent = error.message;
    } finally {
      pending = false;
      picker.disabled = false;
      submit.disabled = false;
      event.target.value = "";
    }
  };
  refresh();
  return () => {
    if (pending) throw Error("Please wait for your image to finish preparing.");
    return selected;
  };
}
