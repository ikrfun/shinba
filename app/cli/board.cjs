const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { isDeepStrictEqual: equal } = require('node:util');

const ABSENT = Symbol('absent');
const isObject = value => value !== ABSENT && value !== null && typeof value === 'object' && !Array.isArray(value);
const wrapped = value => value === ABSENT ? { missing: true } : { value };
const emptyBoard = () => ({ id: 'main', name: 'メインボード', nodes: [], edges: [], schemaVersion: 1, revision: 0 });
const withoutRevision = board => {
  const { revision, schemaVersion, ...rest } = board;
  return rest;
};

// Node and edge arrays are merged by stable ID, other arrays as whole values.
function mergeBoard(base, working, current, resolutions = {}) {
  const conflicts = [];
  function visit(b, w, c, location) {
    if (equal(w, c)) return w;
    if (equal(b, w)) return c;
    if (equal(b, c)) return w;
    if (location.length === 1 && ['nodes', 'edges'].includes(location[0]) && [b, w, c].every(Array.isArray)) {
      const maps = [b, w, c].map(items => new Map(items.map(item => [item.id, item])));
      return [...new Set(maps.flatMap(map => [...map.keys()]))]
        .map(id => visit(...maps.map(map => map.has(id) ? map.get(id) : ABSENT), [...location, id]))
        .filter(value => value !== ABSENT);
    }
    if ([b, w, c].every(isObject)) {
      const result = {};
      for (const key of new Set([...Object.keys(b), ...Object.keys(w), ...Object.keys(c)])) {
        const value = visit(...[b, w, c].map(item => Object.hasOwn(item, key) ? item[key] : ABSENT), [...location, key]);
        if (value !== ABSENT) result[key] = value;
      }
      return result;
    }
    const key = JSON.stringify(location);
    const resolution = resolutions[key];
    if (resolution && typeof resolution === 'object') {
      if (resolution.choice === 'working') return w;
      if (resolution.choice === 'current') return c;
      if (resolution.choice === 'custom' && Object.hasOwn(resolution, 'value')) return resolution.value;
      if (resolution.choice === 'delete') return ABSENT;
    }
    conflicts.push({ path: location, key, base: wrapped(b), working: wrapped(w), current: wrapped(c) });
    return w;
  }
  return { board: visit(base, working, current, []), conflicts };
}
async function readJson(file) { return JSON.parse(await fs.readFile(file, 'utf8')); }
async function readBoard(file) {
  try { const board = await readJson(file); validate(board); return board; }
  catch (error) { if (error.code === 'ENOENT') return emptyBoard(); throw error; }
}
async function writeJson(file, data) {
  const temp = `${file}.${crypto.randomUUID()}.tmp`;
  try {
    await fs.writeFile(temp, JSON.stringify(data, null, 2) + '\n', { flag: 'wx' });
    await fs.rename(temp, file);
  } finally { await fs.rm(temp, { force: true }); }
}
const delay = ms => new Promise(resolve => setTimeout(resolve, ms));
async function withLock(lock, fn) {
  await fs.mkdir(path.dirname(lock), { recursive: true });
  const deadline = Date.now() + 4000;
  const owner = { pid: process.pid, token: crypto.randomUUID() };
  while (true) {
    try {
      await fs.mkdir(lock);
      try { await fs.writeFile(path.join(lock, 'owner.json'), JSON.stringify(owner), { flag: 'wx' }); }
      catch (error) { await fs.rmdir(lock).catch(() => {}); throw error; }
      break;
    } catch (error) {
      if (error.code !== 'EEXIST') throw error;
      // A dead owner's lock can be recovered. An unknown or live owner is never removed.
      try {
        const info = await readJson(path.join(lock, 'owner.json'));
        let alive = true;
        try { process.kill(info.pid, 0); } catch (e) { if (e.code === 'ESRCH') alive = false; }
        if (!alive && Number.isSafeInteger(info.pid) && info.pid > 0) {
          const again = await readJson(path.join(lock, 'owner.json'));
          if (again.token === info.token) {
            await fs.unlink(path.join(lock, 'owner.json'));
            await fs.rmdir(lock);
            continue;
          }
        }
      } catch (e) { if (!['ENOENT', 'ENOTEMPTY'].includes(e.code) && !(e instanceof SyntaxError)) throw e; }
      if (Date.now() >= deadline) throw new Error(`Board is busy; retry after the other operation finishes: ${lock}`);
      await delay(50);
    }
  }
  try { return await fn(); }
  finally {
    const info = await readJson(path.join(lock, 'owner.json')).catch(() => null);
    if (info?.token === owner.token) {
      await fs.unlink(path.join(lock, 'owner.json'));
      await fs.rmdir(lock);
    }
  }
}
function validate(board) {
  if (!board || !Array.isArray(board.nodes) || !Array.isArray(board.edges)) throw Error('Invalid board: nodes and edges must be arrays');
  for (const [kind, list] of [['node', board.nodes], ['edge', board.edges]]) {
    const ids = new Set();
    for (const item of list) {
      if (!item || typeof item.id !== 'string' || !item.id || ids.has(item.id)) throw Error(`Invalid or duplicate ${kind} id`);
      ids.add(item.id);
    }
  }
  const nodes = new Map(board.nodes.map(node => [node.id, node]));
  for (const node of board.nodes) {
    if (!node.position || !Number.isFinite(node.position.x) || !Number.isFinite(node.position.y) || !isObject(node.data)) throw Error(`Invalid card ${node.id}`);
    const seen = new Set([node.id]);
    let parent = node.parentId;
    while (parent) {
      if (seen.has(parent) || !nodes.has(parent)) throw Error(`Invalid parent for ${node.id}`);
      seen.add(parent); parent = nodes.get(parent).parentId;
    }
  }
  for (const edge of board.edges) if (!nodes.has(edge.source) || !nodes.has(edge.target)) throw Error(`Invalid endpoints for ${edge.id}`);
}
// Caller holds the board lock. A resolution is valid only for the exact current snapshot shown to the user.
async function saveBoard(boardFile, base, working, resolution) {
  validate(base); validate(working);
  const current = await readBoard(boardFile);
  const choices = resolution && equal(resolution.current, current) ? resolution.choices : {};
  const b = withoutRevision(base), w = withoutRevision(working), c = withoutRevision(current);
  const result = mergeBoard(b, w, c, choices);
  if (result.conflicts.length) return { saved: false, conflicts: result.conflicts, current, priorChoices: choices };
  let merged = result.board;
  const rootChoice = choices?.['[]'];
  if (rootChoice) {
    if (rootChoice.choice === 'working') merged = w;
    else if (rootChoice.choice === 'current') merged = c;
    else if (rootChoice.choice === 'custom' && Object.hasOwn(rootChoice, 'value')) merged = rootChoice.value;
  }
  const board = { ...merged, schemaVersion: current.schemaVersion ?? 1, revision: (current.revision ?? 0) + 1 };
  try { validate(board); }
  catch (error) {
    return { saved: false, current, priorChoices: choices, conflicts: [{ path: [], key: '[]', base: wrapped(b), working: wrapped(w), current: wrapped(c),
      reason: `The combined changes are invalid: ${error.message}` }] };
  }
  await fs.mkdir(path.dirname(boardFile), { recursive: true });
  await writeJson(boardFile, board);
  return { saved: true, board };
}
module.exports = { mergeBoard, readJson, readBoard, writeJson, withLock, validate, saveBoard, emptyBoard, withoutRevision };
