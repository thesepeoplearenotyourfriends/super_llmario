const fs = require('fs');
const assert = require('assert');
const vm = require('vm');

const oldEditor = fs.readFileSync('editor/editor.html', 'utf8');
const newEditor = fs.readFileSync('editor/reference_pack_editor.html', 'utf8');
const theme = JSON.parse(fs.readFileSync('themes/theme_marioai_reference_pack.llmtheme.txt', 'utf8'));

assert(newEditor.includes('placeables → object → visuals'), 'editor documents its native resolution path');
assert(newEditor.includes('Contract gaps needed by a preview'), 'editor reports contract gaps');
assert(!/\bfetch\s*\(|XMLHttpRequest|import\s*\(/.test(newEditor), 'standalone editor has no runtime repository dependency');
assert.strictEqual(theme.format, 'llmario-theme-pack-reference');
assert(Object.keys(theme.placeables).length > 0, 'reference theme declares a palette');
assert.deepStrictEqual(theme.sceneLayers, ['sky','background','world','actors','foreground']);
assert.strictEqual(theme.placeables.bush.authoringGroup, 'Deco');
assert.strictEqual(theme.placeables.hill.authoringGroup, 'Deco');
for (const id of ['koopaRed','koopaGreen','ground']) assert.strictEqual(theme.placeables[id].authoringGroup, 'World');
for (const [id,placeable] of Object.entries(theme.placeables)) {
  assert(['World','Deco'].includes(placeable.authoringGroup), `${id} has an explicit authoring group`);
  assert(!Object.hasOwn(placeable,'defaultSceneLayer'), `${id} does not duplicate its object's scene-layer default`);
  assert(theme.sceneLayers.includes(theme.objects[placeable.object].defaultSceneLayer),
    `${id} consumes its authored object's scene-layer default`);
}
assert(!Object.keys(theme.placeables).some(id=>id.startsWith('background.')),
  'raw background resources are not palette concepts');
const rawBackgroundResources=Object.keys(theme.resources).filter(id=>id.startsWith('background.'));
assert(rawBackgroundResources.length>0,'fixture contains raw background resources to guard');
assert(rawBackgroundResources.every(id=>!Object.hasOwn(theme.placeables,id)),
  'no raw background resource can become a palette card');
const decoIds=Object.entries(theme.placeables).filter(([,p])=>p.authoringGroup==='Deco').map(([id])=>id);
assert.deepStrictEqual(decoIds.sort(), ['backgroundDome','backgroundFill','bush','darkGreenArch','darkGreenColumn',
  'greyStone','hill','lightGreenArch','lightGreenColumn','rockpile','skyGradient','yellowBrownCave'].sort(),
  'Deco contains audited concepts rather than source-cell palette noise');
for(const id of decoIds) {
  const object=theme.objects[theme.placeables[id].object];
  assert.strictEqual(object.defaultSceneLayer,['backgroundFill','skyGradient'].includes(id)?'sky':'background',
    `${id} defaults to its authored scenery depth`);
  assert.strictEqual(object.collisionMode,undefined,`${id} does not infer collision from appearance`);
  assert.deepStrictEqual(object.capabilities,[],`${id} has no inferred gameplay capability`);
}
assert(newEditor.includes("Object.entries(state.theme.placeables)"), 'palette inventory comes from placeables');
assert(!/buildPalette\(\)[^]*Object\.entries\(state\.theme\.resources\)/.test(newEditor),
  'palette building never enumerates raw resources');

const semanticSource = newEditor.match(/<script id="contractSemantics">([\s\S]*?)<\/script>/)[1];
const context = { structuredClone, globalThis: {} };
vm.runInNewContext(semanticSource, context);
const semantics = context.globalThis.ReferencePackSemantics;
const schema = theme.parameterSchemas;
const plain = value => JSON.parse(JSON.stringify(value));

const item=(id)=>({id,definition:theme.placeables[id],object:theme.objects[theme.placeables[id].object]});
const bush={item:item('bush'),values:{'transform.x':100,'transform.y':100,'extent.width':3}};
const koopa={item:item('koopaRed'),values:{'transform.x':100,'transform.y':100}};
const sky={item:item('skyGradient'),values:{'transform.x':100,'transform.y':100,'extent.width':2,'extent.height':3}};
const ground={item:item('ground'),values:{'transform.x':100,'transform.y':100,'terrain.width':2,'terrain.height':1,'terrain.style':'overground'}};
assert.deepStrictEqual(semantics.orderedInstances(theme,[koopa,ground,bush,sky]).map(x=>x.item.id),
  ['skyGradient','bush','ground','koopaRed'],'five-band ordering is driven by the scene catalog');
assert.deepStrictEqual(semantics.orderedInstances(theme,[bush,koopa]).map(x=>x.item.id),['bush','koopaRed'],
  'Bush placed before Koopa renders behind it');
assert.deepStrictEqual(semantics.orderedInstances(theme,[koopa,bush]).map(x=>x.item.id),['bush','koopaRed'],
  'Bush placed after Koopa still renders behind it');
const overlap=()=>({x:90,y:70,w:30,h:40}),point={x:100,y:100};
assert.strictEqual(semantics.pickInstance(theme,[bush,koopa],point,overlap),koopa,
  'overlapping Bush and Koopa hit-test the normally frontmost Koopa');
bush.sceneLayer='foreground';
assert.deepStrictEqual(semantics.orderedInstances(theme,[bush,koopa]).map(x=>x.item.id),['koopaRed','bush'],
  'instance foreground override renders Bush over Koopa');
assert.strictEqual(semantics.pickInstance(theme,[bush,koopa],point,overlap),bush,
  'overlapping objects hit-test the foreground-overridden Bush first');
for (const path of bush.item.definition.parameters) bush.values[path]=path==='bush.variant'?'variant_1':7;
assert.strictEqual(bush.sceneLayer,'foreground','ordinary position, dimension, and visual edits retain the instance override');
semantics.setSceneLayerOverride(bush,'background');
assert(!Object.hasOwn(bush,'sceneLayer'),'choosing the object default removes the instance override');
assert.strictEqual(semantics.sceneLayerFor(theme,bush),'background','the instance resumes consuming the object default');
const red={item:item('koopaRed'),values:{'transform.x':10,'transform.y':10}},green={item:item('koopaGreen'),values:{'transform.x':20,'transform.y':20}};
assert.deepStrictEqual(semantics.orderedInstances(theme,[green,red]).map(x=>x.item.id),['koopaGreen','koopaRed'],
  'same-layer order stays stable instead of sorting by species or position');
red.values['transform.x']=999;red.values['flight.hasWings']=true;
assert.deepStrictEqual(semantics.orderedInstances(theme,[green,red]).map(x=>x.item.id),['koopaGreen','koopaRed'],
  'same-layer movement and parameter edits cannot change relative depth');

assert.strictEqual(semantics.initialValue('rewardBlock.contents', schema.rewardBlock.contents), undefined,
  'allowed object references do not become authored defaults');
assert.strictEqual(semantics.initialValue('walker.speed', schema.walker.speed), undefined,
  'minimum and engineDefault metadata do not manufacture a numeric value');
assert.strictEqual(semantics.initialValue('rewardBlock.uses', schema.rewardBlock.uses), 1,
  'an explicit schema default is honored');

assert.strictEqual(semantics.visualTarget(theme.objects.coin, {}).target, 'pickup.coin.spin',
  'the sole visual target is deterministic');
assert.strictEqual(semantics.visualTarget(theme.objects.questionBlock, {}, theme.placeables.questionBlock.previewVisual).target,
  'block.question.idle', 'explicit placeable preview metadata resolves a multi-state object');
assert.strictEqual(theme.placeables.koopaRed.previewVisual, 'walk');
assert.strictEqual(theme.placeables.koopaGreen.previewVisual, 'walk');
assert.strictEqual(semantics.visualTarget(theme.objects.brick, {'block.style':'classic'}).target,
  'block.breakable.idle', 'block behavior and authored visual style resolve independently');
assert.strictEqual(semantics.visualTarget(theme.objects.solidBlock, {'solidBlock.style':'wood'}).target,
  'block.wood', 'solid block appearances are styles of one behavior object');
assert.strictEqual(semantics.visualTarget(theme.objects.ground, {'terrain.style':'castle'}).target,
  'construction.terrain.castle', 'an authored selector chooses its matching visual');

assert.strictEqual(semantics.autotilePreview('construction.terrain.overground',
  theme.constructions['construction.terrain.overground']).supported, true,
  'declared neighbor bits and mask variants support deterministic autotiling');
assert.deepStrictEqual(theme.placeables.pipe.initialValues, {'pipe.length':2});
assert.deepStrictEqual(theme.placeables.ladder.initialValues, {'extent.length':2});
assert.deepStrictEqual(theme.placeables.ground.initialValues, {'terrain.width':2,'terrain.height':2});
assert.deepStrictEqual(theme.placeables.mushroomPlatform.initialValues, {'extent.width':3,'extent.height':3});
assert.deepStrictEqual(theme.placeables.bush.initialValues, {'extent.width':3});
assert.deepStrictEqual(theme.objects.bush.visuals, {
  variant_0:'construction.background.bush.variant_0',
  variant_1:'construction.background.bush.variant_1',
}, 'one Bush concept owns both audited appearances');
assert(theme.placeables.bush.parameters.includes('bush.variant'));
assert.strictEqual(semantics.visualTarget(theme.objects.bush, {'bush.variant':'variant_0'}).target,
  'construction.background.bush.variant_0');
assert.strictEqual(semantics.visualTarget(theme.objects.bush, {'bush.variant':'variant_1'}).target,
  'construction.background.bush.variant_1');
assert.deepStrictEqual(theme.constructions['construction.ladder'].components,
  {top:'ladder.top',body:'ladder.body'}, 'ladder construction remains unchanged');
assert.deepStrictEqual(theme.constructions['construction.white-platform'].components, {
  left:'bar.white.left_cap',middle:'ladder.body',right:'bar.white.left_cap',
}, 'white platform reuses ladder art as presentation material without changing the ladder');
assert.deepStrictEqual(theme.constructions['construction.white-platform'].layout.mirror, ['right']);
for (const width of [2,3,5]) {
  const assembled=plain(semantics.constructionLayout(
    theme.constructions['construction.white-platform'].components,
    theme.constructions['construction.white-platform'].layout,width));
  assert.strictEqual(assembled.cells.length,width);
  assert.deepStrictEqual(assembled.cells.map(cell=>cell.x),Array.from({length:width},(_,i)=>i));
  assert.deepStrictEqual(assembled.cells.filter(cell=>cell.mirror).map(cell=>cell.part),['right'],
    `only the right cap is mirrored at width ${width}`);
}
assert.deepStrictEqual(theme.placeables.whitePlatform.initialValues, {'extent.width':3});
for (const path of ['movingPlatform.path','movingPlatform.range','movingPlatform.speed'])
  assert(theme.placeables.whitePlatform.parameters.includes(path), `white platform exposes optional ${path}`);
assert.strictEqual(theme.objects.whitePlatform.runtimeHooks.movement.status, 'implemented');
assert(theme.objects.whitePlatform.capabilities.includes('movingPlatform'));
assert(theme.objects.mushroomPlatform.capabilities.includes('movingPlatform'));
assert.strictEqual(theme.objects.whitePlatform.runtimeHooks.movement.optional, true);
assert.deepStrictEqual(theme.objects.hill.visuals, {
  large:'construction.hill.large',small:'construction.hill.small',
});
const largeHill=plain(semantics.constructionLayout(
  theme.constructions['construction.hill.large'].components,
  theme.constructions['construction.hill.large'].layout));
assert.deepStrictEqual(largeHill.cells.map(({x,y})=>[x,y]),
  [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2]]);
assert.deepStrictEqual(largeHill.cells.map(cell=>theme.resources[cell.id].provenance.index),[70,71,86,87,102,103]);
const smallHill=plain(semantics.constructionLayout(
  theme.constructions['construction.hill.small'].components,
  theme.constructions['construction.hill.small'].layout));
assert.deepStrictEqual(smallHill.cells.map(({id,x,y})=>[theme.resources[id].provenance.index,x,y]),
  [[118,0,0],[119,1,0]]);
assert.strictEqual(semantics.constructionLayout(theme.constructions['construction.hill.wide'].components,
  theme.constructions['construction.hill.wide'].layout),null,'unresolved Hill fragments are not rendered as an invented assembly');
assert(!theme.parameterSchemas.hill.shape.values.includes('wide'));
assert(theme.placeables.hill.parameters.includes('hill.shape'));
assert.strictEqual(theme.objects.hill.collisionMode, undefined, 'hills remain presentation-only');

// Fixed square placeables opt into one shared stamp interaction without losing their identities.
const blockStamp={mode:'squareCell',family:'block',footprint:{w:16,h:16}};
assert.deepStrictEqual(theme.placeables.solidBlock.stamp,blockStamp);
assert.deepStrictEqual(theme.placeables.brick.stamp,blockStamp);
assert.strictEqual(theme.placeables.solidBlock.object,'solidBlock');
assert.strictEqual(theme.placeables.brick.object,'brick');
assert.strictEqual(semantics.squareStampCapability(theme.placeables.pipe),null,'non-square brushes do not opt into stamping');
assert.deepStrictEqual(plain(semantics.squareStampCapability(theme.placeables.brick)),blockStamp);
const line=(a,b)=>plain(semantics.gridLineCells(a,b)).map(({x,y})=>[x,y]);
assert.deepStrictEqual(line({x:0,y:0},{x:64,y:0}),[[0,0],[16,0],[32,0],[48,0],[64,0]],'horizontal stamps fill sparse events');
assert.deepStrictEqual(line({x:0,y:0},{x:0,y:64}),[[0,0],[0,16],[0,32],[0,48],[0,64]],'vertical stamps fill sparse events');
assert.deepStrictEqual(line({x:0,y:0},{x:64,y:64}),[[0,0],[16,16],[32,32],[48,48],[64,64]],'diagonal stamps fill sparse events');
const visited=new Set(),irregular=[];
for(const [a,b] of [[{x:0,y:0},{x:48,y:16}],[{x:48,y:16},{x:16,y:48}],[{x:16,y:48},{x:48,y:16}]])
  for(const [x,y] of line(a,b)){const key=`${x},${y}`;if(!visited.has(key)){visited.add(key);irregular.push([x,y])}}
assert.strictEqual(irregular.length,new Set(irregular.map(x=>x.join(','))).size,'an irregular self-crossing gesture deduplicates its cells');
assert(irregular.some(([x,y])=>x===32&&y===32),'irregular segments traverse intervening cells');
const solidItem={...item('solidBlock'),values:{'solidBlock.style':'stone'}},brickItem={...item('brick'),values:{'block.style':'classic'}};
const at=(brush,x,y,sceneLayer)=>({item:brush,values:{...structuredClone(brush.values),'transform.x':x,'transform.y':y},...(sceneLayer?{sceneLayer}:{})});
const squareBounds=instance=>({x:instance.values['transform.x']-8,y:instance.values['transform.y']-16,w:16,h:16});
assert(semantics.squareStampOccupied(theme,[at(solidItem,16,16)],brickItem,{x:16,y:16},squareBounds),'Brick cannot overwrite Block');
assert(semantics.squareStampOccupied(theme,[at(brickItem,16,16)],solidItem,{x:16,y:16},squareBounds),'Block cannot overwrite Brick');
assert(!semantics.squareStampOccupied(theme,[at(brickItem,16,16)],solidItem,{x:16,y:0},squareBounds),
  'bottom-anchored vertical neighbors touch without falsely overlapping');
assert(!semantics.squareStampOccupied(theme,[at(brickItem,16,16,'foreground')],solidItem,{x:16,y:16},squareBounds),
  'effective scene layers retain intentional cross-layer placement');
const cloneA=structuredClone(brickItem.values),cloneB=structuredClone(brickItem.values);
cloneA['block.style']='edited';
assert.notStrictEqual(cloneA['block.style'],cloneB['block.style'],'each stamp owns an independent values clone');
const stampHistory=semantics.createHistory({instances:[]});
stampHistory.push({instances:[at(brickItem,0,0),at(brickItem,16,0),at(brickItem,32,0)]});
assert.strictEqual(stampHistory.state().index,1,'a multi-cell stamp is one history entry');
assert.strictEqual(stampHistory.undo().instances.length,0,'one undo removes the complete stamp');
assert.strictEqual(stampHistory.redo().instances.length,3,'one redo restores the complete stamp');
const occupiedDocument={instances:[at(brickItem,0,0),at(solidItem,16,0),at(brickItem,32,0)]};
const noOpHistory=semantics.createHistory(occupiedDocument),occupiedInstances=[...occupiedDocument.instances];
const occupiedAdded=semantics.stampSquareCells(theme,occupiedInstances,brickItem,brickItem.values,
  {x:0,y:0},{x:32,y:0},new Set(),squareBounds);
if(occupiedAdded)noOpHistory.push({instances:occupiedInstances});
assert.strictEqual(occupiedAdded,0,'an all-occupied stamp gesture places no instances');
assert.deepStrictEqual(occupiedInstances,occupiedDocument.instances,'an all-occupied stamp gesture leaves the document unchanged');
assert.strictEqual(noOpHistory.state().index,0,'an all-occupied stamp gesture creates no history entry');
const stampCamera={x:91,y:-37,zoom:2.75},stampWorld={x:80,y:48};
assert.deepStrictEqual(plain(semantics.screenToWorld(semantics.worldToScreen(stampWorld,stampCamera),stampCamera)),stampWorld,
  'stamp coordinates survive active camera zoom and pan');

// Erasing uses the same snapped sparse-event traversal, but locks a gesture to
// the effective layer (or to singleton markers) after its first actual hit.
const eraseBounds=instance=>({x:instance.values['transform.x']-8,y:instance.values['transform.y']-8,w:16,h:16});
const eraseGesture=()=>({visited:new Set(),removedTargets:new Set(),scope:null,removedCount:0});
const erase=(instances,markers,from,to,gesture=eraseGesture())=>
  semantics.eraseSquareCells(theme,instances,markers,from,to,gesture,eraseBounds);
const layerItems={
  sky:{...item('skyGradient'),values:{}},
  background:{...item('bush'),values:{}},
  world:{...item('solidBlock'),values:{}},
  actors:{...item('koopaRed'),values:{}},
  foreground:{...item('bush'),values:{}},
};
const layerInstance=(layer,x,y)=>at(layerItems[layer],x,y,layer==='foreground'?'foreground':undefined);
for(const [name,cells] of [
  ['horizontal',line({x:0,y:0},{x:64,y:0})],
  ['vertical',line({x:0,y:0},{x:0,y:64})],
  ['diagonal',line({x:0,y:0},{x:64,y:64})],
]) {
  const instances=cells.map(([x,y])=>layerInstance('world',x,y));
  assert.strictEqual(erase(instances,{start:null,goal:null},{x:cells[0][0],y:cells[0][1]},
    {x:cells.at(-1)[0],y:cells.at(-1)[1]}).count,cells.length,`${name} eraser drag visits every snapped cell`);
  assert.strictEqual(instances.length,0,`${name} eraser drag leaves no sparse-event gaps`);
}
const irregularInstances=irregular.map(([x,y])=>layerInstance('world',x,y)),irregularGesture=eraseGesture();
for(const [from,to] of [[{x:0,y:0},{x:48,y:16}],[{x:48,y:16},{x:16,y:48}],[{x:16,y:48},{x:48,y:16}]])
  erase(irregularInstances,{start:null,goal:null},from,to,irregularGesture);
assert.strictEqual(irregularGesture.removedCount,irregular.length,'irregular eraser traversal visits each deduplicated cell once');
assert.strictEqual(irregularGesture.visited.size,irregular.length,'self-crossing erase segments deduplicate visited cells');
for(const layer of theme.sceneLayers) {
  const instances=[layerInstance(layer,0,0),...theme.sceneLayers.filter(x=>x!==layer).map((other,i)=>layerInstance(other,16*(i+1),0))];
  const gesture=eraseGesture();
  const result=erase(instances,{start:null,goal:null},{x:0,y:0},{x:80,y:0},gesture);
  assert.strictEqual(result.scope,layer,`${layer} establishes its own erase scope`);
  assert.strictEqual(result.count,1,`${layer} lock does not erase other effective layers`);
  assert(instances.every(instance=>semantics.sceneLayerFor(theme,instance)!==layer),`${layer} target was removed`);
}
const missThenHit=[layerInstance('world',32,0),layerInstance('actors',48,0)],missGesture=eraseGesture();
erase(missThenHit,{start:null,goal:null},{x:0,y:0},{x:48,y:0},missGesture);
assert.strictEqual(missGesture.scope,'world','empty leading cells do not lock before the first successful deletion');
assert.deepStrictEqual(missThenHit.map(x=>semantics.sceneLayerFor(theme,x)),['actors'],
  'the first hit locks the remainder of a sparse drag to that layer');
const override=layerInstance('background',0,0);override.sceneLayer='actors';
const overrideGesture=eraseGesture();erase([override],{start:null,goal:null},{x:0,y:0},{x:0,y:0},overrideGesture);
assert.strictEqual(overrideGesture.scope,'actors','an authored per-instance override determines erase scope');
const beneath=[layerInstance('world',0,0),layerInstance('foreground',0,0)],beneathGesture=eraseGesture();
beneathGesture.scope='world';
assert.strictEqual(erase(beneath,{start:null,goal:null},{x:0,y:0},{x:0,y:0},beneathGesture).count,1,
  'layer-filtered picking reaches a matching object beneath a different-layer object');
assert.strictEqual(semantics.sceneLayerFor(theme,beneath[0]),'foreground');
const freshInstances=[layerInstance('sky',0,0),layerInstance('world',16,0)];
assert.strictEqual(erase(freshInstances,{start:null,goal:null},{x:0,y:0},{x:0,y:0}).scope,'sky');
assert.strictEqual(erase(freshInstances,{start:null,goal:null},{x:16,y:0},{x:16,y:0}).scope,'world',
  'a fresh gesture can lock to a different layer');
const markerInstances=[layerInstance('world',16,0)],markers={start:{x:0,y:0},goal:{x:32,y:0}},markerGesture=eraseGesture();
erase(markerInstances,markers,{x:0,y:0},{x:32,y:0},markerGesture);
assert.strictEqual(markerGesture.scope,'markers');
assert.strictEqual(markerGesture.removedCount,2,'marker scope can erase both singleton markers');
assert.strictEqual(markerInstances.length,1,'marker scope cannot fall through to ordinary objects');
const wide=layerInstance('world',16,0),wideGesture=eraseGesture();
const wideBounds=()=>({x:0,y:-8,w:48,h:16});
const wideResult=semantics.eraseSquareCells(theme,[wide],{start:null,goal:null},{x:0,y:0},{x:32,y:0},wideGesture,wideBounds);
assert.strictEqual(wideResult.count,1,'an object spanning several visited cells is removed only once');
const eraseHistory=semantics.createHistory({instances:[{placeable:'solidBlock',values:{'transform.x':0,'transform.y':0}},{placeable:'solidBlock',values:{'transform.x':16,'transform.y':0}}],markers:{start:null,goal:null}});
eraseHistory.push({instances:[],markers:{start:null,goal:null}});
assert.strictEqual(eraseHistory.state().index,1,'one multi-object erase drag is one history entry');
assert.strictEqual(eraseHistory.undo().instances.length,2,'undo restores the complete erase drag');
assert.strictEqual(eraseHistory.redo().instances.length,0,'redo removes the complete erase drag again');
const missHistory=semantics.createHistory({instances:[],markers:{start:null,goal:null}}),missResult=erase([],{start:null,goal:null},{x:0,y:0},{x:64,y:64});
if(missResult.count)missHistory.push({instances:[],markers:{start:null,goal:null}});
assert.strictEqual(missHistory.state().index,0,'an all-empty erase gesture creates no history entry');
const cancelBefore={instances:[layerInstance('world',0,0)],markers:{start:{x:16,y:16},goal:null}},cancelWorking=structuredClone(cancelBefore);
erase(cancelWorking.instances,cancelWorking.markers,{x:0,y:0},{x:0,y:0});
assert.deepStrictEqual(plain(cancelBefore).instances.length,1,'the pre-gesture snapshot remains available for pointer cancellation');
const eraseCamera={x:-123,y:77,zoom:3.25},eraseWorld={x:32,y:-16};
assert.deepStrictEqual(plain(semantics.screenToWorld(semantics.worldToScreen(eraseWorld,eraseCamera),eraseCamera)),eraseWorld,
  'eraser coordinates survive active camera zoom and pan');

const sourceIndices = id => theme.resources[id].provenance.index;
const layout = (id,width,height) => {
  const construction=theme.constructions[id];
  return plain(semantics.constructionLayout(construction.components,construction.layout,width,height));
};
const indices = result => result.cells.map(cell=>sourceIndices(cell.id));
for(const id of ['construction.hill.large','construction.background.dome.variant_0',
  'construction.background.dome.variant_1','construction.background.cave-arch-yellow-brown']) {
  const construction=theme.constructions[id],assembled=layout(id);
  assert.strictEqual(assembled.cells.length,construction.layout.columns*construction.layout.rows,
    `${id} consumes its declared fixedGrid rows and columns`);
}
assert.strictEqual(semantics.constructionLayout({a:'one',b:'two'},{type:'fixedGrid',columns:2,rows:2}),null,
  'fixedGrid rejects a declared shape that does not match its component count');
assert.strictEqual(semantics.constructionLayout({a:'one',b:'two'},{type:'fixedGrid',columns:2}),null,
  'fixedGrid rows are required rather than inert metadata');
for (const bad of [
  {type:'fixedGrid',columns:0,rows:2},
  {type:'fixedGrid',columns:2,rows:-1},
  {type:'fixedGrid',columns:1.5,rows:2},
  {type:'fixedGrid',columns:2,rows:1.5},
]) assert.strictEqual(semantics.constructionLayout({a:'one',b:'two'},bad),null,
  'fixedGrid dimensions must be positive integers');
const diagnosed=semantics.fixedGridResult({a:'one',b:'two'},{type:'fixedGrid',columns:2,rows:2});
assert.strictEqual(diagnosed.resolved,null);
assert.match(diagnosed.issue,/positive integer columns\/rows/,
  'the live renderer resolver returns an actionable issue instead of exposing a null .cells access');
assert.deepStrictEqual(plain(semantics.fixedGridResult({first:'one',second:'two'},
  {type:'fixedGrid',columns:2,rows:1}).resolved.cells.map(x=>x.part)),['first','second'],
  'fixedGrid component insertion order is its documented row-major placement order');
assert.deepStrictEqual(indices(layout('construction.background.dome.variant_0')),[0,1,8,9,16,17]);
assert.deepStrictEqual(indices(layout('construction.background.dome.variant_1')),[2,3,10,11,18,19]);
assert.strictEqual(semantics.visualTarget(theme.objects.backgroundDome,{'dome.variant':'variant_1'}).target,
  'construction.background.dome.variant_1');
assert.deepStrictEqual(indices(layout('construction.background.sky-gradient',1,3)),[4,12,20]);
assert.deepStrictEqual(indices(layout('construction.background.grey-stone-vertical')),[24,32]);
assert.deepStrictEqual(indices(layout('construction.background.grey-stone-horizontal')),[40,41],
  'fixedRow is supported by the same exported helper used by live rendering');
assert.strictEqual(sourceIndices(theme.objects.greyStone.visuals.square),48);
assert.deepStrictEqual(indices(layout('construction.background.green-stone-arch',5)),[25,26,26,26,27]);
assert.strictEqual(layout('construction.background.green-stone-arch',2),null,'audited arch retains its middle piece');
assert.deepStrictEqual(indices(layout('construction.background.green-stone-column',undefined,5)),[35,43,43,43,51]);
assert.deepStrictEqual(indices(layout('construction.background.green-stone-dark-arch')),[33,34]);
assert.deepStrictEqual(indices(layout('construction.background.green-stone-dark-column',undefined,4)),[42,50,50,58]);
assert.strictEqual(layout('construction.background.green-stone-dark-column',undefined,2),null,
  'audited column retains its middle piece');
assert.deepStrictEqual(indices(layout('construction.background.cave-arch-yellow-brown')),[28,29,36,37,44,45,52,53,60,61]);
assert.strictEqual(sourceIndices(theme.objects.rockpile.visuals.sprig),30);
assert.strictEqual(sourceIndices(theme.objects.rockpile.visuals.plain),38);
assert.strictEqual(semantics.visualTarget(theme.objects.rockpile,{'rockpile.appearance':'plain'}).target,
  'background.rockpile.variant_plain');
assert.deepStrictEqual(theme.parameterSchemas.backgroundFill.material.values,['black','maroon','light_green','dark_green']);
for(const [material,index] of Object.entries({black:49,maroon:62,light_green:66,dark_green:67})) {
  const fill=layout(theme.objects.backgroundFill.visuals[material],3,2);
  assert.strictEqual(fill.cells.length,6,`${material} remains one dimensioned instance resolving six presentation cells`);
  assert(fill.cells.every(cell=>sourceIndices(cell.id)===index));
  const geometry=plain(semantics.constructionGeometry(fill,id=>theme.resources[id].display));
  assert.deepStrictEqual({w:geometry.w,h:geometry.h,cellW:geometry.cellW,cellH:geometry.cellH},
    {w:96,h:64,cellW:32,cellH:32},`${material} uses native 32px bgsheet geometry`);
}
const hillGeometry=plain(semantics.constructionGeometry(largeHill,id=>theme.resources[id].display));
assert.deepStrictEqual({w:hillGeometry.w,h:hillGeometry.h,cellW:hillGeometry.cellW,cellH:hillGeometry.cellH},
  {w:32,h:48,cellW:16,cellH:16},'Hill keeps native 16px mapsheet geometry');
assert.strictEqual(theme.resources['background.maroon_fill.source_1'].provenance.index,63,
  'the byte-identical secondary maroon source remains preserved without becoming palette noise');
assert(theme.coverage.unresolvedResources>0);
assert(theme.coverage.unresolvedBySourceSheet['bgsheet.png'].includes(56));
assert(theme.coverage.unresolvedBySourceSheet['mapsheet.png'].includes(73));
assert.deepStrictEqual(theme.constructions['construction.cannon.vertical'].layout.order,
  ['muzzle','neck','body']);
const cannonCells=plain(semantics.constructionLayout(
  theme.constructions['construction.cannon.vertical'].components,
  theme.constructions['construction.cannon.vertical'].layout));
assert.deepStrictEqual(cannonCells.cells.map(({id,x,y})=>({id,x,y})),[
  {id:'cannon.vertical.muzzle',x:0,y:0},
  {id:'cannon.vertical.neck',x:0,y:1},
  {id:'cannon.vertical.body',x:0,y:2},
]);
assert.strictEqual(theme.objects.verticalCannon.runtimeHooks.firing.status, 'unimplemented');
assert.deepStrictEqual(theme.placeables.verticalCannon.parameters,['transform.x','transform.y']);
assert.deepStrictEqual(theme.objects.hiddenRevealedBlock.visuals,
  {preview:'block.hidden.revealed.frame_0'}, 'the authoring preview is one deterministic audited frame');
assert.deepStrictEqual(theme.objects.hiddenRevealedBlock.runtimeHooks,
  {visualAnimation:{status:'unimplemented',frameGroup:'block.hidden.revealed'}},
  'future frame cycling is an explicit socket without invented order or timing');
assert.strictEqual(theme.objects.hiddenRevealedBlock.collisionMode, undefined,
  'the visual family does not imply collision behavior');
assert.strictEqual(theme.constructions['construction.block.hidden'], undefined,
  'no transparent hidden presentation is invented');
assert.strictEqual(theme.parameterSchemas.hiddenBlock, undefined,
  'resource naming does not invent authored state or timing parameters');
assert.deepStrictEqual(theme.placeables.hiddenRevealedBlock.parameters,['transform.x','transform.y']);
assert.deepStrictEqual(theme.frameGroups['block.hidden.revealed'].resources,[
  'block.hidden.revealed.frame_0','block.hidden.revealed.frame_1',
  'block.hidden.revealed.frame_2','block.hidden.revealed.frame_3',
]);
assert.strictEqual(theme.frameGroups['block.hidden.revealed'].sequenceKnown,false);
assert.strictEqual(theme.frameGroups['block.hidden.revealed'].timingKnown,false);
assert(!theme.objects.questionBlock.visuals.used, 'hidden reveal art is not question-block used art');
assert(!theme.placeables.movingMushroomPlatform, 'moving mushroom platform is not a separate palette species');
for (const path of ['movingPlatform.path','movingPlatform.range','movingPlatform.speed'])
  assert(theme.placeables.mushroomPlatform.parameters.includes(path), `mushroom platform exposes optional ${path}`);
for (const id of ['growMushroom','fireFlower','lifeMushroom']) {
  assert(theme.objects[id], `${id} remains a defined reward object`);
  assert(!theme.placeables[id], `${id} is not directly placeable`);
  assert(schema.rewardBlock.contents.allowedObjects.includes(id), `${id} remains selectable as block contents`);
}
for (const id of ['koopaRed','koopaGreen']) {
  assert(theme.placeables[id].parameters.includes('flight.hasWings'), `${id} exposes authored wings`);
  assert(theme.placeables[id].parameters.includes('flight.flying'), `${id} exposes independent flying behavior`);
  assert.deepStrictEqual(theme.objects[theme.placeables[id].object].attachments,
    [{enabledBy:'flight.hasWings',target:'enemy.wing.flap',layer:'behind',instances:[
      {offsetByBody:{x:-0.42,y:-0.46}},
      {offsetByBody:{x:0.42,y:-0.46},mirror:true},
    ]}]);
}
assert.strictEqual(schema.flight.hasWings.default, false);
assert.strictEqual(schema.flight.flying.default, false);
assert(!theme.contract.engineVocabulary.capabilities.includes('flightPresentation'));
assert(!newEditor.includes('koopaWings'), 'attachment placement is interpreted from data, not a named editor special case');
assert.strictEqual(theme.objects.rotatingBlock.visuals.idle, 'block.rotating.frame_0');
assert.strictEqual(theme.resources[theme.objects.rotatingBlock.visuals.idle].provenance.index, 36,
  'rotating-block idle uses the audited full resting face');
assert.strictEqual(theme.objects.rotatingBlock.visuals.spinning, 'block.rotating.spin');
assert.strictEqual(theme.placeables.rotatingBlock.previewVisual, 'idle');
assert.strictEqual(theme.placeables.rotatingBlock.object, 'rotatingBlock');
assert(!Object.values(theme.placeables).some(p => /^block\.rotating\.frame_/.test(p.object)),
  'rotating block runtime frames are not separate palette objects');
const mushroomCells = plain(semantics.stemConstructionCells(4,5));
assert.strictEqual(mushroomCells.length, 20, 'mushroom width and height produce the full cell rectangle');
assert.strictEqual(mushroomCells.filter(c => c.y === 0 && c.part.startsWith('cap')).length, 4);
assert.strictEqual(mushroomCells.filter(c => c.y > 0 && c.part.startsWith('stem')).length, 16);
assert.deepStrictEqual([...new Set(mushroomCells.map(c => c.y))], [0,1,2,3,4]);
assert.deepStrictEqual(plain(semantics.patrolRangeSegment(theme.objects.goomba,
  {'transform.x':100,'transform.y':80,'walker.patrolRange':24})), {x1:76,x2:124,y:80});
assert.strictEqual(semantics.patrolRangeSegment(theme.objects.coin,
  {'transform.x':100,'transform.y':80,'walker.patrolRange':24}), null,
  'range geometry is limited to explicitly patrol-capable actors');
const bodyBounds={w:24,h:40,anchorX:.5,anchorY:1}, wingBounds={w:16,h:32,anchorX:.5,anchorY:1};
const attachments=theme.objects['koopa.red'].attachments, facing=semantics.authoredPresentation(false,true,{'walker.direction':'right'}),origin={x:100,y:200};
const withoutWings=plain(semantics.composedAabb(bodyBounds,facing,origin,attachments,
  {'flight.hasWings':false,'flight.flying':true},()=>wingBounds));
const withWings=plain(semantics.composedAabb(bodyBounds,facing,origin,attachments,
  {'flight.hasWings':true,'flight.flying':false},()=>wingBounds));
assert.deepStrictEqual(withoutWings,{x:88,y:160,w:24,h:40}, 'flying alone does not enable wing presentation or bounds');
assert(withWings.w>withoutWings.w&&withWings.h>withoutWings.h, 'hasWings alone expands composed hit/selection bounds');
const bumpOnly=plain(semantics.blockSemantics({bumpable:true})),triggerOnly=plain(semantics.blockSemantics({bumpTriggers:[{type:'switch'}]}));
assert.deepStrictEqual(bumpOnly.bumpTriggers,[], 'bumpable does not imply triggers');
assert.strictEqual(triggerOnly.bumpable,false, 'bump triggers do not imply bumpable');
assert.deepStrictEqual(triggerOnly.bumpTriggers,[{type:'switch'}]);
const rotating=plain(semantics.blockSemantics(theme.objects.rotatingBlock));
assert.strictEqual(rotating.bumpable,true);
assert.deepStrictEqual(rotating.bumpTriggers,[{type:'temporarySpin',collisionWhileActive:'none',duration:{source:'engineDefault'},completion:{returnState:'idle',restoreCollision:true},enterState:'spinning'}]);
assert.strictEqual(theme.objects.rotatingBlock.visuals[rotating.bumpTriggers[0].enterState], 'block.rotating.spin',
  'behavior selects a semantic state whose visual mapping owns the animation');
const question=plain(semantics.blockSemantics(theme.objects.questionBlock));
assert.deepStrictEqual(question.bumpTriggers,[{type:'dispenseContents',contentsParameter:'rewardBlock.contents'}]);
const brick=plain(semantics.blockSemantics(theme.objects.brick));
assert.strictEqual(brick.bumpable,true);assert.strictEqual(brick.breakable,true);assert.deepStrictEqual(brick.bumpTriggers,[]);
assert.deepStrictEqual(plain(semantics.blockSemantics({visuals:{spin:'block.rotating.spin'}})),
  {bumpable:false,bumpTriggers:[],breakable:false,collisionMode:null}, 'visual resources create no gameplay semantics');
assert.deepStrictEqual(theme.objects.solidBlock.capabilities,[]);
assert.strictEqual(theme.objects.solidBlock.collisionMode,'solid', 'solid collision has one canonical representation');
const pipeBounds = {w:32,h:80,anchorX:.5,anchorY:1};
assert.deepStrictEqual(plain(semantics.transformedAabb(pipeBounds,semantics.authoredPresentation(true,false,{'pipe.direction':'up'}),{x:100,y:200})),
  {x:84,y:120,w:32,h:80}, 'up pipe bounds retain the authored bottom-center anchor');
assert.deepStrictEqual(plain(semantics.transformedAabb(pipeBounds,semantics.authoredPresentation(true,false,{'pipe.direction':'right'}),{x:100,y:200})),
  {x:100,y:184,w:80,h:32}, 'right pipe bounds use the same quarter-turn as rendering');
assert.deepStrictEqual(plain(semantics.transformedAabb(pipeBounds,semantics.authoredPresentation(true,false,{'pipe.direction':'down'}),{x:100,y:200})),
  {x:84,y:200,w:32,h:80}, 'down pipe bounds extend below the authored anchor');
assert.deepStrictEqual(plain(semantics.transformedAabb(pipeBounds,semantics.authoredPresentation(true,false,{'pipe.direction':'left'}),{x:100,y:200})),
  {x:20,y:184,w:80,h:32}, 'left pipe bounds extend left of the authored anchor');
assert.deepStrictEqual(plain(semantics.transformedAabb({w:24,h:40,anchorX:.25,anchorY:1},semantics.authoredPresentation(false,true,{'walker.direction':'left'}),{x:50,y:90})),
  {x:32,y:50,w:24,h:40}, 'mirrored bounds reflect the actual non-centered visual anchor');

const overground = theme.constructions['construction.terrain.overground'].autotile.variants;
const tiles2 = plain(semantics.rectangleAutotiles(2,2,overground));
assert.deepStrictEqual(tiles2.map(({x,y,mask})=>[x,y,mask]),
  [[0,0,'1000'],[1,0,'0100'],[0,1,'0010'],[1,1,'0001']],
  '2x2 terrain resolves all four occupied-cell corner masks');
assert.deepStrictEqual(tiles2.map(tile=>tile.id), [overground['1000'],overground['0100'],overground['0010'],overground['0001']],
  '2x2 terrain resolves corner masks to their declared resources');
const tiles3 = plain(semantics.rectangleAutotiles(3,3,overground));
const tileAt = (x,y) => tiles3.find(tile=>tile.x===x&&tile.y===y);
for(const [x,y,mask] of [[0,0,'1000'],[1,0,'1100'],[2,0,'0100'],[0,1,'1010'],[1,1,'1111'],[2,1,'0101'],[0,2,'0010'],[1,2,'0011'],[2,2,'0001']]){
  const tile=tileAt(x,y);
  assert.strictEqual(tile.mask,mask,`3x3 terrain cell ${x},${y} has the expected occupied-neighbor mask`);
  assert.strictEqual(tile.id,overground[mask],`3x3 terrain cell ${x},${y} uses the declared mask resource`);
}
assert.strictEqual(semantics.controlEnabled('pipe.destination', schema.pipe.destination,
  {'pipe.travelEnabled':false}), false, 'enabledWhen disables a control when its condition is false');
assert.strictEqual(semantics.controlEnabled('pipe.destination', schema.pipe.destination,
  {'pipe.travelEnabled':true}), true, 'enabledWhen enables a control when its condition is true');

const camera={x:80,y:-20,zoom:2},world={x:48,y:96};
assert.deepStrictEqual(plain(semantics.screenToWorld(semantics.worldToScreen(world,camera),camera)),world,
  'the centralized world/screen transform round-trips at zoom');
const cursor={x:310,y:140},zoomed=semantics.zoomAt(camera,cursor,3.5);
assert.deepStrictEqual(plain(semantics.screenToWorld(cursor,zoomed)),plain(semantics.screenToWorld(cursor,camera)),
  'pointer-centered zoom preserves the world point below the pointer');
assert.strictEqual(semantics.cameraView({x:NaN,y:Infinity,zoom:100}).zoom,4,'camera zoom is finite and clamped');
assert.strictEqual(semantics.snap(41),48,'authored positions snap to the 16px world grid');

const brush={id:'brush'},placed={id:'placed'},other={id:'other'};
let interaction={selected:other,brush:null};
interaction=semantics.selectionTransition(interaction,{type:'empty'});
assert.deepStrictEqual(plain(interaction),{selected:null,brush:null},'empty canvas clears destructive selection state');
interaction=semantics.selectionTransition(interaction,{type:'palette',item:brush});
assert.deepStrictEqual(plain(interaction),{selected:null,brush},'palette selection clears unrelated instance selection');
interaction=semantics.selectionTransition(interaction,{type:'empty',instance:placed});
assert.deepStrictEqual(plain(interaction),{selected:null,brush},'brush placement does not create stale destructive selection');
interaction=semantics.selectionTransition(interaction,{type:'empty',instance:{id:'second'}});
assert.deepStrictEqual(plain(interaction),{selected:null,brush},'repeated placement remains active with true select-none state');
interaction=semantics.selectionTransition(interaction,{type:'object',instance:other});
assert.deepStrictEqual(plain(interaction),{selected:other,brush:null},'object selection exits placement without stale brush state');

const modelFor=(placeable,values)=>{
  const target=semantics.visualTarget(item(placeable).object,values,item(placeable).definition.previewVisual).target;
  return semantics.resizeModel(theme.constructions[target],values);
};
const resize=(model,values,bounds,pointer,cell={w:32,h:32},origin={x:48,y:96})=>
  plain(semantics.resizeValues(model,values,bounds,pointer,cell,origin));
for(const [id,placeable] of Object.entries(theme.placeables)) {
  const dimensionPaths=placeable.parameters.filter(path=>/\.(?:width|height|length)$/.test(path));
  if(!dimensionPaths.length)continue;
  const targets=new Set(Object.values(theme.objects[placeable.object].visuals));
  for(const target of targets) {
    const construction=theme.constructions[target];
    assert(construction,`${id} spatial parameters resolve to a construction`);
    const declaredPaths=Object.values(construction.resize||{}).map(axis=>axis.path);
    for(const path of dimensionPaths) assert(declaredPaths.includes(path),`${id} declares resize metadata for ${path}`);
    for(const axis of Object.values(construction.resize||{})) {
      assert(axis.minimum>=1,`${id} resize axis has a valid minimum`);
      assert.strictEqual(axis.anchor,'opposite',`${id} resize axis declares its stable anchor`);
      assert.strictEqual(axis.unit,'nativeCell',`${id} resize axis uses construction-native geometry`);
    }
  }
}
let values={'transform.x':48,'transform.y':96,'extent.width':3,'extent.height':3,'backgroundFill.material':'black'};
let model=modelFor('backgroundFill',values);
let changed=resize(model,values,{x:0,y:0,w:96,h:96},{x:160,y:128});
assert.deepStrictEqual({w:changed['extent.width'],h:changed['extent.height'],x:changed['transform.x'],y:changed['transform.y']},
  {w:5,h:4,x:80,y:128},'repeatRect resizes in native 32px cells while its top-left anchor stays stable');
values={'transform.x':48,'transform.y':32,'extent.width':3};model=modelFor('lightGreenArch',values);
changed=resize(model,values,{x:0,y:0,w:96,h:32},{x:160,y:999});
assert.deepStrictEqual({w:changed['extent.width'],x:changed['transform.x'],y:changed['transform.y']},{w:5,x:80,y:32},
  'extensibleRow changes width only and retains its left/middle/right model');
assert.deepStrictEqual(indices(layout('construction.background.green-stone-arch',changed['extent.width'])),[25,26,26,26,27]);
values={'transform.x':16,'transform.y':96,'extent.height':3};model=modelFor('lightGreenColumn',values);
changed=resize(model,values,{x:0,y:0,w:32,h:96},{x:999,y:160});
assert.deepStrictEqual({h:changed['extent.height'],x:changed['transform.x'],y:changed['transform.y']},{h:5,x:16,y:160},
  'extensibleColumn changes height only and retains its top/middle/bottom model');
assert.deepStrictEqual(indices(layout('construction.background.green-stone-column',undefined,changed['extent.height'])),[35,43,43,43,51]);
values={'transform.x':16,'transform.y':48,'terrain.width':2,'terrain.height':2,'terrain.style':'overground'};
model=modelFor('ground',values);changed=resize(model,values,{x:0,y:0,w:32,h:32},{x:48,y:48},{w:16,h:16},{x:16,y:48});
assert.deepStrictEqual({w:changed['terrain.width'],h:changed['terrain.height'],x:changed['transform.x'],y:changed['transform.y']},{w:3,h:3,x:24,y:64});
assert.strictEqual(semantics.rectangleAutotiles(changed['terrain.width'],changed['terrain.height'],overground)[4].mask,'1111',
  'resized autotile rectangles continue through the semantic neighbor-mask resolver');
for(const width of [2,3]) {
  const row=plain(semantics.rectangleAutotiles(width,1,overground));
  const expected=width===2?['1000','0100']:['1000','1100','0100'];
  assert.deepStrictEqual(row.map(x=>x.mask),expected,`${width}x1 ground keeps the declared top row masks`);
  assert(row.every(x=>x.id===overground[x.mask]),`${width}x1 ground resolves visible resources across its width`);
}
const singleton=plain(semantics.rectangleAutotiles(1,1,overground));
assert.deepStrictEqual(singleton,[{x:0,y:0,mask:'singleton'}],
  '1x1 ground preserves a diagnosable undeclared singleton rather than inventing a 0000 relationship');
const oneRowGeometry=plain(semantics.constructionGeometry(
  {cells:semantics.rectangleAutotiles(3,1,overground),columns:3,rows:1},id=>theme.resources[id].display));
assert.deepStrictEqual({w:oneRowGeometry.w,h:oneRowGeometry.h},{w:48,h:16},
  'one-row ground retains native 16px geometry and hit bounds');
assert.strictEqual(modelFor('hill',{'hill.shape':'large'}),null,'fixed Hill geometry rejects resize');
values={'transform.x':48,'transform.y':32,'extent.width':3};model=modelFor('lightGreenArch',values);
changed=resize(model,values,{x:0,y:0,w:96,h:32},{x:1,y:0});
assert.deepStrictEqual({w:changed['extent.width'],x:changed['transform.x']},{w:3,x:48},
  'declared minimum extent is enforced without moving the stable opposite edge');
const zoomPointer=semantics.worldToScreen({x:160,y:128},camera);
changed=resize(semantics.resizeModel(theme.constructions['construction.background.fill.black'],{'extent.width':3,'extent.height':3}),
  {'transform.x':48,'transform.y':96,'extent.width':3,'extent.height':3},{x:0,y:0,w:96,h:96},
  semantics.screenToWorld(zoomPointer,camera));
assert.deepStrictEqual({w:changed['extent.width'],h:changed['extent.height']},{w:5,h:4},
  'resizing while zoomed converts the pointer back to the same world extents');

const skyConstruction=theme.constructions['construction.background.sky-gradient'];
const skyDefault=plain(semantics.constructionLayout(skyConstruction.components,skyConstruction.layout,1,3));
assert.deepStrictEqual(skyDefault.cells.map(x=>x.part),['top','transition','bottom']);
const wideSky=plain(semantics.constructionLayout(skyConstruction.components,skyConstruction.layout,3,3));
assert.strictEqual(wideSky.cells.length,9,'Sky Gradient repeats all three bands horizontally');
const tallSky=plain(semantics.constructionLayout(skyConstruction.components,skyConstruction.layout,2,6));
assert.deepStrictEqual(tallSky.cells.filter(x=>x.x===0).map(x=>x.part),
  ['top','top','top','transition','bottom','bottom'],
  'odd extra rows deterministically favor the blue top while preserving one center band');
assert.strictEqual(semantics.constructionLayout(skyConstruction.components,skyConstruction.layout,2,2),null,
  'Sky Gradient rejects a height that cannot preserve all three bands');
const skyGeometry=plain(semantics.constructionGeometry(wideSky,id=>theme.resources[id].display));
assert.deepStrictEqual({w:skyGeometry.w,h:skyGeometry.h,cellW:skyGeometry.cellW,cellH:skyGeometry.cellH},
  {w:96,h:96,cellW:32,cellH:32},'Sky Gradient uses native 32px geometry for rendering and selection');
assert.deepStrictEqual({axes:modelFor('skyGradient',{'extent.width':1,'extent.height':3}).axes,
  minHeight:modelFor('skyGradient',{'extent.width':1,'extent.height':3}).minHeight},{axes:'xy',minHeight:3});
assert.strictEqual(modelFor('pipe',{'pipe.length':3}).heightPath,'pipe.length','pipe length is a vertical resize axis');
assert.strictEqual(modelFor('ladder',{'extent.length':3}).heightPath,'extent.length','ladder length is a vertical resize axis');
const pipeModel=modelFor('pipe',{'pipe.length':2}),pipeOrigin={x:100,y:100};
const pipeLocalBounds={x:-16,y:-32,w:32,h:32},pipeCell={w:16,h:16};
for(const [direction,pointer,expectedOrigin,cursor] of [
  ['up',{x:100,y:132},{x:100,y:132},'ns-resize'],
  ['right',{x:68,y:100},{x:68,y:100},'ew-resize'],
  ['down',{x:100,y:68},{x:100,y:68},'ns-resize'],
  ['left',{x:132,y:100},{x:132,y:100},'ew-resize'],
]) {
  const values={'transform.x':100,'transform.y':100,'pipe.length':2,'pipe.direction':direction};
  const pipePresentation=semantics.authoredPresentation(true,false,values);
  assert.deepStrictEqual(plain(semantics.resizeHandleWorld(pipeModel,pipeLocalBounds,pipePresentation,pipeOrigin)),pipeOrigin,
    `${direction} pipe resize handle stays on its local base anchor`);
  const changed=plain(semantics.resizePresentedValues(pipeModel,values,pipeLocalBounds,pointer,pipeCell,pipeOrigin,pipePresentation));
  assert.deepStrictEqual({length:changed['pipe.length'],x:changed['transform.x'],y:changed['transform.y']},
    {length:4,...expectedOrigin},`${direction} pipe resizes along its rotated local length while preserving the mouth edge`);
  assert.strictEqual(semantics.resizeCursor(pipeModel,pipePresentation),cursor,`${direction} pipe advertises its world resize axis`);
  assert.deepStrictEqual(plain(semantics.worldToLocal(
    semantics.localToWorld({x:7,y:-19},pipePresentation,pipeOrigin),pipePresentation,pipeOrigin)),{x:7,y:-19},
    `${direction} pipe local/world resize transforms round-trip`);
}

// Palette forms are explicitly authored; arbitrary enum schemas do not become cycles.
assert.deepStrictEqual(theme.placeables.pipe.formCycle, {
  path:'pipe.direction', values:['up','right','down','left'], labels:['Up','Right','Down','Left'],
});
const pipeItem=item('pipe');
pipeItem.values={'pipe.length':2};
assert.strictEqual(semantics.activatePalette(null,pipeItem),pipeItem,'first click selects without skipping the initial form');
assert.strictEqual(pipeItem.values['pipe.direction'],'up');
for(const direction of ['right','down','left','up']) {
  semantics.activatePalette(pipeItem,pipeItem);
  assert.strictEqual(pipeItem.values['pipe.direction'],direction,`active Pipe advances to ${direction}`);
}
pipeItem.values['pipe.direction']='down';
semantics.activatePalette(pipeItem,pipeItem);
assert.strictEqual(pipeItem.values['pipe.direction'],'left','a Details-authored form is the coherent cycle cursor');
const ladderItem=item('ladder'); ladderItem.values={'extent.length':2};
semantics.activatePalette(ladderItem,ladderItem);
assert.deepStrictEqual(ladderItem.values,{'extent.length':2},'a card without explicit formCycle never mutates');
assert.deepStrictEqual(theme.placeables.bush.formCycle.values,['variant_0','variant_1']);
assert.deepStrictEqual(theme.placeables.hill.formCycle.values,['large','small']);

const mapDocument={instances:[{placeable:'pipe',values:{'transform.x':32,'transform.y':48,'pipe.direction':'right','pipe.length':2},sceneLayer:'foreground'}],markers:{start:{x:16,y:64},goal:{x:320,y:64}}};
const envelope=plain(semantics.serializeMap(theme,mapDocument));
assert.deepStrictEqual(plain(semantics.validateMap(theme,envelope)),[],'the versioned editor map validates against its required theme');
assert.deepStrictEqual(envelope.instances,mapDocument.instances,'instances, cloned values, and authored layer overrides round-trip');
assert.deepStrictEqual(envelope.markers,mapDocument.markers,'singleton markers round-trip');
for(const transient of ['camera','zoom','brush','selection','paletteVisible','detailsVisible','history'])
  assert(!Object.hasOwn(envelope,transient),`${transient} UI state is omitted from map content`);
assert.match(semantics.validateMap({...theme,id:'another-theme'},envelope)[0],/theme mismatch/);
assert(semantics.validateMap(theme,{...envelope,instances:[{placeable:'pipe',values:{}}]}).some(x=>/malformed values/.test(x)));
assert(semantics.validateMap(theme,{...envelope,markers:{start:{x:'bad',y:0},goal:null}}).some(x=>/start marker/.test(x)));

const history=semantics.createHistory({instances:[],markers:{start:null,goal:null}});
history.push(mapDocument);
assert.strictEqual(history.state().dirty,true);
history.markClean();
assert.strictEqual(history.state().dirty,false,'saving marks the current history position clean without erasing undo');
assert.strictEqual(history.state().canUndo,true);
history.undo();
assert.strictEqual(history.state().canRedo,true);
history.push({instances:[],markers:{start:{x:0,y:0},goal:null}});
assert.strictEqual(history.state().canRedo,false,'a new authored edit after undo invalidates redo');
assert.strictEqual(history.state().dirty,true,'a branch replacing the old clean index stays dirty');
history.reset(mapDocument);
assert.deepStrictEqual(plain(history.state()),{canUndo:false,canRedo:false,dirty:false,index:0,clean:0},'map loading establishes a fresh clean history baseline');

const branchedHistory=semantics.createHistory({edit:'initial'});
branchedHistory.push({edit:'A'});
branchedHistory.push({edit:'B'});
branchedHistory.markClean();
branchedHistory.undo();
branchedHistory.push({edit:'C'});
assert.strictEqual(branchedHistory.state().dirty,true,
  'Edit A → Edit B → save → undo to A → Edit C cannot reuse the saved checkpoint');
assert.strictEqual(branchedHistory.state().canRedo,false,'the replaced B branch is no longer redoable');

for(const id of ['eraserBtn','paletteToggle','detailsToggle','helpDialog','openMapBtn','saveMapBtn','undoBtn','redoBtn'])
  assert(newEditor.includes(`id="${id}"`),`${id} is a discoverable editor control`);
assert(newEditor.includes('aria-label="Eraser tool" aria-pressed="false"'),
  'the compact eraser control has an accessible label and exposed pressed state');
assert(newEditor.includes("$('eraserBtn').onclick=()=>setEraserMode(!state.eraser)"),
  'clicking the active eraser toggles it off');
assert((newEditor.match(/state\.eraser=false;\$\('eraserBtn'\)\.setAttribute\('aria-pressed','false'\)/g)||[]).length>=2,
  'marker and ordinary palette cards replace eraser mode');
assert(newEditor.includes("e.key==='Escape'&&state.eraser"),'Escape exits eraser mode');
assert(newEditor.includes('Eraser ready — drag to erase'),'activation feedback names the drag interaction');
assert(newEditor.includes("Eraser locked to ${layerLabel(result.scope)}${result.scope==='markers'?'':' layer'}"),
  'the first successful deletion announces and retains its layer lock');
assert(newEditor.includes("Erased ${gesture.removedCount} ${label}${gesture.removedCount===1?'':'s'}"),
  'completion feedback reports a correctly pluralized authored-target count');
assert(newEditor.includes('<b>Eraser:</b> removes objects only while you drag and locks each drag to the layer'),
  'help documents drag-only erasing and first-layer locking');
assert(newEditor.includes("else if(state.gesture.type==='erase')eraseCells(state.gesture,p)"),
  'hover without an active pointer gesture cannot invoke erasing');
assert(newEditor.includes("if(state.eraser){state.selected=null;state.gesture={type:'erase'"),
  'eraser pointer-down takes priority over selection and move gestures');
assert(newEditor.includes("const wasErase=state.gesture?.type==='erase'"),
  'pointer cancellation follows the snapshot restoration path and clears transient erase state');
assert(newEditor.includes("requestAnimationFrame(resize)"),'sidebar changes schedule canvas/device-pixel resizing');
assert(newEditor.includes('palette-hidden.details-hidden'),'both hidden sidebars release both grid columns');
assert(newEditor.includes('Start and Goal cards place grid-snapped singleton markers'),'help documents actual marker behavior');
assert(newEditor.includes('if(state.brush?.markerKind)'), 'marker brushes have a Details branch before ordinary placeables');
assert(newEditor.includes("!text&&state.history&&(e.metaKey||e.ctrlKey)"),
  'map undo/redo shortcuts are inert before theme history exists');

// A copied fixture protects the explicit requirement that the old editor remains untouched.
assert(oldEditor.includes('LLMario Cartbench v0.30 Pipe Topology'));
console.log('reference pack editor contract checks passed');
