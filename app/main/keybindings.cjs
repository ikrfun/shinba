const actions = require('../shared/keybindings.json');
const modifiers = ['Mod', 'Control', 'Meta', 'Alt', 'Shift'];
const validCode = /^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Backquote|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal|Space|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/;
function defaults(platform = process.platform) {
  const result = Object.fromEntries(Object.entries(actions).map(([key, value]) => [key, value.default]));
  if (platform !== 'darwin') result['toggle-terminal'] = 'Mod+Backquote';
  return result;
}
function normalizeBinding(value) {
  if (value === null) return null;
  if (typeof value !== 'string') throw new Error('A shortcut must be a key combination');
  const parts = value.split('+'), code = parts.pop();
  if (!validCode.test(code) || parts.some(x => !modifiers.includes(x)) || new Set(parts).size !== parts.length)
    throw new Error('Invalid shortcut');
  if (!parts.length && !/^F(?:[1-9]|1[0-2])$/.test(code)) throw new Error('Use a modifier or a function key');
  return [...modifiers.filter(x => parts.includes(x)), code].join('+');
}
function normalizeKeybindings(input, { fallback = false } = {}) {
  if (!input || typeof input !== 'object' || Array.isArray(input)) {
    if (fallback) return defaults();
    throw new Error('Invalid shortcuts');
  }
  if (Object.keys(input).some(action => !Object.hasOwn(actions, action))) throw new Error('Unknown shortcut action');
  const result = {}, defaultKeys = defaults();
  const explicitlyUsed = new Set(Object.values(input).filter(value => typeof value === 'string').map(normalizeBinding));
  for (const action of Object.keys(actions)) {
    const value = Object.hasOwn(input, action) ? input[action] : (explicitlyUsed.has(defaultKeys[action]) ? null : defaultKeys[action]);
    result[action] = normalizeBinding(value);
  }
  const seen = new Map();
  for (const [action, binding] of Object.entries(result)) {
    if (binding && seen.has(binding)) throw new Error(`Shortcut is already assigned to ${actions[seen.get(binding)].label}`);
    if (binding) seen.set(binding, action);
  }
  return result;
}
function bindingFromInput(input, platform) {
  const code = input.code;
  if (!validCode.test(code || '')) return null;
  const mac = platform === 'darwin';
  const bits = [];
  if (mac ? input.meta : input.control) bits.push('Mod');
  if (mac && input.control) bits.push('Control');
  if (!mac && input.meta) bits.push('Meta');
  if (input.alt) bits.push('Alt');
  if (input.shift) bits.push('Shift');
  try { return normalizeBinding([...bits, code].join('+')); } catch { return null; }
}
function matchAction(input, bindings, platform = process.platform) {
  if (input.type !== 'keyDown' || input.isAutoRepeat) return null;
  const key = bindingFromInput(input, platform);
  return key ? Object.keys(actions).find(action => bindings[action] === key) || null : null;
}
module.exports = { defaults, normalizeBinding, normalizeKeybindings, bindingFromInput, matchAction };
