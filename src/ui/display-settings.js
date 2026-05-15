/**
 * Display / privacy UI settings — hide live video preview while keeping inference.
 */

const STORAGE_KEY = 'argus.uiSettings.v1';

/** @typedef {{ showVideoPreview: boolean }} UiSettings */

export const DEFAULTS = {
  showVideoPreview: true,
};

/**
 * @returns {UiSettings}
 */
export function loadUiSettings() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return { ...DEFAULTS };
    const parsed = JSON.parse(raw);
    return {
      showVideoPreview:
        typeof parsed.showVideoPreview === 'boolean'
          ? parsed.showVideoPreview
          : DEFAULTS.showVideoPreview,
    };
  } catch {
    return { ...DEFAULTS };
  }
}

/**
 * @param {Partial<UiSettings>} partial
 * @returns {UiSettings}
 */
export function saveUiSettings(partial) {
  const next = { ...loadUiSettings(), ...partial };
  localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
  return next;
}

/**
 * @param {boolean} show
 */
export function applyVideoPreview(show) {
  const stage = document.querySelector('.stage');
  if (!stage) return;
  stage.classList.toggle('stage--preview-hidden', !show);
}

/**
 * Wire checkbox; call once on page load.
 * @returns {() => UiSettings}
 */
export function bindVideoPreviewToggle() {
  const cb = /** @type {HTMLInputElement | null} */ (document.getElementById('ui-show-video'));
  let settings = loadUiSettings();

  const sync = () => {
    if (cb) cb.checked = settings.showVideoPreview;
    applyVideoPreview(settings.showVideoPreview);
  };

  cb?.addEventListener('change', () => {
    settings = saveUiSettings({ showVideoPreview: cb.checked });
    applyVideoPreview(settings.showVideoPreview);
  });

  sync();
  return () => settings;
}

/** @type {() => UiSettings} */
let getSettings = () => loadUiSettings();

/**
 * @param {() => UiSettings} fn
 */
export function setSettingsGetter(fn) {
  getSettings = fn;
}

export function isVideoPreviewVisible() {
  return getSettings().showVideoPreview;
}
