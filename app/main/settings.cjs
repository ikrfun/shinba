const fs = require("node:fs/promises");
const path = require("node:path");
const { defaults, normalizeKeybindings } = require("./keybindings.cjs");

function registerSettings({ app, ipcMain, onKeybindingsChanged = () => {} }) {
  const file = () => path.join(app.getPath("userData"), "settings.json");
  async function read() {
    try {
      const value = JSON.parse(await fs.readFile(file(), "utf8"));
      if (!value || typeof value !== "object" || Array.isArray(value)) {
        throw new Error("The settings file has an invalid format");
      }
      return value;
    } catch (error) {
      if (error.code === "ENOENT") return {};
      throw error;
    }
  }
  let writeQueue = Promise.resolve();
  async function getKeybindings() {
    await writeQueue;
    try { return normalizeKeybindings((await read()).keybindings || {}); }
    catch { return defaults(); }
  }
  function update(patch) {
    const task = writeQueue.then(async () => {
      const settings = await read();
      await fs.mkdir(path.dirname(file()), { recursive: true });
      const temporary = `${file()}.${process.pid}.tmp`;
      await fs.writeFile(
        temporary,
        JSON.stringify({ ...settings, ...patch }, null, 2) + "\n",
      );
      await fs.rename(temporary, file());
    });
    writeQueue = task.catch(() => {});
    return task;
  }
  ipcMain.handle("settings:get", async () => {
    await writeQueue;
    const settings = await read();
    return {
      vimEnabled:
        typeof settings.vimEnabled === "boolean" ? settings.vimEnabled : true,
      theme: ["dark", "light"].includes(settings.theme)
        ? settings.theme
        : "dark",
      keybindings: await getKeybindings(),
      defaultKeybindings: defaults(),
      layout: {
        sidebarVisible: typeof settings.layout?.sidebarVisible === 'boolean' ? settings.layout.sidebarVisible : true,
        sidebarWidth: Number.isFinite(settings.layout?.sidebarWidth) ? Math.max(160, Math.min(700, settings.layout.sidebarWidth)) : 245,
        terminalHeight: Number.isFinite(settings.layout?.terminalHeight) ? Math.max(100, Math.min(1000, settings.layout.terminalHeight)) : 240,
        boardMinimap: typeof settings.layout?.boardMinimap === 'boolean' ? settings.layout.boardMinimap : false,
        editorMinimap: typeof settings.layout?.editorMinimap === 'boolean' ? settings.layout.editorMinimap : false,
      },
    };
  });
  ipcMain.handle("settings:set-vim", async (_event, enabled) => {
    if (typeof enabled !== "boolean") throw new Error("Invalid setting value");
    await update({ vimEnabled: enabled });
  });
  ipcMain.handle("settings:set-theme", async (_event, theme) => {
    if (!["dark", "light"].includes(theme)) throw new Error("Invalid theme");
    await update({ theme });
  });
  ipcMain.handle('settings:set-keybindings', async (_event, keybindings) => {
    const next = normalizeKeybindings(keybindings);
    await update({ keybindings: next });
    onKeybindingsChanged(next);
    return next;
  });
  ipcMain.handle('settings:set-layout', async (_event, layout) => {
    const names = ['sidebarVisible','sidebarWidth','terminalHeight','boardMinimap','editorMinimap'];
    if (!layout || typeof layout !== 'object' || Array.isArray(layout) || Object.keys(layout).some(name => !names.includes(name))) throw new Error('Invalid layout');
    for (const [key, value] of Object.entries(layout)) {
      if (key === 'sidebarWidth' || key === 'terminalHeight') {
        if (!Number.isFinite(value) || value < 100 || value > 1000) throw new Error('Invalid panel size');
      } else if (typeof value !== 'boolean') throw new Error('Invalid layout preference');
    }
    // Queue the read as part of the update to avoid losing concurrent changes.
    const task = writeQueue.then(async () => {
      const settings = await read();
      await fs.mkdir(path.dirname(file()), { recursive: true });
      const temporary = `${file()}.${process.pid}.tmp`;
      await fs.writeFile(temporary, JSON.stringify({ ...settings, layout: { ...settings.layout, ...layout } }, null, 2) + '\n');
      await fs.rename(temporary, file());
    });
    writeQueue = task.catch(() => {});
    await task;
  });
  return { getKeybindings };
}
module.exports = { registerSettings };
