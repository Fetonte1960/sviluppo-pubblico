const MAX_IMAGES = 24;
const MAX_FILE_BYTES = 25 * 1024 * 1024;

function formatBytes(bytes) {
  if (!Number.isFinite(bytes) || bytes <= 0) return "0 B";
  const units = ["B", "KB", "MB", "GB"];
  const index = Math.min(Math.floor(Math.log(bytes) / Math.log(1024)), units.length - 1);
  const value = bytes / (1024 ** index);
  return `${value.toFixed(index === 0 ? 0 : 1)} ${units[index]}`;
}

function createField(labelText, control) {
  const label = document.createElement("label");
  label.className = "image-field";

  const caption = document.createElement("span");
  caption.textContent = labelText;

  label.append(caption, control);
  return label;
}

function createTextInput(placeholder, value, onChange) {
  const input = document.createElement("input");
  input.type = "text";
  input.placeholder = placeholder;
  input.value = value ?? "";
  input.addEventListener("input", () => onChange(input.value));
  return input;
}

function createSelect(options, value, onChange) {
  const select = document.createElement("select");

  for (const [optionValue, label] of options) {
    const option = document.createElement("option");
    option.value = optionValue;
    option.textContent = label;
    select.append(option);
  }

  select.value = value;
  select.addEventListener("change", () => onChange(select.value));
  return select;
}

export function initializeImageManager() {
  const fileInput = document.getElementById("image-files");
  const clearButton = document.getElementById("image-clear");
  const gallery = document.getElementById("image-gallery");
  const count = document.getElementById("image-count");
  const status = document.getElementById("image-manager-status");

  if (!fileInput || !clearButton || !gallery || !count || !status) return;

  const images = [];

  const setStatus = message => {
    status.textContent = message;
  };

  const releaseImage = image => {
    if (image.objectUrl) URL.revokeObjectURL(image.objectUrl);
  };

  const removeImage = id => {
    const index = images.findIndex(item => item.id === id);
    if (index < 0) return;

    releaseImage(images[index]);
    images.splice(index, 1);
    render();
  };

  const render = () => {
    gallery.replaceChildren();
    count.textContent = `${images.length} ${images.length === 1 ? "immagine" : "immagini"}`;
    clearButton.disabled = images.length === 0;

    if (!images.length) {
      const empty = document.createElement("div");
      empty.className = "image-empty";
      empty.textContent = "Seleziona fotografie di planimetrie, apparati, targhette, quadri, valvole o schemi.";
      gallery.append(empty);
      return;
    }

    images.forEach(item => {
      const card = document.createElement("article");
      card.className = "image-card";

      const preview = document.createElement("img");
      preview.className = "image-preview";
      preview.src = item.objectUrl;
      preview.alt = item.file.name;

      const header = document.createElement("div");
      header.className = "image-card-header";

      const fileInfo = document.createElement("div");
      const fileName = document.createElement("strong");
      fileName.textContent = item.file.name;

      const fileMeta = document.createElement("span");
      fileMeta.textContent = `${formatBytes(item.file.size)} · ${item.file.type || "immagine"}`;

      fileInfo.append(fileName, fileMeta);

      const remove = document.createElement("button");
      remove.type = "button";
      remove.className = "image-remove";
      remove.textContent = "Rimuovi";
      remove.addEventListener("click", () => removeImage(item.id));

      header.append(fileInfo, remove);

      const fields = document.createElement("div");
      fields.className = "image-fields";

      fields.append(
        createField("Farmacia / commessa", createTextInput("es. Farmacia Aurora", item.farmacia, value => { item.farmacia = value; })),
        createField("Sopralluogo", createTextInput("es. Sopralluogo 17/10/2026", item.sopralluogo, value => { item.sopralluogo = value; })),
        createField("Locale", createTextInput("es. locale tecnico", item.locale, value => { item.locale = value; })),
        createField("Componente / apparato", createTextInput("es. quadro Q1", item.componente, value => { item.componente = value; })),
        createField("Categoria", createSelect([
          ["apparato", "Apparato / componente"],
          ["targhetta", "Targhetta"],
          ["planimetria", "Planimetria"],
          ["schema", "Schema"],
          ["quadro", "Quadro"],
          ["valvola", "Valvola"],
          ["altro", "Altro"]
        ], item.categoria, value => { item.categoria = value; })),
        createField("Stato OCR", createSelect([
          ["non_elaborato", "Non elaborato"],
          ["da_verificare", "Da verificare"],
          ["verificato", "Verificato"],
          ["non_richiesto", "Non richiesto"]
        ], item.ocr, value => { item.ocr = value; }))
      );

      const description = document.createElement("textarea");
      description.rows = 3;
      description.placeholder = "Descrizione, numero marcatore, fonte o note tecniche…";
      description.value = item.descrizione;
      description.addEventListener("input", () => { item.descrizione = description.value; });

      const noteField = createField("Descrizione / note", description);
      noteField.classList.add("image-field-wide");
      fields.append(noteField);

      card.append(preview, header, fields);
      gallery.append(card);
    });
  };

  fileInput.addEventListener("change", () => {
    const selected = [...(fileInput.files ?? [])];
    let skipped = 0;

    for (const file of selected) {
      if (images.length >= MAX_IMAGES) {
        skipped++;
        continue;
      }

      if (!file.type.startsWith("image/") || file.size > MAX_FILE_BYTES) {
        skipped++;
        continue;
      }

      images.push({
        id: crypto.randomUUID ? crypto.randomUUID() : `img-${Date.now()}-${Math.random()}`,
        file,
        objectUrl: URL.createObjectURL(file),
        farmacia: "",
        sopralluogo: "",
        locale: "",
        componente: "",
        categoria: "apparato",
        ocr: "non_elaborato",
        descrizione: ""
      });
    }

    fileInput.value = "";
    setStatus(
      skipped
        ? `Aggiunte ${selected.length - skipped} immagini. ${skipped} file ignorati: limite 24 immagini, massimo 25 MB ciascuna e soli formati immagine.`
        : selected.length
          ? `Aggiunte ${selected.length} immagini alla sessione locale.`
          : ""
    );
    render();
  });

  clearButton.addEventListener("click", () => {
    images.forEach(releaseImage);
    images.splice(0, images.length);
    setStatus("Selezione locale svuotata.");
    render();
  });

  window.addEventListener("beforeunload", () => images.forEach(releaseImage));
  render();
}
