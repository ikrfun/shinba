import React, { useEffect, useState } from 'react';
import actions from '../shared/keybindings.json';
const api = window.shinba;
const validCode = /^(?:Key[A-Z]|Digit[0-9]|F(?:[1-9]|1[0-2])|Backquote|Comma|Period|Slash|Semicolon|Quote|BracketLeft|BracketRight|Backslash|Minus|Equal|Space|ArrowUp|ArrowDown|ArrowLeft|ArrowRight)$/;
function capture(event) {
  if (!validCode.test(event.code)) return null;
  const mac = api.platform === 'darwin', parts = [];
  if (mac ? event.metaKey : event.ctrlKey) parts.push('Mod');
  if (mac && event.ctrlKey) parts.push('Control');
  if (!mac && event.metaKey) parts.push('Meta');
  if (event.altKey) parts.push('Alt');
  if (event.shiftKey) parts.push('Shift');
  if (!parts.length && !/^F(?:[1-9]|1[0-2])$/.test(event.code)) return null;
  return [...parts,event.code].join('+');
}
export function shortcutLabel(binding) {
  if (!binding) return 'Unassigned';
  return binding.split('+').map(part => ({Mod:api.platform==='darwin'?'⌘':'Ctrl',Control:'Ctrl',Meta:'Meta',Alt:'Alt',Shift:'Shift',Backquote:'`',Comma:',',Period:'.',Slash:'/',Space:'Space'}[part] || part.replace(/^Key|^Digit/,''))).join(' + ');
}
export function ShortcutSettings({ bindings, defaultBindings, onChange, disabled }) {
  const [recording,setRecording] = useState(null), [error,setError] = useState('');
  const stop = () => { setRecording(null); api.setShortcutCapture(false).catch(() => {}); };
  useEffect(() => {
    if (!recording) return;
    const keydown = event => {
      event.preventDefault(); event.stopImmediatePropagation();
      if (event.repeat) return;
      if (event.key === 'Escape') { stop(); return; }
      const binding = capture(event);
      if (!binding) { setError('Use a modifier with a key, or a function key.'); return; }
      const action = recording;
      stop();
      onChange({ ...bindings, [action]: binding }).then(() => setError('')).catch(e => setError(e.message));
    };
    window.addEventListener('keydown',keydown,true);
    return () => window.removeEventListener('keydown',keydown,true);
  }, [recording, bindings, onChange]);
  useEffect(() => () => { api.setShortcutCapture(false).catch(() => {}); }, []);
  const start = async action => {
    try { await api.setShortcutCapture(true); setError(''); setRecording(action); }
    catch (e) { setError(e.message); }
  };
  const update = next => onChange(next).then(()=>setError('')).catch(e=>setError(e.message));
  return <section className="settings-section">
    <div className="settings-section-header"><div><h2>Keyboard shortcuts</h2><p>Choose a shortcut, then press a key combination. Press Esc to cancel.</p></div>
      <button disabled={disabled || !!recording} onClick={() => update(defaultBindings)}>Reset all</button></div>
    {error && <p className="settings-error" role="alert">{error}</p>}
    <div className="shortcut-list">{Object.entries(actions).map(([id, action]) => <div className="shortcut-row" key={id}>
      <span>{action.label}</span><div className="shortcut-actions">
        <button aria-label={`Change ${action.label} shortcut`} aria-pressed={recording===id} disabled={disabled || (!!recording && recording!==id)}
          onClick={() => recording===id ? stop() : start(id)}>{recording===id ? 'Press keys…' : shortcutLabel(bindings[id])}</button>
        <button aria-label={`Clear ${action.label} shortcut`} disabled={disabled || !!recording || !bindings[id]} onClick={() => update({...bindings,[id]:null})}>Clear</button>
      </div></div>)}</div>
  </section>;
}
