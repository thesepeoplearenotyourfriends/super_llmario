'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const source=fs.readFileSync('editor/editor.html','utf8');

function functionSource(name){
  const start=source.indexOf('function '+name+'(');assert.notEqual(start,-1,'missing '+name);let brace=source.indexOf('{',start),depth=0,quote='',escaped=false;
  for(let i=brace;i<source.length;i++){const ch=source[i];if(quote){if(escaped)escaped=false;else if(ch==='\\')escaped=true;else if(ch===quote)quote='';continue}if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue}if(ch==='{')depth++;else if(ch==='}'&&!--depth)return source.slice(start,i+1)}throw new Error('unterminated '+name);
}
const names=['stableCollisionValue','collisionDisplaySignature','collisionRectsTouch','connectedCollisionGroups','uncoveredEdgeIntervals','isTerrainArtwork'];
const sandbox={plain:value=>!!value&&typeof value==='object'&&!Array.isArray(value),themePack:{constructionCatalog:{families:{overground:{type:'terrain'},pipe:{type:'parametric'}}}},cart:null,visualImageFor:it=>it.obj.image||'',semanticAssetCategory:key=>key.startsWith('map.terrain.')?'mapTile':key.startsWith('legacy_ground')?'terrain-tile-image':'scenery',mapTilePaletteCategory:key=>key.startsWith('map.terrain.')?'terrain':'decor'};vm.runInNewContext(names.map(functionSource).join('\n'),sandbox);

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
const wide=box(32,0);wide.w=32;wide.it.obj.w=32;wide.signature=sandbox.collisionDisplaySignature(wide.it,wide);
assert.equal(wide.signature,cells[0].signature,'display geometry does not split otherwise identical adjacent collision');
assert.equal(sandbox.connectedCollisionGroups([cells[0],cells[1],wide]).length,1);
assert(source.includes('if(!isHitboxHelper(it))drawSelection(it)'),'selection does not redraw each helper cell');
const slab=[];for(let y=0;y<20;y++)for(let x=0;x<25;x++){const cell=box(x*16,y*16);cell.signature=sandbox.collisionDisplaySignature(cell.it,cell);slab.push(cell)}
assert.equal(slab.length,500);assert.deepEqual(Array.from(sandbox.connectedCollisionGroups(slab),g=>g.length),[500],'large uniform slab remains one display group');
const drawBody=functionSource('drawMergedHitboxHelpers');assert(!drawBody.includes('connectedCollisionGroups('));assert(!drawBody.includes('uncoveredEdgeIntervals('));
assert(source.includes('rebuildHelperDisplayCache();populateInsertCatalog()'),'map rebuild refreshes cached helper geometry');
const moveBody=functionSource('setObjectRectXY');assert(moveBody.includes('if(isHitboxHelper(it))helperDisplayDirty=true'),'only helper movement invalidates helper display geometry');
assert.equal(sandbox.isTerrainArtwork({kind:'scenery',obj:{semanticFamily:'overground',image:'any_asset'}}),true,'terrain family art needs no authoring-cell metadata');
assert.equal(sandbox.isTerrainArtwork({kind:'scenery',obj:{image:'map.terrain.edge'}}),true,'map terrain art is recognized without semantic authoring metadata');
assert.equal(sandbox.isTerrainArtwork({kind:'scenery',obj:{image:'legacy_ground_1'}}),true,'legacy terrain-category art is recognized');
assert.equal(sandbox.isTerrainArtwork({kind:'scenery',obj:{image:'custom',terrainMapped:true,terrainType:'ground'}}),true,'manually mapped terrain art is recognized');
assert.equal(sandbox.isTerrainArtwork({kind:'scenery',obj:{semanticFamily:'pipe',constructionGroup:'pipe-1',image:'pipe'}}),false,'non-terrain semantic constructions retain their ordinary outline');
const sceneryBody=functionSource('drawScenery');
assert(sceneryBody.includes('if(!isTerrainArtwork(it))'),'generic scenery outlines are suppressed for all terrain artwork');
console.log('editor collision display groups passed');
