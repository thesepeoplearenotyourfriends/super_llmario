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
assert.deepStrictEqual(theme.sceneLayers, ['background','world','actors','foreground']);
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
  assert.strictEqual(object.defaultSceneLayer,'background',`${id} defaults to the background layer`);
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
assert.strictEqual(theme.objects.whitePlatform.runtimeHooks.movement.status, 'unimplemented');
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
assert.deepStrictEqual(indices(layout('construction.background.dome.variant_0')),[0,1,8,9,16,17]);
assert.deepStrictEqual(indices(layout('construction.background.dome.variant_1')),[2,3,10,11,18,19]);
assert.strictEqual(semantics.visualTarget(theme.objects.backgroundDome,{'dome.variant':'variant_1'}).target,
  'construction.background.dome.variant_1');
assert.deepStrictEqual(indices(layout('construction.background.sky-gradient')),[4,12,20]);
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

// A copied fixture protects the explicit requirement that the old editor remains untouched.
assert(oldEditor.includes('LLMario Cartbench v0.30 Pipe Topology'));
console.log('reference pack editor contract checks passed');
