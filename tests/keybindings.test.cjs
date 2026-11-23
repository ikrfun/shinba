const {test}=require('node:test');
const assert=require('node:assert/strict');
const {defaults,normalizeKeybindings,matchAction}=require('../app/main/keybindings.cjs');
const key=(code,mods={})=>({type:'keyDown',code,meta:false,control:false,alt:false,shift:false,...mods});
test('defaults dispatch save, sidebar and terminal on macOS and Windows',()=>{
 const mac=defaults('darwin'), windows=defaults('win32');
 assert.equal(matchAction(key('KeyS',{meta:true}),mac,'darwin'),'save');
 assert.equal(matchAction(key('KeyB',{meta:true}),mac,'darwin'),'toggle-sidebar');
 assert.equal(matchAction(key('Backquote',{control:true}),mac,'darwin'),'toggle-terminal');
 assert.equal(matchAction(key('KeyB',{control:true}),windows,'win32'),'toggle-sidebar');
 assert.equal(matchAction(key('Backquote',{control:true}),windows,'win32'),'toggle-terminal');
 assert.equal(matchAction(key('KeyB',{control:true}),mac,'darwin'),null);
});
test('custom bindings replace defaults, reject duplicates and allow unbinding',()=>{
 const keys=normalizeKeybindings({...defaults(),save:'Mod+Shift+KeyP','open-project':null});
 assert.equal(matchAction(key('KeyP',{meta:true,shift:true}),keys,'darwin'),'save');
 assert.equal(matchAction(key('KeyS',{meta:true}),keys,'darwin'),null);
 assert.throws(()=>normalizeKeybindings({...keys,save:keys['toggle-sidebar']}),/already assigned/);
 assert.throws(()=>normalizeKeybindings({...keys,save:'KeyS'}),/modifier/);
 assert.equal(matchAction({...key('KeyP',{meta:true,shift:true}),isAutoRepeat:true},keys,'darwin'),null);
});
test('new defaults do not overwrite existing custom shortcuts',()=>{
 const previous=defaults(); delete previous['split-view']; delete previous['new-tab'];
 previous.save='Mod+KeyD';
 const migrated=normalizeKeybindings(previous);
 assert.equal(migrated.save,'Mod+KeyD');
 assert.equal(migrated['split-view'],null);
 assert.equal(migrated['new-tab'],'Mod+KeyT');
});
