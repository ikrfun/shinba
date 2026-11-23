import React from 'react';
import { CodePane } from './CodePane.jsx';

export function EditorWorkspace({ visible, split, primary, secondary, focused, theme, vimEnabled, settingsReady,
  layout, bindings, onFocus, onPaneFocus, onClosePane, onToggleVim, onLayoutChange, onChange, onError, onNew, onEditor }) {
  return <div className="content code" onPointerDownCapture={onFocus} onFocusCapture={onFocus}
    style={{display:visible?'flex':'none'}}>
    <div className="code-columns">
      {['primary', ...(split ? ['secondary'] : [])].map(group => <CodePane key={group} group={group}
        doc={group==='primary' ? primary : secondary} active={focused===group} theme={theme}
        vimEnabled={vimEnabled} settingsReady={settingsReady} layout={layout} bindings={bindings}
        onToggleVim={onToggleVim} onLayoutChange={onLayoutChange} onChange={onChange} onError={onError}
        onNew={onNew} onFocus={()=>onPaneFocus(group)} onClosePane={onClosePane(group)} onEditor={onEditor} />)}
    </div>
  </div>;
}
