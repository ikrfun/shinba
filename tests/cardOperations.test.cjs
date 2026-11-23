const {test}=require('node:test');
const assert=require('node:assert/strict');
const {pathToFileURL}=require('node:url');
const path=require('node:path');
test('shared card updates preserve other cards and fields',async()=>{
 const {createCard,updateCardData}=await import(pathToFileURL(path.resolve('app/shared/cards.mjs')).href);
 const first=createCard({id:'one',title:'Title',body:'Body'}),second=createCard({id:'two'});
 first.data.extra={meaning:'kept'};
 const result=updateCardData([first,second],'one',{body:'Changed'},{requireExisting:true});
 assert.deepEqual(result[0].data,{title:'Title',body:'Changed',extra:{meaning:'kept'}});
 assert.equal(result[1],second); assert.equal(first.data.body,'Body');
 assert.throws(()=>updateCardData(result,'missing',{}, {requireExisting:true}),/not found/);
});
