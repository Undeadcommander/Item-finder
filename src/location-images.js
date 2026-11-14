export const imageChoices = [
  ["living", "Living room"], ["bedroom", "Bedroom"], ["kitchen", "Kitchen"],
  ["office", "Office"], ["box", "Box"], ["drawers", "Drawers"],
  ["shelf", "Shelves"], ["wardrobe", "Wardrobe"],
];

export const itemImageChoices = [
  ["keys", "Keys"], ["book", "Book"], ["phone", "Phone"], ["laptop", "Laptop"],
  ["headphones", "Headphones"], ["camera", "Camera"], ["tools", "Tools"],
  ["clothing", "Clothing"], ["shoes", "Shoes"], ["documents", "Documents"],
  ["mug", "Mug"], ["cables", "Cables"],
];
const itemDrawings = {
  keys: '<circle cx="8" cy="8" r="5"/><circle cx="7" cy="7" r="1"/><path d="m12 12 9 9m-3-3 3-3m-6 0 3-3"/>',
  book: '<path d="M3 4q5-2 9 1 4-3 9-1v16q-5-2-9 1-4-3-9-1ZM12 5v16M6 8h3m6 0h3M6 12h3m6 0h3"/>',
  phone: '<rect x="6" y="2" width="12" height="20" rx="2"/><path d="M10 5h4M10 19h4"/>',
  laptop: '<rect x="4" y="3" width="16" height="13" rx="1"/><path d="m4 16-3 5h22l-3-5M9 18h6"/>',
  headphones: '<path d="M3 14v-3a9 9 0 0 1 18 0v3"/><rect x="3" y="12" width="5" height="9" rx="2"/><rect x="16" y="12" width="5" height="9" rx="2"/>',
  camera: '<path d="M2 7h5l2-3h6l2 3h5v14H2Z"/><circle cx="12" cy="14" r="4"/><path d="M18 10h1"/>',
  tools: '<path d="m4 3 5 5-2 2-5-5v6l5 2 9 9 5-5-9-9-2-6ZM4 20l5-5m6-10 4-4 3 3-4 4"/>',
  clothing: '<path d="m8 3-6 4 3 6 3-2v11h8V11l3 2 3-6-6-4q-4 5-8 0Z"/>',
  shoes: '<path d="M3 5h6l2 8 10 4v4H2V10Zm8 8-3 2m6-1-3 2m6-1-3 2M2 18h9"/>',
  documents: '<path d="M6 2h10l5 5v12H6ZM16 2v5h5M3 6v16h14M9 11h9m-9 4h7"/>',
  mug: '<path d="M3 7h13v11a4 4 0 0 1-4 4H7a4 4 0 0 1-4-4ZM16 8h3a3 3 0 0 1 0 6h-3M6 2v2m4-3v3m4-2v2"/>',
  cables: '<path d="M4 2v4m4-4v4M3 6h6v5H3Zm3 5v5a5 5 0 0 0 10 0v-3M14 7h6v6h-6Zm1-4h4v4"/>',
};

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
  return validImage(value, imageChoices);
}

export function validItemImage(value) {
  return validImage(value, itemImageChoices);
}

function validImage(value, choices) {
  return value === undefined || value === null || choices.some(([id]) => id === value)
    || (typeof value === "string" && value.length <= 180_000
      && /^data:image\/jpeg;base64,[A-Za-z0-9+/]+={0,2}$/.test(value));
}

export function itemImage(value) {
  if (!validItemImage(value) || !value) return "";
  if (value.startsWith("data:")) return locationImage(value);
  return `<svg class="item-art" viewBox="0 0 24 24" aria-hidden="true" fill="currentColor" fill-opacity=".12" stroke="currentColor" stroke-width="1.5" stroke-linejoin="round" stroke-linecap="round">${itemDrawings[value]}</svg>`;
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

export function imageFields(kind) {
  const containerPresets = new Set(["box", "drawers", "shelf", "wardrobe"]);
  const choices = kind === "item" ? itemImageChoices : imageChoices.filter(([id]) => kind ? !containerPresets.has(id) : containerPresets.has(id));
  const renderImage = kind === "item" ? itemImage : locationImage;
  return `<fieldset class="location-image-picker"><legend>Image</legend><div class="location-image-preview" data-image-preview></div><div class="image-options"><label class="image-option"><input type="radio" name="image-choice" value="default"><span>Default</span></label>${choices.map(([id, name]) => `<label class="image-option"><input type="radio" name="image-choice" value="${id}">${renderImage(id)}<span>${name}</span></label>`).join("")}<label class="image-option" data-custom-choice hidden><input type="radio" name="image-choice" value="custom"><span>Your photo</span></label></div><label>Upload your own image<input type="file" data-image-upload accept="image/jpeg,image/png,image/webp" aria-describedby="image-help"></label><p id="image-help" class="modal-description">JPG, PNG, or WebP, up to 10 MB. Photos are resized to save space.</p><p data-image-status role="status"></p></fieldset>`;
}

export function bindImagePicker(dialog, initial, fallback, renderImage = locationImage) {
  let selected = initial || null, custom = initial?.startsWith("data:") ? initial : null;
  let pending = false;
  const picker = dialog.querySelector(".location-image-picker");
  const preview = picker.querySelector("[data-image-preview]");
  const status = picker.querySelector("[data-image-status]");
  const submit = dialog.querySelector('[type="submit"]');
  const refresh = () => {
    preview.innerHTML = renderImage(selected) || fallback;
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
