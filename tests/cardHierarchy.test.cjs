const {test} = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
async function load() {
  const source = await fs.readFile('app/renderer/cardHierarchy.js', 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
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
