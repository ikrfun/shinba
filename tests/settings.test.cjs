const { test } = require("node:test");
const assert = require("node:assert/strict");
const fs = require("node:fs/promises");
const os = require("node:os");
const path = require("node:path");
const { registerSettings } = require("../app/main/settings.cjs");
const { defaults } = require('../app/main/keybindings.cjs');

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
      keybindings: defaults(), defaultKeybindings: defaults(),
      layout: { sidebarVisible:true, sidebarWidth:245, terminalHeight:240, boardMinimap:false, editorMinimap:false },
    });
    await handlers["settings:set-vim"](null, false);
    assert.deepEqual(await handlers["settings:get"](), {
      vimEnabled: false,
      theme: "dark",
      keybindings: defaults(), defaultKeybindings: defaults(),
      layout: { sidebarVisible:true, sidebarWidth:245, terminalHeight:240, boardMinimap:false, editorMinimap:false },
    });
    await handlers["settings:set-vim"](null, true);
    assert.deepEqual(await handlers["settings:get"](), {
      vimEnabled: true,
      theme: "dark",
      keybindings: defaults(), defaultKeybindings: defaults(),
      layout: { sidebarVisible:true, sidebarWidth:245, terminalHeight:240, boardMinimap:false, editorMinimap:false },
    });
    await Promise.all([
      handlers["settings:set-vim"](null, false),
      handlers["settings:set-theme"](null, "light"),
    ]);
    assert.deepEqual(await handlers["settings:get"](), {
      vimEnabled: false,
      theme: "light",
      keybindings: defaults(), defaultKeybindings: defaults(),
      layout: { sidebarVisible:true, sidebarWidth:245, terminalHeight:240, boardMinimap:false, editorMinimap:false },
    });
    await assert.rejects(handlers["settings:set-theme"](null, "other"));
    await assert.rejects(handlers["settings:set-vim"](null, "false"));
    const bindings = {...defaults(), save:'Mod+Shift+KeyS'};
    await Promise.all([
      handlers['settings:set-keybindings'](null, bindings),
      handlers['settings:set-layout'](null, {sidebarWidth:320}),
      handlers['settings:set-layout'](null, {terminalHeight:310,boardMinimap:true}),
    ]);
    const settings = await handlers['settings:get']();
    assert.equal(settings.keybindings.save,'Mod+Shift+KeyS');
    assert.equal(settings.layout.sidebarWidth,320);
    assert.equal(settings.layout.terminalHeight,310);
    assert.equal(settings.layout.boardMinimap,true);
    await assert.rejects(handlers['settings:set-keybindings'](null,{...bindings,save:bindings['open-project']}),/already assigned/);
    await assert.rejects(handlers['settings:set-layout'](null,{sidebarWidth:NaN}));
  } finally {
    await fs.rm(dir, { recursive: true, force: true });
  }
});
