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

const semanticSource = newEditor.match(/<script id="contractSemantics">([\s\S]*?)<\/script>/)[1];
const context = { structuredClone, globalThis: {} };
vm.runInNewContext(semanticSource, context);
const semantics = context.globalThis.ReferencePackSemantics;
const schema = theme.parameterSchemas;
const plain = value => JSON.parse(JSON.stringify(value));

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
  large:'construction.hill.large',wide:'construction.hill.wide',
});
const largeHill=plain(semantics.constructionLayout(
  theme.constructions['construction.hill.large'].components,
  theme.constructions['construction.hill.large'].layout));
assert.deepStrictEqual(largeHill.cells.map(({x,y})=>[x,y]),
  [[0,0],[1,0],[0,1],[1,1],[0,2],[1,2],[0,3],[1,3]]);
const wideHill=plain(semantics.constructionLayout(
  theme.constructions['construction.hill.wide'].components,
  theme.constructions['construction.hill.wide'].layout));
assert.deepStrictEqual(wideHill.cells.map(({x,y})=>[x,y]),
  [[0,0],[1,0],[2,0],[0,1],[1,1],[2,1],[0,2],[2,2],[0,3],[2,3]]);
assert(theme.placeables.hill.parameters.includes('hill.shape'));
assert.strictEqual(theme.objects.hill.collisionMode, undefined, 'hills remain presentation-only');
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
