'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');

const os=require('node:os'),root=path.resolve(__dirname,'..'),{compileRooms,HOLE_LEFT,HOLE_WIDTH}=require('../scripts/world_rooms.js');
const html=fs.readFileSync(path.join(root,'engine/reference_pack_engine.html'),'utf8'),theme=JSON.parse(fs.readFileSync(path.join(root,'themes/theme_marioai_reference_pack.llmtheme.txt'),'utf8'));
const boundary=html.match(/<script id="referencePackBoundary">([\s\S]*?)<\/script>/)[1],application=html.match(/<script>\s*([\s\S]*?)<\/script><\/body>/)[1];
const context={globalThis:{}};vm.runInNewContext(boundary,context);
const api=context.globalThis.ReferencePackBoundary,plain=value=>JSON.parse(JSON.stringify(value)),world=compileRooms();
const C=api.WORLD_SCREEN,W=C.cols*C.cell,H=C.rows*C.cell,FLOOR=C.interiorRows*C.cell;

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

test('the generator is a pure function of seed and screen coordinates',()=>{
  const a=plain(api.worldScreen(world,1987,3,-2)),b=plain(api.worldScreen(world,1987,3,-2));
  assert.deepEqual(a,b,'same inputs, same screen');
  const rooms=new Set(),mirrors=new Set();for(let x=-12;x<12;x++){const screen=api.worldScreen(world,1987,x,1);rooms.add(screen.room);mirrors.add(screen.mirror)}
  assert(rooms.size>=5,'rooms vary across a row');assert.equal(mirrors.size,2,'some screens are mirrored');
  assert.notDeepEqual(plain(api.worldWindowMap(theme,world,1,0,0).screens),plain(api.worldWindowMap(theme,world,2,0,0).screens),'seeds differ');
  assert(a.instances.every(i=>i.instanceId.startsWith('w3_-2_')),'ids are stable and screen-scoped');
});

test('openings are shared: ground under an opening is a climbing room, and solid-floor rooms never get openings',()=>{
  const solid=new Set(world.rooms.filter(room=>room.solidFloor).map(room=>room.id)),ascent=new Set(world.rooms.filter(room=>room.kind==='ascent').map(room=>room.id));
  for(let x=-15;x<15;x++)for(let y=-6;y<8;y++){
    const screen=api.worldScreen(world,4417,x,y),below=api.worldScreen(world,4417,x,y+1);
    assert.equal(screen.bottomOpen&&below.mass==='ground',below.topOpen,`(${x},${y}) and the screen below agree on the opening`);
    if(screen.topOpen)assert(ascent.has(screen.room),`(${x},${y}) under an opening is an ascent room`);
    if(screen.bottomOpen)assert(!solid.has(screen.room),`(${x},${y}) has a hole under a solid-floor room`);
  }
  const home=api.worldScreen(world,4417,0,0);assert.equal(world.rooms.find(room=>room.id===home.room).home,true);assert.equal(home.topOpen,false);assert.equal(home.bottomOpen,false);
});

test('districts give regions a character: hole density, favoured rooms and swapped enemies',()=>{
  const tally={};
  for(let x=-200;x<200;x++)for(let y=-1;y<2;y++){
    const screen=api.worldScreen(world,77,x,y),t=tally[screen.district.id]??={screens:0,holes:0,rooms:{},walkers:{}};
    assert.equal(screen.district.id,api.worldDistrict(77,x,y).id);t.screens++;if(screen.bottomOpen)t.holes++;t.rooms[screen.room]=(t.rooms[screen.room]||0)+1;
    for(const i of screen.instances)if(theme.objects[theme.placeables[i.placeable].object].engineNoun==='walker')t.walkers[i.placeable]=(t.walkers[i.placeable]||0)+1;
  }
  assert.deepEqual(Object.keys(tally).sort(),plain(api.WORLD_DISTRICTS.map(d=>d.id).sort()),'every district shows up');
  const rate=id=>tally[id].holes/tally[id].screens,share=(id,room)=>(tally[id].rooms[room]||0)/tally[id].screens;
  assert(rate('warren')>rate('meadow')+0.1,'warrens are riddled with openings, meadows less so');
  assert(share('pipeworks','pipes')>2*share('meadow','pipes'),'pipeworks favour pipe rooms');
  assert(share('meadow','hills')>2*share('pipeworks','hills'),'meadows favour hills');
  assert(!tally.thorns.walkers.goomba&&tally.thorns.walkers.spiky,'thorns swap goombas for spikies');
  assert(!tally.pipeworks.walkers.goomba&&tally.pipeworks.walkers.koopaGreen,'pipeworks swap goombas for koopas');
  for(const [cx,cy] of [[0,0],[9,0],[-17,4],[30,-4]])assert.deepEqual(plain(api.validateReferenceEditorMap(api.worldWindowMap(theme,world,77,cx,cy).map,theme)),[],`window at ${cx},${cy} is valid`);
});

test('plots: only changed screens are saved, a plot file is a valid map, and saved screens replace generation',()=>{
  const rect={cx:2,cy:0,w:2,h:1},area=api.worldAreaMap(theme,world,1987,rect,{mergeFloors:false}).map;
  assert.deepEqual(plain(api.validateReferenceEditorMap(area,theme)),[]);
  assert.deepEqual(plain(api.worldSaveScreens(theme,world,1987,null,rect,area.instances).changed),[],'looking saves nothing');
  // Empty screen (2,0) completely and add a coin to (3,0).
  const edited=area.instances.filter(i=>api.worldAnchorScreen(i).cx!==2);edited.push({placeable:'coin',instanceId:'new',values:{'transform.x':3*W+100,'transform.y':200}});
  let saved=api.worldSaveScreens(theme,world,1987,null,rect,edited);
  assert.deepEqual(plain(saved.changed),['2,0','3,0']);
  const file=api.worldPlotFile(theme,1987,saved.plots);file.world.plots=[{id:'a',name:'Test',...rect}];
  assert.deepEqual(plain(api.validateReferenceEditorMap(file,theme)),[],'a plot file is an ordinary valid map');
  const plots=api.worldPlots(plain(file));assert.deepEqual([...plots.saved.keys()],['2,0','3,0']);assert.equal(plots.seed,1987);
  assert.deepEqual(plain(plots.saved.get('2,0')),[],'an emptied screen stays empty instead of regenerating');
  const win=api.worldWindowMap(theme,world,1987,2,0,null,1,plots);
  assert.deepEqual(plain(api.validateReferenceEditorMap(win.map,theme)),[]);assert.equal(api.compileReferenceRuntime(theme,win.map).ok,true);
  assert(!win.map.instances.some(i=>api.worldAnchorScreen(i).cx===2&&api.worldAnchorScreen(i).cy===0),'the emptied screen has nothing, not even generated floor');
  assert(win.map.instances.some(i=>i.placeable==='coin'&&i.values['transform.x']===3*W+100),'the added coin is there');
  // Re-saving what you were shown is a no-op; restoring a screen drops it back to generation.
  const shown=api.worldAreaMap(theme,world,1987,rect,{plots,mergeFloors:false}).map.instances;
  assert.deepEqual(plain(api.worldSaveScreens(theme,world,1987,plots,rect,shown).changed),[]);
  const restored=[...shown.filter(i=>api.worldAnchorScreen(i).cx!==2),...api.worldAreaMap(theme,world,1987,{cx:2,cy:0,w:1,h:1},{mergeFloors:false}).map.instances];
  saved=api.worldSaveScreens(theme,world,1987,plots,rect,restored);
  assert.deepEqual(plain(saved.changed),['2,0']);assert.deepEqual([...saved.plots.saved.keys()],['3,0']);
});

test('plots: terrain crossing screen seams is cut per screen when saved and stitched back together in play',()=>{
  // A 2-cell-wide wall running from the floor of screen (5,0) up through (5,-1) and (5,-2): 3 screens, one rectangle.
  const wall={placeable:'ground',instanceId:'wall',values:{'transform.x':5*W+16,'transform.y':FLOOR,'terrain.width':2,'terrain.height':60,'terrain.style':'underground'}};
  const pieces=api.worldSplitAtSeams([wall]);
  assert.equal(pieces.length,3,'one piece per screen');assert.equal(pieces.reduce((n,p)=>n+p.values['terrain.height'],0),60,'nothing lost');
  assert.deepEqual(plain(pieces.map(p=>api.worldAnchorScreen(p).cy)).sort((a,b)=>a-b),[-2,-1,0]);
  const file={format:api.REFERENCE_MAP_FORMAT,mapVersion:1,theme:{id:theme.id,packVersion:theme.packVersion},worldBounds:{x:5*W,y:-2*H,w:W,h:3*H},instances:[wall],markers:{start:null,goal:null},world:{seed:1987,screens:[[5,-2],[5,-1],[5,0]],plots:[]}};
  const plots=api.worldPlots(plain(file));
  for(const cy of [0,-1,-2,-3]){
    const win=api.worldWindowMap(theme,world,1987,5,cy,null,1,plots).map,walls=win.instances.filter(i=>i.values['terrain.style']==='underground'&&i.values['terrain.width']===2&&i.values['transform.x']===5*W+16);
    assert.equal(walls.length,1,`standing in (5,${cy}) the wall is one piece`);assert(walls[0].values['terrain.height']>=16,`and it is there from (5,${cy})`);
  }
  const shown=api.worldAreaMap(theme,world,1987,{cx:5,cy:-2,w:1,h:3},{plots,mergeFloors:false}).map.instances;
  assert.deepEqual(plain(api.worldSaveScreens(theme,world,1987,plots,{cx:5,cy:-2,w:1,h:3},shown).changed),[],'re-saving untouched pieces changes nothing');
});

test('generated screens close their doors on edges they share with a saved screen',()=>{
  let seed=1;while(!api.worldScreen(world,seed,4,0).bottomOpen)seed++;
  const plots={saved:new Map([['4,1',[]]])},above=api.worldScreen(world,seed,4,0,plots);
  assert.equal(above.bottomOpen,false,'no generated hole drops into a plot');
  let s2=1;while(!api.worldScreen(world,s2,4,1).topOpen)s2++;
  assert.equal(api.worldScreen(world,s2,4,1,{saved:new Map([['4,0',[]]])}).topOpen,false,'no generated room expects a climb from a plot');
  assert.equal(api.worldScreen(world,seed,4,1,plots).saved,true);
});

test('a window is an ordinary valid reference map with seamless floors',()=>{
  const {map,screens}=api.worldWindowMap(theme,world,1987,4,2);
  assert.equal(screens.length,9);assert.deepEqual(plain(api.validateReferenceEditorMap(map,theme)),[]);
  assert.equal(api.compileReferenceRuntime(theme,map).ok,true);
  const ground=map.instances.filter(i=>i.placeable==='ground'&&i.values['transform.y']%H===0);
  assert(ground.length,'ground stands on screen bottoms');
  assert(ground.some(g=>g.values['terrain.width']>C.cols),'touching ground of one style merges across screen edges');
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

test('any screen of a captured window promotes back into a room that regenerates the same screen',()=>{
  const {promoteScreen,checkRoom}=require('../scripts/world_room_from_map.js'),seen=new Set(),key=i=>JSON.stringify([i.placeable,Object.entries(i.values).sort()]).replace(/w-?\d+_-?\d+_pipe/g,'pipe').replace(/pipe-[A-Z]+/g,'pipe-X'); // two pipes wired to each other: the letters may swap, the wiring can't
  for(let x=-200;x<200&&seen.size<world.rooms.length;x++){
    const screen=api.worldScreen(world,1987,x,1);if(!world.rooms.some(room=>room.id===screen.room)||seen.has(screen.room))continue;seen.add(screen.room);
    const capture=plain(api.worldWindowMap(theme,world,1987,x,1,{x:x*W+100,y:H+FLOOR}).map),source=world.rooms.find(room=>room.id===screen.room);
    const text=promoteScreen(capture,theme,{header:`kind=${source.kind}${source.solidFloor?' solidfloor':''}`});
    const room=checkRoom(text,theme),expected=screen.instances.filter(i=>!(i.placeable==='ground'&&i.values['transform.y']-i.values['terrain.height']*C.cell>=H+FLOOR)).map(i=>({placeable:i.placeable,values:{...i.values,'transform.x':i.values['transform.x']-x*W,'transform.y':i.values['transform.y']-H}}));
    assert.deepEqual(plain(room.instances.map(key).sort()),plain(expected.map(key).sort()),`${screen.room}${screen.mirror?' (mirrored)':''} survives the round trip`);
  }
  assert(seen.size>=world.rooms.length-1,'covered every room but home');
});

function harness(){
  const clock={t:0};
  const ctx={setTransform(){},save(){},restore(){},translate(){},scale(){},rotate(){},fillRect(){},fillText(){},drawImage(){},clearRect(){},beginPath(){},moveTo(){},lineTo(){},stroke(){},fill(){},arc(){},strokeRect(){},set fillStyle(v){},set strokeStyle(v){},set lineWidth(v){},set font(v){},set textAlign(v){},set textBaseline(v){},set imageSmoothingEnabled(v){},set globalAlpha(v){}};
  const elements={screen:{width:960,height:480,getContext:()=>ctx},stage:{getBoundingClientRect:()=>({width:960,height:480})},diagnostics:{textContent:'',className:''},empty:{hidden:false},themeButton:{},mapButton:{},fitButton:{},coinCount:{value:'',textContent:''},livesCount:{value:'',textContent:''},themeFile:{files:[],value:''},mapFile:{files:[],value:''}};
  class FakeImage{set src(value){this._src=value;this.onload?.()}get src(){return this._src}}
  const window={ReferencePackBoundary:api},frames=[];
  vm.runInNewContext(application,{window,document:{getElementById:id=>elements[id]},Image:FakeImage,devicePixelRatio:1,requestAnimationFrame(fn){frames.push(()=>fn(clock.t+=1000/60))},addEventListener(){},Map,Set,Math,Promise,console,structuredClone});
  return{engine:window.ReferenceEngine,frames};
}
async function worldEngine(seed){const {engine,frames}=harness();await engine.loadReferenceTheme(theme);assert.deepEqual(plain(engine.startWorld(world,{seed})),[]);let t=0;const run=(n,input=()=>({}))=>{for(let i=0;i<n;i++){const actions=input(engine.state.behavior.player,i);engine.state.input.clear();for(const [k,v] of Object.entries(actions))if(v)engine.state.input.add(k);frames.shift()(t+=16)}};return{engine,run}}

test('the window rolls with the player and carries speed across the rebuild',async()=>{
  const {engine,run}=await worldEngine(1987),s=engine.state;
  assert.deepEqual(plain(s.world.center),{cx:0,cy:0});
  // Watch every frame: whenever the window rebuilds mid-run, the speed on either side of the rebuild is the same.
  const crossings=[];let before=null;
  for(let i=0;i<500&&s.world.center.cx<2;i++){
    const center=JSON.stringify(s.world.center);
    run(1,player=>{before={vx:player.vx};return{right:true,run:true,jump:i%50<14}});
    if(JSON.stringify(s.world.center)!==center)crossings.push({center:plain(s.world.center),vx:s.behavior.player.vx,before:before.vx});
  }
  assert(s.world.center.cx>=2,'running right crosses into later screens');
  assert(crossings.some(c=>Math.abs(c.vx)>4),'crossed at least once at running speed');
  for(const c of crossings)assert(Math.abs(c.vx)>=Math.abs(c.before)-0.5,`momentum survives the rebuild into ${JSON.stringify(c.center)}`);
});

test('coins taken stay taken after their screen leaves the window and comes back',async()=>{
  // A seed whose first two screens east of home have solid floors, so the run there and back stays on one row.
  let seed=1;while(api.worldScreen(world,seed,1,0).bottomOpen||api.worldScreen(world,seed,2,0).bottomOpen)seed++;
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
  // A seed where screen (1,0) has a plain hole into ground at (1,1), and neither screen has an enemy in the way.
  const calm=(seed,cx,cy)=>api.worldScreen(world,seed,cx,cy).instances.every(i=>theme.objects[theme.placeables[i.placeable].object].engineNoun!=='walker');
  let seed=1;while(api.worldScreen(world,seed,1,0).bottom!=='hole'||api.worldMass(seed,1,1)!=='ground'||!calm(seed,1,0)||!calm(seed,1,1))seed++;
  const {engine,run}=await worldEngine(seed),s=engine.state,p=()=>s.behavior.player;
  Object.assign(p(),{x:W+(C.holeLeft+C.holeWidth/2)*C.cell-12,y:FLOOR-40,vx:0,vy:0});run(120);
  assert.deepEqual(plain(s.world.center),{cx:1,cy:1},'fell into the screen below');assert.equal(p().onGround,true);
  const ledgeY=p().y;assert(ledgeY<H+4*C.cell,'landed on the ascent ledge near the top of the screen');
  // Like a player: step to just inside the hole's right edge, jump straight up, steer right after the apex.
  Object.assign(p(),{x:W+(C.holeLeft+C.holeWidth)*C.cell-26,vx:0});run(2);
  run(90,(player,i)=>({jump:i<24,right:i>4&&player.vy>=-1}));
  assert.deepEqual(plain(s.world.center),{cx:1,cy:0},'back in the screen above');assert.equal(p().onGround,true);assert.equal(p().y+p().h,FLOOR);
});

test('regions have characters: plain runs of ground, broken floors, open sky, deep rock; flat ground always gets a room',()=>{
  const tally={};let roomless=0;
  for(let x=-120;x<120;x++)for(let y=-4;y<6;y++){
    const s=api.worldScreen(world,31,x,y),t=tally[s.region]??={n:0,solid:0,air:0,rock:0};t.n++;if(s.bottom==='solid')t.solid++;if(s.mass==='air')t.air++;if(s.mass==='rock')t.rock++;
    if(s.mass==='ground'&&!s.room)roomless++;
  }
  const share=(k,f)=>tally[k][f]/tally[k].n;
  assert(share('plain','solid')>.8&&share('plain','air')===0,'plain regions are long runs of solid ground');
  assert(share('broken','solid')<.6,'broken regions open up often');
  assert(share('open','air')>.4,'open regions are mostly sky');
  assert(share('deep','rock')>.4,'deep regions are mostly rock');
  assert.equal(roomless,0,'every ground screen got a room or a shape');
});

test('rock never runs more than two screens, side-by-side rock differs in kind, and every kind is crossable',()=>{
  const kinds={},runs=[];let run=0,previous=null,pairs=0;
  for(const seed of [1,1987])for(let y=2;y<8;y++){run=0;previous=null;for(let x=-150;x<150;x++){
    if(api.worldMass(seed,x,y)!=='rock'){runs.push(run);run=0;previous=null;continue}
    const s=api.worldScreen(world,seed,x,y);run++;kinds[s.room]=(kinds[s.room]||0)+1;if(previous){pairs++;assert.notEqual(s.room,previous,`rock ${seed}:${x},${y} repeats its neighbour's kind`)}previous=s.room}}
  assert(Math.max(...runs)<=2&&pairs>50,`at most two rock screens in a row (${pairs} pairs)`);
  assert.deepEqual(Object.keys(kinds).sort(),['chamber','hops','tunnel']);
  const chamber=api.worldScreen(world,1987,-36,3);assert.equal(chamber.room,'chamber');
  assert.equal(chamber.instances.filter(i=>i.placeable==='whitePlatform').length,2,'a chamber has platforms up to its prize');
  assert(chamber.instances.some(i=>i.placeable==='questionBlock')&&chamber.instances.filter(i=>i.placeable==='coin').length===3);
  // A runner holding right (and jumping when blocked) gets through every kind, start to end.
  const tried={};
  for(let x=-40;x<40&&Object.keys(tried).length<3*4;x++)for(let y=2;y<6;y++){
    if(api.worldMass(1987,x,y)!=='rock')continue;const kind=api.worldScreen(world,1987,x,y).room;if((tried[kind]||0)>=4)continue;tried[kind]=(tried[kind]||0)+1;
    const hl=api.worldEdge(1987,x-1,y),hr=api.worldEdge(1987,x,y),{map}=api.worldAreaMap(theme,world,1987,{cx:x,cy:y,w:1,h:1},{});map.worldBounds.w+=64;
    map.instances.push({placeable:'ground',instanceId:'strip',values:{'transform.x':x*W+W+32,'transform.y':y*H+H,'terrain.width':4,'terrain.height':24-hr,'terrain.style':'underground'}});map.markers.start={x:x*W+16,y:y*H+hl*16};
    const runtime=api.compileReferenceRuntime(theme,map).runtime,b=api.createPlayerBehavior(runtime),p=b.player;let stuck=0,jump=0,last=p.x;
    for(let i=0;i<1500&&p.x<x*W+W+10;i++){if(jump>0)jump--;else if(stuck>6){jump=22;stuck=0}b.step({right:true,run:true,jump:jump>0&&jump<21});stuck=Math.abs(p.x-last)<.5?stuck+1:0;last=p.x}
    assert(p.x>=x*W+W+10,`${kind} at ${x},${y} can be run through (stopped at ${Math.round(p.x-x*W)})`);
  }
  assert.deepEqual(Object.keys(tried).sort(),['chamber','hops','tunnel']);
});

test('in the world, enemies walk only on ground: patrols stop at gaps and walls, and an enemy over a gap moves or goes',()=>{
  const seen=new Set();let moved=0,dropped=0,active=0;
  for(let cy=-2;cy<5;cy++)for(let cx=-24;cx<24;cx+=3){
    const runtime=api.compileReferenceRuntime(theme,api.worldWindowMap(theme,world,1987,cx,cy).map).runtime,behavior=api.createActorBehavior(runtime,null,{grounded:true}),surfaces=[...runtime.surfaces.solid,...runtime.surfaces.solidTop];
    for(const a of behavior.actors){const id=a.instance.instanceId;if(seen.has(id)||a.flying)continue;seen.add(id);if(!a.active){dropped++;continue}active++;if(a.x!==a.instance.transform.x)moved++;
      const under=px=>surfaces.some(s=>Math.abs(s.y-a.y)<=1&&s.x<=px&&s.x+s.w>=px);
      for(let px=a.min;px<=a.max;px+=2)assert(under(px-6)&&under(px+6),`${id} walks on air at ${px}`);
      for(let i=0;i<400;i++)behavior.step(null,null);if(a.mode==='walking')assert(a.x>=a.min&&a.x<=a.max&&under(a.x),`${id} stays on its ground`);}
  }
  assert(active>100&&moved>0&&dropped>0,`some enemies were moved (${moved}) or dropped (${dropped}) of ${active}`);
  // Outside the world nothing changes: an authored map keeps its patrol as written.
  const map={format:api.REFERENCE_MAP_FORMAT,mapVersion:1,theme:{id:theme.id,packVersion:theme.packVersion},worldBounds:{x:0,y:0,w:640,h:384},instances:[{placeable:'goomba',instanceId:'g',values:{'transform.x':200,'transform.y':100,'walker.direction':'left','walker.patrolRange':40}}],markers:{start:null,goal:null}};
  const authored=api.createActorBehavior(api.compileReferenceRuntime(theme,map).runtime).actors[0];assert.deepEqual([authored.active,authored.min,authored.max],[true,160,240]);
  // A flying enemy that loses its wings falls to the real ground below and walks only there.
  map.instances=[{placeable:'koopaRed',instanceId:'k',values:{'transform.x':200,'transform.y':100,'walker.direction':'left','walker.patrolRange':48,'flight.hasWings':true,'flight.flying':true}},{placeable:'ground',instanceId:'f',values:{'transform.x':216,'transform.y':384,'terrain.width':4,'terrain.height':4,'terrain.style':'overground'}}];
  const runtime=api.compileReferenceRuntime(theme,map).runtime,behavior=api.createActorBehavior(runtime,null,{grounded:true}),k=behavior.actors[0],floor=runtime.surfaces.solid[0];
  assert.equal(k.active,true,'flying enemies are placed in the air');
  Object.assign(k,{flying:false,falling:true,vy:0});k.state.winged=false;for(let i=0;i<120;i++)behavior.step(null,null);
  assert.equal(k.y,floor.y,'it lands on the ground below, not back at its old height');assert(k.min>=floor.x+6&&k.max<=floor.x+floor.w-6,'and patrols only that ground');
});

test('every generated screen can be crossed both ways, directly or down and back up through its floor',()=>{
  const side=(x,y,h,tag)=>({placeable:'ground',instanceId:tag,values:{'transform.x':x*W+W/2,'transform.y':y*H+H,'terrain.width':40,'terrain.height':24-h,'terrain.style':'overground'}});
  const failures=[];let viaBelow=0;
  for(let x=-6;x<6;x++)for(let y=-2;y<3;y++){
    const s=api.worldScreen(world,7,x,y),hl=api.worldEdge(7,x-1,y),hr=api.worldEdge(7,x,y);
    const map={format:api.REFERENCE_MAP_FORMAT,mapVersion:1,theme:{id:theme.id,packVersion:theme.packVersion},worldBounds:{x:(x-1)*W,y:(y-1)*H,w:3*W,h:3*H},instances:[...s.instances,side(x-1,y,hl,'L'),side(x+1,y,hr,'R')],markers:{start:null,goal:null}};
    const go=(fx,fh,tx,th)=>{const r=plain(api.simulateReachability(theme,map,{x:fx,y:y*H+fh*16},{maxSteps:2e6}));return r.spans.some(sp=>sp.hop!=null&&sp.y===y*H+th*16&&tx>=sp.x&&tx<=sp.x+sp.w)};
    const both=()=>go((x-1)*W+64,hl,(x+1)*W+560,hr)&&go((x+1)*W+560,hr,(x-1)*W+64,hl);
    if(both())continue;
    if(s.bottomOpen){map.instances.push(...api.worldScreen(world,7,x,y+1).instances);if(both()){viaBelow++;continue}}
    failures.push(`${x},${y} ${s.mass}/${s.room}`);
  }
  assert.deepEqual(failures,[],'screens that cannot be crossed');
});

test('windows across regions have no one-way pockets',()=>{
  for(const [seed,cx,cy] of [[7,5,1],[1987,3,0],[4417,-5,2],[31,9,-2]]){
    const {map}=api.worldWindowMap(theme,world,seed,cx,cy),start={x:cx*W+40,y:cy*H+api.worldEdge(seed,cx-1,cy)*16};
    const r=plain(api.simulateReachability(theme,map,start,{maxSteps:5e6}));
    assert.equal(r.stats.truncated,false);
    // A pocket touching the window's edge may lead on outside it; only enclosed ones are traps.
    const enclosed=r.pockets.filter(p=>p.spans.every(id=>{const sp=r.spans[id];return sp.x>map.worldBounds.x+16&&sp.x+sp.w<map.worldBounds.x+map.worldBounds.w-16&&sp.y>map.worldBounds.y+64}));
    assert.deepEqual(enclosed.map(p=>p.spans.map(id=>`${r.spans[id].x},${r.spans[id].y}`).join(' ')),[],`seed ${seed} window at ${cx},${cy}`);
  }
});
