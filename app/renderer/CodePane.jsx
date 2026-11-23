import React, { useRef, useState } from 'react';
import Editor from '@monaco-editor/react';
import * as monaco from 'monaco-editor';
import { useVim } from './useVim.js';
import { shortcutLabel } from './ShortcutSettings.jsx';

export const documentModelPath = doc => doc.path ? monaco.Uri.file('/' + doc.path).with({query:`shinba=${doc.id}`}).toString() : `untitled:${doc.id}`;
export function CodePane({ doc, group, active, theme, vimEnabled, settingsReady, layout, bindings, onToggleVim, onLayoutChange, onChange, onFocus, onEditor, onError, onNew, onClosePane }) {
  const [editor,setEditor] = useState(null), status = useRef(null);
  useVim(editor, vimEnabled, status, onError);
  return <div className={`code-pane${active ? ' active-code-pane' : ''}`} onPointerDownCapture={onFocus} onFocusCapture={onFocus}>
    {doc ? <>
      <div className="toolbar">
        <span>{doc.label}</span><span>{shortcutLabel(bindings['go-definition'])}: Go to Definition</span>
        {onClosePane && <button aria-label="Close editor split" onClick={onClosePane}>Close split</button>}
        <button aria-pressed={layout.editorMinimap} onClick={()=>onLayoutChange({editorMinimap:!layout.editorMinimap})}>Minimap {layout.editorMinimap?'on':'off'}</button>
        <button onClick={onToggleVim} disabled={!settingsReady} aria-pressed={vimEnabled}>Vim {vimEnabled?'on':'off'}</button>
        <span className="vim-status" ref={status} aria-live="polite" />
      </div>
      <Editor path={documentModelPath(doc)} keepCurrentModel theme={theme.monaco} height="100%" value={doc.text}
        onChange={value=>onChange(doc.id,value || '')}
        onMount={instance=>{setEditor(instance);onEditor(group,instance);instance.onDidDispose(()=>{setEditor(current=>current===instance?null:current);onEditor(group,null,instance);});}}
        options={{minimap:{enabled:layout.editorMinimap},autoDetectHighContrast:false,automaticLayout:true}} />
    </> : <div className="empty-code-pane"><p>No file open</p><button onClick={onNew}>New tab</button>{onClosePane && <button aria-label="Close editor split" onClick={onClosePane}>Close split</button>}</div>}
  </div>;
}
