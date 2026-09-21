'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
test('canonical engine tree contains only the active reference runtime',()=>{
  assert.deepEqual(fs.readdirSync(path.join(root,'engine')).sort(),['reference_pack_engine.html']);
  assert(fs.statSync(path.join(root,'archived/engine/legacy_engine.html')).isFile(),'legacy behavioral oracle remains archived');
  const activeRefs=[];
  for(const file of ['index.html','README.md','docs/repository-mainline.md','scripts/build_release.py','tests/reference_pack_engine.test.js','tests/release_build.test.js']){
    const source=fs.readFileSync(path.join(root,file),'utf8');
    assert(!source.includes(['engine','engine.html'].join('/')),`${file} has no ambiguous legacy engine path`);
    if(/active|runtime|ENGINE|enginePath|redirect/i.test(source))activeRefs.push(source);
  }
  assert(activeRefs.some(source=>source.includes('engine/reference_pack_engine.html')),'active runtime references name the reference-pack engine');
  assert(fs.readFileSync(path.join(root,'tests/reference_pack_engine.test.js'),'utf8').includes("archived/engine/legacy_engine.html"),
    'legacy comparison test names only the archived oracle path');
});
