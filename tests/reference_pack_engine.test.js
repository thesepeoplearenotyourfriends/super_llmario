'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('engine/reference_pack_engine.html','utf8');
const legacy=fs.readFileSync('engine/engine.html','utf8');
const theme=JSON.parse(fs.readFileSync('themes/theme_marioai_reference_pack.llmtheme.txt','utf8'));
const boundarySource=html.match(/<script id="referencePackBoundary">([\s\S]*?)<\/script>/)[1];
const context={globalThis:{}};
vm.runInNewContext(boundarySource,context);
const api=context.globalThis.ReferencePackBoundary;
const plain=value=>JSON.parse(JSON.stringify(value));
const validMap={format:'llmario-reference-editor-map',mapVersion:1,theme:{id:theme.id,packVersion:theme.packVersion},instances:[],markers:{start:null,goal:null}};

test('accepts only the current reference theme and editor-map contract',()=>{
  assert.deepEqual(plain(api.validateReferenceTheme(theme)),[]);
  assert.deepEqual(plain(api.validateReferenceEditorMap(validMap,theme)),[]);
  assert.equal(api.prepareReferenceRuntime(theme,validMap).ok,true);
});

test('checks map theme identity and pack version',()=>{
  const wrongId={...validMap,theme:{...validMap.theme,id:'another-theme'}};
  const wrongVersion={...validMap,theme:{...validMap.theme,packVersion:2}};
  assert.match(api.validateReferenceEditorMap(wrongId,theme).join(' '),/theme mismatch/);
  assert.match(api.validateReferenceEditorMap(wrongVersion,theme).join(' '),/theme version mismatch/);
});

test('malformed documents return useful diagnostics without throwing',()=>{
  assert.match(api.parseReferenceDocument('{','theme').errors[0],/not valid JSON/);
  assert.match(api.validateReferenceTheme(null)[0],/root/);
  assert.match(api.validateReferenceEditorMap(null,theme)[0],/root/);
  assert.equal(api.prepareReferenceRuntime({},{}).ok,false);
});

test('rejects every previous content envelope instead of falling back',()=>{
  for(const format of ['llmario-theme-v1','llmario-theme-pack-v1','llmario-map-v1','llmcart-toybox-recipe',undefined]){
    const document={...theme,format};
    assert(api.validateReferenceTheme(document).some(error=>error.includes('unsupported theme format')));
    const map={...validMap,format};
    assert(api.validateReferenceEditorMap(map,theme).some(error=>error.includes('unsupported map format')));
  }
});

test('boots as a standalone waiting shell with no old default or runtime dependency',()=>{
  assert.match(html,/Reference theme\/map required/);
  assert.match(html,/no level is loaded/);
  assert(!/\bfetch\s*\(|XMLHttpRequest|import\s*\(/.test(html));
  assert(!html.includes('DEMO_CART'));
  assert(!html.includes('ART_RESOURCES'));
  assert(!html.includes('bootPackedReleaseOrDemo'));
  assert(legacy.includes('DEMO_CART'),'legacy oracle remains intact');
});
