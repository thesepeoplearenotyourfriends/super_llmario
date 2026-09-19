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

const provenance = new Set();
for (const [id, resource] of Object.entries(pack.resources)) {
  assert(kinds.has(resource.kind), `${id}: invalid primary kind`);
  assert(resource.role && resource.purpose && resource.belongsTo, `${id}: incomplete semantics`);
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
  assert(animation.frames.length, `${id}: empty animation`);
  assert(animation.timing.frameMs > 0, `${id}: invalid timing`);
  for (const frame of animation.frames) assert(pack.resources[frame.resource], `${id}: missing frame ${frame.resource}`);
}
for (const [id, construction] of Object.entries(pack.constructions)) {
  for (const resource of Object.values(construction.components || {})) assert(pack.resources[resource], `${id}: missing component ${resource}`);
  for (const resource of Object.values(construction.autotile?.variants || {})) assert(pack.resources[resource], `${id}: missing autotile ${resource}`);
}
for (const [id, placeable] of Object.entries(pack.placeables)) {
  assert(pack.objects[placeable.object], `${id}: missing object ${placeable.object}`);
  for (const parameter of placeable.parameters) {
    const [schema, field] = parameter.split('.');
    assert(pack.parameterSchemas[schema]?.[field], `${id}: unknown parameter ${parameter}`);
  }
}
console.log(`MarioAI reference pack: ${independentlyCounted} nonempty resources, ${Object.keys(pack.animations).length} animations, ${Object.keys(pack.placeables).length} placeables`);
