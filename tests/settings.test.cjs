const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { registerSettings } = require("../app/main/settings.cjs");

test("Vim is enabled by default and the chosen setting is persisted", async () => {
  const dir = await fs.mkdtemp(path.join(os.tmpdir(), "shinba-settings-"));
  try {
    const handlers = {};
    const app = { getPath: () => dir };
    registerSettings({
      app,
      ipcMain: {
        handle: (name, fn) => {
          handlers[name] = fn;
        },
      },
    });
    assert.deepEqual(await handlers["settings:get"](), {
      vimEnabled: true,
      theme: "dark",
    });
    await handlers["settings:set-vim"](null, false);
    assert.deepEqual(await handlers["settings:get"](), {
      vimEnabled: false,
      theme: "dark",
    });
    await handlers["settings:set-vim"](null, true);
    assert.deepEqual(await handlers["settings:get"](), {
      vimEnabled: true,
      theme: "dark",
    });
    await Promise.all([
      handlers["settings:set-vim"](null, false),
      handlers["settings:set-theme"](null, "light"),
    ]);
    assert.deepEqual(await handlers["settings:get"](), {
      vimEnabled: false,
      theme: "light",
    });
    await assert.rejects(handlers["settings:set-theme"](null, "other"));
    await assert.rejects(handlers["settings:set-vim"](null, "false"));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
