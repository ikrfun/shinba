import { useRef, useState } from 'react';
import { createAutosave } from './autosave.js';
const api = window.shinba;

export function useDocuments(setMessage) {
  const records = useRef(new Map()), pendingReads = useRef(new Map()), nextUntitled = useRef(1), generation = useRef(0);
  const [, render] = useState(0);
  const [conflict, setConflict] = useState(null), [busy, setBusy] = useState(false);
  const notify = () => render(value => value + 1);
  const all = () => [...records.current.values()];
  function create(path, text) {
    const doc = { id:crypto.randomUUID(), path, label:path || `Untitled-${nextUntitled.current++}`, text, saved:text, dirty:false, saving:false };
    doc.saver = createAutosave(async snapshot => {
      let result;
      do { result = await api.write(snapshot.path, snapshot.text, doc.saved, doc.resolution); } while (result.retry);
      doc.resolution = null;
      if (!result.saved) {
        setConflict({ ...result, id: doc.id });
        throw new Error('Resolve the file conflict before saving');
      }
      doc.saved = result.text;
      if (doc.text === snapshot.text) doc.text = result.text;
    }, (status,error) => {
      doc.dirty = status !== 'saved' || doc.text !== doc.saved;
      if (status === 'error') setMessage(`Failed to save ${doc.label}: ${error.message}`);
      else if (status === 'saved') setMessage(`${doc.label} autosaved`);
      notify();
    });
    records.current.set(doc.id,doc); notify(); return doc.id;
  }
  async function open(path) {
    const existing=all().find(doc=>doc.path===path);
    if(existing)return existing.id;
    if(pendingReads.current.has(path))return pendingReads.current.get(path);
    const currentGeneration = generation.current;
    const reading=api.read(path).then(text=>{
      if (currentGeneration !== generation.current) throw new Error('The project changed while opening the file');
      const again=all().find(doc=>doc.path===path);
      return again ? again.id : create(path,text);
    }).finally(()=>{ if (pendingReads.current.get(path) === reading) pendingReads.current.delete(path); });
    pendingReads.current.set(path,reading);return reading;
  }
  function change(id,text) {
    const doc=records.current.get(id); if(!doc || doc.text===text)return;
    doc.text=text; doc.dirty=doc.path ? text!==doc.saved : text.length>0;
    if(doc.path)doc.saver.schedule({path:doc.path,text});
    notify();
  }
  async function save(id) {
    const doc=records.current.get(id); if(!doc || doc.saving)return false;
    if(doc.path){await doc.saver.flush();return true;}
    doc.saving=true;notify();
    try {
      const text=doc.text, path=await api.saveAs(text);
      if(!path)return false;
      const existing=all().find(item=>item.id!==id && item.path===path);
      if(existing) throw new Error('That file is already open');
      doc.path=path;doc.label=path;doc.saved=text;doc.dirty=doc.text!==text;
      if(doc.dirty)doc.saver.schedule({path,text:doc.text});
      setMessage(`${path} saved`);return true;
    } finally {doc.saving=false;notify();}
  }
  async function close(id) {
    const doc=records.current.get(id);if(!doc || doc.saving)return false;
    if(doc.path)await doc.saver.flush();
    else if(doc.dirty && !await api.discardUntitled(doc.label))return false;
    records.current.delete(id);notify();return true;
  }
  async function prepareProjectSwitch() {
    for(const doc of all()){
      if(doc.saving)throw new Error(`Wait for ${doc.label} to finish saving`);
      if(doc.path)await doc.saver.flush();
      else if(doc.dirty && !await api.discardUntitled(doc.label))return false;
    }
    return true;
  }
  async function resolve(resolution) {
    const doc = records.current.get(conflict?.id);
    if (!doc || busy) return;
    setBusy(true);
    try {
      doc.resolution = resolution;
      doc.saver.schedule({ path: doc.path, text: doc.text });
      await doc.saver.flush();
      setConflict(null);
    } catch (error) { setMessage(`Could not save ${doc.label}: ${error.message}`); }
    finally { setBusy(false); }
  }
  function clear(){generation.current++;records.current.clear();pendingReads.current.clear();setConflict(null);notify();}
  return { conflict, busy, resolve, cancelConflict: () => setConflict(null), all, get:id=>records.current.get(id), open, createUntitled:()=>create(null,''), change, save, close, prepareProjectSwitch, clear,
    hasPending:()=>all().some(doc=>doc.saver.hasChanges() || (!doc.path && doc.dirty) || doc.saving) };
}
