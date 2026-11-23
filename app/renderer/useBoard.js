import { useCallback, useEffect, useRef, useState } from 'react';
import { createAutosave } from './autosave.js';

const api = window.shinba;
const keyFor = project => `shinba:board-session:${project.path}`;
function cleanNode(node) {
  const { selected, measured, dragging, resizing, positionAbsolute, ...persistent } = node;
  return persistent;
}
function cleanEdge(edge) {
  const { selected, ...persistent } = edge;
  return persistent;
}
function contents(board) {
  const { revision, schemaVersion, ...rest } = board;
  return rest;
}
function stable(value) {
  if (Array.isArray(value)) return value.map(stable);
  if (value && typeof value === 'object') return Object.fromEntries(Object.keys(value).sort().map(k => [k, stable(value[k])]));
  return value;
}
const same = (a, b) => JSON.stringify(stable(contents(a))) === JSON.stringify(stable(contents(b)));

export function useBoard(setMessage) {
  const [nodes, renderNodes] = useState([]), [edges, renderEdges] = useState([]);
  const [ready, setReady] = useState(false), [busy, renderBusy] = useState(false);
  const [dirty, setDirty] = useState(false), [external, setExternal] = useState(false);
  const [draftStatus, setDraftStatus] = useState('saved'), [conflict, setConflict] = useState(null);
  const state = useRef({ nodes: [], edges: [], project: null, id: null, base: null, working: null, busy: false, ready: false, external: false, generation: 0, refreshPending: false });
  const saves = useRef(null);
  const setBusy = value => { state.current.busy = value; renderBusy(value); };
  if (!saves.current) saves.current = createAutosave(async ({ id, board }) => {
    await api.writeDraft(id, board);
  }, (status, error) => {
    setDraftStatus(status);
    if (status === 'error') setMessage(`Failed to save board draft: ${error.message}`);
  });
  const snapshot = () => ({ ...state.current.working, nodes: state.current.nodes.map(cleanNode), edges: state.current.edges.map(cleanEdge) });
  const schedule = () => {
    const s = state.current;
    if (!s.ready || !s.id) return;
    const board = snapshot();
    if (same(board, s.working)) return;
    s.working = board;
    setDirty(!same(s.base, board));
    saves.current.schedule({ id: s.id, board });
  };
  const setNodes = useCallback(updater => {
    const s = state.current;
    if (!s.ready || s.busy) return;
    const next = typeof updater === 'function' ? updater(s.nodes) : updater;
    s.nodes = next; renderNodes(next); schedule();
  }, []);
  const setEdges = useCallback(updater => {
    const s = state.current;
    if (!s.ready || s.busy) return;
    const next = typeof updater === 'function' ? updater(s.edges) : updater;
    s.edges = next; renderEdges(next); schedule();
  }, []);
  const apply = (board, base = board) => {
    const s = state.current;
    s.base = base; s.working = board; s.nodes = board.nodes; s.edges = board.edges;
    renderNodes(board.nodes); renderEdges(board.edges); setDirty(!same(base, board));
  };
  const load = async project => {
    const s = state.current;
    s.ready = false; setReady(false); s.generation += 1; s.project = project;
    s.id = null; s.external = false; setExternal(false); setConflict(null);
    let id = localStorage.getItem(keyFor(project));
    let draft;
    if (id) {
      try { draft = await api.loadDraft(id); }
      catch (error) {
        // Never replace a missing or unreadable draft silently.
        throw new Error(`Could not restore board draft ${id}: ${error.message}`);
      }
    } else {
      const current = await api.load();
      const created = await api.beginDraft(current);
      id = created.id;
      try { localStorage.setItem(keyFor(project), id); }
      catch (error) { throw new Error(`Draft ${id} was created but its ID could not be stored: ${error.message}`); }
      draft = { base: current, working: current };
    }
    s.id = id;
    const refreshed = await api.refreshDraft(id);
    if (refreshed.refreshed) draft = { base: refreshed.base, working: refreshed.board };
    else { s.external = true; setExternal(true); }
    apply(draft.working, draft.base);
    s.ready = true; setReady(true); setDraftStatus('saved');
  };
  const flush = async () => { await saves.current.flush(); };
  const hasPending = () => saves.current.hasChanges();
  const commit = async resolution => {
    const s = state.current;
    if (!s.ready || s.busy) return;
    setBusy(true);
    try {
      await flush();
      const result = await api.saveDraft(s.id, resolution);
      if (!result.saved) {
        setConflict({ current: result.current, conflicts: result.conflicts, priorChoices: result.priorChoices });
        setMessage('Resolve all conflicts before saving the board.');
        return;
      }
      if (result.sessionUpdateError) {
        setMessage(`Board saved, but the draft could not be updated: ${result.sessionUpdateError}`);
        return;
      }
      apply(result.board);
      s.external = false; setExternal(false); setConflict(null);
      setMessage('Board saved.');
    } catch (error) { setMessage(`Could not save board: ${error.message}`); }
    finally {
      setBusy(false);
      if (s.refreshPending) { s.refreshPending = false; refreshHandler.current(s.project?.path); }
    }
  };
  const refresh = async project => {
    const s = state.current;
    if (!s.ready || s.project?.path !== project || !s.id) return;
    if (s.busy) { s.refreshPending = true; return; }
    if (document.activeElement?.closest?.('.card input, .card textarea, .card select')) {
      s.refreshPending = true; s.external = true; setExternal(true); return;
    }
    const generation = s.generation;
    setBusy(true);
    try {
      await flush();
      const result = await api.refreshDraft(s.id);
      if (s.generation !== generation) return;
      if (result.refreshed) { apply(result.board, result.base); s.external = false; setExternal(false); }
      else { s.external = true; setExternal(true); }
    } catch (error) { setMessage(`Could not refresh board: ${error.message}`); }
    finally {
      setBusy(false);
      if (s.refreshPending) { s.refreshPending = false; refreshHandler.current(s.project?.path); }
    }
  };
  const refreshHandler = useRef(refresh); refreshHandler.current = refresh;
  useEffect(() => {
    const unsubscribe = api.onBoardChanged(project => refreshHandler.current(project));
    const unsubscribeError = api.onBoardWatchError(project => {
      if (state.current.project?.path === project) setMessage('Could not watch board changes. Use Check updates to refresh.');
    });
    const onFocus = () => refreshHandler.current(state.current.project?.path);
    const onBlur = () => setTimeout(() => {
      const s = state.current;
      if (s.refreshPending && !s.busy) { s.refreshPending = false; refreshHandler.current(s.project?.path); }
    }, 0);
    document.addEventListener('focusout', onBlur);
    document.addEventListener('blur', onBlur, true);
    window.addEventListener('focus', onFocus);
    return () => { unsubscribe(); unsubscribeError(); document.removeEventListener('focusout', onBlur); document.removeEventListener('blur', onBlur, true); window.removeEventListener('focus', onFocus); };
  }, []);
  return { nodes, edges, setNodes, setEdges, ready, busy, dirty, external, draftStatus, conflict, setConflict, load, flush, hasPending, commit,
    check: () => refreshHandler.current(state.current.project?.path),
    retry: () => flush().catch(error => setMessage(`Could not save board draft: ${error.message}`)) };
}
