const { app, BrowserWindow, dialog, ipcMain, shell } = require("electron");
const path = require("node:path");
const fs = require('node:fs/promises');
const { watchBoard } = require("./board-watch.cjs");
const { registerSettings } = require("./settings.cjs");
const { defaults, matchAction } = require("./keybindings.cjs");
const { registerStorage } = require("./storage.cjs");
const { createLanguageService } = require("./language-service.cjs");
const { registerTerminal } = require('./terminal-manager.cjs');
let root = null,
  win,
  boardWatcher = null;
let activeBindings = defaults(), capturingShortcut = false;
function inside(relative = "") {
  if (!root) throw new Error("Open a project folder first");
  const result = path.resolve(root, relative);
  if (result !== root && !result.startsWith(root + path.sep))
    throw new Error("The path is outside the project");
  return result;
}
const language = createLanguageService({
  app,
  ipcMain,
  getRoot: () => root,
  inside,
});
const settings = registerSettings({ app, ipcMain, onKeybindingsChanged: next => { activeBindings = next; } });
const terminals = registerTerminal({ ipcMain, inside, getWindow: () => win, spawn: (...args) => require('node-pty').spawn(...args) });
ipcMain.handle('shortcuts:capture', (_event, enabled) => {
  if (typeof enabled !== 'boolean') throw new Error('Invalid shortcut capture state');
  capturingShortcut = enabled;
});
app.whenReady().then(async () => {
  activeBindings = await settings.getKeybindings();
  win = new BrowserWindow({
    width: 1500,
    height: 950,
    webPreferences: {
      preload: path.join(__dirname, "preload.cjs"),
      contextIsolation: true,
      nodeIntegration: false,
    },
  });
  win.webContents.on("will-prevent-unload", (event) => {
    const result = dialog.showMessageBoxSync(win, {
      type: "warning", buttons: ["Keep working", "Quit without saving"], defaultId: 0,
      cancelId: 0, message: "Some changes have not been saved to disk.",
      detail: "Try saving again, or quit and discard the changes that could not be saved.",
    });
    if (result === 1) event.preventDefault();
  });
  win.webContents.on("before-input-event", (event, input) => {
    if (capturingShortcut) return;
    const action = matchAction(input, activeBindings);
    if (action) {
      event.preventDefault();
      win.webContents.send("shortcut", action);
    }
  });
  win.loadURL(
    process.env.VITE_URL ||
      `file://${path.join(__dirname, "../../dist/index.html")}`,
  );
});
app.on("window-all-closed", () => app.quit());
app.on("will-quit", () => {
  terminals.dispose();
  language.dispose();
});
ipcMain.handle("project:open", async () => {
  const r = await dialog.showOpenDialog(win, { properties: ["openDirectory"] });
  if (r.canceled) return null;
  await language.close();
  terminals.dispose();
  boardWatcher?.close();
  root = r.filePaths[0];
  const watchedProject = root;
  boardWatcher = await watchBoard(watchedProject, () => {
      if (root === watchedProject && !win.isDestroyed()) win.webContents.send("board:changed", watchedProject);
  }, () => {
    if (!win.isDestroyed()) win.webContents.send("board:watch-error", watchedProject);
  });
  return { name: path.basename(root), path: root };
});
registerStorage({ ipcMain, inside });
ipcMain.handle('file:save-as', async (_event, text) => {
  if (typeof text !== 'string') throw new Error('Invalid file content');
  const result = await dialog.showSaveDialog(win, { defaultPath: path.join(inside(), 'untitled.txt'), properties:['showOverwriteConfirmation','createDirectory'] });
  if (result.canceled || !result.filePath) return null;
  const relative = path.relative(inside(), result.filePath);
  if (!relative || relative.startsWith('..' + path.sep) || path.isAbsolute(relative)) throw new Error('Choose a location inside the project');
  try { await fs.writeFile(inside(relative), text, { encoding:'utf8', flag:'wx' }); }
  catch (error) { if (error.code === 'EEXIST') throw new Error('The file already exists. Choose a new name.'); throw error; }
  return relative;
});
ipcMain.handle('file:discard-untitled', async (_event, label) => {
  const result = await dialog.showMessageBox(win, { type:'warning', buttons:['Keep editing','Discard'], defaultId:0, cancelId:0,
    message:`Discard unsaved changes in ${label}?` });
  return result.response === 1;
});
ipcMain.handle('external:open', async (_event, target) => {
  const url = new URL(target);
  if (!['http:', 'https:', 'mailto:'].includes(url.protocol)) throw new Error('Unsupported link protocol');
  await shell.openExternal(url.href);
});
