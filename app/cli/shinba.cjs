#!/usr/bin/env node
const fs = require('node:fs/promises');
const path = require('node:path');
const crypto = require('node:crypto');
const { parseArgs, isDeepStrictEqual } = require('node:util');
const { mergeBoard, readBoard, validate, withoutRevision } = require('./board.cjs');
const sessions = require('./sessions.cjs');
const names = ['project','session','title','name','body','body-file','parent','x','y','width','height','from','to','template','custom-card','path','take','value-json','file','symbol','kind','range-json'];
const options = Object.fromEntries(names.map(key => [key, { type: 'string' }]));
const output = value => console.log(JSON.stringify(value, null, 2));
const HELP = `shinba board begin|status|diff|save|resolve|abort [--session ID] [--project PATH]
shinba card list|show|related|add|update|move|layout|delete|connect|disconnect|link-symbol

board begin [main]                Start an isolated board session.
board status|diff --session ID    Inspect changes in a session.
board save --session ID           Merge and save; exit 2 on conflict.
board resolve --session ID --path JSON_ARRAY --take working|current|custom|delete [--value-json JSON]
board abort --session ID          Close the session and retain its files.
card list|show ID|related ID      Read the saved board; add --session ID for a draft.
card add --title TEXT [--body TEXT|--body-file PATH] [--x N --y N] [--parent ID] [--from ID] [--to ID]
card update ID [--title TEXT] [--body TEXT|--body-file PATH]
card move ID --parent ID|none     Change parent. Coordinates are relative to the parent.
card layout ID [--x N --y N --width N --height N]
card connect FROM TO | disconnect EDGE_ID | delete ID
card link-symbol ID --file PATH --symbol NAME --kind NUMBER --range-json JSON
All card mutations require --session. Output is JSON; errors go to stderr.`;
function finite(value, label, fallback) {
  if (value === undefined) return fallback;
  const number = Number(value);
  if (!Number.isFinite(number) || value.trim() === '') throw Error(`${label} must be a number`);
  return number;
}
function diff(base, work, location = []) {
  if (isDeepStrictEqual(base, work)) return [];
  if (location.length === 1 && ['nodes','edges'].includes(location[0]) && Array.isArray(base) && Array.isArray(work)) {
    const maps = [base,work].map(items => new Map(items.map(item => [item.id,item])));
    return [...new Set([...maps[0].keys(),...maps[1].keys()])].flatMap(id => diff(maps[0].get(id), maps[1].get(id), [...location,id]));
  }
  if (base && work && typeof base === 'object' && typeof work === 'object' && !Array.isArray(base) && !Array.isArray(work))
    return [...new Set([...Object.keys(base),...Object.keys(work)])].flatMap(key => diff(base[key], work[key], [...location,key]));
  return [{ path:location, before:base === undefined ? {missing:true} : {value:base}, after:work === undefined ? {missing:true} : {value:work} }];
}
async function main() {
  if (process.argv.slice(2).includes('--help')) { console.log(HELP); return; }
  const { createCard, updateCardData } = await import('../shared/cards.mjs');
  const { reparentCard } = await import('../shared/cardHierarchy.mjs');
  const {values,positionals} = parseArgs({args:process.argv.slice(2),options,allowPositionals:true,strict:true});
  const [group, action, ...args] = positionals;
  if (!group || group === 'help' || !action || action === 'help' || action === '--help') { console.log(HELP); return; }
  const root = path.resolve(values.project || process.cwd()), session = values.session;
  const p = sessions.paths(root);
  if (group === 'board' && action === 'begin') {
    if (args.length && args[0] !== 'main') throw Error('Only the main board is supported');
    const result = await sessions.begin(root); output({session:result.id,board:'main'}); return;
  }
  if (group === 'board' && action === 'show') { output(await readBoard(p.board)); return; }
  if (group === 'board' && action === 'save') {
    const result = await sessions.commit(root, session);
    if (!result.saved) { output(result); process.exitCode = 2; return; }
    output({saved:true, revision:result.board.revision, session, ...(result.sessionUpdateError ? {sessionUpdateError:result.sessionUpdateError} : {})}); return;
  }
  const readonly = group === 'card' && ['list','show','related'].includes(action);
  if (readonly && !session) { const board = await readBoard(p.board); return readCards(board, action, args); }
  await sessions.useSession(root, session, async (state, files) => {
    const base = state.base, work = state.working;
    if (group === 'board' && action === 'status') { output({session,changed:!isDeepStrictEqual(withoutRevision(base),withoutRevision(work))}); return; }
    if (group === 'board' && action === 'diff') { output({session,changes:diff(withoutRevision(base),withoutRevision(work))}); return; }
    if (group === 'board' && action === 'abort') { state.aborted=true; await sessions.saveState(files,state); output({session,aborted:true,retainedAt:files.session}); return; }
    if (group === 'board' && action === 'resolve') {
      const current = await readBoard(files.board);
      const detected = mergeBoard(withoutRevision(base),withoutRevision(work),withoutRevision(current));
      if (!values.path) throw Error('--path must be the JSON array path from a conflict');
      const conflictPath = JSON.parse(values.path), key = JSON.stringify(conflictPath);
      if (!Array.isArray(conflictPath) || (key !== '[]' && !detected.conflicts.some(conflict => conflict.key === key))) throw Error('No current conflict at that path');
      if (!['working','current','custom','delete'].includes(values.take)) throw Error('--take must be working, current, custom, or delete');
      if (!state.resolution || !isDeepStrictEqual(state.resolution.current,current)) state.resolution={current,choices:{}};
      const choice = {choice:values.take};
      if (values.take === 'custom') { if (values['value-json'] === undefined) throw Error('--value-json is required'); choice.value=JSON.parse(values['value-json']); }
      state.resolution.choices[key]=choice; await sessions.saveState(files,state); output({session,path:conflictPath,resolved:values.take}); return;
    }
    if (group !== 'card') throw Error('Unknown command');
    if (readonly) return readCards(work,action,args);
    const find = id => { const node=work.nodes.find(item=>item.id===id); if (!node) throw Error(`Card not found: ${id}`); return node; };
    let result;
    if (action === 'add') {
      const id=crypto.randomUUID();
      if (values.parent) find(values.parent);
      if (values.from) find(values.from); if (values.to) find(values.to);
      const node=createCard({id,title:values.title ?? values.name ?? 'New card',body:values['body-file'] ? await fs.readFile(values['body-file'],'utf8') : (values.body ?? ''),x:finite(values.x,'x',80),y:finite(values.y,'y',80),parentId:values.parent,templateId:values.template || values['custom-card']});
      work.nodes.push(node);
      if (values.from) work.edges.push({id:crypto.randomUUID(),source:values.from,target:id});
      if (values.to) work.edges.push({id:crypto.randomUUID(),source:id,target:values.to});
      result=node;
    } else if (action === 'update') {
      find(args[0]); const patch={};
      if (values.title !== undefined || values.name !== undefined) patch.title=values.title ?? values.name;
      if (values.body !== undefined) patch.body=values.body;
      if (values['body-file']) patch.body=await fs.readFile(values['body-file'],'utf8');
      work.nodes=updateCardData(work.nodes,args[0],patch,{requireExisting:true}); result=find(args[0]);
    } else if (action === 'move') {
      find(args[0]); if (values.parent === undefined) throw Error('--parent is required; use none to detach');
      const parent = values.parent === 'none' ? '' : values.parent;
      if (parent) find(parent);
      work.nodes = reparentCard(work.nodes, args[0], parent, { placement:'keep-relative' });
      result = find(args[0]);
    } else if (action === 'layout') {
      const n=find(args[0]); n.position={x:finite(values.x,'x',n.position.x),y:finite(values.y,'y',n.position.y)};
      for (const key of ['width','height']) if (values[key] !== undefined) { const value=finite(values[key],key); if (value <= 0) throw Error(`${key} must be positive`); n.style={...n.style,[key]:value}; n[key]=value; } result=n;
    } else if (action === 'connect') {
      const [source,target]=args; find(source); find(target); result={id:crypto.randomUUID(),source,target}; work.edges.push(result);
    } else if (action === 'disconnect') {
      if (!work.edges.some(edge=>edge.id===args[0])) throw Error(`Edge not found: ${args[0]}`);
      work.edges=work.edges.filter(edge=>edge.id!==args[0]); result={deleted:args[0]};
    } else if (action === 'delete') {
      find(args[0]); if (work.nodes.some(n=>n.parentId===args[0]) || work.edges.some(e=>e.source===args[0]||e.target===args[0])) throw Error('Remove children and edges before deleting a card');
      work.nodes=work.nodes.filter(n=>n.id!==args[0]); result={deleted:args[0]};
    } else if (action === 'link-symbol') {
      find(args[0]); if (!values.file || !values.symbol || values.kind === undefined || !values['range-json']) throw Error('--file, --symbol, --kind and --range-json are required');
      const codeLink={path:values.file,name:values.symbol,kind:finite(values.kind,'kind'),range:JSON.parse(values['range-json'])};
      work.nodes=updateCardData(work.nodes,args[0],{codeLink},{requireExisting:true}); result=find(args[0]);
    } else throw Error('Unknown command');
    validate(work); state.resolution=null; await sessions.saveState(files,state); output(result);
  });
}
function readCards(board,action,args) {
  const find=id=>{ const node=board.nodes.find(item=>item.id===id); if(!node) throw Error(`Card not found: ${id}`); return node; };
  if(action==='list') return output(board.nodes.map(node=>({id:node.id,title:node.data.title,parentId:node.parentId})));
  if(action==='show') return output(find(args[0]));
  const node=find(args[0]); output({card:node,children:board.nodes.filter(n=>n.parentId===node.id),edges:board.edges.filter(e=>e.source===node.id||e.target===node.id)});
}
main().catch(error => { console.error(error.message); process.exitCode=1; });
