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
assert.strictEqual(theme.placeables.brick.previewVisual, 'normal');
assert.strictEqual(semantics.visualTarget(theme.objects.ground, {'terrain.style':'castle'}).target,
  'construction.terrain.castle', 'an authored selector chooses its matching visual');

assert.strictEqual(semantics.autotilePreview('construction.terrain.overground',
  theme.constructions['construction.terrain.overground']).supported, true,
  'declared neighbor bits and mask variants support deterministic autotiling');
assert.deepStrictEqual(theme.placeables.pipe.initialValues, {'pipe.length':2});
assert.deepStrictEqual(theme.placeables.ladder.initialValues, {'extent.length':2});
assert.deepStrictEqual(theme.placeables.ground.initialValues, {'terrain.width':2,'terrain.height':2});
assert.deepStrictEqual(theme.placeables.mushroomPlatform.initialValues, {'extent.width':3});
assert.deepStrictEqual(theme.placeables.bush.initialValues, {'extent.width':3});
assert.deepStrictEqual(theme.placeables.movingMushroomPlatform.initialValues, {'extent.width':3});
assert(newEditor.includes("c.rotate(p.rotation)"), 'construction presentation rotates the rendered result');
assert(newEditor.includes("c.scale(p.mirror?-1:1,1)"), 'actor presentation mirrors the rendered result');
assert.strictEqual(semantics.controlEnabled('pipe.destination', schema.pipe.destination,
  {'pipe.travelEnabled':false}), false, 'enabledWhen disables a control when its condition is false');
assert.strictEqual(semantics.controlEnabled('pipe.destination', schema.pipe.destination,
  {'pipe.travelEnabled':true}), true, 'enabledWhen enables a control when its condition is true');

// A copied fixture protects the explicit requirement that the old editor remains untouched.
assert(oldEditor.includes('LLMario Cartbench v0.30 Pipe Topology'));
console.log('reference pack editor contract checks passed');
