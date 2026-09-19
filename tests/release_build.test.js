'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process');

const root=path.resolve(__dirname,'..'),enginePath=path.join(root,'engine/engine.html'),releasePath=path.join(root,'dist/super_llmario.html');
const themes=['theme_desert.llmtheme.txt','theme_jungle.llmtheme.txt','theme_marioai_nonempty.llmtheme.txt','theme_wooded.llmtheme.txt'].map(name=>JSON.parse(fs.readFileSync(path.join(root,'themes',name),'utf8')));
const maps=['map_browntown.txt','map_marioai_reference.llmmap.txt'].map(name=>JSON.parse(fs.readFileSync(path.join(root,'maps',name),'utf8')));
function build(){cp.execFileSync('python3',['scripts/build_release.py'],{cwd:root,stdio:'pipe'});return fs.readFileSync(releasePath,'utf8')}
function packed(html,name){const match=html.match(new RegExp('const '+name+' = (\\[[\\s\\S]*?\\n\\]);'));assert(match,'missing '+name);return vm.runInNewContext(match[1])}
function scripts(html){return [...html.matchAll(/<script(?:\s[^>]*)?>([\s\S]*?)<\/script>/gi)].map(match=>match[1])}

test('release builder is deterministic and never mutates editable engine source',()=>{
  const before=fs.readFileSync(enginePath),first=build(),between=fs.readFileSync(enginePath),second=build(),after=fs.readFileSync(enginePath);
  assert.deepEqual(between,before);assert.deepEqual(after,before);assert.equal(second,first);assert(first.length>before.length);
});
test('release contains exact canonical documents and boots the packed default without sibling loading',()=>{
  const html=build();assert.deepEqual(JSON.parse(JSON.stringify(packed(html,'PACKED_THEMES'))),themes);assert.deepEqual(JSON.parse(JSON.stringify(packed(html,'PACKED_MAPS'))),maps);
  assert(html.includes('const PACKED_DEFAULT_MAP_ID = "marioai-reference-playground";'));
  assert(!/fetch\s*\(|XMLHttpRequest|import\s*\(/.test(html));assert(html.includes('bootPackedReleaseOrDemo();'));
});
test('every generated inline script is syntactically valid JavaScript',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'llmario-release-'));
  try{scripts(build()).forEach((source,index)=>{const file=path.join(dir,index+'.js');fs.writeFileSync(file,source);cp.execFileSync('node',['--check',file],{stdio:'pipe'})})}finally{fs.rmSync(dir,{recursive:true,force:true})}
});
