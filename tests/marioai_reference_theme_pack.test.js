'use strict';

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');

const ROOT = path.resolve(__dirname, '..');
const PACK_PATH = path.join(ROOT, 'themes/theme_marioai_reference_pack.llmtheme.txt');
const pack = JSON.parse(fs.readFileSync(PACK_PATH, 'utf8'));
const kinds = new Set(['ground', 'block', 'pickup', 'actor', 'decoration', 'effect']);

function pngAlpha(data) {
  assert.equal(data.subarray(1, 4).toString(), 'PNG');
  let offset = 8;
  let width, height, depth, colorType, paletteAlpha;
  const idat = [];
  while (offset < data.length) {
    const length = data.readUInt32BE(offset);
    const type = data.subarray(offset + 4, offset + 8).toString();
    const body = data.subarray(offset + 8, offset + 8 + length);
    offset += 12 + length;
    if (type === 'IHDR') [width, height, depth, colorType] = [body.readUInt32BE(0), body.readUInt32BE(4), body[8], body[9]];
    if (type === 'tRNS') paletteAlpha = body;
    if (type === 'IDAT') idat.push(body);
  }
  assert.equal(depth, 8, 'test decoder expects 8-bit MarioAI PNGs');
  const channels = {0: 1, 2: 3, 3: 1, 4: 2, 6: 4}[colorType];
  const bpp = channels;
  const stride = width * channels;
  const encoded = zlib.inflateSync(Buffer.concat(idat));
  const pixels = Buffer.alloc(stride * height);
  const paeth = (a, b, c) => { const p = a + b - c, pa = Math.abs(p-a), pb = Math.abs(p-b), pc = Math.abs(p-c); return pa <= pb && pa <= pc ? a : pb <= pc ? b : c; };
  for (let y = 0, src = 0; y < height; y++) {
    const filter = encoded[src++];
    for (let x = 0; x < stride; x++, src++) {
      const left = x >= bpp ? pixels[y*stride+x-bpp] : 0;
      const up = y ? pixels[(y-1)*stride+x] : 0;
      const upperLeft = y && x >= bpp ? pixels[(y-1)*stride+x-bpp] : 0;
      const predictor = filter === 0 ? 0 : filter === 1 ? left : filter === 2 ? up : filter === 3 ? Math.floor((left+up)/2) : filter === 4 ? paeth(left,up,upperLeft) : assert.fail(`PNG filter ${filter}`);
      pixels[y*stride+x] = (encoded[src] + predictor) & 255;
    }
  }
  const alphaAt = (x,y) => colorType === 6 ? pixels[y*stride+x*4+3] : colorType === 4 ? pixels[y*stride+x*2+1] : colorType === 3 ? (paletteAlpha?.[pixels[y*stride+x]] ?? 255) : 255;
  return {width, height, alphaAt};
}

assert.equal(pack.format, 'llmario-theme-pack-reference');
assert.deepEqual(new Set(pack.contract.resourceKinds), kinds);
assert.equal(Object.keys(pack.resources).length, pack.coverage.nonemptyWorldResources);
assert.equal(pack.coverage.nonemptyWorldResources, 298);
assert.equal(pack.coverage.backgroundUnresolved, 0);
assert.equal(pack.coverage.unresolvedResources, 0);
assert.equal(pack.coverage.unresolvedExactPurpose.length, 0);
assert(!Object.keys(pack.resources).some(id => id.includes('unresolved')));

const reviewedBackgrounds = {
  0:'background.dome.variant_0.top_left', 1:'background.dome.variant_0.top_right',
  2:'background.dome.variant_1.top_left', 3:'background.dome.variant_1.top_right',
  4:'background.sky_gradient.top', 6:'background.red_brown_stone_arch.top_left',
  7:'background.red_brown_stone_arch.top_right', 8:'background.dome.variant_0.middle_left',
  9:'background.dome.variant_0.middle_right', 10:'background.dome.variant_1.middle_left',
  11:'background.dome.variant_1.middle_right', 12:'background.sky_gradient.transition',
  14:'background.red_brown_stone_arch.middle_left', 15:'background.red_brown_stone_arch.middle_right',
  16:'background.dome.variant_0.bottom_left', 17:'background.dome.variant_0.bottom_right',
  18:'background.dome.variant_1.bottom_left', 19:'background.dome.variant_1.bottom_right',
  20:'background.sky_gradient.bottom', 23:'background.red_brown_stone_arch.bottom',
  24:'background.grey_stone.vertical.top', 25:'background.green_stone.arch.left',
  26:'background.green_stone.arch.middle', 27:'background.green_stone.arch.right',
  28:'background.cave_arch_yellow_brown.top_left', 29:'background.cave_arch_yellow_brown.top_right',
  30:'background.rockpile.variant_sprig', 31:'background.red_brown_stone_arch.lower_extension_1',
  32:'background.grey_stone.vertical.bottom', 33:'background.green_stone_dark.arch.left',
  34:'background.green_stone_dark.arch.right', 35:'background.green_stone.column.top',
  36:'background.cave_arch_yellow_brown.upper_left', 37:'background.cave_arch_yellow_brown.upper_right',
  38:'background.rockpile.variant_plain', 39:'background.red_brown_stone_arch.lower_extension_2',
  40:'background.grey_stone.horizontal.left', 41:'background.grey_stone.horizontal.right',
  42:'background.green_stone_dark.column.top', 43:'background.green_stone.column.middle',
  44:'background.cave_arch_yellow_brown.middle_left', 45:'background.cave_arch_yellow_brown.middle_right',
  46:'background.red_stone_wall.upper_left', 47:'background.red_stone_wall.upper_right',
  48:'background.grey_stone.square', 49:'background.black_fill',
  50:'background.green_stone_dark.column.middle', 51:'background.green_stone.column.bottom',
  52:'background.cave_arch_yellow_brown.lower_left', 53:'background.cave_arch_yellow_brown.lower_right',
  54:'background.red_stone_wall.middle_left', 55:'background.red_stone_wall.middle_right',
  56:'background.dark_bars.fill', 57:'background.green_stone_dark.trim_line',
  58:'background.green_stone_dark.column.bottom', 59:'background.green.border_top',
  60:'background.cave_arch_yellow_brown.bottom_left', 61:'background.cave_arch_yellow_brown.bottom_right',
  62:'background.red_stone_wall.lower_left', 63:'background.red_stone_wall.lower_right',
  66:'background.green_stone.fill', 67:'background.green_stone_dark.fill',
};
assert.equal(Object.keys(reviewedBackgrounds).length, 62);
for (const [index, id] of Object.entries(reviewedBackgrounds)) {
  assert.equal(pack.resources[id]?.provenance.sheet, 'bgsheet.png', `${id}: wrong source sheet`);
  assert.equal(pack.resources[id]?.provenance.index, Number(index), `${id}: wrong source index`);
}
assert(!Object.values(pack.resources).some(resource => resource.provenance.sheet === 'bgsheet.png' && resource.role.includes('unresolved')));

const auditedMapCells = {
  4:'block.hidden.revealed.frame_0', 5:'block.hidden.revealed.frame_1', 6:'block.hidden.revealed.frame_2', 7:'block.hidden.revealed.frame_3',
  16:'block.breakable.idle.frame_0', 17:'block.breakable.idle.frame_1', 18:'block.breakable.idle.frame_2', 19:'block.breakable.idle.frame_3',
  20:'block.question.frame_0', 21:'block.question.frame_1', 22:'block.question.frame_2', 23:'block.question.frame_3',
  32:'pickup.coin.frame_0', 33:'pickup.coin.frame_1', 34:'pickup.coin.frame_2', 35:'pickup.coin.frame_3',
  36:'block.rotating.frame_0', 37:'block.rotating.frame_1', 38:'block.rotating.frame_2', 39:'block.rotating.frame_3',
  67:'decoration.sign_arrow_right.top_left', 68:'decoration.sign_arrow_right.top_right',
  80:'background.bush.variant_0.left', 81:'background.bush.variant_0.middle', 82:'background.bush.variant_0.right',
  83:'decoration.sign_arrow_right.bottom_left', 84:'decoration.sign_arrow_right.bottom_right',
  96:'background.bush.variant_1.left', 97:'background.bush.variant_1.middle', 98:'background.bush.variant_1.right',
  136:'terrain.castle.top_left', 137:'terrain.castle.top_middle', 138:'terrain.castle.top_right',
  140:'terrain.underground.top_left', 141:'terrain.underground.top_middle', 142:'terrain.underground.top_right',
  152:'terrain.castle.middle_left', 153:'terrain.castle.fill', 154:'terrain.castle.middle_right',
  156:'terrain.underground.middle_left', 157:'terrain.underground.fill', 158:'terrain.underground.middle_right',
  168:'terrain.castle.bottom_left', 169:'terrain.castle.bottom_middle', 170:'terrain.castle.bottom_right',
  172:'terrain.underground.bottom_left', 173:'terrain.underground.bottom_middle', 174:'terrain.underground.bottom_right',
};
for (const [index, id] of Object.entries(auditedMapCells)) {
  assert.equal(pack.resources[id]?.provenance.sheet, 'mapsheet.png', `${id}: wrong source sheet`);
  assert.equal(pack.resources[id]?.provenance.index, Number(index), `${id}: wrong source index`);
}
assert(!Object.keys(pack.resources).some(id => /^block\.question\.(coin|powerup|multicoin)$/.test(id)), 'question frames must not imply rewards');

const completedResources = {
  'enemysheet.png:2':'enemy.walker.armored.red.turnaround',
  'enemysheet.png:18':'enemy.walker.armored.green.turnaround',
  'mariosheet.png:8':'player.normal.slide',
  'mariosheet.png:13':'player.normal.kick',
  'smallmariosheet.png:6':'player.small.slide',
  'smallmariosheet.png:10':'player.small.kick',
  'firemariosheet.png:8':'player.powered.slide',
  'firemariosheet.png:13':'player.powered.kick',
  'racoonmariosheet.png:8':'player.carrying.slide',
  'racoonmariosheet.png:13':'player.carrying.kick',
  'racoonmariosheet.png:15':'player.carrying.fast_jump.alternate_tail',
  'princess.png:0':'goal.actor.idle',
  'princess.png:1':'goal.actor.celebration.frame_0',
  'princess.png:2':'goal.actor.celebration.frame_1',
};
for (const [source, id] of Object.entries(completedResources)) {
  const [sheet, index] = source.split(':');
  assert.equal(pack.resources[id]?.provenance.sheet, sheet, `${id}: wrong source sheet`);
  assert.equal(pack.resources[id]?.provenance.index, Number(index), `${id}: wrong source index`);
}

const provenance = new Set();
for (const [id, resource] of Object.entries(pack.resources)) {
  assert(kinds.has(resource.kind), `${id}: invalid primary kind`);
  assert(resource.role && resource.purpose && resource.belongsTo, `${id}: incomplete semantics`);
  assert(pack.families[resource.belongsTo], `${id}: undeclared family ${resource.belongsTo}`);
  assert(pack.families[resource.belongsTo].purpose, `${id}: family ${resource.belongsTo} has no purpose`);
  assert(pack.atlases[resource.image.atlas], `${id}: missing atlas`);
  assert(resource.display?.anchor && resource.display.w > 0 && resource.display.h > 0, `${id}: incomplete display contract`);
  const key = `${resource.provenance.sheet}:${resource.provenance.index}`;
  assert(!provenance.has(key), `${id}: duplicate source cell ${key}`);
  provenance.add(key);
}

let independentlyCounted = 0;
for (const atlas of Object.values(pack.atlases)) {
  const source = fs.readFileSync(path.join(ROOT, 'themes/marioai_theme_files', atlas.sourceFile));
  assert.equal(require('crypto').createHash('sha256').update(source).digest('hex'), atlas.sha256);
  assert(source.equals(Buffer.from(atlas.data, 'base64')), `${atlas.sourceFile}: embedded atlas differs from static source`);
  const image = pngAlpha(source);
  const {w, h} = atlas.cellSize;
  for (let cy = 0; cy < image.height / h; cy++) for (let cx = 0; cx < image.width / w; cx++) {
    let visible = false;
    for (let y = cy*h; y < (cy+1)*h && !visible; y++) for (let x = cx*w; x < (cx+1)*w; x++) if (image.alphaAt(x,y)) { visible = true; break; }
    if (visible) {
      independentlyCounted++;
      const index = cy * (image.width / w) + cx;
      assert(provenance.has(`${atlas.sourceFile}:${index}`), `${atlas.sourceFile} nonempty cell ${index} is not inventoried`);
    }
  }
}
assert.equal(independentlyCounted, 298);

for (const [id, animation] of Object.entries(pack.animations)) {
  assert(animation.frames.length > 1, `${id}: static resources must not be wrapped as animations`);
  for (const frame of animation.frames) assert(pack.resources[frame.resource], `${id}: missing frame ${frame.resource}`);
}
assert.deepEqual(
  pack.frameGroups['player.carrying.airborne_tail_states'].resources,
  ['player.carrying.fast_jump', 'player.carrying.fast_jump.alternate_tail'],
);
assert.equal(pack.frameGroups['player.carrying.airborne_tail_states'].selection, 'runtime-selected');
assert.equal(pack.frameGroups['player.carrying.airborne_tail_states'].sequenceKnown, false);
for (const [id, group] of Object.entries(pack.frameGroups)) {
  assert(group.resources.length > 1, `${id}: frame group must contain related resources`);
  assert.equal(group.sequenceKnown, false, `${id}: uncertain group must not claim a sequence`);
  assert.equal(group.timingKnown, false, `${id}: uncertain group must not claim timing`);
  for (const resource of group.resources) assert(pack.resources[resource], `${id}: missing grouped resource ${resource}`);
}
assert.deepEqual(
  pack.animations['goal.actor.celebration'].frames.map(frame => frame.resource),
  ['goal.actor.celebration.frame_0', 'goal.actor.celebration.frame_1'],
);
assert.equal(pack.objects['koopa.red'].visuals.turnaround, 'enemy.walker.armored.red.turnaround');
assert.equal(pack.objects['koopa.green'].visuals.turnaround, 'enemy.walker.armored.green.turnaround');
assert.equal(pack.objects.brick.visuals.normal, 'block.breakable.idle');
assert.equal(pack.objects.questionBlock.visuals.used, 'block.hidden.revealed');
for (const [id, construction] of Object.entries(pack.constructions)) {
  if (construction.family) assert(pack.families[construction.family], `${id}: missing family ${construction.family}`);
  for (const resource of Object.values(construction.components || {})) assert(pack.resources[resource], `${id}: missing component ${resource}`);
  for (const resource of Object.values(construction.autotile?.variants || {})) assert(pack.resources[resource], `${id}: missing autotile ${resource}`);
}
const presentationTargets = new Set([
  ...Object.keys(pack.resources),
  ...Object.keys(pack.animations),
  ...Object.keys(pack.frameGroups),
  ...Object.keys(pack.constructions),
]);
for (const [id, object] of Object.entries(pack.objects)) {
  assert(object.engineNoun, `${id}: missing engine noun`);
  assert(pack.contract.engineVocabulary.nouns.includes(object.engineNoun), `${id}: undeclared engine noun ${object.engineNoun}`);
  assert(Array.isArray(object.capabilities), `${id}: missing capabilities`);
  for (const capability of object.capabilities) {
    assert(pack.contract.engineVocabulary.capabilities.includes(capability), `${id}: undeclared capability ${capability}`);
  }
  for (const [state, target] of Object.entries(object.visuals)) {
    assert(presentationTargets.has(target), `${id}.${state}: missing presentation target ${target}`);
  }
}
for (const [schemaId, schema] of Object.entries(pack.parameterSchemas)) {
  for (const [fieldId, field] of Object.entries(schema)) {
    for (const objectId of field.allowedObjects || []) {
      assert(pack.objects[objectId], `${schemaId}.${fieldId}: missing allowed object ${objectId}`);
    }
  }
}
for (const [id, placeable] of Object.entries(pack.placeables)) {
  assert(pack.objects[placeable.object], `${id}: missing object ${placeable.object}`);
  for (const parameter of placeable.parameters) {
    const [schema, field] = parameter.split('.');
    assert(pack.parameterSchemas[schema]?.[field], `${id}: unknown parameter ${parameter}`);
  }
}
assert(!Object.values(pack.placeables).some(placeable => placeable.object === 'goalActor'), 'goal actor must not enter the general placeable palette');
console.log(`MarioAI reference pack: ${independentlyCounted} nonempty resources, ${Object.keys(pack.animations).length} animations, ${Object.keys(pack.placeables).length} placeables`);
