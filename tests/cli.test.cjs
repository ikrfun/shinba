const {test}=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs/promises');
const os=require('node:os');
const path=require('node:path');
const {spawnSync}=require('node:child_process');
const cli=path.resolve('app/cli/shinba.cjs');
test('sessions preserve concurrent unrelated edits and report conflicts',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shinba-cli-'));
 const run=(...args)=>spawnSync(process.execPath,[cli,...args,'--project',dir],{encoding:'utf8'});
 try {
  await fs.mkdir(path.join(dir,'.shinba','boards'),{recursive:true});
  const file=path.join(dir,'.shinba','boards','main.json');
  const board={id:'main',name:'Main',nodes:[{id:'a',type:'card',position:{x:0,y:0},data:{title:'A',body:'old'}}],edges:[],schemaVersion:1,revision:1};
  await fs.writeFile(file,JSON.stringify(board));
  const a=JSON.parse(run('board','begin','main').stdout).session;
  const b=JSON.parse(run('board','begin','main').stdout).session;
  assert.equal(run('card','update','a','--title','local','--session',a).status,0);
  assert.equal(run('card','update','a','--body','remote','--session',b).status,0);
  assert.equal(run('board','save','--session',a).status,0);
  assert.equal(run('board','save','--session',b).status,0);
  const saved=JSON.parse(await fs.readFile(file)); assert.equal(saved.nodes[0].data.title,'local'); assert.equal(saved.nodes[0].data.body,'remote');
  const c=JSON.parse(run('board','begin','main').stdout).session;
  const d=JSON.parse(run('board','begin','main').stdout).session;
  run('card','update','a','--body','one','--session',c);
  run('card','update','a','--body','two','--session',d);
  assert.equal(run('board','save','--session',c).status,0);
  const conflict=run('board','save','--session',d); assert.equal(conflict.status,2); assert.equal(JSON.parse(conflict.stdout).conflicts.length,1);
  assert.equal(JSON.parse(await fs.readFile(file)).nodes[0].data.body,'one');
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('CLI resolves conflicts only against the version that was reviewed',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shinba-cli-resolve-'));
 const run=(...args)=>spawnSync(process.execPath,[cli,...args,'--project',dir],{encoding:'utf8'});
 try {
  await fs.mkdir(path.join(dir,'.shinba','boards'),{recursive:true});
  const file=path.join(dir,'.shinba','boards','main.json');
  const board={id:'main',name:'Main',nodes:[{id:'a',type:'card',position:{x:0,y:0},data:{title:'A',body:'old'}}],edges:[],schemaVersion:1,revision:1};
  await fs.writeFile(file,JSON.stringify(board));
  const human=JSON.parse(run('board','begin').stdout).session, agent=JSON.parse(run('board','begin').stdout).session;
  run('card','update','a','--body','human','--session',human);
  run('card','update','a','--body','agent','--session',agent);
  assert.equal(run('board','save','--session',agent).status,0);
  const conflict=JSON.parse(run('board','save','--session',human).stdout).conflicts[0];
  assert.equal(run('board','resolve','--session',human,'--path',JSON.stringify(conflict.path),'--take','custom','--value-json','"both"').status,0);
  assert.equal(run('board','save','--session',human).status,0);
  assert.equal(JSON.parse(await fs.readFile(file)).nodes[0].data.body,'both');
  const state=JSON.parse(await fs.readFile(path.join(dir,'.shinba','sessions',human,'state.json')));
  assert.equal(state.base.nodes[0].data.body,'both'); assert.equal(state.working.nodes[0].data.body,'both');
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});
test('CLI edits card hierarchy, relationships, layout and symbols in an isolated draft',async()=>{
 const dir=await fs.mkdtemp(path.join(os.tmpdir(),'shinba-cli-cards-'));
 const run=(...args)=>spawnSync(process.execPath,[cli,...args,'--project',dir],{encoding:'utf8'});
 try {
  const session=JSON.parse(run('board','begin').stdout).session;
  const parent=JSON.parse(run('card','add','--session',session,'--title','Parent').stdout);
  const child=JSON.parse(run('card','add','--session',session,'--title','Child','--parent',parent.id,'--x','40','--y','170','--from',parent.id).stdout);
  assert.equal(child.parentId,parent.id);
  const related=JSON.parse(run('card','related',parent.id,'--session',session).stdout);
  assert.equal(related.children[0].id,child.id); assert.equal(related.edges[0].target,child.id);
  assert.notEqual(run('card','delete',parent.id,'--session',session).status,0);
  assert.equal(run('card','layout',child.id,'--session',session,'--width','300','--height','240').status,0);
  const range=JSON.stringify({start:{line:0,character:0},end:{line:0,character:5}});
  assert.equal(run('card','link-symbol',child.id,'--session',session,'--file','app.js','--symbol','hello','--kind','12','--range-json',range).status,0);
  assert.equal(JSON.parse(run('card','show',child.id,'--session',session).stdout).data.codeLink.name,'hello');
  assert.notEqual(run('card','move',parent.id,'--session',session,'--parent',child.id).status,0);
  assert.equal(run('card','disconnect',related.edges[0].id,'--session',session).status,0);
  assert.equal(run('board','save','--session',session).status,0);
  assert.equal(JSON.parse(run('card','list').stdout).length,2);
 } finally {await fs.rm(dir,{recursive:true,force:true});}
});
