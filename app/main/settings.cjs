const fs = require("node:fs/promises");
const path = require("node:path");

function registerSettings({ app, ipcMain }) {
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
}
module.exports = { registerSettings };
