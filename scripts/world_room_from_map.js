#!/usr/bin/env node
'use strict';
// Promotes one screen of a captured World map (Editor while exploring → refine → save) into a world room sketch.
// Usage: node scripts/world_room_from_map.js CAPTURE.llmmap.txt [--screen CX,CY] [--header "kind=plain tags=hills"] [-o world/rooms/NAME.llmroom.txt]
// The screen defaults to the one holding the map's start marker (where you stood). The generator-owned floor band is left
// out; everything else in the screen's 40×20 interior becomes the room. The result is compiled before it is written.
const fs=require('node:fs'),os=require('node:os'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),{compileRooms,ROOM_COLS,ROOM_ROWS}=require('./world_rooms.js'),CELL=16,SCREEN_ROWS=24;

function embedded(file,id){const html=fs.readFileSync(path.join(root,file),'utf8'),context={globalThis:{}};vm.runInNewContext(html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`))[1],context);return context.globalThis}
function promoteScreen(map,theme,{screen,header='kind=plain'}={}){
  const engine=embedded('engine/reference_pack_engine.html','referencePackBoundary').ReferencePackBoundary,ascii=embedded('editor/reference_pack_editor.html','llmarioAscii').LLMarioAscii;
  const W=ROOM_COLS*CELL,H=SCREEN_ROWS*CELL,FLOOR=ROOM_ROWS*CELL,start=map.markers?.start;
  if(!screen){if(!start)throw new Error('the map has no start marker; pass --screen CX,CY');screen=engine.worldScreenAt(start.x,start.y-1)}
  const x0=screen.cx*W,y0=screen.cy*H,inside=i=>{const x=i.values['transform.x'],y=i.values['transform.y'];return x>=x0&&x<x0+W&&y>y0&&y<=y0+FLOOR};
  const floorBand=i=>i.placeable==='ground'&&i.values['transform.y']-(i.values['terrain.height']||0)*CELL>=y0+FLOOR;
  const picked=map.instances.filter(i=>!floorBand(i)&&inside(i)),ids=new Set(picked.map(i=>i.instanceId).filter(Boolean));
  const instances=picked.map(source=>{
    const values=JSON.parse(JSON.stringify(source.values)),out={placeable:source.placeable,values};
    values['transform.x']-=x0;values['transform.y']-=y0;
    const d=values['pipe.destination'];
    if(d?.kind==='pipe'&&!ids.has(d.instanceId))throw new Error(`a pipe leads to ${d.instanceId}, outside this screen; rooms can only wire pipes inside themselves`);
    if(d?.kind==='point'){values['pipe.destination']={kind:'point',x:d.x-x0,y:d.y-y0};if(d.x<x0||d.x>x0+W||d.y<y0||d.y>y0+FLOOR)throw new Error('a pipe leads to a point outside this screen')}
    if(source.instanceId)out.instanceId=source.instanceId;if(source.sceneLayer)out.sceneLayer=source.sceneLayer;return out;
  });
  const room={format:map.format,mapVersion:map.mapVersion,theme:map.theme,worldBounds:{x:0,y:0,w:W,h:FLOOR},instances,markers:{start:null,goal:null}};
  const runtime=engine.compileReferenceRuntime(theme,{...room,worldBounds:{x:-W,y:-H,w:3*W,h:3*H}}).runtime;
  const spill=(runtime?.instances||[]).filter(i=>i.bounds.x<0||i.bounds.y<0||i.bounds.x+i.bounds.w>W||i.bounds.y+i.bounds.h>FLOOR).map(i=>i.placeable);
  if(spill.length)throw new Error(`${[...new Set(spill)].join(', ')} spills out of the screen's 40×20 interior; trim it in the editor first`);
  return`@room ${header}\n${ascii.mapToAscii(room,theme).text.replace(/\n*$/,'\n')}`;
}
function checkRoom(text,theme){
  // Compile it alongside the real rooms, so the room compiler's rules (grid size, nothing over the hole) apply.
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'room-')),rooms=path.join(root,'world/rooms');
  try{for(const name of fs.readdirSync(rooms))fs.copyFileSync(path.join(rooms,name),path.join(dir,name));fs.writeFileSync(path.join(dir,'promoted.llmroom.txt'),text);try{return compileRooms(dir,theme).rooms.find(room=>room.id==='promoted')}catch(error){throw new Error(error.message.replace('promoted.llmroom.txt','this screen'))}}
  finally{fs.rmSync(dir,{recursive:true,force:true})}
}
module.exports={promoteScreen,checkRoom};
if(require.main===module){
  const args=process.argv.slice(2),take=flag=>{const i=args.indexOf(flag);return i<0?undefined:args.splice(i,2)[1]};
  const out=take('-o'),screenArg=take('--screen'),header=take('--header'),file=args[0];
  try{
    if(!file)throw new Error('usage: world_room_from_map.js CAPTURE.llmmap.txt [--screen CX,CY] [--header "kind=plain"] [-o OUT]');
    const theme=JSON.parse(fs.readFileSync(path.join(root,'themes/theme_marioai_reference_pack.llmtheme.txt'),'utf8')),map=JSON.parse(fs.readFileSync(file,'utf8'));
    const screen=screenArg?(([cx,cy])=>({cx,cy}))(screenArg.split(',').map(Number)):undefined,text=promoteScreen(map,theme,{screen,header});
    checkRoom(text,theme);
    if(out){fs.writeFileSync(out,text);console.error(`wrote ${out}; run node --test tests/world.test.js to put it through the reachability checks`)}else process.stdout.write(text);
  }catch(error){console.error(error.message);process.exitCode=1}
}
