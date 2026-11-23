// Run with electron after npm run build; uses an isolated project and settings directory.
const { app, BrowserWindow, ipcMain } = require('electron');
const fs = require('node:fs/promises');
const path = require('node:path');
const os = require('node:os');
const assert = require('node:assert/strict');
const { registerStorage } = require('../app/main/storage.cjs');
const { registerSettings } = require('../app/main/settings.cjs');
const { defaults, matchAction } = require('../app/main/keybindings.cjs');
const { writeJson, readBoard } = require('../app/cli/board.cjs');
let root, win, activeBindings=defaults(), capturing=false, terminalResizes=[];
const pause = ms => new Promise(resolve => setTimeout(resolve,ms));
async function capture(file) {
  try { await fs.writeFile(file, (await win.capturePage()).toPNG()); }
  catch (error) { console.warn(`Screenshot unavailable: ${error.message}`); }
}
const js = expression => win.webContents.executeJavaScript(expression);
async function waitFor(expression, label) {
  for (let i=0;i<120;i++) { if (await js(expression)) return; await pause(100); }
  throw new Error(`Timed out: ${label}`);
}
async function key(keyCode,modifiers=[]) {
  win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});
  win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});
  await pause(150);
}
async function drag(selector, dx, dy) {
  const r=await js(`(() => { const r=document.querySelector(${JSON.stringify(selector)}).getBoundingClientRect(); return {x:Math.round((r.left+r.right)/2),y:Math.round((r.top+r.bottom)/2)} })()`);
  win.webContents.sendInputEvent({type:'mouseMove',...r});
  win.webContents.sendInputEvent({type:'mouseDown',...r,button:'left',clickCount:1}); await pause(100);
  for(let i=1;i<=5;i++) {win.webContents.sendInputEvent({type:'mouseMove',x:r.x+dx*i/5,y:r.y+dy*i/5,button:'left'});await pause(30);}
  win.webContents.sendInputEvent({type:'mouseUp',x:r.x+dx,y:r.y+dy,button:'left',clickCount:1}); await pause(200);
}
async function run(){
 root=await fs.mkdtemp(path.join(os.tmpdir(),'shinba-workspace-e2e-'));
 const project=path.join(root,'project'), boardFile=path.join(project,'.shinba','boards','main.json');
 await fs.mkdir(path.dirname(boardFile),{recursive:true});
 await fs.writeFile(path.join(project,'sample.txt'),'example file');
 await fs.writeFile(path.join(project,'pixel.png'),Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAQAAAC1HAwCAAAAC0lEQVR42mP8/x8AAwMCAO+jRZkAAAAASUVORK5CYII=','base64'));
 await writeJson(boardFile,{id:'main',name:'Main',schemaVersion:1,revision:1,nodes:[{id:'a',type:'card',position:{x:0,y:0},data:{title:'Markdown',body:'# Heading\n\n- item **bold**\n\n![pixel](pixel.png)\n\n```js\nconst x = 1\n```\n<script>window.pwned=1</script>\n<img src="x" onerror="window.pwned=2">\n[unsafe](javascript:alert(1))'},style:{width:380,height:350}},{id:'b',type:'card',position:{x:650,y:50},data:{title:'Second',body:'Notes'},style:{width:260,height:200}}],edges:[{id:'a-b',source:'a',target:'b'}]});
 registerStorage({ipcMain,inside:(p='')=>path.join(project,p)});
 const settings=registerSettings({app:{getPath:()=>path.join(root,'settings')},ipcMain,onKeybindingsChanged:next=>{activeBindings=next;}});
 ipcMain.handle('shortcuts:capture',(_e,value)=>{capturing=value;});
 ipcMain.handle('project:open',()=>({name:'project',path:project}));
 ipcMain.handle('terminal:start',()=>true);
 ipcMain.on('terminal:resize',(_e,cols,rows)=>terminalResizes.push([cols,rows]));
 ipcMain.on('terminal:write',()=>{});
 win=new BrowserWindow({width:1100,height:800,show:false,webPreferences:{preload:path.resolve('app/main/preload.cjs'),contextIsolation:true,nodeIntegration:false}});
 if (process.env.SHINBA_E2E_VISIBLE) win.showInactive();
 win.webContents.on('before-input-event',(event,input)=>{ if(capturing)return;const action=matchAction(input,activeBindings);if(action){event.preventDefault();win.webContents.send('shortcut',action);}});
 await win.loadFile(path.resolve('dist/index.html'));
 win.webContents.send('shortcut','open-project');
 await waitFor("!!document.querySelector('.markdown-card h1')",'Markdown card');
 await waitFor("document.querySelectorAll('.react-flow__edge').length === 1",'initial connection');
 assert.equal(await js("document.querySelector('.markdown-card h1').textContent"),'Heading');
 assert.equal(await js("document.querySelector('.markdown-card li strong').textContent"),'bold');
 assert.equal(await js("document.querySelectorAll('.markdown-card script').length"),0);
 assert.equal(await js("document.querySelectorAll('.markdown-card [onerror], .markdown-card a[href^=javascript]').length"),0);
 assert.equal(await js('window.pwned || 0'),0);
 assert.equal(await js("document.querySelectorAll('.markdown-card pre code').length"),1);
 await waitFor("document.querySelector('.markdown-card img[alt=pixel]')?.src.startsWith('data:image/png;base64,')",'local Markdown image');
 const widthBefore=await js('document.querySelector("aside").getBoundingClientRect().width');
 await drag('[aria-label="Resize sidebar"]',100,0);
 const widthAfter=await js('document.querySelector("aside").getBoundingClientRect().width');
 assert.ok(widthAfter > widthBefore+70,`${widthBefore} -> ${widthAfter}`);
 await key('B',['meta']); await waitFor('!document.querySelector("aside")','hide sidebar');
 await key('B',['meta']); await waitFor('!!document.querySelector("aside")','show sidebar');
 assert.ok(await js('document.querySelector("aside").getBoundingClientRect().width') > widthBefore+70);
 await js("[...document.querySelectorAll('.toolbar button')].find(x=>x.textContent.includes('Minimap')).click()");
 await waitFor('!!document.querySelector(".react-flow__minimap")','board minimap');
 await pause(300);
 await capture('/private/tmp/shinba-board-minimap.png');
 await key('M',['meta','shift']); await waitFor('!document.querySelector(".react-flow__minimap")','hide board minimap');
 // Zoom far enough out to fit substantially larger graphs and switch to outlines.
 for(let i=0;i<24;i++){await js("document.querySelector('.react-flow__controls-zoomout').click()");await pause(30);}
 await waitFor('!!document.querySelector(".card-overview")','zoomed-out overview');
 const transform=await js("document.querySelector('.react-flow__viewport').style.transform");
 assert.ok(Number(transform.match(/scale\(([^)]+)\)/)?.[1]) < .1, transform);
 assert.equal(await js('document.querySelectorAll(".card-overview .markdown-card").length'),0);
 assert.equal(await js('document.querySelectorAll(".react-flow__edge").length'),1);
 for(let i=0;i<24;i++){await js("document.querySelector('.react-flow__controls-zoomin').click()");await pause(30);}
 await waitFor('!!document.querySelector(".markdown-card h1")','restore card text');
 await key('`',['control']); await waitFor('!!document.querySelector("[aria-label=\\"Resize terminal\\"]")','terminal');
 const terminalBefore=await js('document.querySelector(".terminal").getBoundingClientRect().height');
 await drag('[aria-label="Resize terminal"]',0,-100);
 const terminalAfter=await js('document.querySelector(".terminal").getBoundingClientRect().height');
 assert.ok(terminalAfter > terminalBefore+70,`${terminalBefore} -> ${terminalAfter}`);
 assert.ok(terminalResizes.length>0,'terminal receives new dimensions');
 await key('`',['control']);
 await js("[...document.querySelectorAll('nav button')].find(x=>x.textContent==='Settings').click()");
 await waitFor('!!document.querySelector("[aria-label=\\"Change Toggle sidebar shortcut\\"]")','shortcut settings');
 await js("document.querySelector('.shortcut-list').scrollIntoView({block:'start'})");
 await pause(300);
 await capture('/private/tmp/shinba-shortcut-settings.png');
 await js("document.querySelector('[aria-label=\"Change Toggle sidebar shortcut\"]').click()");
 await waitFor("document.querySelector('[aria-label=\"Change Toggle sidebar shortcut\"]').textContent.includes('Press')",'record shortcut');
 await key('K',['meta','shift']);
 await waitFor("document.querySelector('[aria-label=\"Change Toggle sidebar shortcut\"]').textContent.includes('K')",'new shortcut');
 assert.equal((await settings.getKeybindings())['toggle-sidebar'],'Mod+Shift+KeyK');
 await key('B',['meta']); assert.equal(await js('!!document.querySelector("aside")'),true);
 await key('K',['meta','shift']); await waitFor('!document.querySelector("aside")','custom shortcut');
 await key('K',['meta','shift']); await waitFor('!!document.querySelector("aside")','custom shortcut restore');
 // Board Cmd+S must merge the working copy, not merely write the draft.
 await js("[...document.querySelectorAll('nav button')].find(x=>x.textContent==='Board').click()");
 await js("[...document.querySelectorAll('.toolbar button')].find(x=>x.textContent.includes('Card')).click()");
 await waitFor('document.querySelectorAll(".react-flow__node").length === 3','new draft card');
 await key('S',['meta']);
 for(let i=0;i<100;i++){if((await readBoard(boardFile)).nodes.length===3)break;await pause(100);}
 assert.equal((await readBoard(boardFile)).nodes.length,3);
 // Code minimap can be switched independently of the board minimap.
 await js("[...document.querySelectorAll('.tree-row')].find(x=>x.textContent.includes('sample.txt')).click()");
 await waitFor('!!document.querySelector(".monaco-editor")','code editor');
 await js("[...document.querySelectorAll('.code .toolbar button')].find(x=>x.textContent.includes('Minimap')).click()");
 await waitFor('!!document.querySelector(".monaco-editor .minimap")','code minimap');
 await js("[...document.querySelectorAll('.code .toolbar button')].find(x=>x.textContent.startsWith('Vim')).click()");
 await waitFor("[...document.querySelectorAll('.code .toolbar button')].some(x=>x.textContent==='Vim off')",'disable Vim for text input');
 await js("document.querySelector('.monaco-editor [role=textbox]').focus()");
 await js(`(() => { const ec=document.querySelector('.native-edit-context').editContext; const start=ec.selectionStart, end=ec.selectionEnd, text=' updated'; ec.dispatchEvent(new TextUpdateEvent('textupdate',{updateRangeStart:start,updateRangeEnd:end,text,selectionStart:start+text.length,selectionEnd:start+text.length})); })()`);
 await pause(100);
 await key('S',['meta']);
 for(let i=0;i<5;i++){if((await fs.readFile(path.join(project,'sample.txt'),'utf8')).includes('updated'))break;await pause(50);}
 assert.match(await fs.readFile(path.join(project,'sample.txt'),'utf8'),/updated/);
 assert.equal(await js("document.querySelectorAll('nav .workspace-tab').length"),2);
 assert.equal(await js("!!document.querySelector('nav .workspace-tab [aria-label=\"Close Board\"]') && !!document.querySelector('nav .workspace-tab [aria-label=\"Close sample.txt\"]')"),true);
 // A conflict during the close leaves the tab and its unsaved contents intact.
 const previous=await fs.readFile(path.join(project,'sample.txt'),'utf8');
 await js(`(() => { const ec=document.querySelector('.native-edit-context').editContext; const start=ec.selectionStart, end=ec.selectionEnd, text=' retained'; ec.dispatchEvent(new TextUpdateEvent('textupdate',{updateRangeStart:start,updateRangeEnd:end,text,selectionStart:start+text.length,selectionEnd:start+text.length})); })()`);
 await waitFor("document.querySelector('nav .workspace-tab.active .workspace-tab-label')?.textContent.includes('●')",'unsaved file edit');
 await fs.writeFile(path.join(project,'sample.txt'),'external edit');
 await js("document.querySelector('[aria-label=\"Close sample.txt\"]').click()");
 await waitFor("document.querySelector('footer').textContent.includes('Could not close sample.txt')",'failed close');
 assert.equal(await js("!!document.querySelector('[aria-label=\"Close sample.txt\"]')"),true);
 assert.equal(await fs.readFile(path.join(project,'sample.txt'),'utf8'),'external edit');
 // Restore the expected disk version and retry so the test can close cleanly.
 await fs.writeFile(path.join(project,'sample.txt'),previous);
 await js("document.querySelector('[aria-label=\"Close sample.txt\"]').click()");
 await waitFor("!document.querySelector('[aria-label=\"Close sample.txt\"]')",'retry close');
 assert.match(await fs.readFile(path.join(project,'sample.txt'),'utf8'),/retained/);
 assert.equal(await js("document.querySelector('nav .workspace-tab.active .workspace-tab-label').textContent"),'Board');
 // Closing an inactive file tab must not switch away from Settings.
 await js("[...document.querySelectorAll('.tree-row')].find(x=>x.textContent.includes('sample.txt')).click()");
 await waitFor('!!document.querySelector("[aria-label=\\"Close sample.txt\\"]")','reopened tab');
 await js("[...document.querySelectorAll('nav button')].find(x=>x.textContent==='Settings').click()");
 await js("document.querySelector('[aria-label=\"Close sample.txt\"]').click()");
 await waitFor("!document.querySelector('[aria-label=\"Close sample.txt\"]')",'close background file');
 assert.equal(await js("!!document.querySelector('.settings-page')"),true);
 // If Board is already closed, closing the remaining file opens Settings.
 await js("[...document.querySelectorAll('.tree-row')].find(x=>x.textContent.includes('sample.txt')).click()");
 await waitFor('!!document.querySelector("[aria-label=\\"Close sample.txt\\"]")','reopened file');
 await js("document.querySelector('[aria-label=\"Close Board\"]').click()");
 assert.equal(await js("!!document.querySelector('[aria-label=\"Close sample.txt\"]')"),true);
 await js("document.querySelector('[aria-label=\"Close sample.txt\"]').click()");
 await waitFor("!!document.querySelector('.settings-page')",'fallback after both tabs close');
 const saved=JSON.parse(await fs.readFile(path.join(root,'settings','settings.json'),'utf8'));
 assert.equal(saved.layout.editorMinimap,true); assert.equal(saved.layout.boardMinimap,false);
 assert.equal(saved.layout.sidebarWidth,Math.round(widthAfter)); assert.equal(saved.layout.terminalHeight,Math.round(terminalAfter));
 await win.webContents.reload(); await pause(400);
 await waitFor("document.querySelector('aside')?.getBoundingClientRect().width > 300",'restored sidebar width');
 await key('K',['meta','shift']); await waitFor('!document.querySelector("aside")','restored shortcut');
 await key('K',['meta','shift']); await waitFor('!!document.querySelector("aside")','restored shortcut toggle');
 await capture('/private/tmp/shinba-workspace-e2e.png');
 console.log('Electron workspace workflow passed');
}
app.whenReady().then(run).then(async()=>{await fs.rm(root,{recursive:true,force:true});app.exit(0);}).catch(e=>{console.error(e);if(root)console.error('Fixture retained:',root);app.exit(1);});
