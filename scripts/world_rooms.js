#!/usr/bin/env node
'use strict';
// Compiles world/rooms/*.llmroom.txt (an "@room" header line + an LLMario ASCII v3 sketch of a 40×20-cell chunk interior)
// into the room list the engine's world generator consumes. Uses the codec embedded in the canonical editor.
// Usage: node scripts/world_rooms.js [ROOM_DIR] [--theme THEME]   → JSON on stdout
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..'),ROOM_COLS=40,ROOM_ROWS=20,CELL=16,HOLE_LEFT=17,HOLE_WIDTH=6;

function embedded(file,id){
  const html=fs.readFileSync(path.join(root,file),'utf8'),match=html.match(new RegExp(`<script id="${id}">([\\s\\S]*?)<\\/script>`));
  if(!match)throw new Error(`${file} has no ${id} script`);const context={globalThis:{}};vm.runInNewContext(match[1],context);return context.globalThis;
}
function parseHeader(line,file){
  const m=line.match(/^@room\s+(.*)$/);if(!m)throw new Error(`${file}: first line must be "@room kind=plain|ascent [weight=N] [tags=a,b] [home] [solidfloor]"`);
  const header={kind:null,weight:1,tags:[],home:false,solidFloor:false};
  for(const token of m[1].trim().split(/\s+/)){
    if(token==='home')header.home=true;
    else if(token==='solidfloor')header.solidFloor=true;
    else if(/^kind=(plain|ascent)$/.test(token))header.kind=token.slice(5);
    else if(/^weight=\d+$/.test(token))header.weight=Number(token.slice(7));
    else if(/^tags=[a-z][a-z0-9]*(,[a-z][a-z0-9]*)*$/.test(token))header.tags=token.slice(5).split(',');
    else throw new Error(`${file}: unknown @room token "${token}"`);
  }
  if(!header.kind)throw new Error(`${file}: @room needs kind=plain or kind=ascent`);return header;
}
function overHole(engine,theme,map){
  // Anything standing on the floor across the hole columns (enemies and pickups aside: they just drop in) would hang over
  // the hole the generator may cut there. The hole is symmetric, so mirroring doesn't change the answer.
  const left=HOLE_LEFT*CELL,right=(HOLE_LEFT+HOLE_WIDTH)*CELL,floor=ROOM_ROWS*CELL,runtime=engine.compileReferenceRuntime(theme,map).runtime;
  return(runtime?.instances||[]).filter(i=>i.bounds&&i.engineNoun!=='walker'&&i.engineNoun!=='pickup'&&i.bounds.y+i.bounds.h===floor&&i.bounds.x<right&&i.bounds.x+i.bounds.w>left).map(i=>i.placeable);
}
function compileRooms(dir=path.join(root,'world/rooms'),theme=JSON.parse(fs.readFileSync(path.join(root,'themes/theme_marioai_reference_pack.llmtheme.txt'),'utf8'))){
  const ascii=embedded('editor/reference_pack_editor.html','llmarioAscii').LLMarioAscii,engine=embedded('engine/reference_pack_engine.html','referencePackBoundary').ReferencePackBoundary;
  const files=fs.readdirSync(dir).filter(name=>name.endsWith('.llmroom.txt')).sort();
  const rooms=files.map(name=>{
    const text=fs.readFileSync(path.join(dir,name),'utf8').replace(/\r/g,''),lines=text.split('\n'),header=parseHeader(lines[0],name);
    let map;try{map=ascii.asciiToMap(lines.slice(1).join('\n'),theme).map}catch(error){throw new Error(`${name}: ${error.message}`)}
    const b=map.worldBounds;if(b.x!==0||b.y!==0||b.w!==ROOM_COLS*CELL||b.h!==ROOM_ROWS*CELL)throw new Error(`${name}: the grid must be exactly ${ROOM_COLS}×${ROOM_ROWS} cells`);
    if(map.markers.start||map.markers.goal)throw new Error(`${name}: rooms have no start or goal markers`);
    const standing=header.solidFloor?[]:overHole(engine,theme,map);
    if(standing.length)throw new Error(`${name}: ${[...new Set(standing)].join(', ')} stands on the floor over the hole (cols ${HOLE_LEFT}–${HOLE_LEFT+HOLE_WIDTH-1}); move it or add solidfloor`);
    return{id:name.slice(0,-'.llmroom.txt'.length),...header,instances:JSON.parse(JSON.stringify(map.instances))};
  });
  if(rooms.filter(room=>room.home).length!==1)throw new Error('exactly one room must be marked home');
  if(!rooms.some(room=>room.kind==='ascent'))throw new Error('at least one ascent room is required');
  return{format:'llmario-world-rooms',version:1,rooms};
}
module.exports={compileRooms,ROOM_COLS,ROOM_ROWS,HOLE_LEFT,HOLE_WIDTH};
if(require.main===module){
  const args=process.argv.slice(2),themeIndex=args.indexOf('--theme'),theme=themeIndex>=0?JSON.parse(fs.readFileSync(args.splice(themeIndex,2)[1],'utf8')):undefined;
  try{process.stdout.write(JSON.stringify(compileRooms(args[0]?path.resolve(args[0]):undefined,theme))+'\n')}catch(error){console.error(error.message);process.exitCode=1}
}
