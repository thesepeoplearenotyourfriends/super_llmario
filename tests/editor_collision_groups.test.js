'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('editor/editor.html','utf8');

function functionSource(name){
  const start=source.indexOf('function '+name+'(');assert.notEqual(start,-1,'missing '+name);let brace=source.indexOf('{',start),depth=0,quote='',escaped=false;
  for(let i=brace;i<source.length;i++){const ch=source[i];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue}if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue}if(ch==='{')depth++;else if(ch==='}'&&!--depth)return source.slice(start,i+1)}throw new Error('unterminated '+name);
}
const names=['stableCollisionValue','collisionDisplaySignature','collisionRectsTouch','connectedCollisionGroups','uncoveredEdgeIntervals'];
const sandbox={plain:value=>!!value&&typeof value==='object'&&!Array.isArray(value)};vm.runInNewContext(names.map(functionSource).join('\n'),sandbox);

const box=(x,y,details={type:'ground'})=>({x,y,w:16,h:16,it:{kind:'platform',obj:{x,y,w:16,h:16,id:'box-'+x+'-'+y,...details}}});
const cells=[box(0,0),box(16,0),box(32,0),box(48,0),box(0,16),box(16,16),box(32,16),box(48,16),box(0,32),box(16,32),box(32,32,{type:'ice'}),box(48,32,{type:'ice'})];
for(const cell of cells)cell.signature=sandbox.collisionDisplaySignature(cell.it,cell);
const groups=sandbox.connectedCollisionGroups(cells);
assert.deepEqual(Array.from(groups,g=>g.length).sort((a,b)=>a-b),[2,10]);
assert.notEqual(cells[0].signature,cells.at(-1).signature);
assert.equal(sandbox.collisionRectsTouch(cells[0],cells[1]),true);
assert.equal(sandbox.collisionRectsTouch(cells[0],cells[5]),false,'corner-only contact is not edge adjacency');
assert.equal(JSON.stringify(sandbox.uncoveredEdgeIntervals([cells[0],cells[1]],'v',16,0,16,1)),'[]','shared edge is omitted from the group outline');
assert.equal(JSON.stringify(sandbox.uncoveredEdgeIntervals([cells[0],cells[1]],'h',0,0,16,-1)),'[[0,16]]','outer edge remains in the group outline');
console.log('editor collision display groups passed');
