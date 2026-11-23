const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
const os = require('node:os');
const path = require('node:path');
const sessions = require('../app/cli/sessions.cjs');
const { readBoard, writeJson } = require('../app/cli/board.cjs');

const card = (id, body = 'old') => ({id, type:'card', position:{x:0,y:0}, data:{title:id,body}});
async function fixture(fn) {
  const root = await fs.mkdtemp(path.join(os.tmpdir(),'shinba-board-'));
  try {
    const board = {id:'main', name:'Main', schemaVersion:1, revision:3, nodes:[card('a'),card('b')], edges:[]};
    const file = sessions.paths(root).board;
    await fs.mkdir(path.dirname(file),{recursive:true}); await writeJson(file,board);
    await fn({root, board, file});
  } finally { await fs.rm(root,{recursive:true,force:true}); }
}
test('drafts persist independently, and unrelated GUI and CLI edits merge', () => fixture(async ({root,board,file}) => {
  const gui = await sessions.begin(root), agent = await sessions.begin(root);
  const local = structuredClone(board); local.nodes[0].data.body='human';
  const remote = structuredClone(board); remote.nodes[1].data.body='agent';
  await sessions.update(root,gui.id,local); await sessions.update(root,agent.id,remote);
  assert.deepEqual(await readBoard(file),board, 'autosave changes only the draft');
  assert.equal((await sessions.commit(root,agent.id)).saved,true);
  const reopened = await sessions.useSession(root,gui.id,state=>state);
  assert.equal(reopened.working.nodes[0].data.body,'human');
  const rebased = await sessions.refresh(root,gui.id);
  assert.equal(rebased.refreshed,true);
  assert.equal(rebased.board.nodes[0].data.body,'human');
  assert.equal(rebased.board.nodes[1].data.body,'agent');
  const result = await sessions.commit(root,gui.id);
  assert.equal(result.saved,true); assert.equal(result.board.nodes[0].data.body,'human'); assert.equal(result.board.nodes[1].data.body,'agent');
}));
test('conflict resolution is bound to the compared saved snapshot', () => fixture(async ({root,board,file}) => {
  const human = await sessions.begin(root), agent = await sessions.begin(root);
  const local=structuredClone(board), remote=structuredClone(board);
  local.nodes[0].data.body='human'; remote.nodes[0].data.body='agent';
  await sessions.update(root,human.id,local); await sessions.update(root,agent.id,remote); await sessions.commit(root,agent.id);
  const conflict = await sessions.commit(root,human.id);
  assert.equal(conflict.saved,false); assert.equal(conflict.conflicts.length,1);
  const choice = {[conflict.conflicts[0].key]:{choice:'working'}};
  const changed = await readBoard(file); changed.nodes[0].data.body='newer'; changed.revision++;
  await writeJson(file,changed);
  const stale = await sessions.commit(root,human.id,{current:conflict.current,choices:choice});
  assert.equal(stale.saved,false); assert.equal(stale.conflicts[0].current.value,'newer');
  assert.equal((await readBoard(file)).nodes[0].data.body,'newer');
  const resolved = await sessions.commit(root,human.id,{current:stale.current,choices:{[stale.conflicts[0].key]:{choice:'custom',value:'human + newer'}}});
  assert.equal(resolved.board.nodes[0].data.body,'human + newer');
}));
test('refresh merges non-conflicting changes and retains conflicting drafts', () => fixture(async ({root,board,file}) => {
  const human = await sessions.begin(root);
  const updated=structuredClone(board); updated.nodes[1].data.body='new'; updated.revision++;
  await writeJson(file,updated);
  const refreshed=await sessions.refresh(root,human.id); assert.equal(refreshed.refreshed,true);
  refreshed.board.nodes[0].data.body='local'; await sessions.update(root,human.id,refreshed.board);
  updated.nodes[0].data.body='remote conflicting'; await writeJson(file,updated);
  assert.equal((await sessions.refresh(root,human.id)).refreshed,false);
  assert.equal((await sessions.useSession(root,human.id,state=>state)).working.nodes[0].data.body,'local');
}));
test('invalid merges and deletes retain the draft and the saved board', () => fixture(async ({root,board,file}) => {
  const human=await sessions.begin(root), agent=await sessions.begin(root);
  const local=structuredClone(board), remote=structuredClone(board);
  local.nodes[1].parentId='a'; remote.nodes=remote.nodes.filter(n=>n.id!=='a');
  await sessions.update(root,human.id,local); await sessions.update(root,agent.id,remote); await sessions.commit(root,agent.id);
  const conflict = await sessions.commit(root,human.id);
  assert.equal(conflict.saved, false);
  assert.match(conflict.conflicts[0].reason, /Invalid parent/);
  assert.equal((await readBoard(file)).nodes.length,1);
  assert.equal((await sessions.useSession(root,human.id,state=>state)).working.nodes.length,2);
}));
test('a dead owner lock can be recovered without discarding a draft', () => fixture(async ({root,board}) => {
  const draft=await sessions.begin(root);
  const local=structuredClone(board); local.nodes[0].data.body='recoverable';
  await sessions.update(root,draft.id,local);
  const lock=sessions.paths(root).boardLock;
  await fs.mkdir(lock);
  // This PID is outside the OS-supported range and cannot refer to a running process.
  await fs.writeFile(path.join(lock,'owner.json'),JSON.stringify({pid:2147483647,token:'dead-owner'}));
  const result=await sessions.commit(root,draft.id);
  assert.equal(result.saved,true);
  assert.equal(result.board.nodes[0].data.body,'recoverable');
}));
