import React, { forwardRef, useEffect, useImperativeHandle, useRef, useState } from 'react';
import { Terminal } from '@xterm/xterm';
import { FitAddon } from '@xterm/addon-fit';
import { WorkspaceTab } from './WorkspaceTab.jsx';
const api = window.shinba;
const uid = () => crypto.randomUUID();
const newTab = () => { const id=uid(); return {id:uid(),panes:[id],active:id}; };

function TerminalPane({ id, enabled, active, theme, onFocus, onClose, canClose }) {
  const element=useRef(null), session=useRef(null);
  useEffect(() => {
    if (!enabled || session.current) return;
    const terminal=new Terminal({fontSize:13,fontFamily:'"Hack Nerd Font Mono", Menlo, Monaco, monospace',lineHeight:1.15,
      theme:{background:theme.colors['terminal.background'],foreground:theme.colors['terminal.foreground']}});
    const fit=new FitAddon(); terminal.loadAddon(fit); terminal.open(element.current); fit.fit();
    const unsubscribe=api.onTerminal((source,data)=>{ if(source===id) terminal.write(data); });
    terminal.onData(data=>api.terminalWrite(id,data));
    const resize=new ResizeObserver(()=>{
      if(element.current?.offsetWidth && element.current?.offsetHeight) { fit.fit(); api.terminalResize(id,terminal.cols,terminal.rows); }
    });
    resize.observe(element.current);
    const current={terminal,fit,unsubscribe,resize}; session.current=current;
    api.terminalStart(id,terminal.cols,terminal.rows).then(()=>{
      if(session.current===current) {api.terminalResize(id,terminal.cols,terminal.rows); if(active) terminal.focus();}
      else api.terminalClose(id);
    }).catch(error=>terminal.writeln('\r\n'+error.message));
  },[enabled,id]);
  useEffect(()=>{ if(session.current) session.current.terminal.options.theme={background:theme.colors['terminal.background'],foreground:theme.colors['terminal.foreground']}; },[theme]);
  useEffect(()=>{ if(!enabled||!session.current)return; const {terminal,fit}=session.current; requestAnimationFrame(()=>{
    if(element.current?.offsetWidth && element.current?.offsetHeight){fit.fit();api.terminalResize(id,terminal.cols,terminal.rows);if(active)terminal.focus();}
  }); },[enabled,active,id]);
  useEffect(()=>()=>{if(!session.current)return;const {terminal,unsubscribe,resize}=session.current;resize.disconnect();unsubscribe();terminal.dispose();session.current=null;api.terminalClose(id);},[id]);
  return <div className={`terminal-pane${active?' active-terminal':''}`} onFocusCapture={onFocus} onPointerDown={onFocus}>
    {canClose && <button className="terminal-pane-close" aria-label="Close terminal pane" onClick={onClose}>×</button>}
    <div className="terminal-content" ref={element} />
  </div>;
}

export const Term = forwardRef(function Term({ enabled, theme, height=240, onFocus }, ref) {
  const [tabs,setTabs]=useState(()=>[newTab()]), [activeTab,setActiveTab]=useState(null);
  const selected=activeTab || tabs[0].id;
  const tabsRef=useRef(tabs), selectedRef=useRef(selected); tabsRef.current=tabs; selectedRef.current=selected;
  useImperativeHandle(ref,()=>({
    split() { const pane=uid(); setTabs(current=>current.map(tab=>tab.id===selectedRef.current?{...tab,panes:[...tab.panes,pane],active:pane}:tab)); },
    newTab() { const tab=newTab(); setTabs(current=>[...current,tab]); setActiveTab(tab.id); },
  }),[]);
  const closeTab = id => {
    if(tabsRef.current.length===1) return;
    const remaining=tabsRef.current.filter(tab=>tab.id!==id); setTabs(remaining);
    if(selectedRef.current===id)setActiveTab(remaining[0].id);
  };
  return <div className="terminal" style={{display:enabled?'flex':'none',flexBasis:height}} onFocusCapture={onFocus}>
    <div className="terminal-tabs" aria-label="Terminal tabs">
      {tabs.map((tab,index)=><WorkspaceTab key={tab.id} className="terminal-tab" label={`Terminal ${index+1}`} active={tab.id===selected}
        onSelect={()=>setActiveTab(tab.id)} closeLabel={`Close terminal ${index+1}`} onClose={tabs.length>1 ? ()=>closeTab(tab.id) : undefined} />)}
      <button aria-label="New terminal tab" onClick={()=>{const tab=newTab();setTabs(current=>[...current,tab]);setActiveTab(tab.id);}}>+</button>
    </div>
    <div className="terminal-tab-content">
      {tabs.map(tab=><div key={tab.id} className="terminal-panes" style={{display:tab.id===selected?'flex':'none'}}>
        {tab.panes.map(id=><TerminalPane key={id} id={id} enabled={enabled && tab.id===selected} active={tab.active===id} theme={theme}
          onFocus={()=>{onFocus?.();setTabs(current=>current.map(item=>item.id===tab.id?{...item,active:id}:item));}}
          canClose={tab.panes.length>1} onClose={()=>setTabs(current=>current.map(item=>{if(item.id!==tab.id)return item;const panes=item.panes.filter(pane=>pane!==id);return {...item,panes,active:item.active===id?panes[0]:item.active};}))} />)}
      </div>)}
    </div>
  </div>;
});
