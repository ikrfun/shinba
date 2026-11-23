import React, { useEffect, useState } from 'react';

function display(value) {
  return value.missing ? '(deleted)' : typeof value.value === 'string' ? value.value : JSON.stringify(value.value, null, 2);
}
function isText(item) {
  return [item.working, item.current].every(value => value.missing || typeof value.value === 'string');
}
function lineDiff(left, right) {
  const a = left.split('\n'), b = right.split('\n');
  if (a.length * b.length > 90000) return [a.map(text => ({text,changed:true})), b.map(text => ({text,changed:true}))];
  const lengths = Array.from({length:a.length+1}, () => new Uint32Array(b.length+1));
  for (let i=a.length-1;i>=0;i--) for (let j=b.length-1;j>=0;j--)
    lengths[i][j] = a[i] === b[j] ? lengths[i+1][j+1]+1 : Math.max(lengths[i+1][j], lengths[i][j+1]);
  const l=[], r=[]; let i=0,j=0;
  while (i<a.length || j<b.length) {
    if (i<a.length && j<b.length && a[i]===b[j]) { l.push({text:a[i++],changed:false}); r.push({text:b[j++],changed:false}); }
    else if (j>=b.length || (i<a.length && lengths[i+1][j]>=lengths[i][j+1])) l.push({text:a[i++],changed:true});
    else r.push({text:b[j++],changed:true});
  }
  return [l,r];
}
function DiffText({ lines, side }) {
  return <pre className="conflict-diff">{lines.map((line,index) => <span key={index} className={line.changed ? `diff-${side}` : undefined}>{line.text}{'\n'}</span>)}</pre>;
}
export function BoardConflicts({ conflict, busy, onCancel, onSave }) {
  const [choices, setChoices] = useState({});
  const [custom, setCustom] = useState({});
  const [error, setError] = useState('');
  useEffect(() => { setChoices({}); setCustom({}); setError(''); }, [conflict]);
  if (!conflict) return null;
  const complete = conflict.conflicts.every(item => choices[item.key]);
  const choose = (key, choice) => setChoices(previous => ({ ...previous, [key]: choice }));
  const edit = item => {
    setCustom(previous => ({...previous, [item.key]: previous[item.key] ?? (item.working.missing ? display(item.current) : display(item.working))}));
    choose(item.key,'custom');
  };
  const submit = () => {
    try {
      const resolutions = { ...conflict.priorChoices };
      for (const item of conflict.conflicts) {
        const choice = choices[item.key];
        resolutions[item.key] = choice === 'custom'
          ? { choice, value: isText(item) ? (custom[item.key] ?? '') : JSON.parse(custom[item.key] ?? '') }
          : { choice };
      }
      setError('');
      onSave({ current: conflict.current, choices: resolutions });
    } catch (e) { setError(`The edited value must be valid JSON: ${e.message}`); }
  };
  return <div className="conflict-overlay" role="dialog" aria-modal="true" aria-labelledby="conflict-title">
    <div className="conflict-dialog">
      <header><div><h2 id="conflict-title">Resolve board conflicts</h2>
        <p>Review each change. The board will be checked again when you save.</p></div>
        <button onClick={onCancel} disabled={busy}>Close</button></header>
      <div className="conflict-list">
        {conflict.conflicts.map(item => {
          const [left,right] = lineDiff(display(item.working),display(item.current));
          return <section className="conflict-item" key={item.key}>
            <h3>{item.path.join(' / ') || 'Board'}</h3>
            {item.reason && <p role="alert">{item.reason}. Review the entire board before choosing a version.</p>}
            <details><summary>Base</summary><pre>{display(item.base)}</pre></details>
            <div className="conflict-columns">
              <div><h4>Your draft</h4><DiffText lines={left} side="draft" />
                <button disabled={busy} aria-pressed={choices[item.key] === 'working'} onClick={() => choose(item.key, 'working')}>Keep draft</button></div>
              <div><h4>Saved board</h4><DiffText lines={right} side="saved" />
                <button disabled={busy} aria-pressed={choices[item.key] === 'current'} onClick={() => choose(item.key, 'current')}>Keep saved</button></div>
            </div>
            <button disabled={busy} aria-pressed={choices[item.key] === 'custom'} onClick={() => edit(item)}>Edit result</button>
            {choices[item.key] === 'custom' && <label>Result{!isText(item) && ' (JSON)'}
              <textarea disabled={busy} value={custom[item.key] ?? ''} onChange={e => setCustom(previous => ({...previous,[item.key]:e.target.value}))} />
            </label>}
            <p className="conflict-status">{choices[item.key] ? `Resolved: ${choices[item.key]}` : 'Not resolved'}</p>
          </section>;
        })}
      </div>
      <footer>{error && <span role="alert">{error}</span>}<span>{Object.keys(choices).length} / {conflict.conflicts.length} resolved</span>
        <button disabled={!complete || busy} onClick={submit}>Save resolved board</button></footer>
    </div>
  </div>;
}
