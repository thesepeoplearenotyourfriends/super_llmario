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
assert.equal(pack.coverage.unresolvedExactPurpose.length, 12);
assert(!pack.coverage.unresolvedExactPurpose.some(id => id.startsWith('background.')));

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
assert.deepEqual(
  Object.keys(pack.resources).filter(id => id.includes('unresolved')).sort(),
  [...pack.coverage.unresolvedExactPurpose].sort(),
  'coverage must enumerate every and only unresolved resource',
);

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
  assert(animation.frames.length, `${id}: empty animation`);
  assert(animation.timing.frameMs > 0, `${id}: invalid timing`);
  for (const frame of animation.frames) assert(pack.resources[frame.resource], `${id}: missing frame ${frame.resource}`);
}
for (const [id, construction] of Object.entries(pack.constructions)) {
  if (construction.family) assert(pack.families[construction.family], `${id}: missing family ${construction.family}`);
  for (const resource of Object.values(construction.components || {})) assert(pack.resources[resource], `${id}: missing component ${resource}`);
  for (const resource of Object.values(construction.autotile?.variants || {})) assert(pack.resources[resource], `${id}: missing autotile ${resource}`);
}
const presentationTargets = new Set([
  ...Object.keys(pack.resources),
  ...Object.keys(pack.animations),
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
console.log(`MarioAI reference pack: ${independentlyCounted} nonempty resources, ${Object.keys(pack.animations).length} animations, ${Object.keys(pack.placeables).length} placeables`);
