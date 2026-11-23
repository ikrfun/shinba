const fs = require('node:fs');
const fsPromises = require('node:fs/promises');
const path = require('node:path');

async function watchBoard(project, notify, onError) {
  const dir = path.join(project, '.shinba', 'boards');
  await fsPromises.mkdir(dir, { recursive: true });
  let timer;
  const watcher = fs.watch(dir, (_event, filename) => {
    if (filename && filename.toString() !== 'main.json') return;
    clearTimeout(timer);
    timer = setTimeout(() => notify(project), 150);
  });
  watcher.on('error', error => onError?.(error));
  return { close() { clearTimeout(timer); watcher.close(); } };
}
module.exports = { watchBoard };
