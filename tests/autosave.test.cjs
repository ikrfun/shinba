const { test } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs/promises');
async function load() {
  const source = await fs.readFile('app/renderer/autosave.js', 'utf8');
  return import('data:text/javascript;base64,' + Buffer.from(source).toString('base64'));
}
test('serializes edits made during an active save', async () => {
  const {createAutosave} = await load();
  let release;
  const gate = new Promise(resolve => { release = resolve; });
  const written = [];
  const queue = createAutosave(async value => { written.push(value); if (value === 1) await gate; }, () => {}, 10000);
  queue.schedule(1);
  const first = queue.flush();
  queue.schedule(2);
  release();
  await first;
  assert.deepEqual(written, [1, 2]);
  assert.equal(queue.hasChanges(), false);
});
test('retains unsaved content after a write failure', async () => {
  const {createAutosave} = await load();
  let fail = true;
  const written = [];
  const queue = createAutosave(async value => {if (fail) throw Error('conflict'); written.push(value)}, () => {}, 10000);
  queue.schedule('content');
  await assert.rejects(queue.flush(), /conflict/);
  assert.equal(queue.hasChanges(), true);
  fail = false;
  await queue.flush();
  assert.deepEqual(written, ['content']);
  assert.equal(queue.hasChanges(), false);
});
