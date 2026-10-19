#!/usr/bin/env node
'use strict';
// Packs are a theme and a map in one file (the editor's Save pack). They split back into exactly the documents they
// were made from, using the editor's own unit/pack code.
// Usage: node scripts/llmario_pack.js join THEME MAP PACK
//        node scripts/llmario_pack.js split PACK THEME MAP
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');

function usage(message){if(message)console.error(message);console.error('usage: node scripts/llmario_pack.js join THEME MAP PACK | split PACK THEME MAP');process.exit(2)}
function loadUnits(){
  const html=fs.readFileSync(path.join(root,'editor/reference_pack_editor.html'),'utf8'),source=html.match(/<script id="unitPacks">([\s\S]*?)<\/script>/)[1],context={globalThis:{},structuredClone};
  vm.runInNewContext(source,context);return context.globalThis.ReferencePackUnits;
}
function readJson(file){try{return JSON.parse(fs.readFileSync(file,'utf8'))}catch(error){usage(`${file}: ${error.message}`)}}
function main(argv){
  const [command,...files]=argv,units=loadUnits();if(files.length!==3)usage();
  if(command==='join'){const [theme,map,pack]=files;fs.writeFileSync(pack,units.serialize(units.makePack(readJson(theme),readJson(map))));console.error(`wrote ${pack}`);return}
  if(command==='split'){const [pack,theme,map]=files,parts=units.splitPack(readJson(pack));if(parts.errors.length)usage(`${pack}: ${parts.errors.join('; ')}`);fs.writeFileSync(theme,units.serialize(parts.theme));fs.writeFileSync(map,units.serialize(parts.map));console.error(`wrote ${theme} and ${map}`);return}
  usage(`unknown command ${command??''}`);
}
if(require.main===module)main(process.argv.slice(2));
