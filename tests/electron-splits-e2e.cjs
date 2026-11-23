// Run with electron after npm run build. Uses fake PTYs and an isolated project.
const {app,BrowserWindow,ipcMain}=require('electron');
const fs=require('node:fs/promises'),path=require('node:path'),os=require('node:os'),assert=require('node:assert/strict');
const {registerStorage}=require('../app/main/storage.cjs');
const {registerSettings}=require('../app/main/settings.cjs');
const {registerTerminal}=require('../app/main/terminal-manager.cjs');
const {defaults,matchAction}=require('../app/main/keybindings.cjs');
const {writeJson}=require('../app/cli/board.cjs');
let root,win,bindings=defaults(),capturing=false,allowDiscard=false,discardRequests=0;
const processes=[];
const pause=ms=>new Promise(resolve=>setTimeout(resolve,ms));
const js=source=>win.webContents.executeJavaScript(source);
async function waitFor(source,label){for(let i=0;i<120;i++){if(await js(source))return;await pause(100);}throw Error(`Timed out: ${label}`);}
async function key(keyCode,modifiers=['meta']){win.webContents.sendInputEvent({type:'keyDown',keyCode,modifiers});win.webContents.sendInputEvent({type:'keyUp',keyCode,modifiers});await pause(200);}
async function run(){
 root=await fs.mkdtemp(path.join(os.tmpdir(),'shinba-splits-'));
 const project=path.join(root,'project'), board=path.join(project,'.shinba','boards','main.json');
 await fs.mkdir(path.dirname(board),{recursive:true});
 await writeJson(board,{id:'main',name:'Main',schemaVersion:1,revision:1,nodes:[{id:'a',type:'card',position:{x:0,y:0},data:{title:'Card',body:'Body'},style:{width:260,height:200}}],edges:[]});
 await fs.writeFile(path.join(project,'one.txt'),'one');await fs.writeFile(path.join(project,'two.txt'),'two');
 await fs.mkdir(path.join(root,'settings'),{recursive:true});await fs.writeFile(path.join(root,'settings','settings.json'),JSON.stringify({vimEnabled:false}));
 registerStorage({ipcMain,inside:(p='')=>path.join(project,p)});
 registerSettings({app:{getPath:()=>path.join(root,'settings')},ipcMain,onKeybindingsChanged:next=>bindings=next});
 ipcMain.handle('shortcuts:capture',(_e,value)=>{capturing=value;});
 ipcMain.handle('project:open',()=>({name:'project',path:project}));
 ipcMain.handle('file:discard-untitled',()=>{discardRequests++;return allowDiscard;});
 ipcMain.handle('file:save-as',async(_e,text)=>{await fs.writeFile(path.join(project,'new.txt'),text);return 'new.txt';});
 registerTerminal({ipcMain,inside:()=>project,getWindow:()=>win,spawn:()=>{
   const p={writes:[],killed:false,onData(fn){this.data=fn;},onExit(fn){this.exit=fn;},write(t){this.writes.push(t);},resize(){},kill(){this.killed=true;}};processes.push(p);return p;
 }});
 win=new BrowserWindow({width:1100,height:800,show:false,webPreferences:{preload:path.resolve('app/main/preload.cjs'),contextIsolation:true,nodeIntegration:false}});
 win.webContents.on('before-input-event',(event,input)=>{if(capturing)return;const action=matchAction(input,bindings);if(action){event.preventDefault();win.webContents.send('shortcut',action);}});
 await win.loadFile(path.resolve('dist/index.html'));win.webContents.send('shortcut','open-project');
 await waitFor('!!document.querySelector(".card-view-title")','open board');
 const colors=await js("[getComputedStyle(document.querySelector('.card')).backgroundColor,getComputedStyle(document.querySelector('.react-flow').parentElement).backgroundColor]");
 assert.notEqual(colors[0],colors[1]);
 // Splitting the board keeps it visible and opens a workspace beside it.
 await key('D');await waitFor('!!document.querySelector(".split-board .code-pane")','board split');
 assert.equal(await js('getComputedStyle(document.querySelector(".react-flow").parentElement).display !== "none"'),true);
 await waitFor('!!document.querySelector("[aria-label=\\"Close Untitled-1\\"]")','new split document');
 await js("document.querySelector('[aria-label=\"Close Untitled-1\"]').click()");
 await waitFor("!document.querySelector('[aria-label=\"Close Untitled-1\"]')",'close untitled');
 await js("document.querySelector('[aria-label=\"Close editor split\"]').click()");
 await waitFor('!document.querySelector(".split-board")','close board split');
 // Terminal split and new terminal tab keep separate PTYs alive.
 await key('`',['control']);await waitFor('document.querySelectorAll(".terminal-pane").length === 1','terminal');
 await js("document.querySelector('.terminal').dispatchEvent(new FocusEvent('focusin',{bubbles:true}))");
 await key('D');await waitFor('document.querySelectorAll(".terminal-pane").length === 2','split terminal');
 assert.equal(processes.length,2);assert.ok(processes.every(p=>!p.killed));
 await js("document.querySelector('.terminal').dispatchEvent(new FocusEvent('focusin',{bubbles:true}))");
 await key('T');await waitFor('document.querySelectorAll(".terminal-tab").length === 2','new terminal tab');
 await waitFor('document.querySelectorAll(".terminal-pane").length === 3','new terminal pane');
 assert.equal(processes.length,3);assert.ok(processes.every(p=>!p.killed));
 await js("document.querySelector('[aria-label=\"Close terminal 2\"]').click()");
 await waitFor('document.querySelectorAll(".terminal-pane").length === 2','close terminal tab');
 assert.equal(processes[2].killed,true);assert.equal(processes[0].killed,false);assert.equal(processes[1].killed,false);
 await key('`',['control']);
 // Different documents can be shown side by side, and a new tab targets the focused pane.
 await js("[...document.querySelectorAll('.tree-row')].find(x=>x.textContent.includes('one.txt')).click()");
 await waitFor('!!document.querySelector("[aria-label=\\"Close one.txt\\"]")','open first file');
 await js("document.querySelector('.code-pane').dispatchEvent(new FocusEvent('focusin',{bubbles:true}))");
 await key('D');await waitFor('document.querySelectorAll(".code-pane").length === 2','split editor');
 await waitFor('document.querySelectorAll(".native-edit-context").length === 2','shared document editors');
 await pause(400);
 const sameModel=await js(`(() => { try { function editor(el) { let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))]; while(f){for(const g of [f,f.alternate]){for(let h=g?.memoizedState;h;h=h.next){let v=h.memoizedState;if(v&&typeof v.trigger==='function'&&typeof v.getModel==='function')return v;}}f=f.return;} } const panes=document.querySelectorAll('.code-pane'); return editor(panes[0]).getModel()===editor(panes[1]).getModel(); } catch(e){return e.stack} })()`);
 assert.equal(sameModel,true);
 await js("document.querySelector('[aria-label=\"Close editor split\"]').click()");
 await waitFor('document.querySelectorAll(".code-pane").length === 1','close shared split');
 await js(`(() => { const el=document.querySelector('.code-pane'); let f=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))]; while(f){for(const g of [f,f.alternate]){for(let h=g?.memoizedState;h;h=h.next){const v=h.memoizedState;if(v&&typeof v.trigger==='function'&&typeof v.getModel==='function'){v.trigger('test','type',{text:' shared'});return;}}}f=f.return;}throw Error('Editor instance not found');})()`);
 await waitFor("document.querySelector('.workspace-tab-label') && [...document.querySelectorAll('.workspace-tab-label')].some(e=>e.textContent.includes('one.txt') && e.textContent.includes('●'))",'remaining shared editor');
 await key('S');
 await key('D');await waitFor('document.querySelectorAll(".code-pane").length === 2','split editor again');
 await js("document.querySelectorAll('.code-pane')[1].dispatchEvent(new FocusEvent('focusin',{bubbles:true}))");
 await js("[...document.querySelectorAll('.tree-row')].find(x=>x.textContent.includes('two.txt')).click()");
 await waitFor('!!document.querySelector("[aria-label=\\"Close two.txt\\"]")','open second file');
 assert.match(await js("document.querySelectorAll('.code-pane')[0].textContent"),/one.txt/);
 assert.match(await js("document.querySelectorAll('.code-pane')[1].textContent"),/two.txt/);
 await js("document.querySelectorAll('.code-pane')[1].dispatchEvent(new FocusEvent('focusin',{bubbles:true}))");
 await key('T');await waitFor('!!document.querySelector("[aria-label=\\"Close Untitled-2\\"]")','new editor tab');
 assert.match(await js("document.querySelectorAll('.code-pane')[0].textContent"),/one.txt/);
 assert.match(await js("document.querySelectorAll('.code-pane')[1].textContent"),/Untitled-2/);
 await waitFor('document.querySelectorAll(".native-edit-context").length === 2','both editors mounted');
 await pause(300);
 await js(`(() => { const el=document.querySelectorAll('.code-pane')[1]; let fiber=el[Object.keys(el).find(k=>k.startsWith('__reactFiber$'))]; while(fiber){ for(const g of [fiber,fiber.alternate]){ let hook=g?.memoizedState; while(hook){ const value=hook.memoizedState; if(value && typeof value.trigger==='function' && typeof value.getModel==='function'){ value.trigger('test','type',{text:'new draft'}); return; } hook=hook.next; }} fiber=fiber.return; } throw Error('Editor instance not found'); })()`);
 await waitFor("[...document.querySelectorAll('.workspace-tab-label')].some(e=>e.textContent.includes('Untitled-2') && e.textContent.includes('●'))",'dirty untitled');
 await js("document.querySelector('[aria-label=\"Close Untitled-2\"]').click()");
 await pause(100);assert.equal(discardRequests,1);assert.equal(await js("!!document.querySelector('[aria-label=\"Close Untitled-2\"]')"),true);
 await key('S');await waitFor('!!document.querySelector("[aria-label=\\"Close new.txt\\"]")','save new file');
 assert.match(await fs.readFile(path.join(project,'new.txt'),'utf8'),/new draft/);
 await js("document.querySelector('[aria-label=\"Close new.txt\"]').click()");
 await waitFor('!document.querySelector("[aria-label=\\"Close new.txt\\"]")','close saved editor tab');
 await js("document.querySelector('[aria-label=\"Close editor split\"]').click()");
 await waitFor('document.querySelectorAll(".code-pane").length === 1','close editor split');
 console.log('Electron split workflow passed');
}
app.whenReady().then(run).then(async()=>{await fs.rm(root,{recursive:true,force:true});app.exit(0);}).catch(e=>{console.error(e);if(root)console.error('Fixture retained:',root);app.exit(1);});
