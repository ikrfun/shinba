const {test}=require('node:test');
const assert=require('node:assert/strict');
const {registerTerminal}=require('../app/main/terminal-manager.cjs');
test('terminal panes have independent processes, data and lifecycle',()=>{
 const handlers={},listeners={},outputs=[],processes=[];
 const ipcMain={handle:(n,fn)=>handlers[n]=fn,on:(n,fn)=>listeners[n]=fn};
 const manager=registerTerminal({ipcMain,inside:()=>'/project',getWindow:()=>({webContents:{send:(...args)=>outputs.push(args)}}),spawn:()=>{
   const p={writes:[],sizes:[],killed:false,onData(fn){this.data=fn;},onExit(fn){this.exit=fn;},write(t){this.writes.push(t);},resize(c,r){this.sizes.push([c,r]);},kill(){this.killed=true;}};processes.push(p);return p;
 }});
 handlers['terminal:start'](null,'first',80,24); handlers['terminal:start'](null,'second',90,30);
 listeners['terminal:write'](null,'first','a'); listeners['terminal:write'](null,'second','b');
 listeners['terminal:resize'](null,'second',120,40); processes[0].data('one');processes[1].data('two');
 assert.deepEqual(processes.map(p=>p.writes),[['a'],['b']]);
 assert.deepEqual(outputs,[['terminal:data','first','one'],['terminal:data','second','two']]);
 assert.deepEqual(processes[1].sizes,[[120,40]]);
 listeners['terminal:close'](null,'first');assert.equal(processes[0].killed,true);assert.equal(processes[1].killed,false);
 manager.dispose();assert.equal(processes[1].killed,true);
 assert.throws(()=>handlers['terminal:start'](null,'../bad',80,24),/Invalid terminal/);
});
