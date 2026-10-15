#!/usr/bin/env node
'use strict';
// LLMario ASCII v3 ⇄ reference editor map, using the codec embedded in the canonical editor.
// Usage:
//   node scripts/llmario_ascii.js to-map SKETCH.txt [-o OUT.llmmap.txt] [--theme THEME]
//   node scripts/llmario_ascii.js to-ascii MAP.llmmap.txt [-o OUT.txt] [--theme THEME]
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');

function usage(message){if(message)console.error(message);console.error('usage: node scripts/llmario_ascii.js to-map|to-ascii INPUT [-o OUTPUT] [--theme THEME]');process.exit(2)}
function load(id,file){
  const html=fs.readFileSync(path.join(root,file),'utf8'),match=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));if(!match)throw new Error(`${file} has no ${id} script`);
  const context={globalThis:{}};vm.runInNewContext(match[1],context);return context.globalThis;
}

const args=process.argv.slice(2),command=args.shift();let input=null,output=null,themePath=path.join(root,'themes/theme_marioai_reference_pack.llmtheme.txt');
for(let i=0;i<args.length;i++){if(args[i]==='-o')output=args[++i];else if(args[i]==='--theme')themePath=args[++i];else if(args[i].startsWith('-'))usage(`unknown option ${args[i]}`);else if(input)usage('one input at a time');else input=args[i]}
if(!['to-map','to-ascii'].includes(command)||!input)usage();
const ascii=load('llmarioAscii','editor/reference_pack_editor.html').LLMarioAscii,boundary=load('referencePackBoundary','engine/reference_pack_engine.html').ReferencePackBoundary;
const theme=JSON.parse(fs.readFileSync(themePath,'utf8')),text=fs.readFileSync(input,'utf8');
let result;
try{
  if(command==='to-map'){
    const {map,warnings}=ascii.asciiToMap(text,theme),errors=boundary.validateReferenceEditorMap(map,theme);
    for(const warning of warnings)console.error(`warning: ${warning}`);if(errors.length){console.error(errors.join('\n'));process.exit(1)}
    result=JSON.stringify(map,null,2)+'\n';console.error(`${map.instances.length} instances · world ${map.worldBounds.w}×${map.worldBounds.h}`);
  }else{
    const out=ascii.mapToAscii(JSON.parse(text),theme);result=out.text;
    console.error(`${out.stats.cols}×${out.stats.rows} cells · ${out.stats.glyphObjects} drawn · ${out.stats.placeLines} @place · ${out.stats.atLines} @at`);
  }
}catch(error){console.error(error.message);process.exit(1)}
if(output)fs.writeFileSync(output,result);else process.stdout.write(result);
