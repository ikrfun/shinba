const validId = id => typeof id === 'string' && /^[a-zA-Z0-9-]{1,80}$/.test(id);
function registerTerminal({ ipcMain, inside, getWindow, spawn }) {
  const sessions = new Map();
  const get = id => { if (!validId(id)) throw new Error('Invalid terminal ID'); return sessions.get(id); };
  ipcMain.handle('terminal:start', (_event, id, cols, rows) => {
    if (get(id)) throw new Error('Terminal already exists');
    const terminal = spawn(process.env.SHELL || '/bin/sh', [], {
      name:'xterm-256color', cols:Number.isInteger(cols) && cols>0 ? cols:100,
      rows:Number.isInteger(rows) && rows>0 ? rows:24, cwd:inside(), env:process.env,
    });
    sessions.set(id, terminal);
    terminal.onData(data => { if (sessions.get(id) === terminal) getWindow()?.webContents.send('terminal:data', id, data); });
    terminal.onExit(() => {
      if (sessions.get(id) !== terminal) return;
      sessions.delete(id);
      getWindow()?.webContents.send('terminal:data', id, '\r\n[Process exited]\r\n');
    });
    return true;
  });
  ipcMain.on('terminal:write', (_event, id, text) => { if (typeof text === 'string') get(id)?.write(text); });
  ipcMain.on('terminal:resize', (_event, id, cols, rows) => {
    if (Number.isInteger(cols) && cols > 0 && Number.isInteger(rows) && rows > 0) get(id)?.resize(cols, rows);
  });
  ipcMain.on('terminal:close', (_event, id) => { const terminal=get(id); if (terminal) { sessions.delete(id); terminal.kill(); } });
  return { dispose() { for (const terminal of sessions.values()) terminal.kill(); sessions.clear(); } };
}
module.exports = { registerTerminal };
