/**
 * FPS Sensitivity Converter — script.js
 * ============================================================
 *
 * CONVERSION METHODOLOGY
 * ─────────────────────────────────────────────────────────────
 * Every game maps its in-game sensitivity value to a real-world
 * physical movement: "how many centimetres of mouse movement
 * does it take to rotate 360°?"  We call this cm/360.
 *
 * Formula:
 *   cm/360 = (360 / (sens × yaw)) / (dpi / 2.54)
 *
 * Where:
 *   sens  = in-game sensitivity value
 *   yaw   = degrees rotated per dot (game-specific constant)
 *   dpi   = mouse dots-per-inch
 *   /2.54 = converts inches → centimetres
 *
 * To convert sensitivity FROM game A TO game B at the same DPI:
 *   1. Compute source cm/360
 *   2. Solve for target sens: sens_B = (360 / (cm360 × (dpi/2.54))) / yaw_B
 *
 * YAW VALUES sourced from game engine data / community databases:
 *   Valorant        0.07  (confirmed engine value)
 *   CS:GO / CS2     0.022 (classic Source engine yaw)
 *   Apex Legends    0.022 (Source-derived engine)
 *   CoD (MW/WZ)     0.0066
 *   Fortnite        0.5589 (UE4 — sens maps to degrees-per-dot × scale)
 *   Marvel Rivals   0.1    (UE5 custom; empirically measured)
 *   Rainbow Six     0.00572958 (same as 1/(180/π) × scale factor)
 *   Battlefield 6   0.022  (Frostbite engine — matches 1:1 with CS at same DPI)
 *
 * eDPI = DPI × in-game sensitivity (effective DPI — hardware-agnostic measure)
 *
 * ============================================================
 */

'use strict';

/* ── Game database ──────────────────────────────────────────── */
/**
 * Each entry:
 *   name  {string}  Display name shown in dropdowns
 *   yaw   {number}  Degrees rotated per count/dot (the key constant)
 *   min   {number}  Minimum allowed in-game sensitivity
 *   max   {number}  Maximum allowed in-game sensitivity
 *   step  {number}  Typical decimal precision
 */
const GAMES = [
  { id: 'valorant',    name: 'Valorant',              yaw: 0.07,          min: 0.01,  max: 10,   step: 2 },
  { id: 'csgo',        name: 'CS:GO / CS2',           yaw: 0.022,         min: 0.01,  max: 64,   step: 2 },
  { id: 'apex',        name: 'Apex Legends',          yaw: 0.022,         min: 0.01,  max: 3,    step: 2 },
  { id: 'cod',         name: 'Call of Duty (MW/WZ)',  yaw: 0.0066,        min: 1,     max: 20,   step: 2 },
  { id: 'fortnite',    name: 'Fortnite',              yaw: 0.5589,        min: 0.01,  max: 100,  step: 2 },
  { id: 'marvel',      name: 'Marvel Rivals',         yaw: 0.1,           min: 0.01,  max: 50,   step: 2 },
  { id: 'r6',          name: 'Rainbow Six Siege',     yaw: 0.00572958,    min: 1,     max: 500,  step: 1 },
  { id: 'bf6',         name: 'Battlefield 6',         yaw: 0.022,         min: 1,     max: 150,  step: 1 },
];

/* ── Lookup map for fast access ─────────────────────────────── */
const GAME_MAP = Object.fromEntries(GAMES.map(g => [g.id, g]));

/* ── DOM references ─────────────────────────────────────────── */
const sourceGameEl  = document.getElementById('sourceGame');
const targetGameEl  = document.getElementById('targetGame');
const dpiInput      = document.getElementById('dpiInput');
const sensInput     = document.getElementById('sensInput');
const outputValue   = document.getElementById('outputValue');
const outputGameName = document.getElementById('outputGameName');
const outputPrimary = document.getElementById('outputPrimary');
const sourceEdpiEl  = document.getElementById('sourceEdpi');
const targetEdpiEl  = document.getElementById('targetEdpi');
const cm360El       = document.getElementById('cm360');
const copyBtn       = document.getElementById('copyBtn');
const swapBtn       = document.getElementById('swapBtn');
const warningBanner = document.getElementById('warningBanner');
const warningText   = document.getElementById('warningText');

/* ── State ───────────────────────────────────────────────────── */
let lastConvertedValue = null; // Raw number for copy
let copyTimeout = null;        // Debounce timer for copy feedback

/* ── Initialise dropdowns ───────────────────────────────────── */
function populateDropdowns() {
  GAMES.forEach(game => {
    const optSrc = document.createElement('option');
    optSrc.value = game.id;
    optSrc.textContent = game.name;
    sourceGameEl.appendChild(optSrc);

    const optTgt = document.createElement('option');
    optTgt.value = game.id;
    optTgt.textContent = game.name;
    targetGameEl.appendChild(optTgt);
  });

  // Default: CS:GO → Valorant
  sourceGameEl.value = 'csgo';
  targetGameEl.value = 'valorant';
}

/* ── localStorage persistence ───────────────────────────────── */
const STORAGE_KEY = 'fps_converter_v1';

function saveState() {
  try {
    const state = {
      sourceGame: sourceGameEl.value,
      targetGame: targetGameEl.value,
      dpi:        dpiInput.value,
      sens:       sensInput.value,
    };
    localStorage.setItem(STORAGE_KEY, JSON.stringify(state));
  } catch (_) {
    // localStorage unavailable — silent fail
  }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return false;
    const state = JSON.parse(raw);

    // Validate that saved game IDs still exist
    if (GAME_MAP[state.sourceGame]) sourceGameEl.value = state.sourceGame;
    if (GAME_MAP[state.targetGame]) targetGameEl.value = state.targetGame;

    // Validate and restore numbers
    const dpi = parseFloat(state.dpi);
    const sens = parseFloat(state.sens);
    if (isFinite(dpi) && dpi > 0)  dpiInput.value  = state.dpi;
    if (isFinite(sens) && sens > 0) sensInput.value = state.sens;

    return true;
  } catch (_) {
    return false;
  }
}

/* ── Input validation ───────────────────────────────────────── */
/**
 * Returns { valid, dpi, sens, sourceGame, targetGame, errorMsg }
 */
function validateInputs() {
  const sourceId = sourceGameEl.value;
  const targetId = targetGameEl.value;
  const dpiRaw   = dpiInput.value.trim();
  const sensRaw  = sensInput.value.trim();

  // Empty inputs — soft state (no warning, just no output)
  if (dpiRaw === '' || sensRaw === '') {
    return { valid: false, silent: true };
  }

  const dpi  = parseFloat(dpiRaw);
  const sens = parseFloat(sensRaw);

  if (!isFinite(dpi) || isNaN(dpi)) {
    return { valid: false, errorMsg: 'DPI must be a valid number.' };
  }
  if (dpi <= 0) {
    return { valid: false, errorMsg: 'DPI must be greater than 0.' };
  }
  if (dpi > 32000) {
    return { valid: false, errorMsg: 'DPI exceeds maximum supported value (32,000).' };
  }
  if (!isFinite(sens) || isNaN(sens)) {
    return { valid: false, errorMsg: 'Sensitivity must be a valid number.' };
  }
  if (sens <= 0) {
    return { valid: false, errorMsg: 'Sensitivity must be greater than 0.' };
  }

  return { valid: true, dpi, sens, sourceId, targetId };
}

/* ── Core conversion math ───────────────────────────────────── */
/**
 * computeCm360
 * How many centimetres of mouse movement = 360° rotation?
 *
 * counts_per_cm = dpi / 2.54
 * degrees_per_count = sens × yaw
 * counts_per_360 = 360 / degrees_per_count
 * cm_per_360 = counts_per_360 / counts_per_cm
 */
function computeCm360(sens, dpi, yaw) {
  const countsPerCm  = dpi / 2.54;
  const degPerCount  = sens * yaw;
  const countsPer360 = 360 / degPerCount;
  return countsPer360 / countsPerCm;
}

/**
 * computeSensFromCm360
 * Reverse: given a target cm/360 and game yaw, find the required sensitivity.
 *
 * counts_per_360 = cm360 × counts_per_cm
 * degrees_per_count = 360 / counts_per_360
 * sens = degrees_per_count / yaw
 */
function computeSensFromCm360(cm360, dpi, yaw) {
  const countsPerCm  = dpi / 2.54;
  const countsPer360 = cm360 * countsPerCm;
  const degPerCount  = 360 / countsPer360;
  return degPerCount / yaw;
}

/* ── Warning UI helpers ─────────────────────────────────────── */
function showWarning(msg) {
  warningText.textContent = msg;
  warningBanner.classList.add('visible');
}

function hideWarning() {
  warningBanner.classList.remove('visible');
}

/* ── Output UI helpers ──────────────────────────────────────── */
function clearOutput() {
  outputValue.textContent     = '—';
  outputGameName.textContent  = '—';
  sourceEdpiEl.textContent    = '—';
  targetEdpiEl.textContent    = '—';
  cm360El.textContent         = '—';
  outputPrimary.classList.remove('has-value');
  copyBtn.disabled = true;
  lastConvertedValue = null;
}

function flashValue(el) {
  el.classList.add('updating');
  requestAnimationFrame(() => {
    requestAnimationFrame(() => el.classList.remove('updating'));
  });
}

/* ── Format helpers ─────────────────────────────────────────── */
/**
 * Format a sensitivity value to a sensible number of decimals.
 * Avoids unnecessary trailing zeros while keeping precision.
 */
function formatSens(value) {
  if (!isFinite(value)) return '—';
  // Use up to 4 sig figs, but trim trailing zeros
  if (value >= 100) return value.toFixed(1);
  if (value >= 10)  return value.toFixed(2);
  if (value >= 1)   return value.toFixed(3);
  return value.toFixed(4).replace(/\.?0+$/, '') || value.toFixed(4);
}

function formatEdpi(dpi, sens) {
  const edpi = dpi * sens;
  return isFinite(edpi) ? Math.round(edpi).toLocaleString() : '—';
}

function formatCm360(cm) {
  if (!isFinite(cm)) return '—';
  return cm.toFixed(1) + ' cm';
}

/* ── Main conversion function ───────────────────────────────── */
function convert() {
  // Mark inputs as error-free first
  dpiInput.classList.remove('error');
  sensInput.classList.remove('error');

  const result = validateInputs();

  if (!result.valid) {
    hideWarning();
    clearOutput();

    if (!result.silent) {
      showWarning(result.errorMsg || 'Invalid input.');
      // Highlight which field is wrong
      if (result.errorMsg && result.errorMsg.toLowerCase().includes('dpi')) {
        dpiInput.classList.add('error');
      } else if (result.errorMsg && result.errorMsg.toLowerCase().includes('sens')) {
        sensInput.classList.add('error');
      } else {
        dpiInput.classList.add('error');
        sensInput.classList.add('error');
      }
    }
    return;
  }

  hideWarning();

  const { dpi, sens, sourceId, targetId } = result;
  const sourceGame = GAME_MAP[sourceId];
  const targetGame = GAME_MAP[targetId];

  // Compute shared cm/360 baseline from source
  const cm360 = computeCm360(sens, dpi, sourceGame.yaw);

  // Convert to target sensitivity
  const targetSens = computeSensFromCm360(cm360, dpi, targetGame.yaw);

  // Clamp and warn if out of target game's range (purely informational)
  if (targetSens < targetGame.min || targetSens > targetGame.max) {
    showWarning(
      `Result (${formatSens(targetSens)}) is outside ${targetGame.name}'s typical sensitivity range ` +
      `(${targetGame.min}–${targetGame.max}). Conversion is still mathematically correct.`
    );
  }

  // Update primary output
  flashValue(outputValue);
  outputValue.textContent    = formatSens(targetSens);
  outputGameName.textContent = targetGame.name.toUpperCase();
  outputPrimary.classList.add('has-value');
  lastConvertedValue = targetSens;
  copyBtn.disabled = false;

  // Update stats
  sourceEdpiEl.textContent = formatEdpi(dpi, sens);
  targetEdpiEl.textContent = formatEdpi(dpi, targetSens);
  cm360El.textContent      = formatCm360(cm360);

  // Persist
  saveState();
}

/* ── Swap button logic ──────────────────────────────────────── */
function swapGames() {
  const tmp = sourceGameEl.value;
  sourceGameEl.value = targetGameEl.value;
  targetGameEl.value = tmp;

  // Animate
  swapBtn.classList.add('swapping');
  swapBtn.addEventListener('animationend', () => {
    swapBtn.classList.remove('swapping');
  }, { once: true });

  convert();
}

/* ── Copy to clipboard ──────────────────────────────────────── */
function copyResult() {
  if (lastConvertedValue === null) return;

  const text = formatSens(lastConvertedValue);

  // Prefer Clipboard API; fall back to execCommand
  const doFallback = () => {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
      document.body.appendChild(ta);
      ta.select();
      document.execCommand('copy');
      document.body.removeChild(ta);
      onCopied();
    } catch (_) {
      // Cannot copy — silent fail
    }
  };

  if (navigator.clipboard && navigator.clipboard.writeText) {
    navigator.clipboard.writeText(text).then(onCopied).catch(doFallback);
  } else {
    doFallback();
  }
}

function onCopied() {
  copyBtn.classList.add('copied');
  const labelEl = copyBtn.querySelector('.copy-label');
  if (labelEl) labelEl.textContent = 'COPIED';

  clearTimeout(copyTimeout);
  copyTimeout = setTimeout(() => {
    copyBtn.classList.remove('copied');
    if (labelEl) labelEl.textContent = 'COPY';
  }, 2000);
}

/* ── Event listeners ────────────────────────────────────────── */
sourceGameEl.addEventListener('change', convert);
targetGameEl.addEventListener('change', convert);
dpiInput.addEventListener('input', convert);
sensInput.addEventListener('input', convert);
swapBtn.addEventListener('click', swapGames);
copyBtn.addEventListener('click', copyResult);

/* ── Keyboard accessibility for swap ───────────────────────── */
swapBtn.addEventListener('keydown', e => {
  if (e.key === 'Enter' || e.key === ' ') {
    e.preventDefault();
    swapGames();
  }
});

/* ── Bootstrap ──────────────────────────────────────────────── */
function init() {
  populateDropdowns();
  loadState();
  convert(); // Run conversion with restored (or default) values
}

document.addEventListener('DOMContentLoaded', init);
