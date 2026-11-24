const fs = require('node:fs/promises');
const path = require('node:path');
const { readBoard, mergeValues, applicableChoices } = require('../cli/board.cjs');
const sessions = require('../cli/sessions.cjs');
function registerStorage({ ipcMain, inside }) {
  ipcMain.handle('project:tree', async (_e, dir = '') => {
    const entries = await fs.readdir(inside(dir), { withFileTypes: true });
    return entries.filter(x => x.name !== '.git' && !x.isSymbolicLink())
      .sort((a, b) => Number(b.isDirectory()) - Number(a.isDirectory()) || a.name.localeCompare(b.name))
      .map(x => ({ name: x.name, path: path.join(dir, x.name), directory: x.isDirectory() }));
  });
  ipcMain.handle('file:read', async (_e, file) => fs.readFile(inside(file), 'utf8'));
  ipcMain.handle('file:read-image', async (_e, file) => {
    if (typeof file !== 'string' || path.isAbsolute(file)) throw new Error('Invalid image path');
    const project = inside(), candidate = inside(file);
    if (!candidate.startsWith(project + path.sep)) throw new Error('Image is outside the project');
    const root = await fs.realpath(project);
    let target;
    try { target = await fs.realpath(candidate); }
    catch (error) { if (error.code === 'ENOENT') return null; throw error; }
    if (!target.startsWith(root + path.sep)) throw new Error('Image is outside the project');
    const mime = { '.png':'image/png', '.jpg':'image/jpeg', '.jpeg':'image/jpeg', '.gif':'image/gif', '.webp':'image/webp' }[path.extname(target).toLowerCase()];
    if (!mime) throw new Error('Unsupported image format');
    const info = await fs.stat(target);
    if (!info.isFile() || info.size > 10 * 1024 * 1024) throw new Error('Image is too large or not a file');
    return `data:${mime};base64,${(await fs.readFile(target)).toString('base64')}`;
  });
  ipcMain.handle('file:write', async (_e, file, text, expected, resolution) => {
    const target = inside(file);
    const current = await fs.readFile(target, 'utf8');
    const choices = resolution?.working === text ? applicableChoices(resolution, current) : {};
    const result = mergeValues(expected, text, current, choices);
    if (result.conflicts.length) return { saved: false, current, working: text, conflicts: result.conflicts, priorChoices: choices };
    // Check again immediately before writing, including after a reviewed resolution.
    if (await fs.readFile(target, 'utf8') !== current) return { saved: false, retry: true };
    await fs.writeFile(target, result.value, 'utf8');
    return { saved: true, text: result.value };
  });
  ipcMain.handle('board:load', async () => readBoard(inside('.shinba/boards/main.json')));
  ipcMain.handle('board:draft-begin', async (_e, board) => sessions.begin(inside(), board));
  ipcMain.handle('board:draft-load', async (_e, id) => sessions.useSession(inside(), id, state => state));
  ipcMain.handle('board:draft-write', async (_e, id, board) => sessions.update(inside(), id, board));
  ipcMain.handle('board:draft-refresh', async (_e, id) => sessions.refresh(inside(), id));
  ipcMain.handle('board:draft-save', async (_e, id, resolution) => sessions.commit(inside(), id, resolution));
}
module.exports = { registerStorage };
