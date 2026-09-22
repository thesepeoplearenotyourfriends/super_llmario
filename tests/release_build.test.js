'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');

const root=path.resolve(__dirname,'..'),enginePath=path.join(root,'engine/reference_pack_engine.html'),editorPath=path.join(root,'editor/reference_pack_editor.html'),releasePath=path.join(root,'dist/super_llmario.html');
const theme=JSON.parse(fs.readFileSync(path.join(root,'themes/theme_marioai_reference_pack.llmtheme.txt'),'utf8'));
const map=JSON.parse(fs.readFileSync(path.join(root,'maps/demo.llmmap.txt'),'utf8'));
function build(){cp.execFileSync('python3',['scripts/build_release.py'],{cwd:root,stdio:'pipe'});return fs.readFileSync(releasePath,'utf8')}
function scripts(html){return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1])}
function packedScript(html){const match=html.match(/<script id="packedReleaseContent">([\s\S]*?)<\/script>/);assert(match,'missing packed release content');return match[1]}

test('release builder is deterministic and never mutates editable engine/editor sources',()=>{
  const engineBefore=fs.readFileSync(enginePath),editorBefore=fs.readFileSync(editorPath),first=build(),engineBetween=fs.readFileSync(enginePath),editorBetween=fs.readFileSync(editorPath),second=build();
  assert.deepEqual(engineBetween,engineBefore);assert.deepEqual(editorBetween,editorBefore);assert.deepEqual(fs.readFileSync(enginePath),engineBefore);assert.deepEqual(fs.readFileSync(editorPath),editorBefore);assert.equal(second,first);assert(first.length>engineBefore.length);
});
test('release packs the canonical reference theme, demo map, and embedded map editor',()=>{
  const html=build(),source=packedScript(html),sandbox={};vm.createContext(sandbox);vm.runInContext(source.replace(/^const /gm,'var '),sandbox);
  assert.equal(sandbox.PACKED_EXPERIENCES.length,1);assert.equal(sandbox.PACKED_EXPERIENCES[0].id,'demo');
  assert.deepEqual(JSON.parse(JSON.stringify(sandbox.PACKED_EXPERIENCES[0].theme)),theme);assert.deepEqual(JSON.parse(JSON.stringify(sandbox.PACKED_EXPERIENCES[0].map)),map);
  assert.equal(sandbox.PACKED_DEFAULT_EXPERIENCE_ID,'demo');assert(sandbox.PACKED_EDITOR_HTML.includes('Reference Pack Editor'));assert(sandbox.PACKED_EDITOR_HTML.includes('ReferencePackEditorReleaseLoad'));
  assert(html.includes('MAP EDITOR'));assert(html.includes('bootPackedRelease();'));assert(!/fetch\s*\(|XMLHttpRequest|import\s*\(/.test(html));
  assert.match(html,/<button id="releaseEditorButton">Editor<\/button><\/header>/);assert.doesNotMatch(html,/id="releaseMenu"|class="releaseMenu"/);
  assert.match(html,/getElementById\('releaseEditorButton'\).*addEventListener\('click',openPackedEditor\)/);
});
test('every generated inline script is syntactically valid JavaScript',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'llmario-release-'));
  try{scripts(build()).forEach((source,index)=>{const file=path.join(dir,index+'.js');fs.writeFileSync(file,source);cp.execFileSync('node',['--check',file],{stdio:'pipe'})})}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
