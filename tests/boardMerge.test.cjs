const { test } = require('node:test');
const assert = require('node:assert/strict');
const { mergeBoard } = require('../app/cli/board.cjs');
test('merges independent edits to the same card and additions', async () => {
  const base = {nodes:[{id:'a', data:{title:'A', body:'old'}}], edges:[]};
  const local = {nodes:[{id:'a',data:{title:'B',body:'old'}}],edges:[]};
  const remote = {nodes:[{id:'a',data:{title:'A',body:'new'}},{id:'b'}],edges:[]};
  const result = mergeBoard(base, local, remote);
  assert.equal(result.conflicts.length, 0);
  assert.deepEqual(result.board.nodes, [{id:'a',data:{title:'B',body:'new'}},{id:'b'}]);
});
test('preserves both sides of deletion versus edit for resolution', async () => {
  const base = {nodes:[{id:'a',data:{title:'A'}}],edges:[]};
  const local = {nodes:[],edges:[]};
  const remote = {nodes:[{id:'a',data:{title:'B'}}],edges:[]};
  const result = mergeBoard(base,local,remote);
  assert.equal(result.conflicts.length,1);
  assert.equal(result.conflicts[0].working.missing,true);
  assert.deepEqual(mergeBoard(base,local,remote,{[result.conflicts[0].key]:{choice:'current'}}).board,remote);
});
