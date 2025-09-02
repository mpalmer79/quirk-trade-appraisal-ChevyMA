/* assets/app.js
    Quirk Sight-Unseen Trade Tool — VIN decode + Netlify Forms submit
    - VIN decode (NHTSA VPIC) prefills Year/Make/Model/Trim
    - Case-insensitive Make/Model selection; adds option if missing so selection “sticks”
    - Year list & common Make bootstrap if HTML left blank
    - Model loader for Make+Year
    - Spanish toggle (reads/writes sessionStorage 'quirk_lang')
    - Logo SVG injection + recolor
*/

/* -------------------- Small utilities -------------------- */
const $ = (sel) => document.querySelector(sel);

function debounce(fn, wait = 500) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

async function fetchWithTimeout(resource, options = {}) {
  const { timeout = 15000, ...rest } = options;
  const controller = new AbortController();
  const id = setTimeout(() => controller.abort(), timeout);
  try {
    return await fetch(resource, { ...rest, signal: controller.signal });
  } finally {
    clearTimeout(id);
  }
}

function validVin(v) {
  if (!v) return false;
  const s = String(v).trim().toUpperCase();
  return /^[A-HJ-NPR-Z0-9]{17}$/.test(s);
}

function setSelectValue(sel, val) {
  const el = typeof sel === "string" ? $(sel) : sel;
  if (!el) return;
  const opts = Array.from(el.options);
  const found = opts.find(
    (o) => o.value.toLowerCase() === String(val || "").toLowerCase()
  );
  if (found) {
    el.value = found.value;
  } else if (val && String(val).trim()) {
    const opt = new Option(val, val, true, true);
    el.add(opt);
    el.value = val;
  }
}

/* -------------------- VIN Decode -------------------- */
async function decodeVin(vin) {
  const url = `https://vpic.nhtsa.dot.gov/api/vehicles/DecodeVinValuesExtended/${encodeURIComponent(
    vin
  )}?format=json`;
  const res = await fetchWithTimeout(url);
  if (!res.ok) throw new Error("VIN decode failed");
  const js = await res.json();
  const r = js.Results && js.Results[0];
  if (!r) return {};
  return {
    year: r.ModelYear,
    make: r.Make,
    model: r.Model,
    trim: r.Trim,
  };
}

/* -------------------- Models for Make+Year -------------------- */
async function loadModelsFor(make, year) {
  const status = $("#modelStatus");
  const modelSel = $("#model");
  if (!modelSel) return;

  // Clear current
  modelSel.innerHTML = `<option value="" data-i18n="selectModel">Select Model</option>`;
  if (status) status.textContent = "";

  if (!make || !year) return;

  try {
    if (status) status.textContent = "Loading models…";
    const url = `https://vpic.nhtsa.dot.gov/api/vehicles/GetModelsForMakeYear/make/${encodeURIComponent(
      make
    )}/modelyear/${encodeURIComponent(year)}?format=json`;

    const res = await fetchWithTimeout(url);
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    const data = await res.json();

    const list = (data.Results || [])
      .map((r) => r.Model_Name)
      .filter(Boolean)
      .sort((a, b) => a.localeCompare(b));

    // Populate options
    for (const m of list) {
      modelSel.add(new Option(m, m));
    }
    if (status) status.textContent = list.length ? "" : "No models found for that Make/Year.";
  } catch (e) {
    if (status) status.textContent = "Could not load models.";
    console.error("Model load failed:", e);
  }
}

/* -------------------- Year/Make bootstrap (if blank in HTML) -------------------- */
function populateYearsIfEmpty() {
  const yearSel = $("#year");
  if (!yearSel || yearSel.options.length > 1) return;

  const thisYear = new Date().getFullYear();
  const min = thisYear - 30; // last ~30 years
  yearSel.add(new Option("Select Year", ""), undefined);
  for (let y = thisYear + 1; y >= min; y--) {
    yearSel.add(new Option(String(y), String(y)));
  }
}

function bootstrapCommonMakesIfEmpty() {
  const makeSel = $("#make");
  if (!makeSel || makeSel.options.length > 1) return;

  const common = [
    "Chevrolet","GMC","Ford","Ram","Toyota","Honda","Nissan","Hyundai","Kia",
    "Jeep","Volkswagen","Subaru","Mazda","BMW","Mercedes-Benz","Audi","Dodge",
    "Chrysler","Buick","Cadillac","Lincoln","Volvo"
  ];
  makeSel.add(new Option("Select Make", ""), undefined);
  for (const m of common) {
    makeSel.add(new Option(m, m));
  }
}

/* -------------------- Wire up events on DOM ready -------------------- */
document.addEventListener("DOMContentLoaded", () => {
  // Bootstrap selects if the HTML didn't include static options
  populateYearsIfEmpty();
  bootstrapCommonMakesIfEmpty();

  const yearSel = $("#year");
  const makeSel = $("#make");
  const modelSel = $("#model");
  const trimInput = $("#trim");
  const vinInput = $("#vin");
  const decodeBtn = $("#decodeVinBtn");

  // When year/make change, refresh models
  if (yearSel && makeSel) {
    const refreshModels = debounce(() => loadModelsFor(makeSel.value, yearSel.value), 300);
    yearSel.addEventListener("change", refreshModels);
    makeSel.addEventListener("change", refreshModels);
  }

  // VIN decode button
  if (decodeBtn && vinInput) {
    decodeBtn.addEventListener("click", async () => {
      const vin = (vinInput.value || "").trim().toUpperCase();
      if (!validVin(vin)) {
        const toast = $("#toast") || $("#modelStatus");
        if (toast) toast.textContent = "Enter a valid 17-character VIN.";
        vinInput.focus();
        return;
      }

      // UI pre-state
      const btnText = decodeBtn.textContent;
      decodeBtn.disabled = true;
      decodeBtn.textContent = "Decoding…";
      const status = $("#modelStatus");
      if (status) status.textContent = "";

      try {
        const { year, make, model, trim } = await decodeVin(vin);

        if (year) setSelectValue("#year", year);
        if (make) setSelectValue("#make", make);

        // load models for selected make+year, then set model
        if (make && year) {
          await loadModelsFor(make, year);
        }
        if (model) setSelectValue("#model", model);
        if (trim && trimInput) trimInput.value = trim || "";

        if (status) status.textContent = (model || make || year) ? "" : "VIN decoded, but details are limited.";
      } catch (e) {
        console.error("VIN decode failed:", e);
        const toast = $("#toast") || $("#modelStatus");
        if (toast) toast.textContent = "Could not decode VIN. Please fill fields manually.";
      } finally {
        decodeBtn.disabled = false;
        decodeBtn.textContent = btnText;
      }
    });
  }
});

/* -------------------- Logo injection & recolor -------------------- */
(async function injectAndRecolorQuirkLogo() {
  const slot = document.getElementById("quirkBrand");
  if (!slot) return;

  const BRAND_GREEN = "#0b7d2e"; // official green

  try {
    const res = await fetch("assets/quirk-logo.svg", { cache: "no-store" });
    if (!res.ok) throw new Error(`Logo HTTP ${res.status}`);
    const svgText = await res.text();

    const parser = new DOMParser();
    const doc = parser.parseFromString(svgText, "image/svg+xml");
    const svg = doc.documentElement;

    // Force all fills to brand green (letters + underline)
    svg.querySelectorAll("[fill]").forEach((node) => {
      node.setAttribute("fill", BRAND_GREEN);
    });

    if (!svg.getAttribute("viewBox")) {
      svg.setAttribute("preserveAspectRatio", "xMidYMid meet");
      if (!svg.getAttribute("width")) svg.setAttribute("width", 260);
      if (!svg.getAttribute("height")) svg.setAttribute("height", 64);
    }

    slot.innerHTML = "";
    slot.appendChild(svg);
  } catch (err) {
    console.error("Logo load/recolor failed:", err);
    const img = document.createElement("img");
    img.src = "assets/quirk-logo.svg";
    img.alt = "Quirk Auto";
    img.style.height = "64px";
    img.style.width = "auto";
    slot.innerHTML = "";
    slot.appendChild(img);
  }
})();

/* -------------------- Full i18n: English <-> Spanish -------------------- */
(function i18nFull() {
  const LANG_KEY = "quirk_lang";
  const STORAGE = window.sessionStorage; // per tab; resets on new session

  // Central dictionary. Keys are EN; values are ES.
  const MAP_EN_ES = new Map([
    ["title", "Tasación de intercambio sin inspección"],
    ["welcome", "Bienvenido al programa de tasación sin inspección de Quirk Auto Dealers"],
    ["instructions", "Complete este formulario con información precisa y completa sobre su vehículo. El valor de intercambio que le proporcionemos será válido siempre que la condición del vehículo coincida con sus respuestas."],
    ["decodeVinBtn", "Decodificar VIN y autocompletar"],
    ["clearBtn", "Borrar formulario"],
    ["nameLabel", "Nombre completo"],
    ["phoneLabel", "Número de teléfono"],
    ["phoneHint", "Formato: (###) ###-####"],
    ["emailLabel", "Correo electrónico"],
    ["vinLabel", "VIN (obligatorio)"],
    ["vinHint", "El VIN se escribe en mayúsculas automáticamente; las letras I, O, Q no son válidas."],
    ["mileageLabel", "Kilometraje actual"],
    ["yearLabel", "Año"],
    ["makeLabel", "Marca"],
    ["modelLabel", "Modelo"],
    ["trimLabel", "Nivel de equipamiento (si se conoce)"],
    ["extColorLabel", "Color exterior"],
    ["intColorLabel", "Color interior"],
    ["keysLabel", "Número de llaves incluidas"],
    ["titleStatus", "Estado del título"],
    ["ownersLabel", "Número de propietarios (estimado OK)"],
    ["accidentLabel", "¿Ha estado el vehículo involucrado en un accidente?"],
    ["accidentRepair", "Si es así, ¿fue reparado profesionalmente?"],
    ["vehDetails", "Detalles del vehículo"],
    ["vehCondition", "Condición del vehículo"],
    ["warnings", "¿Alguna luz de advertencia en el tablero?"],
    ["mech", "Problemas mecánicos"],
    ["cosmetic", "Problemas cosméticos"],
    ["interior", "¿Interior limpio y sin daños?"],
    ["mods", "¿Piezas o modificaciones no originales?"],
    ["smells", "¿Olores inusuales?"],
    ["service", "¿Mantenimientos al día?"],
    ["tires", "Estado de los neumáticos"],
    ["brakes", "Estado de los frenos"],
    ["wearOther", "Otros elementos de desgaste (¿problemas?)"],
    ["photos", "Fotos (opcional)"],
    ["photosExterior", "Fotos del exterior"],
    ["photosInterior", "Fotos del interior"],
    ["photosDash", "Tablero / Odómetro"],
    ["photosDamage", "Daños / defectos"],
    ["photoHint", "Máx 10MB por archivo; 24 archivos en total."],
    ["finalDisclaimerTitle", "Aviso final"],
    ["finalDisclaimer", "Confirmo que la información proporcionada es correcta a mi leal saber y entender. Entiendo que el valor de tasación puede cambiar si la condición real del vehículo no coincide con los detalles anteriores."],
    ["agreeLabel", "Acepto y confirmo"],
    ["submit", "Obtener mi tasación"],
    ["submitAnother", "Enviar otro vehículo"],
    ["backToDealer", "Volver a Quirk Chevrolet Braintree"],
    ["successTitle", "¡Gracias! - Quirk Chevrolet Braintree"],
    ["successHeading", "¡Gracias!"],
    ["successMessage", "Hemos recibido los detalles de su intercambio. Un especialista de Quirk Chevrolet Braintree se pondrá en contacto con usted en breve."]
  ]);

  function translateDoc(lang) {
    if (lang !== "es") return; // Only translate if Spanish requested
    document.querySelectorAll("[data-i18n]").forEach((el) => {
      const key = el.getAttribute("data-i18n");
      if (MAP_EN_ES.has(key)) {
        const val = MAP_EN_ES.get(key);
        if (el.tagName === "INPUT" || el.tagName === "TEXTAREA" || el.tagName === "SELECT") {
          el.placeholder = val;
        } else if (el.tagName === "TITLE") {
          document.title = val;
        } else {
          el.textContent = val;
        }
      }
    });
  }

  // Default to English; use stored value for this tab only
  let lang = STORAGE.getItem(LANG_KEY);
  if (!lang) {
    lang = "en";
    STORAGE.setItem(LANG_KEY, lang);
  }
  if (lang === "es") translateDoc("es");

  // Toggle button switches language for THIS TAB ONLY
  const btn = document.getElementById("langToggle");
  if (btn) {
    btn.addEventListener("click", () => {
      const next = STORAGE.getItem(LANG_KEY) === "es" ? "en" : "es";
      STORAGE.setItem(LANG_KEY, next);
      location.reload();
    });
  }
})();
