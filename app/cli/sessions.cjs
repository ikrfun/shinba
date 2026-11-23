const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { readBoard, readJson, writeJson, withLock, validate, saveBoard, withoutRevision, mergeBoard } = require('./board.cjs');

const validId = id => typeof id === 'string' && /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(id);
function paths(root, id) {
  if (id && !validId(id)) throw new Error('Invalid session ID');
  const dir = path.join(root, '.shinba');
  return { board: path.join(dir, 'boards', 'main.json'), boardLock: path.join(dir, 'boards', '.main.lock'),
    session: id ? path.join(dir, 'sessions', id) : null,
    state: id ? path.join(dir, 'sessions', id, 'state.json') : null,
    sessionLock: id ? path.join(dir, 'sessions', `${id}.lock`) : null };
}
async function begin(root, source) {
  const p = paths(root);
  const board = source || await withLock(p.boardLock, () => readBoard(p.board));
  validate(board);
  const id = crypto.randomUUID();
  const dest = paths(root, id);
  await fs.mkdir(dest.session, { recursive: true });
  await writeJson(dest.state, { base: board, working: board, resolution: null, aborted: false });
  return { id, board };
}
async function getState(p) {
  let state;
  try { state = await readJson(p.state); }
  catch (error) {
    if (error.code !== 'ENOENT') throw error;
    // Preserve and migrate drafts created by earlier development versions.
    const base = await readJson(path.join(p.session, 'base.json'));
    const working = await readJson(path.join(p.session, 'working.json'));
    state = { base, working, resolution: null, aborted: false };
  }
  if (state.aborted) throw new Error('Session is aborted');
  validate(state.base); validate(state.working);
  return state;
}
async function useSession(root, id, fn) {
  if (!validId(id)) throw new Error('A valid session ID is required');
  const p = paths(root, id);
  await fs.access(p.session);
  return withLock(p.sessionLock, async () => fn(await getState(p), p));
}
async function saveState(p, state) { await writeJson(p.state, state); }
async function update(root, id, working) {
  validate(working);
  return useSession(root, id, async (state, p) => {
    state.working = working; state.resolution = null;
    await saveState(p, state);
    return state;
  });
}
async function refresh(root, id) {
  return useSession(root, id, async (state, p) => withLock(p.boardLock, async () => {
    const current = await readBoard(p.board);
    const result = mergeBoard(withoutRevision(state.base), withoutRevision(state.working), withoutRevision(current));
    if (result.conflicts.length) return { refreshed: false, current, conflicts: result.conflicts };
    const working = { ...result.board, schemaVersion: current.schemaVersion, revision: current.revision };
    try { validate(working); } catch (error) { return { refreshed: false, current, error: error.message }; }
    state.base = current; state.working = working; state.resolution = null;
    await saveState(p, state);
    return { refreshed: true, board: working, base: current };
  }));
}
async function commit(root, id, resolution) {
  return useSession(root, id, async (state, p) => withLock(p.boardLock, async () => {
    const result = await saveBoard(p.board, state.base, state.working, resolution || state.resolution);
    if (!result.saved) return result;
    try {
      await saveState(p, { base: result.board, working: result.board, resolution: null, aborted: false });
    } catch (error) {
      // The shared board has already been atomically replaced; report that explicitly.
      return { ...result, sessionUpdateError: error.message };
    }
    return result;
  }));
}
module.exports = { paths, validId, begin, useSession, saveState, update, refresh, commit };
