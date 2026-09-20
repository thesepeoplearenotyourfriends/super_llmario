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
assert(!theme.placeables.movingMushroomPlatform, 'moving mushroom platform is not a separate palette species');
for (const path of ['movingPlatform.path','movingPlatform.range','movingPlatform.speed'])
  assert(theme.placeables.mushroomPlatform.parameters.includes(path), `mushroom platform exposes optional ${path}`);
for (const id of ['growMushroom','fireFlower','lifeMushroom']) {
  assert(theme.objects[id], `${id} remains a defined reward object`);
  assert(!theme.placeables[id], `${id} is not directly placeable`);
  assert(schema.rewardBlock.contents.allowedObjects.includes(id), `${id} remains selectable as block contents`);
}
for (const id of ['koopaRed','koopaGreen']) {
  assert(theme.placeables[id].parameters.includes('flight.winged'), `${id} exposes authored wings`);
  assert.deepStrictEqual(theme.objects[theme.placeables[id].object].attachments,
    [{enabledBy:'flight.winged',target:'enemy.wing.flap',layer:'behind',placement:'koopaWings'}]);
}
assert(newEditor.includes('function drawPatrolRange(inst)'), 'selected patrol actors have an editor-only range gizmo');
assert(newEditor.includes("authoredSize('extent.height')"), 'mushroom construction consumes authored height');
const plain = value => JSON.parse(JSON.stringify(value));
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
