'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm'),cp=require('node:child_process'),os=require('node:os');

const root=path.resolve(__dirname,'..');
const script=(file,id)=>{const html=fs.readFileSync(path.join(root,file),'utf8'),match=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));assert(match,`${file} embeds ${id}`);const context={globalThis:{}};vm.runInNewContext(match[1],context);return context.globalThis};
// Results cross a vm realm boundary; strict deep equality needs plain local objects.
const plain=value=>JSON.parse(JSON.stringify(value)),wrap=(object,names)=>Object.fromEntries(names.map(name=>[name,(...args)=>plain(object[name](...args))]));
const ascii=wrap(script('editor/reference_pack_editor.html','llmarioAscii').LLMarioAscii,['asciiToMap','mapToAscii']),api=wrap(script('engine/reference_pack_engine.html','referencePackBoundary').ReferencePackBoundary,['validateReferenceEditorMap','simulateReachability']);
const theme=JSON.parse(fs.readFileSync(path.join(root,'themes/theme_marioai_reference_pack.llmtheme.txt'),'utf8'));
const sample=fs.readFileSync(path.join(root,'tests/fixtures/ascii_sample.llmascii.txt'),'utf8');
const maps=fs.readdirSync(path.join(root,'maps')).filter(name=>name.endsWith('.llmmap.txt'));

function normalized(map){
  // Compare instances by placeable, effective values (schema defaults filled) and layer; pipe targets by position.
  const byId=new Map(map.instances.filter(i=>i.instanceId).map(i=>[i.instanceId,i]));
  return map.instances.map(instance=>{const placeable=theme.placeables[instance.placeable],values={};
    for(const p of placeable.parameters){const [group,name]=p.split('.'),fallback=theme.parameterSchemas[group]?.[name]?.default;if(fallback!==undefined)values[p]=fallback}
    Object.assign(values,placeable.initialValues||{},instance.values);const d=values['pipe.destination'];
    if(d?.kind==='pipe'){const target=byId.get(d.instanceId);values['pipe.destination']=target?['pipe',target.values['transform.x'],target.values['transform.y']]:['dangling',d.instanceId]}
    return JSON.stringify([instance.placeable,Object.keys(values).sort().map(k=>[k,values[k]]),instance.sceneLayer||null])}).sort();
}

test('every repository map survives map → ASCII → map without losing an object or value',()=>{
  for(const name of maps){
    const map=JSON.parse(fs.readFileSync(path.join(root,'maps',name),'utf8')),out=ascii.mapToAscii(map,theme),back=ascii.asciiToMap(out.text,theme).map;
    assert.deepEqual(api.validateReferenceEditorMap(back,theme),[],`${name} re-imports as a valid map`);
    assert.deepEqual(normalized(back),normalized(map),`${name} instances round-trip`);
    assert.deepEqual(back.markers,map.markers);assert.deepEqual(back.worldBounds,map.worldBounds);
    assert(out.stats.glyphObjects>out.stats.placeLines,`${name} is mostly drawn, not listed`);
  }
});

test('an authored sketch compiles to the expected reference map',()=>{
  const {map,warnings}=ascii.asciiToMap(sample,theme);
  assert.deepEqual(warnings,[]);assert.deepEqual(api.validateReferenceEditorMap(map,theme),[]);
  assert.deepEqual(map.worldBounds,{x:0,y:0,w:64*16,h:14*16});
  const of=id=>map.instances.filter(i=>i.placeable===id);
  assert.equal(of('ground').length,3,'each floor is one merged rectangle');
  assert.deepEqual(of('ground').map(g=>[g.values['terrain.width'],g.values['terrain.height'],g.values['transform.x']-g.values['terrain.width']*8]),[[22,2,0],[12,2,416],[23,2,656]]);
  const pipes=of('pipe');assert.deepEqual(pipes.map(p=>[p.instanceId,p.values['pipe.direction'],p.values['pipe.length']]),[['pipe-A','up',2],['pipe-B','up',3]]);
  assert.deepEqual(pipes[0].values['pipe.destination'],{kind:'pipe',instanceId:'pipe-B'});assert.equal(pipes[0].values['pipe.travelEnabled'],true);assert.equal(pipes[1].values['pipe.travelEnabled'],false);
  assert.deepEqual(of('questionBlock').map(q=>[q.values['rewardBlock.contents'],q.values['rewardBlock.uses']]),[['coin',undefined],['growMushroom',3],['coin',undefined],['coin',undefined]]);
  const koopa=of('koopaGreen')[0];assert.equal(koopa.values['walker.direction'],'right');assert.equal(koopa.values['walker.patrolRange'],48);
  assert.equal(of('whitePlatform').find(p=>p.values['extent.width']===5).values['movingPlatform.range'],40);
  assert.deepEqual(of('hill')[0],{placeable:'hill',values:{'transform.x':64,'transform.y':176,'hill.shape':'small'},sceneLayer:'sky'});
  assert.deepEqual(map.markers,{start:{x:24,y:176},goal:{x:968,y:160}});
  const reach=api.simulateReachability(theme,map,map.markers.start);assert.equal(reach.goal.reachable,true,'the sketch is beatable');
});

test('sketch errors name the line or cell that caused them',()=>{
  const sketch=grid=>`@llmario-ascii 3\n\n${grid}\n`;
  assert.throws(()=>ascii.asciiToMap(sketch('..Q..'),theme),/line 3: unknown glyph "Q" at column 2/);
  assert.throws(()=>ascii.asciiToMap(sketch('PPPP\npppp'),theme),/exactly one 2-cell mouth/);
  assert.throws(()=>ascii.asciiToMap(sketch('.....')+'@at 9,9 walker.direction=right\n',theme),/@at 9,9 does not touch/);
  assert.throws(()=>ascii.asciiToMap(sketch('.g...\nXXXXX')+'@at 1,0 terrain.width=3\n',theme),/goomba has no authorable parameter "terrain.width"/);
  assert.throws(()=>ascii.asciiToMap('@llmario-ascii 2\n@cell 21\n\nX\n',theme),/v1\/v2 sketches belong to the archived editor/);
  assert.throws(()=>ascii.asciiToMap(sketch('S....\nXXXXX'),theme),/start marker .* needs a cell of clearance/);
  assert.throws(()=>ascii.asciiToMap(sketch('PP.\npp.')+'@pipe A -> C\n',theme),/no pipe C/);
  assert.throws(()=>ascii.asciiToMap(sketch('...')+'@place hill 1 1 layer=attic\n',theme),/unknown layer "attic"/);
  assert.equal(ascii.asciiToMap(sketch('...')+'@place hill 1 1 layer=background\n',theme).map.instances[0].sceneLayer,undefined,'a layer equal to the default is not an override');
});

test('odd-width objects snapped by the editor round-trip through dx shifts instead of @place',()=>{
  const map={format:'llmario-reference-editor-map',mapVersion:1,theme:{id:theme.id,packVersion:theme.packVersion},worldBounds:{x:0,y:0,w:320,h:160},markers:{start:null,goal:null},instances:[
    {placeable:'ground',values:{'transform.x':160,'transform.y':160,'terrain.width':20,'terrain.height':2,'terrain.style':'overground'}},
    {placeable:'solidBlock',values:{'transform.x':96,'transform.y':128,'solidBlock.style':'wood'}},
    {placeable:'solidBlock',values:{'transform.x':112,'transform.y':128,'solidBlock.style':'wood'}}]};
  const out=ascii.mapToAscii(map,theme);
  assert.equal(out.stats.placeLines,0);assert.equal(out.stats.shifted,1,'the minority lattice carries the shift');
  assert.deepEqual(normalized(ascii.asciiToMap(out.text,theme).map),normalized(map));
});

test('the CLI converts both ways using the codec embedded in the editor',()=>{
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'llmascii-')),mapFile=path.join(dir,'sample.llmmap.txt'),back=path.join(dir,'sample.txt');
  cp.execFileSync('node',['scripts/llmario_ascii.js','to-map','tests/fixtures/ascii_sample.llmascii.txt','-o',mapFile],{cwd:root,stdio:'pipe'});
  cp.execFileSync('node',['scripts/llmario_ascii.js','to-ascii',mapFile,'-o',back],{cwd:root,stdio:'pipe'});
  const first=JSON.parse(fs.readFileSync(mapFile,'utf8')),second=ascii.asciiToMap(fs.readFileSync(back,'utf8'),theme).map;
  assert.deepEqual(normalized(second),normalized(first));
  const report=cp.execFileSync('node',['scripts/reachability_report.js',mapFile],{cwd:root,encoding:'utf8'});
  assert.match(report,/goal reachable in \d+ move/);
});
