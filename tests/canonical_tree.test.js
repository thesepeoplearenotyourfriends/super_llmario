'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');

const root=path.resolve(__dirname,'..');
const read=relative=>fs.readFileSync(path.join(root,relative),'utf8');
test('canonical tree and guidance name only the reference-pack applications',()=>{
  assert.deepEqual(fs.readdirSync(path.join(root,'engine')).sort(),['reference_pack_engine.html']);
  assert.deepEqual(fs.readdirSync(path.join(root,'editor')).sort(),['reference_pack_editor.html','theme_pack_editor.html']);
  assert(fs.statSync(path.join(root,'archived/engine/legacy_engine.html')).isFile(),'legacy behavioral oracle remains archived');
  const activeFiles=['AGENTS.md','README.md','docs/repository-mainline.md','docs/marioai-reference-theme-pack.md','index.html','scripts/build_release.py','tests/release_build.test.js'];
  for(const file of activeFiles){
    const source=read(file);
    assert(!source.includes(['engine','engine.html'].join('/')),`${file} has no obsolete engine path`);
    assert(!source.includes(['editor','editor.html'].join('/')),`${file} has no obsolete editor path`);
  }
  const guidance=[read('README.md'),read('docs/repository-mainline.md')].join('\n');
  for(const canonical of ['editor/reference_pack_editor.html','themes/theme_marioai_reference_pack.llmtheme.txt','engine/reference_pack_engine.html'])
    assert(guidance.includes(canonical),`guidance names ${canonical}`);
  assert.match(guidance,/standalone, single-file runtime/);
  assert.match(guidance,/no runtime PNG, GIF, or DAT filesystem dependency/);
  assert.match(guidance,/derived compatibility envelope/);
  assert.match(guidance,/Rows and row transitions are not part/);
  assert(read('tests/reference_pack_engine.test.js').includes("archived/engine/legacy_engine.html"),
    'legacy comparison names only the archived oracle path');
});
