'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

const os=require('node:os'),root=path.resolve(__dirname,'..'),{compileRooms,HOLE_LEFT,HOLE_WIDTH}=require('../scripts/world_rooms.js');
const html=fs.readFileSync(path.join(root,'engine/reference_pack_engine.html'),'utf8'),theme=JSON.parse(fs.readFileSync(path.join(root,'themes/theme_marioai_reference_pack.llmtheme.txt'),'utf8'));
const boundary=html.match(/<script id="referencePackBoundary">([\s\S]*?)<\/script>/)[1],application=html.match(/<script>\s*([\s\S]*?)<\/script><\/body>/)[1];
const context={globalThis:{}};vm.runInNewContext(boundary,context);
const api=context.globalThis.ReferencePackBoundary,plain=value=>JSON.parse(JSON.stringify(value)),world=compileRooms();
const C=api.WORLD_CHUNK,W=C.cols*C.cell,H=C.rows*C.cell,FLOOR=C.interiorRows*C.cell;

test('rooms compile from ASCII with a header, one home, and ascent rooms',()=>{
  assert(world.rooms.length>=8);assert.equal(world.rooms.filter(room=>room.home).length,1);
  assert(world.rooms.some(room=>room.kind==='ascent')&&world.rooms.some(room=>room.kind==='plain'&&!room.home));
  for(const room of world.rooms)assert(room.instances.every(i=>i.values['transform.y']<=FLOOR),`${room.id} stays inside its 20-row interior`);
});

test('a room that stands something over the hole columns is refused unless it says solidfloor',()=>{
  assert.deepEqual([HOLE_LEFT,HOLE_WIDTH],[C.holeLeft,C.holeWidth],'compiler and generator agree on the hole');
  const dir=fs.mkdtempSync(path.join(os.tmpdir(),'rooms-')),blank='.'.repeat(40);
  const room=header=>[header,'@llmario-ascii 3','@cell 16','',...Array(19).fill(blank),'.'.repeat(18)+'XXXX'+'.'.repeat(18)].join('\n');
  try{
    fs.writeFileSync(path.join(dir,'home.llmroom.txt'),room('@room kind=plain home').replace(/X/g,'.'));
    fs.writeFileSync(path.join(dir,'stump.llmroom.txt'),room('@room kind=ascent'));
    assert.throws(()=>compileRooms(dir,theme),/stump\.llmroom\.txt: ground stands on the floor over the hole/);
    fs.writeFileSync(path.join(dir,'stump.llmroom.txt'),room('@room kind=ascent solidfloor'));
    assert.equal(compileRooms(dir,theme).rooms.length,2);
  }finally{fs.rmSync(dir,{recursive:true,force:true})}
});

test('the generator is a pure function of seed and chunk coordinates',()=>{
  const a=plain(api.worldChunk(world,1987,3,-2)),b=plain(api.worldChunk(world,1987,3,-2));
  assert.deepEqual(a,b,'same inputs, same chunk');
  const rooms=new Set(),mirrors=new Set();for(let x=-12;x<12;x++){const chunk=api.worldChunk(world,1987,x,1);rooms.add(chunk.room);mirrors.add(chunk.mirror)}
  assert(rooms.size>=5,'rooms vary across a row');assert.equal(mirrors.size,2,'some chunks are mirrored');
  assert.notDeepEqual(plain(api.worldWindowMap(theme,world,1,0,0).chunks),plain(api.worldWindowMap(theme,world,2,0,0).chunks),'seeds differ');
  assert(a.instances.every(i=>i.instanceId.startsWith('w3_-2_')),'ids are stable and chunk-scoped');
});

test('doors are shared, holes always land in ascent rooms, and solid-floor rooms never get holes',()=>{
  const solid=new Set(world.rooms.filter(room=>room.solidFloor).map(room=>room.id)),ascent=new Set(world.rooms.filter(room=>room.kind==='ascent').map(room=>room.id));
  for(let x=-15;x<15;x++)for(let y=-6;y<8;y++){
    const chunk=api.worldChunk(world,4417,x,y),below=api.worldChunk(world,4417,x,y+1);
    assert.equal(chunk.bottomOpen,below.topOpen);
    if(chunk.topOpen)assert(ascent.has(chunk.room),`(${x},${y}) under a hole is an ascent room`);
    if(chunk.bottomOpen)assert(!solid.has(chunk.room),`(${x},${y}) has a hole under a solid-floor room`);
  }
  const home=api.worldChunk(world,4417,0,0);assert.equal(world.rooms.find(room=>room.id===home.room).home,true);assert.equal(home.topOpen,false);assert.equal(home.bottomOpen,false);
});

test('a window is an ordinary valid reference map with seamless floors',()=>{
  const {map,chunks}=api.worldWindowMap(theme,world,1987,4,2);
  assert.equal(chunks.length,9);assert.deepEqual(plain(api.validateReferenceEditorMap(map,theme)),[]);
  assert.equal(api.compileReferenceRuntime(theme,map).ok,true);
  const floors=map.instances.filter(i=>i.instanceId.includes('floor'));
  for(const floor of floors)assert.equal(floor.values['transform.y']%H,0,'floors sit on chunk bottoms');
  assert(floors.some(floor=>floor.values['terrain.width']>C.cols),'touching floors merge across chunk edges');
});

test('every room passes the checker in its neighbourhood: floor both ways, with and without a hole, and up through the hole above',()=>{
  const ground=(id,left,width,ox,oy)=>({placeable:'ground',instanceId:id,values:{'transform.x':ox+(left+width/2)*C.cell,'transform.y':oy+H,'terrain.width':width,'terrain.height':C.rows-C.interiorRows,'terrain.style':'overground'}});
  const band=(tag,ox,oy,hole)=>hole?[ground(tag+'L',0,C.holeLeft,ox,oy),ground(tag+'R',C.holeLeft+C.holeWidth,C.cols-C.holeLeft-C.holeWidth,ox,oy)]:[ground(tag,0,C.cols,ox,oy)];
  const shift=(room,prefix,dy)=>room.instances.map((i,n)=>({...i,instanceId:prefix+n,values:{...i.values,'transform.y':i.values['transform.y']+dy}}));
  const landing=world.rooms.find(room=>room.kind==='ascent'&&!room.solidFloor);
  for(const room of world.rooms)for(const hole of room.solidFloor?[false]:[false,true]){
    const instances=[...shift(room,'r',0),...band('own',0,0,hole),...band('left',-W,0,false),...band('right',W,0,false)];
    if(room.kind==='ascent')instances.push(...band('up',0,-H,true));
    if(hole)instances.push(...shift(landing,'b',H),...band('below',0,H,false));
    const map={format:'llmario-reference-editor-map',mapVersion:1,theme:{id:theme.id,packVersion:theme.packVersion},worldBounds:{x:-W,y:-H,w:3*W,h:hole?3*H:2*H},instances,markers:{start:null,goal:null}};
    const result=plain(api.simulateReachability(theme,map,{x:-W+64,y:FLOOR},{maxSteps:3e6})),at=(x,y)=>result.spans.find(span=>span.y===y&&x>=span.x&&x<=span.x+span.w);
    const label=`${room.id}${hole?' with a hole':''}`;
    assert.equal(result.stats.truncated,false,label);assert.deepEqual(result.pockets,[],`${label} has no one-way pockets`);
    assert.notEqual(at(W+576,FLOOR).hop,null,`${label}: the floor runs through to the right`);
    if(room.kind==='ascent')assert.notEqual(at(64,FLOOR-H).hop,null,`${label}: climbs up through the hole above`);
    if(hole)assert.notEqual(at(64,FLOOR+H).hop,null,`${label}: drops through its own hole`);
  }
});

function harness(){
  const ctx={setTransform(){},save(){},restore(){},translate(){},scale(){},rotate(){},fillRect(){},fillText(){},drawImage(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(){},strokeRect(){},set fillStyle(v){},set strokeStyle(v){},set lineWidth(v){},set font(v){},set textAlign(v){},set textBaseline(v){},set imageSmoothingEnabled(v){},set globalAlpha(v){}};
  const elements={screen:{width:960,height:480,getContext:()=>ctx},stage:{getBoundingClientRect:()=>({width:960,height:480})},diagnostics:{textContent:'',className:''},empty:{hidden:false},themeButton:{},mapButton:{},fitButton:{},coinCount:{value:'',textContent:''},livesCount:{value:'',textContent:''},themeFile:{files:[],value:''},mapFile:{files:[],value:''}};
  class FakeImage{set src(value){this._src=value;this.onload?.()}get src(){return this._src}}
  const window={ReferencePackBoundary:api},frames=[];
  vm.runInNewContext(application,{window,document:{getElementById:id=>elements[id]},Image:FakeImage,devicePixelRatio:1,requestAnimationFrame(fn){frames.push(fn)},addEventListener(){},Map,Set,Math,Promise,console,structuredClone});
  return{engine:window.ReferenceEngine,frames};
}
async function worldEngine(seed){const {engine,frames}=harness();await engine.loadReferenceTheme(theme);assert.deepEqual(plain(engine.startWorld(world,{seed})),[]);let t=0;const run=(n,input=()=>({}))=>{for(let i=0;i<n;i++){const actions=input(engine.state.behavior.player,i);engine.state.input.clear();for(const [k,v] of Object.entries(actions))if(v)engine.state.input.add(k);frames.shift()(t+=16)}};return{engine,run}}

test('the window rolls with the player and carries speed across the rebuild',async()=>{
  const {engine,run}=await worldEngine(1987),s=engine.state;
  assert.deepEqual(plain(s.world.center),{cx:0,cy:0});
  const hop=(player,i)=>({right:true,run:true,jump:i%50<14});
  run(700,hop);
  assert(s.world.center.cx>=2,'running right crosses into later chunks');
  assert(Math.abs(s.behavior.player.vx)>4,'momentum survives rebuilds');
});

test('coins taken stay taken after their chunk leaves the window and comes back',async()=>{
  // A seed whose first two chunks east of home have solid floors, so the run there and back stays on one row.
  let seed=1;while(api.worldChunk(world,seed,1,0).bottomOpen||api.worldChunk(world,seed,2,0).bottomOpen)seed++;
  const {engine,run}=await worldEngine(seed),s=engine.state,idOf=pickup=>s.runtime.instances[pickup.authoredInstance].instanceId;
  const coin=s.powerupBehavior.powerups.find(p=>p.authoredInstance!==undefined&&idOf(p).startsWith('w0_0_'));
  assert(coin,'home has a coin');const id=idOf(coin);coin.taken=true;
  for(let i=0;i<60&&s.world.center.cx<2;i++)run(20,(player,k)=>({right:true,run:true,jump:k%20<8}));
  assert.equal(s.world.center.cx,2,'home has left the window');assert(!s.runtime.instances.some(i=>i.instanceId===id));
  for(let i=0;i<60&&s.world.center.cx>0;i++)run(20,(player,k)=>({left:true,run:true,jump:k%20<8}));
  assert.deepEqual(plain(s.world.center),{cx:0,cy:0},'walked back home');
  assert.equal(s.powerupBehavior.powerups.find(p=>p.authoredInstance!==undefined&&idOf(p)===id).taken,true);
});

test('drop through a hole, then jump back up through it from the ascent room below',async()=>{
  // Seed 1987: chunk (1,0) has a hole into (1,1).
  assert.equal(api.worldChunk(world,1987,1,0).bottomOpen,true);
  const {engine,run}=await worldEngine(1987),s=engine.state,p=()=>s.behavior.player;
  Object.assign(p(),{x:W+(C.holeLeft+C.holeWidth/2)*C.cell-12,y:FLOOR-40,vx:0,vy:0});run(120);
  assert.deepEqual(plain(s.world.center),{cx:1,cy:1},'fell into the chunk below');assert.equal(p().onGround,true);
  const ledgeY=p().y;assert(ledgeY<H+4*C.cell,'landed on the ascent ledge near the top of the chunk');
  // Like a player: step to just inside the hole's right edge, jump straight up, steer right after the apex.
  Object.assign(p(),{x:W+(C.holeLeft+C.holeWidth)*C.cell-26,vx:0});run(2);
  run(90,(player,i)=>({jump:i<24,right:i>4&&player.vy>=-1}));
  assert.deepEqual(plain(s.world.center),{cx:1,cy:0},'back in the chunk above');assert.equal(p().onGround,true);assert.equal(p().y+p().h,FLOOR);
});
