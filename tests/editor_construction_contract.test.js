'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),cp=require('node:child_process'),C=require('../construction/catalog.js');
const theme=JSON.parse(fs.readFileSync('themes/theme_marioai_nonempty.llmtheme.txt','utf8')),terrain=theme.constructionCatalog.families['terrain.overground'];
const images=theme.assets.images,catalog=theme.assetCatalog,counts={};for(const entry of Object.values(catalog))counts[entry.sourceSheet]=(counts[entry.sourceSheet]||0)+1;assert.equal(Object.keys(images).length,298);assert.equal(counts['mapsheet.png'],134);assert.deepEqual(counts,{'mapsheet.png':134,'bgsheet.png':62,'enemysheet.png':27,'itemsheet.png':3,'particlesheet.png':12,'mariosheet.png':15,'smallmariosheet.png':11,'firemariosheet.png':15,'racoonmariosheet.png':16,'princess.png':3});assert(!Object.keys(images).some(id=>id.includes('marioai_map_')));for(const frames of Object.values(theme.animationGroups))for(const frame of frames)assert(images[frame.asset]);for(const [id,truth] of Object.entries(theme.collisionTruth.assets)){assert(images[id]);assert(truth.marioAI)}for(const family of Object.values(theme.constructionCatalog.families)){assert(!family.assets);for(const value of Object.values(family.components||{}))if(Array.isArray(value))for(const part of value)assert(images[part.asset],part.asset)}
const ids=Object.keys(images).sort(),bySuffix={};for(const id of ids){const aliases=[id];for(let dot=id.indexOf('.');dot>=0;dot=id.indexOf('.',dot+1))aliases.push(id.slice(dot+1));for(const alias of aliases)(bySuffix[alias]||(bySuffix[alias]=[])).push(id)}const semanticAsset=suffix=>(bySuffix[suffix]||[])[0]||null;for(const id of ['mario.player-motion.idle_walk_0','smallmario.player-motion.idle_walk_0','firemario.player-motion.idle_walk_0','racoonmario.player-motion.idle_walk_0'])assert.equal(semanticAsset(id),id);assert.equal(semanticAsset('pickup-powerup.grow'),'item.pickup-powerup.grow');assert.equal(semanticAsset('pickup-powerup.projectile'),'item.pickup-powerup.projectile');assert.equal(semanticAsset('pickup-special.green'),'item.pickup-special.green');for(const group of ['enemy.goomba.walk','enemy.flower','effect.sparkle.general','projectile.fireball'])for(const frame of theme.animationGroups[group])assert(images[frame.asset],group+': '+frame.asset);
let state={sprites:[],collisions:[]};C.applyTerrainEdit(state,terrain,new Set(['0,0']),true);C.applyTerrainEdit(state,terrain,new Set(['1,0']),true);
assert.deepEqual(C.terrainOccupancy(state.sprites,terrain.id),new Set(['0,0','1,0']));assert.equal(state.sprites.find(x=>x.semanticCellX===0).semanticTopology,'0100');assert.equal(state.sprites.find(x=>x.semanticCellX===1).semanticTopology,'0001');
C.applyTerrainEdit(state,terrain,new Set(['1,0']),false);assert.deepEqual(C.terrainOccupancy(state.sprites,terrain.id),new Set(['0,0']));assert.equal(state.sprites[0].semanticTopology,'0000');
state={sprites:[],collisions:[]};const full=new Set();for(let y=0;y<3;y++)for(let x=0;x<3;x++)full.add(x+','+y);C.applyTerrainEdit(state,terrain,full,true);const center=state.sprites.find(x=>x.semanticCellX===1&&x.semanticCellY===1);assert.equal(center.semanticTopology,'1111');assert.equal(center.semanticFallback,null);assert.equal(center.image,'map.terrain.overground.dirt_fill.variant_0');assert.equal(center.w,terrain.dimensions.cell);assert.equal(state.collisions.find(x=>x.semanticCellX===1&&x.semanticCellY===1).w,terrain.dimensions.cell);
assert.deepEqual(C.proceduralStyle(theme,'terrain.overground'),terrain.components.topologyFallback.style);
const ops=[],ctx={save(){ops.push(['save'])},restore(){ops.push(['restore'])},fillRect(...a){ops.push(['fillRect',this.fillStyle,...a])},strokeRect(...a){ops.push(['strokeRect',this.strokeStyle,...a])}};C.drawProceduralTerrain(ctx,{x:1,y:2,w:16,h:16},C.proceduralStyle(theme,'terrain.overground'));assert.deepEqual(ops,[['save'],['fillRect','#75451f',1,2,16,16],['fillRect','#6abf31',1,2,16,5],['strokeRect','rgba(0,0,0,.45)',1,2,16,16],['restore']]);
const pipe=theme.constructionCatalog.families['pipe.vertical'],short=C.construct(pipe,{w:2,h:2}),tall=C.construct(pipe,{w:2,h:5});assert.deepEqual(short.slice(0,2).map(x=>x.asset),tall.slice(0,2).map(x=>x.asset));assert.equal(tall.length-short.length,6);
const map={custom:{bindings:[]}},customEntry={id:'custom',type:'resizable',name:'Custom',dimensions:{cell:10},components:{cap:[],body:[]},authoringBinding:{noun:'pipe',path:'custom.bindings',defaults:{solid:true}}};const binding=C.updateBinding(map,customEntry,'g',{x:20,y:30},{w:2,h:4});assert.equal(map.custom.bindings.length,1);assert.strictEqual(C.updateBinding(map,customEntry,'g',{x:20,y:30},{w:2,h:6}),binding);assert.equal(map.custom.bindings.length,1);assert.equal(binding.length,60);
const visuals=tall.map(x=>({...x,constructionGroup:'original',constructionSize:{w:2,h:5}})),bound={constructionGroup:'original',constructionBinding:'pipe',travel:true,targetX:9,targetY:10,solid:true,global:true},copies=JSON.parse(JSON.stringify([...visuals,bound]));C.remapConstructionGroups(copies,()=> 'copy');assert(copies.every(x=>x.constructionGroup==='copy'));assert(visuals.every(x=>x.constructionGroup==='original'));assert.equal(copies.at(-1).targetX,9);
const pipeMap={resourceScenery:{pipes:[]}},realPipe=C.updateBinding(pipeMap,pipe,'pipe-group',{x:0,y:0},{w:2,h:4},{semanticFamily:'pipe.vertical'});realPipe.travel=true;realPipe.targetX=120;realPipe.targetY=80;realPipe.solid=false;realPipe.global=false;assert.strictEqual(C.findBinding(pipeMap,pipe,'pipe-group'),realPipe);assert.deepEqual({travel:realPipe.travel,targetX:realPipe.targetX,targetY:realPipe.targetY,solid:realPipe.solid,global:realPipe.global},{travel:true,targetX:120,targetY:80,solid:false,global:false});assert.equal(visuals.length,tall.length);

const imported=C.asciiCellsToNative(new Set(['0,0','1,0','2,0','3,0']),{x:0,y:0},21,16);assert.deepEqual(imported,new Set(['0,0','1,0','2,0','3,0','4,0']));const terrainRect={x:4*16,w:16},neighborWorldX=4*21;assert.equal(Math.floor(terrainRect.x/21),3);assert.equal(Math.ceil((terrainRect.x+terrainRect.w)/21)-1,3);assert.equal(Math.floor(neighborWorldX/21),4);
const ordinaryA={obj:{kind:'pipe',name:'ordinary-a'}},ordinaryB={obj:{kind:'pipe',name:'ordinary-b'}},semanticAVisual={obj:{constructionGroup:'ga',image:'map.pipe.vertical.mouth.left'}},semanticABinding={obj:{constructionGroup:'ga',constructionBinding:'pipe',kind:'pipe'}},semanticBVisual={obj:{constructionGroup:'gb',image:'map.pipe.vertical.mouth.left'}},semanticBBinding={obj:{constructionGroup:'gb',constructionBinding:'pipe',kind:'pipe'}},allPipes=[ordinaryA,ordinaryB,semanticAVisual,semanticABinding,semanticBVisual,semanticBBinding],isPipeItem=it=>(it.obj||it).kind==='pipe';
assert.deepEqual(C.logicalSelection([ordinaryA,ordinaryB],allPipes,'pipe',isPipeItem),[ordinaryA,ordinaryB]);assert.deepEqual(C.logicalSelection([semanticAVisual,ordinaryB],allPipes,'pipe',isPipeItem),[semanticABinding,ordinaryB]);assert.deepEqual(C.logicalSelection([ordinaryA,semanticBVisual],allPipes,'pipe',isPipeItem),[ordinaryA,semanticBBinding]);assert.deepEqual(C.logicalSelection([semanticAVisual,semanticBVisual],allPipes,'pipe',isPipeItem),[semanticABinding,semanticBBinding]);
assert.equal(C.asciiMaps(theme.constructionCatalog).imports.X,'terrain.overground');assert(!C.asciiMaps(theme.constructionCatalog).exports['pipe.vertical']);
cp.execFileSync('python3',['scripts/sync_editor_catalog.py','--check']);for(const file of ['editor/editor.html','engine/engine.html']){const html=fs.readFileSync(file,'utf8');assert(!/<script[^>]+src=["'][^"']*construction\/catalog\.js/.test(html));assert(html.includes('BEGIN GENERATED CONSTRUCTION CATALOG'))}
console.log('editor construction contract tests passed');

// Auto terrain retiles around edits while explicit family tiles remain locked.
state={sprites:[],collisions:[]};
C.applyTerrainEdit(state,terrain,new Set(['0,0','1,0']),true);
state.sprites=state.sprites.filter(s=>s.semanticCellX!==1);state.collisions=state.collisions.filter(s=>s.semanticCellX!==1);
state.sprites.push({semanticFamily:terrain.id,semanticAuto:false,semanticCellX:1,semanticCellY:0,image:'manual.tile'});
state.collisions.push({semanticFamily:terrain.id,semanticAuto:false,semanticCellX:1,semanticCellY:0,type:'ground'});
C.applyTerrainEdit(state,terrain,new Set(['0,1']),true);
assert.equal(state.sprites.find(s=>s.semanticCellX===1&&s.semanticCellY===0).image,'manual.tile');
assert.equal(state.sprites.find(s=>s.semanticCellX===1&&s.semanticCellY===0).semanticAuto,false);
// An Auto stroke crossing the locked cell preserves it and resolves both neighbors around its occupancy.
C.applyTerrainEdit(state,terrain,new Set(['1,0','2,0']),true);
const locked=state.sprites.find(s=>s.semanticCellX===1&&s.semanticCellY===0),left=state.sprites.find(s=>s.semanticCellX===0&&s.semanticCellY===0),right=state.sprites.find(s=>s.semanticCellX===2&&s.semanticCellY===0);
assert.equal(locked.image,'manual.tile');assert.equal(locked.semanticAuto,false);
assert.equal(left.semanticTopology,'0110');assert.equal(right.semanticTopology,'0001');
C.applyTerrainEdit(state,terrain,new Set(['1,0']),false);
assert(!state.sprites.some(s=>s.semanticCellX===1&&s.semanticCellY===0));
console.log('terrain auto/manual contract passed');

// Terrain brush interpolation follows traversed cells rather than filling bounds.
const irregular=C.terrainStrokeCells([{x:1,y:1},{x:33,y:33},{x:65,y:33}],16);
assert.deepEqual(irregular,new Set(['0,0','1,1','2,2','3,2','4,2']));
assert(!irregular.has('0,2'));assert(!irregular.has('4,0'));
// Manual inventory is explicit family data and is deliberately larger than Auto topology.
const manual=new Set(terrain.manualAssets),auto=new Set(Object.values(terrain.components.topology));
for(const id of ['map.terrain.overground.grass_top.alt_middle','map.terrain.overground.grass_edge.curved_left','map.terrain.overground.rounded_corner.bottom_left','map.terrain.overground.dirt_fill.variant_5'])assert(manual.has(id));
assert(manual.size>auto.size);
console.log('terrain brush and explicit family inventory contracts passed');
const editorSource=fs.readFileSync('editor/editor.html','utf8');
assert(editorSource.includes("const semantic=cart&&activeSemanticTerrain();if(stampMode&&semantic)"));
assert(editorSource.includes("const semantic=activeSemanticTerrain();if(semantic){terrainStrokeMode=false"));
assert(!editorSource.includes("if(activeSemanticTerrain()){terrainStrokeMode=true"));
console.log('terrain palette mode contract passed');
