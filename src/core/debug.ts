/**
 * Dev shortcuts, enabled with `?debug=1` in the URL. Lets anyone jump to any
 * story beat in seconds instead of playing a full run. Bindings live in
 * RunScene.bindDebugKeys().
 */
export const DEBUG = typeof location !== 'undefined' && new URLSearchParams(location.search).has('debug');

export const debugState = {
  /** Player takes no damage. */
  god: false,
};

export const DEBUG_HELP = 'DEBUG  G god · X kill room · B boss room · N next floor · T item · H heal · [ ] karma ∓25';
