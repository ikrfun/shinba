const {test} = require('node:test');
const assert = require('node:assert/strict');
const path = require('node:path');
const { pathToFileURL } = require('node:url');
async function load() { return import(pathToFileURL(path.resolve('app/shared/cardHierarchy.mjs')).href); }
const card = (id,x,y) => ({id,position:{x,y},style:{width:260,height:200}});
test('nesting grows the parent, orders ancestors first, and preserves children', async () => {
  const {reparentCard, canNest} = await load();
  let nodes = [card('child',500,200),card('parent',50,30),card('grand',0,0)];
  nodes = reparentCard(nodes,'parent','grand');
  nodes = reparentCard(nodes,'child','parent');
  assert.deepEqual(nodes.map(n => n.id), ['grand','parent','child']);
  const parent = nodes.find(n => n.id === 'parent');
  const grand = nodes.find(n => n.id === 'grand');
  const child = nodes.find(n => n.id === 'child');
  assert.equal(child.parentId, 'parent');
  assert.ok(parent.style.height >= child.position.y + child.style.height);
  assert.ok(grand.style.height >= parent.position.y + parent.style.height);
  assert.equal(canNest(nodes,'grand','child'), false);
  assert.throws(() => reparentCard(nodes,'grand','child'));
});
test('detaching preserves absolute position and removes the parent', async () => {
  const {reparentCard} = await load();
  let nodes = [card('parent',100,50),card('child',0,0)];
  nodes = reparentCard(nodes,'child','parent');
  const before = nodes.find(n => n.id === 'child');
  const expected = {x:100+before.position.x,y:50+before.position.y};
  nodes = reparentCard(nodes,'child','');
  const after = nodes.find(n => n.id === 'child');
  assert.equal(after.parentId, undefined);
  assert.deepEqual(after.position, expected);
});
test('CLI placement retains relative coordinates and existing metadata', async () => {
  const {reparentCard} = await load();
  const nodes=[card('child',500,200),card('parent',50,30)];
  nodes[0].extent='parent';
  const attached=reparentCard(nodes,'child','parent',{placement:'keep-relative'});
  assert.deepEqual(attached.map(node=>node.id),['parent','child']);
  const child=attached.find(node=>node.id==='child');
  assert.deepEqual(child.position,{x:500,y:200});
  assert.equal(child.extent,'parent');
  assert.deepEqual(attached[0].style,{width:260,height:200});
  const detached=reparentCard(attached,'child','',{placement:'keep-relative'});
  assert.deepEqual(detached.find(node=>node.id==='child').position,{x:500,y:200});
});
