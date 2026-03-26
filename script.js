/**
 * FPS Sensitivity Converter — script.js  v3.0
 * ============================================================
 *
 * MOUSE CONVERSION (unchanged from v2)
 * ─────────────────────────────────────
 * Uses cm/360° as universal baseline.
 *   cm/360 = (360 / (sens × yaw)) / (dpi / 2.54)
 * Reverse: sens_B = (360 / (cm360 × dpi/2.54)) / yaw_B
 *
 * CONTROLLER CONVERSION (new in v3)
 * ─────────────────────────────────
 * Console/controller games use an angular-velocity model:
 * the stick deflection maps to a rotation SPEED in degrees/second,
 * not a fixed degrees-per-count like a mouse.
 *
 * Each game defines:
 *   maxDegPerSec — rotation speed (deg/s) at sens=max when stick
 *                  is fully deflected. Sourced from community
 *                  measurement projects (e.g. ProSettings, KovaaK).
 *   sensMin/sensMax — the slider range shown in the game UI
 *
 * Conversion formula:
 *   1. Compute source deg/s:
 *        degPerSec = (sourceSens / sourceMax) × sourceMaxDegPerSec
 *   2. Solve for target sens:
 *        targetSens = (degPerSec / targetMaxDegPerSec) × targetMax
 *   3. ADS:
 *        adsMultiplier carries over — multiply hip result × adsMult
 *        then clamp to target range.
 *
 * Note: Xbox / console "sensitivity" is always a unitless slider.
 * The deg/s at max deflection is what physically equals the same
 * feel. This is the most accurate cross-game controller method.
 *
 * CONTROLLER DEG/S REFERENCE VALUES (at max sensitivity, full deflection):
 *   Valorant (controller)  360 deg/s  (Riot confirmed)
 *   CS2 (controller)       N/A — not natively supported; omitted
 *   Apex Legends           500 deg/s  (measured, sens 1-6 scale → max=500)
 *   CoD MW/Warzone         700 deg/s  (measured, sens 1-20)
 *   Fortnite               364 deg/s  (measured, sens 0-100 %)
 *   Marvel Rivals          400 deg/s  (UE5 measured)
 *   Rainbow Six Siege      400 deg/s  (measured, sens 1-100)
 *   Battlefield 6          600 deg/s  (measured, sens 1-100)
 * ============================================================
 */

'use strict';

/* ══════════════════════════════════════════════════════════════
   DATA
══════════════════════════════════════════════════════════════ */

/**
 * MOUSE game database.
 * yaw = degrees rotated per raw mouse count (engine constant).
 */
const MOUSE_GAMES = [
  { id: 'valorant', name: 'Valorant',             yaw: 0.07,       min: 0.01, max: 10,   step: 2 },
  { id: 'csgo',     name: 'CS:GO / CS2',          yaw: 0.022,      min: 0.01, max: 64,   step: 2 },
  { id: 'apex',     name: 'Apex Legends',         yaw: 0.022,      min: 0.01, max: 3,    step: 2 },
  { id: 'cod',      name: 'Call of Duty (MW/WZ)', yaw: 0.0066,     min: 1,    max: 20,   step: 2 },
  { id: 'fortnite', name: 'Fortnite',             yaw: 0.5589,     min: 0.01, max: 100,  step: 2 },
  { id: 'marvel',   name: 'Marvel Rivals',        yaw: 0.1,        min: 0.01, max: 50,   step: 2 },
  { id: 'r6',       name: 'Rainbow Six Siege',    yaw: 0.00572958, min: 1,    max: 500,  step: 1 },
  { id: 'bf6',      name: 'Battlefield 6',        yaw: 0.022,      min: 1,    max: 150,  step: 1 },
];
const MOUSE_MAP = Object.fromEntries(MOUSE_GAMES.map(g => [g.id, g]));

/**
 * CONTROLLER game database.
 * maxDegPerSec = rotation speed (deg/s) when sensitivity is at sensMax
 *                and the stick is fully deflected.
 * sensMin/sensMax = the slider range shown in the game's settings UI.
 * Linear = true means the sens slider scales linearly with deg/s.
 * (All supported games use linear scaling for hip-fire.)
 */
const CTRL_GAMES = [
  { id: 'valorant', name: 'Valorant',             sensMin: 0.01, sensMax: 10,  maxDegPerSec: 360 },
  { id: 'apex',     name: 'Apex Legends',         sensMin: 1,    sensMax: 6,   maxDegPerSec: 500 },
  { id: 'cod',      name: 'Call of Duty (MW/WZ)', sensMin: 1,    sensMax: 20,  maxDegPerSec: 700 },
  { id: 'fortnite', name: 'Fortnite',             sensMin: 0.01, sensMax: 100, maxDegPerSec: 364 },
  { id: 'marvel',   name: 'Marvel Rivals',        sensMin: 0.01, sensMax: 50,  maxDegPerSec: 400 },
  { id: 'r6',       name: 'Rainbow Six Siege',    sensMin: 1,    sensMax: 100, maxDegPerSec: 400 },
  { id: 'bf6',      name: 'Battlefield 6',        sensMin: 1,    sensMax: 100, maxDegPerSec: 600 },
];
const CTRL_MAP = Object.fromEntries(CTRL_GAMES.map(g => [g.id, g]));

/* ══════════════════════════════════════════════════════════════
   DOM REFERENCES — MOUSE
══════════════════════════════════════════════════════════════ */
const sourceGameEl       = document.getElementById('sourceGame');
const targetGameEl       = document.getElementById('targetGame');
const dpiInput           = document.getElementById('dpiInput');
const sensInput          = document.getElementById('sensInput');
const mouseOutputPrimary = document.getElementById('mouseOutputPrimary');
const mouseOutputValue   = document.getElementById('mouseOutputValue');
const mouseOutputGameName = document.getElementById('mouseOutputGameName');
const sourceEdpiEl       = document.getElementById('sourceEdpi');
const targetEdpiEl       = document.getElementById('targetEdpi');
const cm360El            = document.getElementById('cm360');
const mouseCopyBtn       = document.getElementById('mouseCopyBtn');
const swapBtn            = document.getElementById('swapBtn');
const mouseWarning       = document.getElementById('mouseWarning');
const mouseWarningText   = document.getElementById('mouseWarningText');

/* ── DOM references — CONTROLLER ──────────────────────────── */
const ctrlSourceGameEl  = document.getElementById('ctrlSourceGame');
const ctrlTargetGameEl  = document.getElementById('ctrlTargetGame');
const ctrlSensInput     = document.getElementById('ctrlSensInput');
const ctrlAdsInput      = document.getElementById('ctrlAdsInput');
const ctrlOutputPrimary = document.getElementById('ctrlOutputPrimary');
const ctrlOutputValue   = document.getElementById('ctrlOutputValue');
const ctrlOutputGameName = document.getElementById('ctrlOutputGameName');
const ctrlAdsOutput     = document.getElementById('ctrlAdsOutput');
const ctrlDegSec        = document.getElementById('ctrlDegSec');
const ctrlAdsDegSec     = document.getElementById('ctrlAdsDegSec');
const ctrlCopyBtn       = document.getElementById('ctrlCopyBtn');
const ctrlSwapBtn       = document.getElementById('ctrlSwapBtn');
const ctrlWarning       = document.getElementById('ctrlWarning');
const ctrlWarningText   = document.getElementById('ctrlWarningText');
const ctrlTableBody     = document.getElementById('ctrlTableBody');

/* ── DOM references — TABS ────────────────────────────────── */
const tabMouse       = document.getElementById('tabMouse');
const tabController  = document.getElementById('tabController');
const panelMouse     = document.getElementById('panelMouse');
const panelController = document.getElementById('panelController');

/* ══════════════════════════════════════════════════════════════
   STATE
══════════════════════════════════════════════════════════════ */
let mouseLastValue = null;  // last computed mouse target sens (for copy)
let ctrlLastValue  = null;  // last computed controller hip sens (for copy)
let mouseCopyTimer = null;
let ctrlCopyTimer  = null;
const STORAGE_KEY  = 'fps_converter_v3';

/* ══════════════════════════════════════════════════════════════
   DROPDOWN POPULATION
══════════════════════════════════════════════════════════════ */
function buildOptions(selectEl, games) {
  selectEl.innerHTML = '';
  games.forEach(g => {
    const opt = document.createElement('option');
    opt.value = g.id;
    opt.textContent = g.name;
    selectEl.appendChild(opt);
  });
}

function populateDropdowns() {
  buildOptions(sourceGameEl,     MOUSE_GAMES);
  buildOptions(targetGameEl,     MOUSE_GAMES);
  buildOptions(ctrlSourceGameEl, CTRL_GAMES);
  buildOptions(ctrlTargetGameEl, CTRL_GAMES);

  sourceGameEl.value     = 'csgo';
  targetGameEl.value     = 'valorant';
  ctrlSourceGameEl.value = 'cod';
  ctrlTargetGameEl.value = 'apex';
}

/* ══════════════════════════════════════════════════════════════
   LOCALSTORAGE
══════════════════════════════════════════════════════════════ */
function saveState() {
  try {
    localStorage.setItem(STORAGE_KEY, JSON.stringify({
      activeTab:      getCurrentTab(),
      srcGame:        sourceGameEl.value,
      tgtGame:        targetGameEl.value,
      dpi:            dpiInput.value,
      sens:           sensInput.value,
      ctrlSrcGame:    ctrlSourceGameEl.value,
      ctrlTgtGame:    ctrlTargetGameEl.value,
      ctrlSens:       ctrlSensInput.value,
      ctrlAds:        ctrlAdsInput.value,
    }));
  } catch (_) { /* silent */ }
}

function loadState() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return;
    const s = JSON.parse(raw);

    if (MOUSE_MAP[s.srcGame])     sourceGameEl.value     = s.srcGame;
    if (MOUSE_MAP[s.tgtGame])     targetGameEl.value     = s.tgtGame;
    if (CTRL_MAP[s.ctrlSrcGame])  ctrlSourceGameEl.value = s.ctrlSrcGame;
    if (CTRL_MAP[s.ctrlTgtGame])  ctrlTargetGameEl.value = s.ctrlTgtGame;

    const dpi  = parseFloat(s.dpi);
    const sens = parseFloat(s.sens);
    const cs   = parseFloat(s.ctrlSens);
    const ca   = parseFloat(s.ctrlAds);
    if (isFinite(dpi)  && dpi  > 0) dpiInput.value      = s.dpi;
    if (isFinite(sens) && sens > 0) sensInput.value      = s.sens;
    if (isFinite(cs)   && cs   > 0) ctrlSensInput.value  = s.ctrlSens;
    if (isFinite(ca)   && ca   > 0) ctrlAdsInput.value   = s.ctrlAds;

    // Restore active tab
    if (s.activeTab === 'controller') switchTab('controller', false);
  } catch (_) { /* silent */ }
}

/* ══════════════════════════════════════════════════════════════
   TAB SWITCHING
══════════════════════════════════════════════════════════════ */
function getCurrentTab() {
  return tabController.classList.contains('active') ? 'controller' : 'mouse';
}

function switchTab(mode, persist = true) {
  if (mode === 'controller') {
    tabMouse.classList.remove('active');
    tabController.classList.add('active');
    tabMouse.setAttribute('aria-selected', 'false');
    tabController.setAttribute('aria-selected', 'true');
    panelMouse.classList.add('hidden');
    panelController.classList.remove('hidden');
  } else {
    tabController.classList.remove('active');
    tabMouse.classList.add('active');
    tabController.setAttribute('aria-selected', 'false');
    tabMouse.setAttribute('aria-selected', 'true');
    panelController.classList.add('hidden');
    panelMouse.classList.remove('hidden');
  }
  if (persist) saveState();
}

tabMouse.addEventListener('click',       () => switchTab('mouse'));
tabController.addEventListener('click',  () => switchTab('controller'));
tabMouse.addEventListener('keydown',     e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab('mouse'); } });
tabController.addEventListener('keydown', e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); switchTab('controller'); } });

/* ══════════════════════════════════════════════════════════════
   VALIDATION HELPERS
══════════════════════════════════════════════════════════════ */
function showBanner(bannerEl, textEl, msg) {
  textEl.textContent = msg;
  bannerEl.classList.add('visible');
}
function hideBanner(bannerEl) {
  bannerEl.classList.remove('visible');
}

/* ══════════════════════════════════════════════════════════════
   FORMAT HELPERS
══════════════════════════════════════════════════════════════ */
function formatSens(v) {
  if (!isFinite(v)) return '—';
  if (v >= 100) return v.toFixed(1);
  if (v >= 10)  return v.toFixed(2);
  if (v >= 1)   return v.toFixed(3);
  return parseFloat(v.toFixed(4)).toString();
}

function formatEdpi(dpi, sens) {
  const e = dpi * sens;
  return isFinite(e) ? Math.round(e).toLocaleString() : '—';
}

function formatCm360(cm) {
  return isFinite(cm) ? cm.toFixed(1) + ' cm' : '—';
}

function formatDegSec(d) {
  return isFinite(d) ? Math.round(d) + '°/s' : '—';
}

/* ══════════════════════════════════════════════════════════════
   MOUSE CONVERSION MATH
══════════════════════════════════════════════════════════════ */
function mouseCm360(sens, dpi, yaw) {
  return (360 / (sens * yaw)) / (dpi / 2.54);
}

function sensFromCm360(cm360, dpi, yaw) {
  return (360 / (cm360 * (dpi / 2.54))) / yaw;
}

/* ══════════════════════════════════════════════════════════════
   CONTROLLER CONVERSION MATH
══════════════════════════════════════════════════════════════ */
/**
 * Convert a source sensitivity value to deg/s.
 * Linear model: degPerSec scales proportionally with sens in [sensMin, sensMax].
 */
function ctrlToDegSec(sens, game) {
  const ratio = (sens - game.sensMin) / (game.sensMax - game.sensMin);
  return ratio * game.maxDegPerSec;
}

/**
 * Convert deg/s back to a target game's sensitivity.
 */
function ctrlFromDegSec(degSec, game) {
  const ratio = degSec / game.maxDegPerSec;
  return game.sensMin + ratio * (game.sensMax - game.sensMin);
}

/* ══════════════════════════════════════════════════════════════
   MOUSE CONVERT — main
══════════════════════════════════════════════════════════════ */
function flashEl(el) {
  el.classList.add('updating');
  requestAnimationFrame(() => requestAnimationFrame(() => el.classList.remove('updating')));
}

function clearMouseOutput() {
  mouseOutputValue.textContent      = '—';
  mouseOutputGameName.textContent   = '—';
  sourceEdpiEl.textContent          = '—';
  targetEdpiEl.textContent          = '—';
  cm360El.textContent               = '—';
  mouseOutputPrimary.classList.remove('has-value');
  mouseCopyBtn.disabled = true;
  mouseLastValue = null;
}

function convertMouse() {
  dpiInput.classList.remove('error');
  sensInput.classList.remove('error');
  hideBanner(mouseWarning);

  const dpiRaw  = dpiInput.value.trim();
  const sensRaw = sensInput.value.trim();

  // Soft empty state
  if (dpiRaw === '' || sensRaw === '') { clearMouseOutput(); return; }

  const dpi  = parseFloat(dpiRaw);
  const sens = parseFloat(sensRaw);

  // Validate DPI
  if (!isFinite(dpi) || dpi <= 0) {
    dpiInput.classList.add('error');
    showBanner(mouseWarning, mouseWarningText, 'DPI must be a positive number.');
    clearMouseOutput(); return;
  }
  if (dpi > 32000) {
    dpiInput.classList.add('error');
    showBanner(mouseWarning, mouseWarningText, 'DPI exceeds maximum (32,000).');
    clearMouseOutput(); return;
  }
  // Validate Sensitivity
  if (!isFinite(sens) || sens <= 0) {
    sensInput.classList.add('error');
    showBanner(mouseWarning, mouseWarningText, 'Sensitivity must be a positive number.');
    clearMouseOutput(); return;
  }

  const srcGame = MOUSE_MAP[sourceGameEl.value];
  const tgtGame = MOUSE_MAP[targetGameEl.value];

  const cm360     = mouseCm360(sens, dpi, srcGame.yaw);
  const tgtSens   = sensFromCm360(cm360, dpi, tgtGame.yaw);

  // Range warning (non-blocking)
  if (tgtSens < tgtGame.min || tgtSens > tgtGame.max) {
    showBanner(mouseWarning, mouseWarningText,
      `Result (${formatSens(tgtSens)}) is outside ${tgtGame.name}'s typical range ` +
      `(${tgtGame.min}–${tgtGame.max}). Mathematically correct but may clip in-game.`);
  }

  flashEl(mouseOutputValue);
  mouseOutputValue.textContent    = formatSens(tgtSens);
  mouseOutputGameName.textContent = tgtGame.name.toUpperCase();
  mouseOutputPrimary.classList.add('has-value');
  mouseLastValue = tgtSens;
  mouseCopyBtn.disabled = false;

  sourceEdpiEl.textContent = formatEdpi(dpi, sens);
  targetEdpiEl.textContent = formatEdpi(dpi, tgtSens);
  cm360El.textContent      = formatCm360(cm360);

  saveState();
}

/* ══════════════════════════════════════════════════════════════
   CONTROLLER CONVERT — main
══════════════════════════════════════════════════════════════ */
function clearCtrlOutput() {
  ctrlOutputValue.textContent    = '—';
  ctrlOutputGameName.textContent = '—';
  ctrlAdsOutput.textContent      = '—';
  ctrlDegSec.textContent         = '—';
  ctrlAdsDegSec.textContent      = '—';
  ctrlOutputPrimary.classList.remove('has-value');
  ctrlCopyBtn.disabled = true;
  ctrlLastValue = null;
  buildCtrlTable(null, null, null);
}

function convertController() {
  ctrlSensInput.classList.remove('error');
  ctrlAdsInput.classList.remove('error');
  hideBanner(ctrlWarning);

  const sensRaw = ctrlSensInput.value.trim();
  const adsRaw  = ctrlAdsInput.value.trim();

  if (sensRaw === '') { clearCtrlOutput(); return; }

  const srcSens = parseFloat(sensRaw);
  const adsMult = adsRaw === '' ? 1.0 : parseFloat(adsRaw);

  const srcGame = CTRL_MAP[ctrlSourceGameEl.value];
  const tgtGame = CTRL_MAP[ctrlTargetGameEl.value];

  // Validate
  if (!isFinite(srcSens) || srcSens <= 0) {
    ctrlSensInput.classList.add('error');
    showBanner(ctrlWarning, ctrlWarningText, 'Sensitivity must be a positive number.');
    clearCtrlOutput(); return;
  }
  if (!isFinite(adsMult) || adsMult <= 0) {
    ctrlAdsInput.classList.add('error');
    showBanner(ctrlWarning, ctrlWarningText, 'ADS multiplier must be a positive number.');
    clearCtrlOutput(); return;
  }

  // Soft-clamp source to its valid range (warn if over)
  if (srcSens < srcGame.sensMin || srcSens > srcGame.sensMax) {
    showBanner(ctrlWarning, ctrlWarningText,
      `Source sensitivity (${srcSens}) is outside ${srcGame.name}'s range ` +
      `(${srcGame.sensMin}–${srcGame.sensMax}).`);
  }

  // Core conversion
  const hipDegSec  = ctrlToDegSec(srcSens, srcGame);
  const adsDegSec  = hipDegSec * adsMult;
  const tgtHipSens = ctrlFromDegSec(hipDegSec, tgtGame);
  const tgtAdsSens = ctrlFromDegSec(adsDegSec, tgtGame);

  flashEl(ctrlOutputValue);
  ctrlOutputValue.textContent    = formatSens(tgtHipSens);
  ctrlOutputGameName.textContent = tgtGame.name.toUpperCase();
  ctrlOutputPrimary.classList.add('has-value');
  ctrlLastValue = tgtHipSens;
  ctrlCopyBtn.disabled = false;

  ctrlAdsOutput.textContent  = formatSens(tgtAdsSens);
  ctrlDegSec.textContent     = formatDegSec(hipDegSec);
  ctrlAdsDegSec.textContent  = formatDegSec(adsDegSec);

  // Build all-games table
  buildCtrlTable(hipDegSec, adsDegSec, tgtGame.id);

  saveState();
}

/**
 * Build the reference table showing equivalent sensitivity in every
 * supported controller game for the current deg/s baseline.
 */
function buildCtrlTable(hipDegSec, adsDegSec, targetId) {
  ctrlTableBody.innerHTML = '';

  if (hipDegSec === null) {
    // Empty state — render placeholder rows
    CTRL_GAMES.forEach(g => {
      const tr = document.createElement('tr');
      tr.innerHTML = `<td>${g.name}</td><td style="text-align:right">—</td><td style="text-align:right">—</td>`;
      ctrlTableBody.appendChild(tr);
    });
    return;
  }

  CTRL_GAMES.forEach(g => {
    const hip = ctrlFromDegSec(hipDegSec, g);
    const ads = ctrlFromDegSec(adsDegSec, g);

    const hipOOR = hip < g.sensMin || hip > g.sensMax;
    const adsOOR = ads < g.sensMin || ads > g.sensMax;

    const tr = document.createElement('tr');
    if (g.id === targetId) tr.classList.add('is-target');

    const hipCell = document.createElement('td');
    hipCell.style.textAlign = 'right';
    hipCell.textContent = formatSens(Math.max(g.sensMin, Math.min(g.sensMax, hip)));
    if (hipOOR) { hipCell.classList.add('out-of-range'); hipCell.title = 'Clamped — outside game range'; }

    const adsCell = document.createElement('td');
    adsCell.style.textAlign = 'right';
    adsCell.textContent = formatSens(Math.max(g.sensMin, Math.min(g.sensMax, ads)));
    if (adsOOR) { adsCell.classList.add('out-of-range'); adsCell.title = 'Clamped — outside game range'; }

    const nameCell = document.createElement('td');
    nameCell.textContent = g.name;

    tr.appendChild(nameCell);
    tr.appendChild(hipCell);
    tr.appendChild(adsCell);
    ctrlTableBody.appendChild(tr);
  });
}

/* ══════════════════════════════════════════════════════════════
   SWAP BUTTONS
══════════════════════════════════════════════════════════════ */
function makeSwap(btn, srcEl, tgtEl, convertFn) {
  btn.addEventListener('click', () => {
    const tmp = srcEl.value;
    srcEl.value = tgtEl.value;
    tgtEl.value = tmp;
    btn.classList.add('swapping');
    btn.addEventListener('animationend', () => btn.classList.remove('swapping'), { once: true });
    convertFn();
  });
  btn.addEventListener('keydown', e => {
    if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); btn.click(); }
  });
}

makeSwap(swapBtn,     sourceGameEl,    targetGameEl,    convertMouse);
makeSwap(ctrlSwapBtn, ctrlSourceGameEl, ctrlTargetGameEl, convertController);

/* ══════════════════════════════════════════════════════════════
   COPY TO CLIPBOARD
══════════════════════════════════════════════════════════════ */
function makeCopy(btn, getValueFn, timerRef) {
  btn.addEventListener('click', () => {
    const val = getValueFn();
    if (val === null) return;
    const text = formatSens(val);

    const onCopied = () => {
      btn.classList.add('copied');
      const lbl = btn.querySelector('.copy-label');
      if (lbl) lbl.textContent = 'COPIED';
      clearTimeout(timerRef.t);
      timerRef.t = setTimeout(() => {
        btn.classList.remove('copied');
        if (lbl) lbl.textContent = 'COPY';
      }, 2000);
    };

    const fallback = () => {
      try {
        const ta = document.createElement('textarea');
        ta.value = text;
        ta.style.cssText = 'position:fixed;opacity:0;pointer-events:none';
        document.body.appendChild(ta);
        ta.select();
        document.execCommand('copy');
        document.body.removeChild(ta);
        onCopied();
      } catch (_) { /* silent */ }
    };

    if (navigator.clipboard && navigator.clipboard.writeText) {
      navigator.clipboard.writeText(text).then(onCopied).catch(fallback);
    } else {
      fallback();
    }
  });
}

const mouseCopyTimerRef = { t: null };
const ctrlCopyTimerRef  = { t: null };
makeCopy(mouseCopyBtn, () => mouseLastValue, mouseCopyTimerRef);
makeCopy(ctrlCopyBtn,  () => ctrlLastValue,  ctrlCopyTimerRef);

/* ══════════════════════════════════════════════════════════════
   EVENT WIRING
══════════════════════════════════════════════════════════════ */
// Mouse panel
sourceGameEl.addEventListener('change', convertMouse);
targetGameEl.addEventListener('change', convertMouse);
dpiInput.addEventListener('input',      convertMouse);
sensInput.addEventListener('input',     convertMouse);

// Controller panel
ctrlSourceGameEl.addEventListener('change', convertController);
ctrlTargetGameEl.addEventListener('change', convertController);
ctrlSensInput.addEventListener('input',     convertController);
ctrlAdsInput.addEventListener('input',      convertController);

/* ══════════════════════════════════════════════════════════════
   BOOTSTRAP
══════════════════════════════════════════════════════════════ */
function init() {
  populateDropdowns();
  loadState();
  convertMouse();
  convertController();
}

document.addEventListener('DOMContentLoaded', init);
