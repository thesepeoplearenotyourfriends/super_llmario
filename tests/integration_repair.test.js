'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('../construction/catalog.js');
const engine=fs.readFileSync('engine/engine.html','utf8'),editor=fs.readFileSync('editor/editor.html','utf8');
function fn(source,name){const start=source.indexOf('function '+name+'(');assert(start>=0,'missing '+name);let paren=source.indexOf('(',start),pd=0,brace=-1;for(let i=paren;i<source.length;i++){if(source[i]==='(')pd++;else if(source[i]===')'&&!--pd){brace=source.indexOf('{',i);break}}let depth=0,quote='',escape=false;for(let i=brace;i<source.length;i++){const ch=source[i];if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch===quote)quote='';continue}if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue}if(ch==='{')depth++;else if(ch==='}'&&!--depth)return source.slice(start,i+1)}throw Error('unterminated '+name)}
function context(seed={}){const c=vm.createContext(Object.assign({console,Math,JSON},seed));return c}
function load(c,source,names){vm.runInContext(names.map(n=>fn(source,n)).join('\n'),c)}
const theme=JSON.parse(fs.readFileSync('themes/theme_marioai_nonempty.llmtheme.txt','utf8'));
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/raw_bush.llmmap.txt','utf8'));

// Cartbench's real save/reload functions retain an ordinary explicit canonical sprite.
let c=context({themePack:theme,fileName:'fixture',mapFileName:'fixture',plain:o=>!!o&&typeof o==='object'&&!Array.isArray(o),cleanExportBaseName:s=>String(s).replace(/[^a-z0-9_-]+/ig,'_')});
load(c,editor,['themeIdFromSource','buildThinMapFromCart','cartFromThemeAndMap']);
c.cartFromThemeAndMap=vm.runInContext('cartFromThemeAndMap',c);c.buildThinMapFromCart=vm.runInContext('buildThinMapFromCart',c);
const loaded=c.cartFromThemeAndMap(theme,fixture),saved=c.buildThinMapFromCart(loaded);
assert.equal(saved.resourceScenery.sprites[0].image,'map.bush.left');assert.equal(c.cartFromThemeAndMap(theme,saved).resourceScenery.sprites[0].image,'map.bush.left');assert(theme.assets.images['map.bush.left'].startsWith('data:image/png;base64,'));

// The engine's real split builder and image loader populate the cache from the real theme payload.
const drawCalls=[];class ImageStub{constructor(){this.width=this.naturalWidth=16;this.height=this.naturalHeight=16}set src(v){this._src=v}get src(){return this._src}}
c=context({DEMO_CART:{recipes:{}},LEVEL_FUNDAMENTALS:{},PENDING_MAP_LABEL:'fixture',isThemeDoc:x=>x.format==='llmario-theme-pack-v1',isMapDoc:x=>x.format==='llmario-map-v1',mapThemeIdOf:x=>x.theme,themeIdOf:x=>x.id,cloneData:x=>JSON.parse(JSON.stringify(x)),mergeCartValue:(a,b)=>Object.assign({},a,b),normalizeMapMessages:m=>m.messages||{},convertTruthSlopePlatformsToSprites:x=>x,isPlainObject:x=>!!x&&typeof x==='object'&&!Array.isArray(x),finiteNumber:Number.isFinite,CART_IMAGE_CACHE:{},CART_IMAGE_TOKEN:0,Image:ImageStub,measureOpaqueBounds:()=>null,rebuildThemedFamilyBounds:()=>{},requestAnimationFrame:f=>f(),draw:()=>{},ACTIVE_CART:{assetCatalog:theme.assetCatalog,collisionTruth:theme.collisionTruth,placeables:{}},W:640,worldX:x=>x,ctx:{globalAlpha:1,imageSmoothingEnabled:true,drawImage:(...x)=>drawCalls.push(x)},themeTruthForImage:id=>theme.assetCatalog[id]||{},LLMarioConstruction:C,drawDefaultLadderFrame:()=>{throw Error('fallback')},spriteLooksClimbable:()=>false});
load(c,engine,['buildCartFromThemeAndMap','loadCartImageAssets','cartImage','cartImageRecord','imageSpriteFrame','drawImageSprite']);
const built=vm.runInContext('buildCartFromThemeAndMap',c)(theme,fixture);c.ACTIVE_CART=built;vm.runInContext('loadCartImageAssets',c)(built);const bushRecord=vm.runInContext('cartImageRecord',c)('map.bush.left');assert.equal(bushRecord.ready,false);assert.equal(bushRecord.img.src,theme.assets.images['map.bush.left']);assert.equal(vm.runInContext('imageSpriteFrame',c)(built.resourceScenery.sprites[0]).img,null);bushRecord.img.onload();assert.equal(bushRecord.ready,true);const frame=vm.runInContext('imageSpriteFrame',c)(built.resourceScenery.sprites[0]);assert.equal(frame.id,'map.bush.left');vm.runInContext('drawImageSprite',c)(built.resourceScenery.sprites[0]);assert.equal(drawCalls.length,1);

// Semantic metadata controls normal palette exposure; actor/particle frames are not decor stamps.
c=context({themePack:theme,cart:{assetCatalog:theme.assetCatalog}});load(c,editor,['semanticAssetCategory','mapTilePaletteCategory','paletteCategoryForAsset','primaryPaletteAsset']);
for(const category of ['playerArt','enemyArt','particleArt']){const id=Object.keys(theme.assetCatalog).find(k=>theme.assetCatalog[k].category===category);assert(id);assert.equal(vm.runInContext('primaryPaletteAsset',c)(id),false);assert.notEqual(vm.runInContext('paletteCategoryForAsset',c)(id),'decor')}assert.equal(vm.runInContext('paletteCategoryForAsset',c)('map.bush.left'),'decor');assert.equal(vm.runInContext('paletteCategoryForAsset',c)('map.terrain.overground.grass_top.left'),'terrain');assert.equal(vm.runInContext('paletteCategoryForAsset',c)('map.block.breakable'),'blocks');

// Constructions place, resize, save and reload as explicit canonical pieces.
for(const [id,a,b,expected] of [['bush.span',{w:3},{w:5},['map.bush.left','map.bush.middle','map.bush.middle','map.bush.middle','map.bush.right']],['mushroom.platform',{w:3,h:2},{w:5,h:4},null]]){const family=theme.constructionCatalog.families[id];assert(family);assert(C.construct(family,a).length<C.construct(family,b).length);const pieces=C.construct(family,b).map(p=>({...p,image:p.asset}));const reload=JSON.parse(JSON.stringify({resourceScenery:{sprites:pieces}}));assert.deepEqual(reload.resourceScenery.sprites.map(p=>p.image),pieces.map(p=>p.image));if(expected)assert.deepEqual(pieces.map(p=>p.image),expected);else{assert.equal(pieces.filter(p=>p.image==='map.mushroom_platform.cap.middle').length,3);assert.equal(pieces.filter(p=>p.image.includes('.stem.')).length,15)}}

// Reference pipes carry both gameplay bindings and resolved canonical WYSIWYG pieces.
const reference=JSON.parse(fs.readFileSync('maps/map_marioai_reference.llmmap.txt','utf8'));assert.equal(reference.theme,theme.id);for(const pipe of reference.resourceScenery.pipes){assert(pipe.target||pipe.noTravel);assert(pipe.resolvedVisuals);const pieces=reference.resourceScenery.sprites.filter(s=>s.constructionGroup===pipe.constructionGroup),x0=Math.min(...pieces.map(p=>p.x)),y0=Math.min(...pieces.map(p=>p.y)),x1=Math.max(...pieces.map(p=>p.x+p.w)),y1=Math.max(...pieces.map(p=>p.y+p.h));assert.deepEqual({x:pipe.x,y:pipe.y-pipe.h,w:58*pipe.scale,h:pipe.h},{x:x0,y:y0,w:x1-x0,h:y1-y0});for(const id of ['map.pipe.vertical.mouth.left','map.pipe.vertical.mouth.right','map.pipe.vertical.body.left','map.pipe.vertical.body.right'])assert(pieces.some(p=>p.image===id))}
assert.deepEqual(reference.resourceScenery.pipes.map(p=>({w:58*p.scale,h:p.h})),[{w:58,h:58},{w:58,h:86},{w:58,h:86}]);

for(const h of [58,86]){const pieces=C.pipeLayout(theme.constructionCatalog.families['pipe.vertical'],h,1),x1=Math.max(...pieces.map(p=>p.x+p.w)),y1=Math.max(...pieces.map(p=>p.y+p.h));assert.deepEqual({w:x1,h:y1},{w:58,h});assert.equal(pieces.at(-1).h,h===58?13:9)}

// Cartbench's generic construction-size Apply/save path retains an exact pipe gameplay height.
const edited=JSON.parse(JSON.stringify(reference)),editedPipe=edited.resourceScenery.pipes[0],editedGroup=editedPipe.constructionGroup;let editorObjects=edited.resourceScenery.sprites.map(obj=>({obj})).concat(edited.resourceScenery.pipes.map(obj=>({obj})));c=context({cart:edited,themePack:theme,objects:editorObjects,selection:editorObjects.filter(it=>it.obj.constructionGroup===editedGroup),LLMarioConstruction:C,num:(v,d)=>Number.isFinite(Number(v))?Number(v):d,objectRect:it=>it.obj,ensureArray:path=>path.reduce((at,key)=>(at[key]||(at[key]=[])),edited),byId:id=>({constructionW:{value:2},constructionH:{value:4}}[id]),rebuild:()=>{},setSelection:()=>{},saveUndo:()=>{},setStatus:()=>{}});load(c,editor,['selectedConstructionGroup','constructionEntryForGroup','groupOrigin','updateConstructionBinding','regenerateConstruction','applyConstructionSize']);vm.runInContext('applyConstructionSize',c)();const savedEdited=JSON.parse(JSON.stringify(edited)),savedPipe=savedEdited.resourceScenery.pipes.find(p=>p.constructionGroup===editedGroup),savedPieces=savedEdited.resourceScenery.sprites.filter(p=>p.constructionGroup===editedGroup);assert.equal(savedPipe.h,58);assert.equal(savedPipe.length,58);assert.equal(savedPipe.y-savedPipe.h,Math.min(...savedPieces.map(p=>p.y)));assert.equal(Math.max(...savedPieces.map(p=>p.y+p.h))-Math.min(...savedPieces.map(p=>p.y)),58);

// Used question art and active/bustable brick art use canonical theme IDs.
const themed=[];c=context({floatingBlocks:[{x:0,y:0,w:16,h:16,boxKind:'question',used:true},{x:20,y:0,w:16,h:16,boxKind:'brick',bustable:true}],tick:0,semanticAsset:id=>theme.assets.images[id]?id:null,animationAsset:(g)=>g==='block.question.visual'?'map.block.question.visual.frame_0':null,drawThemedAsset:id=>{themed.push(id);return true},currentBlockY:b=>b.y,drawRecipe:()=>{throw Error('fallback')}});load(c,engine,['drawFloatingBlocks']);vm.runInContext('drawFloatingBlocks',c)();assert.deepEqual(themed,['map.block.hidden.revealed','map.block.breakable']);
c=context({player:{big:true},ACTIVE_CART:{recipes:{}},blockBursts:[],shake:0,boolLike:undefined,pathGet:()=>null,blockRecipePath:()=>'',currentBlockY:b=>b.y,playSfx:()=>{}});load(c,engine,['boolLike','blockIsBustable','blockBustRequiresBig','canBustBlock','blockBurstPalette','spawnBlockBurst','bustBlock']);const brick={x:0,y:0,w:42,h:42,bustable:true,requiresBig:true};assert(vm.runInContext('canBustBlock',c)(brick));assert(vm.runInContext('bustBlock',c)(brick));assert(brick.busted);

// Attachment handedness follows the canonical source wing: left plain, right mirrored.
const wingDraws=[];c=context({tick:0,animationAsset:()=> 'enemy.wing.flap.frame_0',drawThemedAsset:(id,box,opts)=>wingDraws.push({id,box,opts})});load(c,engine,['drawEnemyAttachments']);vm.runInContext('drawEnemyAttachments',c)({alive:true,winged:true,state:'walking',x:40,y:60,w:34});assert.equal(wingDraws[0].opts,undefined);assert.equal(wingDraws[1].opts.mirror,true);

// Swept relative-motion classification handles stationary, rising, and falling enemies.
c=context({player:{y:60,h:48},finiteNumber:Number.isFinite});load(c,engine,['isStompContact']);const stompContact=vm.runInContext('isStompContact',c),koopa={y:100};assert(stompContact(koopa,50,100));c.player.y=56;koopa.y=94;assert(stompContact(koopa,50,100));c.player.y=60;koopa.y=106;assert(stompContact(koopa,50,100));c.player.y=84;koopa.y=100;assert.equal(stompContact(koopa,80,100),false);c.player.y=116;assert.equal(stompContact(koopa,120,100),false);

// Stomps flatten; shell and fireball hits enter the shared upward knockout fall mode.
c=context({player:{vy:0,coins:0},shake:0,enemies:[],projectiles:[],powerups:[],WORLD_W:1000,spikedEnemy:()=>false,flowerEnemy:()=>false,shellCapableEnemy:()=>false,hurtPlayer:()=>{},playSfx:()=>{},enterKoopaShell:()=>{},aabb:(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y,hitSolids:()=>[],powerupSlopeSupport:()=>false,worldDeathY:()=>100,allSlopeSurfaces:()=>[],finiteNumber:Number.isFinite,tick:0,flowerHostPipe:()=>null,playerOccupiesPipeMouth:()=>false,updateShellVertical:()=>{}});load(c,engine,['stompEnemy','knockOutEnemy','resolveMovingShellHits','updateProjectiles','updateEnemyMotion']);let stomp={alive:true,state:'walking',x:0,y:0,w:16,h:16};vm.runInContext('stompEnemy',c)(stomp);assert.equal(stomp.flat,18);assert.equal(stomp.alive,false);let hurt=0;c.hurtPlayer=()=>hurt++;c.spikedEnemy=e=>e.kind==='spiky';c.flowerEnemy=e=>e.kind==='flower';c.shellCapableEnemy=e=>e.kind==='green_koopa';let winged={kind:'green_koopa',alive:true,state:'walking',winged:true,x:0,y:0,w:16,h:16};vm.runInContext('stompEnemy',c)(winged);assert.equal(winged.winged,false);assert.equal(winged.alive,true);assert.equal(hurt,0);vm.runInContext('stompEnemy',c)({kind:'spiky'});vm.runInContext('stompEnemy',c)({kind:'flower'});assert.equal(hurt,2);c.spikedEnemy=()=>false;c.flowerEnemy=()=>false;c.shellCapableEnemy=()=>false;
let shell={alive:true,state:'shellMoving',x:0,y:0,w:16,h:16,shellVx:4},shellTarget={alive:true,state:'walking',x:8,y:0,w:16,h:16};c.enemies=[shell,shellTarget];vm.runInContext('resolveMovingShellHits',c)();assert.equal(shellTarget.state,'knockedOut');assert(shellTarget.knockVy<0);const shellY=shellTarget.y;vm.runInContext('updateEnemyMotion',c)(shellTarget);assert(shellTarget.y<shellY);
let fireTarget={alive:true,state:'walking',x:8,y:0,w:16,h:16};c.enemies=[fireTarget];c.projectiles=[{alive:true,life:20,x:0,y:0,w:16,h:16,vx:4,vy:0,bounces:0}];vm.runInContext('updateProjectiles',c)();assert.equal(fireTarget.state,'knockedOut');assert(fireTarget.knockVy<0);assert.equal(fireTarget.flat,0);fireTarget.y=99;fireTarget.knockVy=4;vm.runInContext('updateEnemyMotion',c)(fireTarget);assert.equal(fireTarget.alive,false);

// A wing-removing stomp separates the bodies before the following motion update.
c.player={x:0,y:-8,w:16,h:16,vy:8,onGround:false,coins:0};c.spikedEnemy=()=>false;c.flowerEnemy=()=>false;c.shellCapableEnemy=e=>e.kind==='green_koopa';winged={kind:'green_koopa',alive:true,state:'walking',winged:true,x:0,y:0,w:16,h:16};vm.runInContext('stompEnemy',c)(winged);assert.equal(c.player.y,winged.y-c.player.h);assert(c.player.vy<0);c.player.y+=c.player.vy;assert.equal(c.aabb(c.player,winged),false);assert.equal(winged.alive,true);assert.equal(c.player.big,undefined);assert.equal(c.player.deadTimer,undefined);

// Unlayered visual-only scenery is back-layer content; explicit and legacy layers retain their behavior.
c=context({});load(c,engine,['sceneryLayerForSprite']);const sceneryLayer=vm.runInContext('sceneryLayerForSprite',c);assert.equal(sceneryLayer({visualOnly:true,image:'hill'}),'back');assert.equal(sceneryLayer({visualOnly:true,image:'bush',layer:'foreground'}),'foreground');assert.equal(sceneryLayer({image:'legacy-actor-sprite'}),'front');

// Holding a shell does not animate a stationary big Mario's legs.
c=context({player:{form:'normal',big:true,carryEnemy:{},onGround:true,vx:0,face:1,pSpeed:false},input:{down:false,run:false},tick:14,themeImageIds:()=>['mario.player-motion.idle_walk_0','mario.player-motion.carry_0','mario.player-motion.carry_1'],cartImageRecord:()=>({})});load(c,engine,['playerMotionAsset']);assert.equal(vm.runInContext('playerMotionAsset',c)(),'mario.player-motion.carry_0');

// Terrain painting emits visually named canonical pieces for mapped topologies.
const terrain=theme.constructionCatalog.families['terrain.overground'],state={sprites:[],collisions:[]};C.applyTerrainEdit(state,terrain,new Set(['0,0','1,0','2,0']),true);assert(state.sprites.every(s=>s.image.startsWith('map.terrain.overground.')));assert(state.sprites.every(s=>!s.semanticFallback));
console.log('integration repair tests passed');

// Explicit semantic prefixes outrank generic collision truth in palette categories.
const mappedBlock='map.block.hidden.revealed';assert(theme.collisionTruth.assets[mappedBlock]);
c=context({themePack:theme,cart:{assetCatalog:theme.assetCatalog},images:{},terrainMapForAsset:id=>theme.collisionTruth.assets[id],paletteBadgeForMap:()=> 'RECT',plain:o=>!!o&&typeof o==='object'&&!Array.isArray(o)});
load(c,editor,['semanticAssetCategory','mapTilePaletteCategory','paletteCategoryForAsset','shortNameForValue','paletteMeta']);
assert.equal(vm.runInContext('paletteMeta',c)('terrainAsset:'+mappedBlock,mappedBlock).cat,'blocks');

// Every explicit manual-family asset has one family card and no generic duplicate.
c=context({themePack:theme,cart:{assets:theme.assets,assetCatalog:theme.assetCatalog,recipes:{platforms:{},blocks:{}}},plain:o=>!!o&&typeof o==='object'&&!Array.isArray(o),animationGroupsForTheme:()=>({}),isSupportedWalkerAnimation:()=>false,platformTemplateMap:()=>new Map(),terrainMapForAsset:id=>theme.collisionTruth.assets[id]||null});
load(c,editor,['semanticAssetCategory','mapTilePaletteCategory','paletteCategoryForAsset','primaryPaletteAsset','recipeImageKeys','insertOptionEntries']);
const paletteEntries=vm.runInContext('insertOptionEntries',c)(),manualAssets=theme.constructionCatalog.families['terrain.overground'].manualAssets;
assert.equal(manualAssets.length,19);
for(const asset of manualAssets){const matches=paletteEntries.filter(e=>e.value.endsWith(':'+asset)||e.value==='asset:'+asset);assert.equal(matches.length,1,asset);assert.equal(matches[0].value,'terrainFamilyAsset:terrain.overground:'+asset)}

// Input precedence and transient tool cleanup remain explicit editor contracts.
assert(editor.includes("if(e.button===0&&spacePanHeld){drag={mode:'pan'"));
assert(editor.indexOf("if(e.button===0&&spacePanHeld)")<editor.indexOf("const semantic=cart&&activeSemanticTerrain()"));
assert(editor.includes("if(terrainStrokeMode&&!isOrdinaryPlatformBrush())"));
assert(editor.includes("else{clearTerrainErase();"));
console.log('palette categorization, deduplication, and input cleanup tests passed');

// Palette drops run the same transition used by clicks/select changes before placement.
const dropHandler=editor.slice(editor.indexOf("wrap.addEventListener('drop'"),editor.indexOf("function openHelp"));
assert(dropHandler.indexOf('paletteSelectionChanged()')>=0);
assert(dropHandler.indexOf('paletteSelectionChanged()')<dropHandler.indexOf('insertObject(pointerWorld(e))'));
assert(!dropHandler.includes('updateActiveBrush();populatePalette();insertObject'));
c=context({themePack:theme,els:{insertKind:{value:'construction:terrain.overground'},terrainStroke:{classList:{remove(){c.nativeCleared=true}}}},terrainStrokeMode:true,terrainEraseMode:false,paletteWasSemantic:false,stampMode:false,updateActiveBrush:()=>{},populatePalette:()=>{},updateTopStatus:()=>{},clearTerrainErase:undefined,byId:()=>({classList:{remove(){}}}),setStampMode:()=>{}});
load(c,editor,['activeSemanticTerrain','isOrdinaryPlatformBrush','clearTerrainErase','paletteSelectionChanged']);
vm.runInContext('paletteSelectionChanged',c)();assert.equal(c.terrainStrokeMode,false);assert.equal(c.nativeCleared,true);assert.equal(c.paletteWasSemantic,true);
c.terrainEraseMode=true;c.els.insertKind.value='coin';vm.runInContext('paletteSelectionChanged',c)();assert.equal(c.terrainEraseMode,false);assert.equal(c.paletteWasSemantic,false);
console.log('palette drop transition tests passed');
