'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('engine/reference_pack_engine.html','utf8');
const legacy=fs.readFileSync('engine/engine.html','utf8');
const theme=JSON.parse(fs.readFileSync('themes/theme_marioai_reference_pack.llmtheme.txt','utf8'));
const fixture=JSON.parse(fs.readFileSync('tests/fixtures/reference_static_scene.llmmap.txt','utf8'));
const boundarySource=html.match(/<script id="referencePackBoundary">([\s\S]*?)<\/script>/)[1];
const applicationSource=html.match(/<script>\s*([\s\S]*?)<\/script><\/body>/)[1];
const context={globalThis:{}};
vm.runInNewContext(boundarySource,context);
const api=context.globalThis.ReferencePackBoundary;
const plain=value=>JSON.parse(JSON.stringify(value));
const validMap={format:'llmario-reference-editor-map',mapVersion:1,theme:{id:theme.id,packVersion:theme.packVersion},instances:[],markers:{start:null,goal:null}};

function engineHarness(){
  const operations={fillRect:0,drawImage:0,drawCalls:[],translates:[],scales:[]};
  const frames=[];
  const ctx={setTransform(){},save(){},restore(){},translate(...args){operations.translates.push(args)},scale(...args){operations.scales.push(args)},rotate(){},fillRect(){operations.fillRect++},drawImage(...args){operations.drawImage++;operations.drawCalls.push(args)}};
  const elements={
    screen:{width:960,height:480,getContext:()=>ctx},stage:{getBoundingClientRect:()=>({width:960,height:480})},diagnostics:{textContent:'',className:''},empty:{hidden:false},
    themeButton:{},mapButton:{},fitButton:{},themeFile:{files:[],value:''},mapFile:{files:[],value:''}
  };
  class FakeImage{set src(value){this._src=value;this.onload?.()}get src(){return this._src}}
  const window={ReferencePackBoundary:api};
  const domContext={window,document:{getElementById:id=>elements[id]},Image:FakeImage,devicePixelRatio:1,requestAnimationFrame(fn){frames.push(fn)},addEventListener(){},Map,Set,Math,Promise,console};
  vm.runInNewContext(applicationSource,domContext);
  return{engine:window.ReferenceEngine,elements,operations,frames};
}

test('compiles the actual reference theme and representative editor map',()=>{
  const result=api.compileReferenceRuntime(theme,fixture);
  assert.equal(result.ok,true);
  assert.equal(result.runtime.format,'llmario-reference-static-runtime');
  assert.equal(result.runtime.instances.length,fixture.instances.length);
  assert(result.runtime.drawCommands.length>fixture.instances.length);
  assert(result.runtime.drawCommands.every(command=>theme.atlases[command.atlas]&&command.sourceRect));
});

test('orders all five declared layers and resolves default and override layers',()=>{
  const runtime=api.compileReferenceRuntime(theme,fixture).runtime;
  assert.deepEqual(plain(runtime.layers),['sky','background','world','actors','foreground']);
  const used=runtime.drawCommands.map(x=>x.layer);
  assert.deepEqual([...new Set(used)],['sky','background','world','actors','foreground']);
  assert.equal(runtime.instances.find(x=>x.placeable==='goomba').layer,'actors');
  assert.equal(runtime.instances.find(x=>x.placeable==='arrowSign').layer,'foreground');
});

test('resolves atlas rectangles and deterministic animation initial frames',()=>{
  const runtime=api.compileReferenceRuntime(theme,fixture).runtime;
  const actor=runtime.instances.find(x=>x.placeable==='goomba');
  assert.equal(actor.target.kind,'animation');
  assert.equal(actor.target.animation.id,'enemy.goomba.walk');
  assert.equal(actor.target.animation.initialFrame,0);
  assert.equal(actor.target.animation.frames[0].resource.id,theme.animations['enemy.goomba.walk'].frames[0].resource);
  const command=actor.drawCommands[0],resource=theme.resources[command.resource];
  assert.deepEqual(plain(command.sourceRect),resource.image.rect);
  assert.equal(command.atlas,resource.image.atlas);
});

test('authored actor animations advance deterministically at declared cadence and loop',()=>{
  const timedTheme=plain(theme),animation=timedTheme.animations['enemy.goomba.walk'];
  animation.frameTiming={ticksPerFrame:3};animation.loop=true;
  timedTheme.objects.spiky.visuals.walk=timedTheme.animations['enemy.spiky.walk'].frames[0].resource;
  const map={...validMap,instances:[
    {placeable:'goomba',values:{'transform.x':64,'transform.y':96,'walker.direction':'left','walker.patrolRange':0}},
    {placeable:'spiky',values:{'transform.x':128,'transform.y':96,'walker.direction':'right','walker.patrolRange':0}}
  ]};
  const runtime=api.compileReferenceRuntime(timedTheme,map).runtime,animated=runtime.drawCommands.find(c=>c.placeable==='goomba'),staticActor=runtime.drawCommands.find(c=>c.placeable==='spiky');
  const at0=api.commandAtTick(animated,0),at3=api.commandAtTick(animated,3),at6=api.commandAtTick(animated,6),again=api.commandAtTick(animated,3);
  assert.equal(at0.resource,animation.frames[0].resource,'tick zero uses the declared first frame');
  assert.equal(at3.resource,animation.frames[1].resource,'declared cadence advances to the next ordered frame');
  assert.equal(at6.resource,animation.frames[0].resource,'looping returns to the first frame');
  assert.deepEqual(plain(again),plain(at3),'the same tick always resolves the same frame');
  for(const next of [at0,at3,at6])assert.deepEqual(
    {worldX:next.worldX,worldY:next.worldY,w:next.w,h:next.h,anchorX:next.anchorX,anchorY:next.anchorY,rotation:next.rotation,mirror:next.mirror,layer:next.layer},
    {worldX:animated.worldX,worldY:animated.worldY,w:animated.w,h:animated.h,anchorX:animated.anchorX,anchorY:animated.anchorY,rotation:animated.rotation,mirror:animated.mirror,layer:animated.layer},
    'animation frames retain the actor bounds, anchor, transform, and layer');
  assert.strictEqual(api.commandAtTick(staticActor,99),staticActor,'static actor visuals remain unchanged');
});


test('authored patrol actors retain their range, move at legacy speed, reverse, and mirror',()=>{
  const map={...validMap,instances:[
    {placeable:'koopaRed',values:{'transform.x':100,'transform.y':96,'walker.direction':'right','walker.patrolRange':1.2}},
    {placeable:'goomba',values:{'transform.x':160,'transform.y':96,'walker.direction':'left','walker.patrolRange':0}},
    {placeable:'coin',values:{'transform.x':220,'transform.y':96}}
  ]};
  const runtime=api.compileReferenceRuntime(theme,map).runtime,koopa=runtime.instances[0];
  assert.equal(koopa.values['walker.patrolRange'],1.2,'authored world-unit range survives compilation');
  const behavior=api.createActorBehavior(runtime),actor=behavior.actors[0],command=runtime.drawCommands.find(item=>item.instanceIndex===0);
  assert.equal(behavior.actors.filter(item=>item.range>0).length,1,'only actors with a positive authored range move');
  assert.equal(actor.speed,.4,'walker uses the established old-engine speed');
  behavior.step();assert.equal(actor.x,100.4);assert.equal(actor.direction,1);assert.equal(actor.mirror,false);
  behavior.step();behavior.step();assert.equal(actor.x,101.2);assert.equal(actor.direction,-1);assert.equal(actor.mirror,true,'right endpoint reverses and faces left');
  const frameBefore=behavior.commandAt(command,0),frameAfter=behavior.commandAt(command,8);
  assert.notEqual(frameBefore.resource,frameAfter.resource,'walking animation advances while patrol movement is active');
  assert.equal(frameAfter.worldX,actor.x);assert.equal(frameAfter.mirror,true);
  for(let i=0;i<6;i++)behavior.step();
  assert.equal(actor.x,98.8);assert.equal(actor.direction,1);assert.equal(actor.mirror,false,'left endpoint reverses and faces right');
  assert.equal(runtime.drawCommands.find(item=>item.instanceIndex===1).worldX,160,'zero-range actor stays at its authored transform');
  assert.equal(runtime.drawCommands.find(item=>item.instanceIndex===2).worldX,220,'actor without patrol capability stays static');
});



test('wing attachments honor enablement, authored offsets, mirroring, animation, and reset',()=>{
  const wingMap=(hasWings,flying=hasWings)=>({...validMap,instances:[{placeable:'koopaRed',values:{'transform.x':100,'transform.y':120,'walker.direction':'right','walker.patrolRange':8,'flight.hasWings':hasWings,'flight.flying':flying}}]});
  const plainRuntime=api.compileReferenceRuntime(theme,wingMap(false)).runtime;
  assert.equal(plainRuntime.drawCommands.filter(command=>command.attachment).length,0,'disabled presentation data emits no wings');
  const visibleRuntime=api.compileReferenceRuntime(theme,wingMap(true,false)).runtime,visibleBehavior=api.createActorBehavior(visibleRuntime),visibleY=visibleBehavior.actors[0].y;
  visibleBehavior.step();assert.equal(visibleBehavior.actors[0].y,visibleY,'visible wings do not imply flight behavior');
  assert.equal(visibleRuntime.drawCommands.filter(command=>command.attachment).length,2);
  const runtime=api.compileReferenceRuntime(theme,wingMap(true,true)).runtime,attachments=runtime.drawCommands.filter(command=>command.attachment);
  assert.equal(attachments.length,2,'enabled attachment resolves both authored wing copies');
  assert.deepEqual(plain(attachments.map(command=>({x:command.rawOffsetX,y:command.rawOffsetY,mirror:command.attachmentMirror}))),[
    {x:-6.72,y:-14.72,mirror:false},{x:6.72,y:-14.72,mirror:true}
  ]);
  assert(attachments.every(command=>command.attachmentLayer==='behind'&&command.order<0));
  const behavior=api.createActorBehavior(runtime),actor=behavior.actors[0],startY=actor.y;
  behavior.step();
  assert.equal(actor.x,100.4,'flying retains horizontal patrol');
  assert.notEqual(actor.y,startY,'flying applies the established vertical phase motion');
  const left=behavior.commandAt(attachments[0],0);for(let i=0;i<7;i++)behavior.step();const right=behavior.commandAt(attachments[1],0);
  assert.equal(left.worldOffsetX,-6.72);assert.equal(right.worldOffsetX,6.72);
  assert.equal(left.mirror,false);assert.equal(right.mirror,true);
  assert.notEqual(left.resource,right.resource,'wing animation advances at its declared cadence');
  behavior.reset();
  assert.equal(behavior.commandAt(attachments[0],99).resource,theme.animations['enemy.wing.flap'].frames[0].resource,'reset restarts wing animation');
  assert.deepEqual({x:actor.x,y:actor.y,direction:actor.direction,winged:actor.winged,flying:actor.flying,phase:actor.wingPhase,state:actor.state},
    {x:100,y:120,direction:1,winged:true,flying:true,phase:0,state:'walking'});
});

test('relative stomp contacts defeat stompables and route harmful contacts through death',()=>{
  const enemyMap=placeable=>({...validMap,instances:[{placeable,values:{'transform.x':100,'transform.y':120,'walker.direction':'left','walker.patrolRange':16}}]});
  const goombaRuntime=api.compileReferenceRuntime(theme,enemyMap('goomba')).runtime;
  const playerBehavior=api.createPlayerBehavior({playerSpawn:{x:7,y:9},bounds:null,surfaces:{solid:[],solidTop:[]}}),goombas=api.createActorBehavior(goombaRuntime,playerBehavior),goomba=goombas.actors[0],box=goombas.actorBox(goomba);
  Object.assign(playerBehavior.player,{x:box.x,y:box.y-12,vy:5});
  const stomp=goombas.collide(playerBehavior.player,{x:box.x,y:box.y-24});
  assert.equal(stomp.type,'stomp');assert.equal(goomba.state,'defeated');assert.equal(goomba.collisionEligible,false);
  const stoppedX=goomba.x;goombas.step();assert.equal(goomba.x,stoppedX,'defeated actors stop ordinary patrol');
  for(let i=0;i<17;i++)goombas.step();
  assert.equal(goomba.active,false,'squash presentation completes and removes the actor');
  assert.equal(goombas.commandAt(goombaRuntime.drawCommands[0],99),null,'completed defeat no longer renders or collides');

  const spikyRuntime=api.compileReferenceRuntime(theme,enemyMap('spiky')).runtime,spikies=api.createActorBehavior(spikyRuntime,playerBehavior),spiky=spikies.actors[0],spikyBox=spikies.actorBox(spiky);
  Object.assign(playerBehavior.player,{x:spikyBox.x,y:spikyBox.y-12,vy:5});
  const hazard=spikies.collide(playerBehavior.player,{x:spikyBox.x,y:spikyBox.y-24});
  assert.equal(hazard.type,'hurt');assert.equal(spiky.state,'walking','stomp hazards are never defeated');
  assert.equal(playerBehavior.player.dead,true,'stomp hazards enter the shared death transition');

  const sidePlayers=api.createPlayerBehavior({playerSpawn:{x:3,y:4},bounds:null,surfaces:{solid:[],solidTop:[]}}),sides=api.createActorBehavior(goombaRuntime,sidePlayers),sideBox=sides.actorBox(sides.actors[0]);
  Object.assign(sidePlayers.player,{x:sideBox.x,y:sideBox.y,vy:0});
  assert.equal(sides.collide(sidePlayers.player,{x:sideBox.x-1,y:sideBox.y}).type,'hurt');
  assert.equal(sidePlayers.player.dead,true,'ordinary side contact enters the shared death transition');
});

test('winged Koopas lose wings first, then enter the declared shell state',()=>{
  const map={...validMap,instances:[{placeable:'koopaRed',values:{'transform.x':100,'transform.y':120,'walker.direction':'right','walker.patrolRange':16,'flight.hasWings':true,'flight.flying':true}}]},runtime=api.compileReferenceRuntime(theme,map).runtime,behavior=api.createActorBehavior(runtime),actor=behavior.actors[0],body=runtime.drawCommands.find(command=>!command.attachment);
  const stomp=()=>{const box=behavior.actorBox(actor),player={x:box.x,y:box.y-12,w:24,h:24,vy:5,onGround:false};return behavior.collide(player,{x:box.x,y:box.y-24})};
  assert.equal(stomp().type,'stomp');assert.equal(actor.winged,false);assert.equal(actor.flying,false);assert.equal(actor.state,'walking');
  assert.equal(runtime.drawCommands.filter(command=>command.attachment).map(command=>behavior.commandAt(command,0)).filter(Boolean).length,0,'lost wings stop rendering');
  assert.equal(stomp().type,'stomp');assert.equal(actor.state,'shellStopped');assert.equal(actor.collisionEligible,true);
  const shell=behavior.commandAt(body,0);
  assert.equal(shell.resource,theme.animations['enemy.red_koopa.shell'].frames[0].resource,'shell capability selects the declared shell visual');
  const x=actor.x;behavior.step();assert.equal(actor.x,x,'transformed shell no longer patrols as a walker');
  behavior.reset();assert.equal(actor.state,'walking');assert.equal(actor.winged,true);assert.equal(actor.flying,true);assert.equal(actor.collisionEligible,true);
});

test('authored interaction geometry follows actor feet without changing native presentation',()=>{
  const map={...validMap,instances:[
    {placeable:'goomba',values:{'transform.x':100,'transform.y':120,'walker.direction':'left','walker.patrolRange':0}},
    {placeable:'koopaRed',values:{'transform.x':150,'transform.y':120,'walker.direction':'left','walker.patrolRange':0}}
  ]},runtime=api.compileReferenceRuntime(theme,map).runtime,behavior=api.createActorBehavior(runtime);
  const goomba=behavior.actors[0],koopa=behavior.actors[1];
  assert.deepEqual(plain(behavior.actorBox(goomba)),{x:92,y:104,w:16,h:16});
  assert.deepEqual(plain(behavior.actorBox(koopa)),{x:142,y:96,w:16,h:24});
  assert.equal(goomba.instance.bounds.y,88,'the authored 16×32 presentation remains bottom anchored and unchanged');
  const playerBehavior=api.createPlayerBehavior({playerSpawn:{x:0,y:0},bounds:null,surfaces:{solid:[],solidTop:[]}});
  Object.assign(playerBehavior.player,{x:92,y:80,vy:0});
  assert.equal(behavior.collide(playerBehavior.player,{x:92,y:80}),null,'empty presentation space above the body is not interactive');
  playerBehavior.player.y=104;
  assert.equal(behavior.collide(playerBehavior.player,{x:91,y:104}).type,'hurt','contact with the visible foot-aligned body is harmful');
});

test('Koopa shells stop, kick, travel, mirror, stop on stomp, and knock out enemies',()=>{
  const map={...validMap,worldBounds:{x:0,y:0,w:500,h:240},instances:[
    {placeable:'koopaRed',values:{'transform.x':100,'transform.y':120,'walker.direction':'left','walker.patrolRange':0}},
    {placeable:'goomba',values:{'transform.x':130,'transform.y':120,'walker.direction':'left','walker.patrolRange':0}}
  ]},runtime=api.compileReferenceRuntime(theme,map).runtime,players=api.createPlayerBehavior(runtime),behavior=api.createActorBehavior(runtime,players),shell=behavior.actors[0],target=behavior.actors[1];
  shell.winged=false;const walkingBox=behavior.actorBox(shell);
  Object.assign(players.player,{x:walkingBox.x,y:walkingBox.y-12,vy:5});
  assert.equal(behavior.collide(players.player,{x:walkingBox.x,y:walkingBox.y-24}).type,'stomp');
  assert.equal(shell.state,'shellStopped');
  const stopped=behavior.actorBox(shell);Object.assign(players.player,{x:stopped.x-22,y:stopped.y,vy:0,dead:false});
  const kick=behavior.collide(players.player,{x:players.player.x-1,y:players.player.y});
  assert.equal(kick.type,'shellKick');assert.equal(shell.shellVx,api.SHELL_SPEED);assert.equal(shell.mirror,false);
  const start=shell.x;players.player.x=300;behavior.step();assert.equal(shell.x,start+api.SHELL_SPEED,'moving shell uses the oracle speed');
  while(target.state==='walking')behavior.step();
  assert.equal(target.state,'knockedOut','moving-shell overlap applies the established knockout state');
  assert.equal(target.collisionEligible,false);
  shell.state='shellMoving';shell.shellVx=-api.SHELL_SPEED;shell.direction=-1;shell.mirror=true;shell.x=200;
  behavior.step();assert.equal(shell.x,200-api.SHELL_SPEED);assert.equal(shell.mirror,true,'leftward shell travel mirrors the shell visual');
  const movingBox=behavior.actorBox(shell);Object.assign(players.player,{x:movingBox.x,y:movingBox.y-12,vy:5,dead:false});
  assert.equal(behavior.collide(players.player,{x:movingBox.x,y:movingBox.y-24}).type,'stomp');
  assert.equal(shell.state,'shellStopped');assert.equal(shell.shellVx,0);
});

test('Run-held stopped shells carry, follow both facing sides, stay inert, and render as shells',()=>{
  const map={...validMap,worldBounds:{x:0,y:0,w:500,h:240},markers:{start:{x:60,y:120},goal:null},instances:[
    {placeable:'koopaRed',values:{'transform.x':100,'transform.y':120,'walker.direction':'left','walker.patrolRange':20}},
    {placeable:'goomba',values:{'transform.x':100,'transform.y':120,'walker.direction':'left','walker.patrolRange':0}}
  ]},runtime=api.compileReferenceRuntime(theme,map).runtime,players=api.createPlayerBehavior(runtime),behavior=api.createActorBehavior(runtime,players),shell=behavior.actors[0],target=behavior.actors[1],body=runtime.drawCommands.find(command=>command.instanceIndex===shell.instanceIndex&&!command.attachment);
  shell.state='shellStopped';shell.winged=false;players.step({run:true});
  const box=behavior.actorBox(shell);Object.assign(players.player,{x:box.x-8,y:box.y,face:1,vy:0});
  assert.equal(behavior.collide(players.player,{x:players.player.x-1,y:players.player.y}).type,'shellCarry');
  assert.equal(shell.state,'shellHeld');assert.strictEqual(behavior.carriedActor,shell);
  assert.equal(behavior.commandAt(body,0).resource,theme.animations['enemy.red_koopa.shell'].frames[0].resource);

  const heldStart={x:shell.x,y:shell.y};Object.assign(players.player,{x:180,y:70,face:1});behavior.step(players.player,{x:170,y:70});
  const rightBox=behavior.actorBox(shell);assert.equal(rightBox.x,players.player.x+players.player.w-7);assert.equal(rightBox.y,players.player.y+players.player.h-rightBox.h-7);
  Object.assign(players.player,{x:150,y:50,face:-1});behavior.step(players.player,{x:180,y:70});
  const leftBox=behavior.actorBox(shell);assert.equal(leftBox.x,players.player.x-leftBox.w+7);assert.equal(shell.mirror,true);
  assert.notDeepEqual({x:shell.x,y:shell.y},heldStart,'held shell follows player movement and jumping');
  assert.equal(target.state,'walking','held overlap never knocks out another actor');
  target.state='shellMoving';target.shellVx=0;target.x=shell.x;target.y=shell.y;behavior.step(null,null);assert.equal(shell.state,'shellHeld','other moving shells also ignore the held shell');
  assert.equal(shell.shellVy,0,'held shell does not fall');assert.equal(shell.state,'shellHeld','held shell does not patrol or collide with its carrier');
});

test('Run falling edge releases a carried shell on the current facing side with oracle impulses',()=>{
  for(const face of [1,-1]){
    const runtime=api.compileReferenceRuntime(theme,{...validMap,worldBounds:{x:0,y:0,w:500,h:240},markers:{start:{x:60,y:120},goal:null},instances:[{placeable:'koopaRed',values:{'transform.x':100,'transform.y':120,'walker.direction':'left','walker.patrolRange':0}}]}).runtime;
    const players=api.createPlayerBehavior(runtime),behavior=api.createActorBehavior(runtime,players),shell=behavior.actors[0];shell.state='shellStopped';shell.winged=false;
    players.step({run:true});const box=behavior.actorBox(shell);Object.assign(players.player,{x:box.x-8,y:box.y,face});assert.equal(behavior.collide(players.player,{x:players.player.x,y:players.player.y}).type,'shellCarry');
    Object.assign(players.player,{x:200,y:80,face});behavior.step(players.player,{x:190,y:80});players.step({run:false});behavior.step(players.player,{x:200,y:80});
    const released=behavior.actorBox(shell);assert.equal(shell.state,'shellMoving');assert.equal(shell.shellVx,face*api.SHELL_SPEED);assert.equal(shell.shellVy,-1.2);assert.equal(shell.mirror,face<0);assert.equal(behavior.carriedActor,null);
    assert.equal(face>0?released.x:released.x+released.w,face>0?players.player.x+players.player.w+2:players.player.x-2,'release begins just beyond the current facing side');
  }
});

test('shell pickup lock survives moving-shell stomp until player separation',()=>{
  const runtime=api.compileReferenceRuntime(theme,{...validMap,instances:[{placeable:'koopaRed',values:{'transform.x':100,'transform.y':120,'walker.direction':'left','walker.patrolRange':0}}]}).runtime,players=api.createPlayerBehavior(runtime),behavior=api.createActorBehavior(runtime,players),shell=behavior.actors[0];
  shell.state='shellMoving';shell.shellVx=api.SHELL_SPEED;const moving=behavior.actorBox(shell);players.step({run:true});Object.assign(players.player,{x:moving.x,y:moving.y-12,vy:5});
  assert.equal(behavior.collide(players.player,{x:moving.x,y:moving.y-24}).type,'stomp');assert.equal(shell.pickupLock,true);
  players.player.y=behavior.actorBox(shell).y;assert.equal(behavior.collide(players.player,{x:players.player.x,y:players.player.y}),null);assert.equal(shell.state,'shellStopped');
  players.player.x=300;behavior.step(players.player,{x:290,y:players.player.y});assert.equal(shell.pickupLock,false);
  const stopped=behavior.actorBox(shell);Object.assign(players.player,{x:stopped.x-8,y:stopped.y});assert.equal(behavior.collide(players.player,{x:players.player.x-1,y:players.player.y}).type,'shellCarry');
});

test('death and reset clear carried shells without throwing or stale carry state',()=>{
  const map={...validMap,worldBounds:{x:0,y:0,w:320,h:160},markers:{start:{x:40,y:60},goal:null},instances:[
    {placeable:'koopaRed',values:{'transform.x':100,'transform.y':100,'walker.direction':'right','walker.patrolRange':10}},
    {placeable:'spiky',values:{'transform.x':180,'transform.y':100,'walker.direction':'left','walker.patrolRange':0}}
  ]},runtime=api.compileReferenceRuntime(theme,map).runtime,players=api.createPlayerBehavior(runtime),behavior=api.createActorBehavior(runtime,players),shell=behavior.actors[0],hazard=behavior.actors[1];
  shell.state='shellStopped';shell.winged=false;players.step({run:true});const shellBox=behavior.actorBox(shell);Object.assign(players.player,{x:shellBox.x-8,y:shellBox.y});behavior.collide(players.player,{x:players.player.x-1,y:players.player.y});
  const hazardBox=behavior.actorBox(hazard);Object.assign(players.player,{x:hazardBox.x,y:hazardBox.y});assert.equal(behavior.collide(players.player,{x:hazardBox.x-1,y:hazardBox.y}).type,'hurt');
  assert.equal(players.player.dead,true);assert.equal(behavior.carriedActor,null);assert.equal(shell.state,'shellStopped');assert.equal(shell.shellVx,0,'death releases without throwing');
  while(players.player.dead)players.step();assert.equal(players.consumeRestart(),true);behavior.reset();
  assert.equal(behavior.carriedActor,null);assert.deepEqual({state:shell.state,x:shell.x,y:shell.y,direction:shell.direction,lock:shell.pickupLock},{state:'walking',x:100,y:100,direction:1,lock:false});
  shell.state='shellHeld';behavior.reset();assert.equal(shell.state,'walking','manual actor reset cannot leave a stale held state');
});

test('moving shells and every harmful actor share the dead-player transition',()=>{
  for(const placeable of ['goomba','spiky','koopaRed']){
    const runtime=api.compileReferenceRuntime(theme,{...validMap,instances:[{placeable,values:{'transform.x':100,'transform.y':120,'walker.direction':'left','walker.patrolRange':0}}]}).runtime;
    const players=api.createPlayerBehavior(runtime),behavior=api.createActorBehavior(runtime,players),actor=behavior.actors[0];
    if(placeable==='koopaRed'){actor.state='shellMoving';actor.shellVx=api.SHELL_SPEED}
    const box=behavior.actorBox(actor);Object.assign(players.player,{x:box.x,y:box.y,vy:0});
    assert.equal(behavior.collide(players.player,{x:box.x-1,y:box.y}).type,'hurt');
    assert.equal(players.player.dead,true,`${placeable} uses the dead state`);assert.equal(players.player.vy,-4);
  }
});

test('dead motion ignores terrain and finite-envelope restart restores player and actors',()=>{
  const map={...validMap,worldBounds:{x:0,y:0,w:320,h:160},markers:{start:{x:20,y:40},goal:null},instances:[
    {placeable:'ground',values:{'transform.x':160,'transform.y':100,'terrain.width':8,'terrain.height':1,'terrain.style':'overground'}},
    {placeable:'koopaRed',values:{'transform.x':100,'transform.y':80,'walker.direction':'right','walker.patrolRange':20,'flight.hasWings':true,'flight.flying':true}}
  ]},runtime=api.compileReferenceRuntime(theme,map).runtime,players=api.createPlayerBehavior(runtime),behavior=api.createActorBehavior(runtime,players),actor=behavior.actors[0];
  players.player.y=60;players.beginDeath();actor.state='shellMoving';actor.shellVx=api.SHELL_SPEED;actor.winged=false;actor.x=140;actor.tick=17;
  let crossedSolid=false;
  for(let i=0;i<100&&!players.consumeRestart();i++){players.step({left:true,jump:true});if(players.player.dead&&players.player.y>100)crossedSolid=true}
  assert.equal(crossedSolid,true,'dead fall passes through solid and one-way collision without input control');
  if(!players.player.dead)behavior.reset();
  assert.equal(players.player.dead,false);assert.deepEqual({x:players.player.x,y:players.player.y},plain(runtime.playerSpawn));
  assert.deepEqual({x:actor.x,y:actor.y,state:actor.state,direction:actor.direction,winged:actor.winged,flying:actor.flying,tick:actor.tick,eligible:actor.collisionEligible},
    {x:100,y:80,state:'walking',direction:1,winged:true,flying:true,tick:0,eligible:true});
});

test('construction geometry follows editor native-cell, autotile, sky, and rotation rules',()=>{
  const runtime=api.compileReferenceRuntime(theme,fixture).runtime;
  const ground=runtime.instances.find(x=>x.placeable==='ground').target.construction.geometry;
  assert.equal(ground.cells.length,16);
  assert.equal(ground.w,8*ground.cellW);
  const oneRow={...fixture,instances:[{placeable:'ground',values:{'transform.x':0,'transform.y':16,'terrain.width':3,'terrain.height':1,'terrain.style':'overground'}}]};
  const row=api.compileReferenceRuntime(theme,oneRow).runtime.instances[0].target.construction.geometry;
  assert.deepEqual(plain(row.cells.map(x=>x.mask)),['1000','1100','0100']);
  const sky=runtime.instances.find(x=>x.placeable==='skyGradient').target.construction.geometry;
  assert.equal(sky.cells.length,50);
  assert.equal(sky.w,10*sky.cellW);
  assert.equal(sky.h,5*sky.cellH);
  const pipe=runtime.instances.find(x=>x.placeable==='pipe');
  assert.equal(pipe.transform.presentation.quarterTurns,1);
  assert.equal(pipe.bounds.w,pipe.target.bounds.h);
  assert.equal(pipe.bounds.h,pipe.target.bounds.w);
  assert.equal(pipe.target.bounds.anchorX,.5);
  assert.equal(pipe.target.bounds.anchorY,1);
});

test('preserves markers and exposes finite derived preview bounds',()=>{
  const result=api.compileReferenceRuntime(theme,fixture),runtime=result.runtime;
  assert.deepEqual(plain(runtime.markers),fixture.markers);
  assert.deepEqual(plain(runtime.playerSpawn),{x:fixture.markers.start.x-api.PLAYER_WIDTH/2,y:fixture.markers.start.y-api.PLAYER_HEIGHT});
  assert.equal(runtime.boundsSource,'derived-preview');
  assert([runtime.bounds.x,runtime.bounds.y,runtime.bounds.w,runtime.bounds.h].every(Number.isFinite));
  assert(runtime.bounds.w>0&&runtime.bounds.h>0);
  assert(result.diagnostics.some(x=>x.code==='derived-bounds'&&x.severity==='warning'));
});

test('compiles explicit solid and solidTop behavior surfaces from capabilities',()=>{
  const map={...validMap,instances:[
    {placeable:'ground',values:{'transform.x':80,'transform.y':160,'terrain.width':4,'terrain.height':2,'terrain.style':'overground'}},
    {placeable:'mushroomPlatform',values:{'transform.x':224,'transform.y':128,'extent.width':3,'extent.height':3}}
  ],markers:{start:{x:32,y:128},goal:{x:320,y:128}}};
  const runtime=api.compileReferenceRuntime(theme,map).runtime;
  assert.equal(runtime.surfaces.solid.length,1);
  assert.equal(runtime.surfaces.solidTop.length,1);
  assert.deepEqual(plain(runtime.surfaces.solid[0]),{...plain(runtime.instances[0].bounds),instanceIndex:0});
  assert.equal(runtime.surfaces.solidTop[0].y,runtime.instances[1].bounds.y);
  assert.equal(runtime.surfaces.solidTop[0].w,runtime.instances[1].bounds.w);
  assert.equal(runtime.markers.goal.x,320,'Level Goal remains marker data');
});

test('ported player behavior preserves oracle acceleration, jump cut, gravity, and dimensions',()=>{
  const runtime={playerSpawn:{x:100,y:276},bounds:{x:0,y:0,w:1000,h:500},surfaces:{solid:[{x:0,y:300,w:1000,h:200}],solidTop:[]}};
  const behavior=api.createPlayerBehavior(runtime),player=behavior.player;
  behavior.step();
  assert.deepEqual({w:player.w,h:player.h,onGround:player.onGround,y:player.y},{w:24,h:24,onGround:true,y:276});
  behavior.step({right:true});
  assert.equal(player.vx,.36);
  assert.equal(player.face,1);
  behavior.step({right:true,run:true});
  assert.equal(player.vx,.86);
  behavior.step({right:false,run:false,jump:true});
  assert.equal(player.vy,-10.63);
  assert.equal(player.onGround,false);
  assert.equal(player.animationState,'jump');
  behavior.step({jump:false});
  assert(Math.abs(player.vy-(-3.58))<1e-9,'released jump uses the oracle short-hop clamp before gravity');
});

test('Down selects crouch presentation only while grounded without changing gameplay geometry',()=>{
  const runtime={playerSpawn:{x:100,y:276},bounds:{x:0,y:0,w:500,h:400},surfaces:{solid:[{x:0,y:300,w:500,h:100}],solidTop:[]}},behavior=api.createPlayerBehavior(runtime),player=behavior.player;
  behavior.step();behavior.step({down:true});
  assert.equal(player.animationState,'duck');
  assert.deepEqual({w:player.w,h:player.h,x:player.x,y:player.y},{w:24,h:24,x:100,y:276},'crouch is presentation-only and keeps the 24×24 body');
  player.onGround=false;player.vy=-2;behavior.step({down:true});
  assert.equal(player.animationState,'jump','Down does not select crouch while airborne');
});

test('question boxes consume their theme-authored trigger, bump, and retain collision',()=>{
  const map={...validMap,instances:[{placeable:'questionBlock',values:{'transform.x':112,'transform.y':200,'rewardBlock.uses':1}}],markers:{start:{x:112,y:240},goal:null}},runtime=api.compileReferenceRuntime(theme,map).runtime;
  const players=api.createPlayerBehavior(runtime),blocks=api.createBlockBehavior(runtime,players),block=blocks.blocks[0],surface=runtime.surfaces.solid[0];
  assert(surface,'theme collisionMode binds the question box to a runtime solid');
  players.player.x=100;players.player.y=202;players.player.vy=-8;players.resolvePlayer();
  const event=blocks.step();assert.equal(event.type,'blockBump');
  assert.equal(event.triggers[0].type,'dispenseContents');
  assert.equal(block.used,true);
  assert.equal(surface.disabled,undefined,'used question boxes remain solid');
  const authored=runtime.drawCommands.find(command=>command.instanceIndex===block.instanceIndex),drawn=blocks.commandAt(authored);
  assert.deepEqual(plain(drawn.sourceRect),plain(authored.sourceRect),'no undeclared used-box artwork is invented');
  assert(drawn.worldY<authored.worldY,'the active bump lifts the visual without moving collision');
});

test('brick hits bump while small and break while powered, disabling collision and drawing',()=>{
  const map={...validMap,instances:[{placeable:'brick',values:{'transform.x':112,'transform.y':200,'block.style':'classic'}}],markers:{start:{x:112,y:240},goal:null}},runtime=api.compileReferenceRuntime(theme,map).runtime;
  const players=api.createPlayerBehavior(runtime),blocks=api.createBlockBehavior(runtime,players),block=blocks.blocks[0],surface=runtime.surfaces.solid[0],hit=()=>{players.player.x=100;players.player.y=202;players.player.vy=-8;players.resolvePlayer();return blocks.step()};
  assert.equal(hit().type,'blockBump');
  while(block.bump)blocks.step();
  players.player.form='normal';
  assert.equal(hit().type,'blockBreak');
  assert.equal(block.broken,true);
  assert.equal(surface.disabled,true);
  assert.equal(blocks.commandAt(runtime.drawCommands.find(command=>command.instanceIndex===block.instanceIndex)),null);
  blocks.reset();
  assert.equal(surface.disabled,false,'restart restores broken brick collision');
});

test('authored box contents emerge before walking and retain native theme presentation',()=>{
  const map={...validMap,instances:[
    {placeable:'ground',values:{'transform.x':160,'transform.y':240,'terrain.width':8,'terrain.height':1,'terrain.style':'overground'}},
    {placeable:'questionBlock',values:{'transform.x':112,'transform.y':200,'rewardBlock.contents':'growMushroom','rewardBlock.uses':1}}
  ],markers:{start:{x:112,y:240},goal:null}},runtime=api.compileReferenceRuntime(theme,map).runtime,players=api.createPlayerBehavior(runtime),blocks=api.createBlockBehavior(runtime,players),powerups=api.createPowerupBehavior(runtime);
  players.player.x=100;players.player.y=202;players.player.vy=-8;players.resolvePlayer();
  const blockEvent=blocks.step(),events=powerups.step(blockEvent,{x:400,y:200,w:24,h:24}),mushroom=powerups.powerups[0];
  assert.equal(events[0].type,'powerupSpawn');
  assert.equal(mushroom.id,'growMushroom');
  assert.equal(mushroom.vx,0,'walker remains still while emerging');
  assert(mushroom.y>mushroom.emergeTargetY);
  for(let i=0;i<16;i++)powerups.step(null,{x:400,y:200,w:24,h:24});
  assert.equal(mushroom.emergeFrames,0);
  assert.equal(mushroom.vx,.85,'theme walker capability starts established movement after emergence');
  const command=powerups.commands()[0],resource=theme.resources[theme.objects.growMushroom.visuals.idle];
  assert.deepEqual(plain(command.sourceRect),resource.image.rect);
  assert.deepEqual({w:command.w,h:command.h},{w:resource.display.w,h:resource.display.h});
});

test('powerup contact emits authored capabilities, removes the pickup, and reset clears spawns',()=>{
  const map={...validMap,instances:[{placeable:'questionBlock',values:{'transform.x':112,'transform.y':200,'rewardBlock.contents':'fireFlower','rewardBlock.uses':1}}],markers:{start:{x:112,y:240},goal:null}},runtime=api.compileReferenceRuntime(theme,map).runtime,players=api.createPlayerBehavior(runtime),blocks=api.createBlockBehavior(runtime,players),powerups=api.createPowerupBehavior(runtime);
  players.player.x=100;players.player.y=202;players.player.vy=-8;players.resolvePlayer();powerups.step(blocks.step(),{x:400,y:200,w:24,h:24});
  const flower=powerups.powerups[0];flower.emergeFrames=0;flower.x=50;flower.y=60;
  const events=powerups.step(null,{x:50,y:60,w:24,h:24}),collection=events.find(event=>event.type==='powerupCollect');
  assert.deepEqual(plain(collection.capabilities),['collectible','projectilePower']);
  assert.equal(flower.taken,true);
  assert.equal(powerups.commands().length,0,'collected pickup no longer renders');
  powerups.reset();assert.equal(powerups.powerups.length,0);
});

test('pickup capabilities drive small, normal, fire, and extra-life transitions without changing physics geometry',()=>{
  const players=api.createPlayerBehavior({playerSpawn:{x:100,y:276},bounds:{x:0,y:0,w:500,h:400},surfaces:{solid:[],solidTop:[]}}),player=players.player,feet=player.y+player.h;
  assert.deepEqual(plain(players.applyPowerup({type:'powerupCollect',capabilities:['collectible','grow']})),{type:'formChange',form:'normal'});
  assert.deepEqual({form:player.form,w:player.w,h:player.h,feet:player.y+player.h,inv:player.inv},{form:'normal',w:24,h:24,feet,inv:24});
  assert.deepEqual(plain(players.applyPowerup({type:'powerupCollect',capabilities:['collectible','projectilePower']})),{type:'formChange',form:'fire'});
  assert.equal(player.form,'fire');
  players.applyPowerup({type:'powerupCollect',capabilities:['collectible','grow']});
  assert.equal(player.form,'fire','growth does not downgrade an existing fire form');
  const lives=player.lives;
  assert.deepEqual(plain(players.applyPowerup({type:'powerupCollect',capabilities:['collectible','extraLife']})),{type:'extraLife',form:'fire'});
  assert.equal(player.lives,lives+1);
});

test('damage steps fire to normal to small before life loss and honors transition invulnerability',()=>{
  const players=api.createPlayerBehavior({playerSpawn:{x:100,y:276},bounds:{x:0,y:0,w:500,h:400},surfaces:{solid:[],solidTop:[]}}),player=players.player;
  players.setForm('fire');
  assert.equal(players.hurt(),'powerDown');assert.equal(player.form,'normal');assert.equal(player.inv,90);
  assert.equal(players.hurt(),null,'damage is ignored during transition invulnerability');assert.equal(player.form,'normal');
  player.inv=0;assert.equal(players.hurt(),'powerDown');assert.equal(player.form,'small');
  player.inv=0;const lives=player.lives;assert.equal(players.hurt(),'death');assert.equal(player.lives,lives-1);assert.equal(player.dead,true);
  player.y=500;players.step();assert.equal(players.consumeRestart(),true);assert.equal(player.form,'small');assert.equal(player.lives,lives-1,'automatic death reset preserves the decremented life count');
});

test('ported collision behavior lands on solidTop and rejects solid walls',()=>{
  const oneWay=api.createPlayerBehavior({playerSpawn:{x:110,y:120},bounds:{x:0,y:0,w:500,h:400},surfaces:{solid:[],solidTop:[{x:100,y:200,w:100,h:32}]}});
  oneWay.player.vy=11;
  for(let i=0;i<6&&!oneWay.player.onGround;i++)oneWay.step();
  assert.equal(oneWay.player.y,176);
  assert.equal(oneWay.player.onGround,true);

  const wall=api.createPlayerBehavior({playerSpawn:{x:100,y:276},bounds:{x:0,y:0,w:500,h:400},surfaces:{solid:[{x:0,y:300,w:500,h:100},{x:150,y:200,w:20,h:100}],solidTop:[]}});
  wall.step();
  wall.player.vx=4.6;
  for(let i=0;i<8;i++)wall.step({right:true,run:true});
  assert.equal(wall.player.x,126);
  assert.equal(wall.player.vx,0);
});

test('reports unsupported content without throwing or drawing substitutes',()=>{
  const broken=plain(fixture);
  broken.instances.push({placeable:'missing',values:{'transform.x':0,'transform.y':0}});
  broken.instances.push({placeable:'coin',values:{'transform.x':'bad','transform.y':0}});
  broken.instances.push({placeable:'coin',values:{'transform.x':0,'transform.y':0},sceneLayer:'bogus'});
  const result=api.compileReferenceRuntime(theme,broken);
  assert.equal(result.ok,true);
  assert(result.diagnostics.some(x=>x.code==='unknown-placeable'));
  assert(result.diagnostics.some(x=>x.code==='malformed-value'));
  assert(result.diagnostics.some(x=>x.code==='invalid-layer'));
  assert.equal(result.runtime.instances.length,fixture.instances.length);
});

test('successful load hides the empty-state overlay',async()=>{
  assert.match(html,/#empty\[hidden\]\s*\{\s*display\s*:\s*none\s*;?\s*\}/);
  const {engine,elements}=engineHarness();
  await engine.loadReferenceTheme(theme);
  engine.loadReferenceEditorMap(fixture);
  assert(engine.state.runtime);
  assert(engine.state.behavior,'Mario Start creates the player behavior state');
  assert.deepEqual(plain(engine.state.behavior.player),{
    x:fixture.markers.start.x-12,y:fixture.markers.start.y-24,w:24,h:24,vx:0,vy:0,
    onGround:false,face:1,runCharge:0,pSpeed:false,tick:0,animationState:'idle',form:'small',lives:3,inv:0,dead:false
  });
  const idle=theme.resources[theme.objects['player.small'].visuals.idle];
  assert.deepEqual(plain(engine.currentPlayerVisual()),{atlas:idle.image.atlas,sourceRect:idle.image.rect,offset:{x:0,y:0},display:idle.display});
  assert.equal(elements.empty.hidden,true);
});

test('player sprite preserves authored aspect ratio and bottom-center anchor',async()=>{
  const {engine,operations,frames}=engineHarness();
  await engine.loadReferenceTheme(theme);
  engine.loadReferenceEditorMap(fixture);
  const player=engine.state.behavior.player,fit=engine.currentPlayerFit();
  assert.deepEqual(plain(fit),{
    originX:player.x+player.w/2,
    originY:player.y+player.h,
    dx:-8,dy:-16,w:16,h:16
  });
  assert.equal(fit.w/fit.h,1,'the authored 16×16 frame remains square');
  assert.equal(fit.w,16,'native rendering retains the authored width rather than scaling to gameplay geometry');
  assert.equal(fit.originY+fit.dy+fit.h,player.y+player.h,'the visual bottom remains at the player feet');
  assert.equal(fit.originX+fit.dx+fit.w/2,player.x+player.w/2,'the visual remains horizontally centered');
  assert(operations.drawCalls.some(args=>args.length===9&&args[5]===-8&&args[6]===-16&&args[7]===16&&args[8]===16),
    'canvas draw uses the authored native, foot-centered destination rectangle');
  operations.scales.length=0;operations.translates.length=0;player.face=-1;frames.shift()(0);
  assert(operations.scales.some(args=>args[0]===-1&&args[1]===1),'mirroring happens around the player anchor');
  assert(operations.translates.some(args=>args[0]===player.x+player.w/2&&args[1]===player.y+player.h),'mirroring retains the bottom-center anchor');
});

test('finite-bounds camera keeps the oracle follow target and smoothing',async()=>{
  const {engine}=engineHarness();
  await engine.loadReferenceTheme(theme);
  engine.state.runtime={bounds:{x:100,y:40,w:2000,h:600}};
  engine.state.behavior=api.createPlayerBehavior({playerSpawn:{x:1000,y:300},bounds:engine.state.runtime.bounds,surfaces:{solid:[],solidTop:[]}});
  engine.state.camera={x:0,y:0,zoom:1};
  engine.followPlayer();
  assert.equal(engine.state.camera.x,-63.2,'(player.x - 210) is clamped to bounds then eased by 0.08');
  assert(Number.isFinite(engine.state.camera.y));
});

test('player visual states use theme animations with established walk and run cadence',async()=>{
  const {engine}=engineHarness();
  await engine.loadReferenceTheme(theme);
  engine.loadReferenceEditorMap(fixture);
  const player=engine.state.behavior.player;
  player.animationState='walk';player.tick=0;
  assert.deepEqual(plain(engine.currentPlayerVisual().sourceRect),theme.resources[theme.animations['player.small.walk'].frames[0].resource].image.rect);
  player.tick=7;
  assert.deepEqual(plain(engine.currentPlayerVisual().sourceRect),theme.resources[theme.animations['player.small.walk'].frames[1].resource].image.rect);
  player.animationState='run';player.tick=5;
  assert.deepEqual(plain(engine.currentPlayerVisual().sourceRect),theme.resources[theme.animations['player.small.run'].frames[1].resource].image.rect);
  player.animationState='jump';player.face=-1;
  assert.deepEqual(plain(engine.currentPlayerVisual().sourceRect),theme.resources[theme.objects['player.small'].visuals.jump].image.rect);
});

test('grounded crouch uses the selected form duck visual and falls back when absent',async()=>{
  const {engine}=engineHarness();
  await engine.loadReferenceTheme(theme);engine.loadReferenceEditorMap(fixture);
  const player=engine.state.behavior.player;
  player.form='normal';player.animationState='duck';
  const normalDuck=theme.resources[theme.objects['player.normal'].visuals.duck];
  assert.deepEqual(plain(engine.currentPlayerVisual().sourceRect),normalDuck.image.rect,'normal form uses its authored duck frame');
  player.form='fire';
  const fireDuck=theme.resources[theme.objects['player.fire'].visuals.duck];
  assert.deepEqual(plain(engine.currentPlayerVisual().sourceRect),fireDuck.image.rect,'fire form uses its authored duck frame');
  player.form='small';
  const smallIdle=theme.resources[theme.objects['player.small'].visuals.idle];
  assert.deepEqual(plain(engine.currentPlayerVisual().sourceRect),smallIdle.image.rect,'small form without duck uses its normal idle fallback');
  assert.deepEqual({w:player.w,h:player.h},{w:24,h:24});
});

test('invalid public map and theme loads clear an already rendered scene and retain diagnostics',async()=>{
  const {engine,elements,operations}=engineHarness();
  await engine.loadReferenceTheme(theme);
  engine.loadReferenceEditorMap(fixture);
  assert(engine.state.runtime);
  assert.equal(elements.empty.hidden,true);
  assert(operations.drawImage>0);

  operations.fillRect=operations.drawImage=0;
  const mapErrors=engine.loadReferenceEditorMap({...fixture,format:'old-map'});
  assert(mapErrors.length);
  assert.equal(engine.state.runtime,null);
  assert.equal(engine.state.map,null);
  assert.equal(elements.empty.hidden,false);
  assert.match(elements.diagnostics.textContent,/unsupported map format/);
  assert(operations.fillRect>0);
  assert.equal(operations.drawImage,0);

  engine.loadReferenceEditorMap(fixture);
  assert(engine.state.runtime);
  assert(engine.state.atlases.size>0);
  operations.fillRect=operations.drawImage=0;
  const themeErrors=await engine.loadReferenceTheme({...theme,format:'old-theme'});
  assert(themeErrors.length);
  assert.equal(engine.state.runtime,null);
  assert.equal(engine.state.theme,null);
  assert.equal(engine.state.atlases.size,0);
  assert.equal(elements.empty.hidden,false);
  assert.match(elements.diagnostics.textContent,/unsupported theme format/);
  assert(operations.fillRect>0);
  assert.equal(operations.drawImage,0);
});

test('file parse failures use the same scene invalidation path',async()=>{
  const {engine,elements,operations}=engineHarness();
  await engine.loadReferenceTheme(theme);
  engine.loadReferenceEditorMap(fixture);
  assert(engine.state.runtime);
  operations.fillRect=operations.drawImage=0;
  elements.mapFile.files=[{text:async()=>'{'}];
  await elements.mapFile.onchange();
  assert.equal(engine.state.runtime,null);
  assert.equal(engine.state.map,null);
  assert.equal(elements.empty.hidden,false);
  assert.match(elements.diagnostics.textContent,/map is not valid JSON/);
  assert(operations.fillRect>0);
  assert.equal(operations.drawImage,0);
});

test('accepts only the current reference documents and rejects old fallbacks',()=>{
  assert.deepEqual(plain(api.validateReferenceTheme(theme)),[]);
  assert.deepEqual(plain(api.validateReferenceEditorMap(validMap,theme)),[]);
  assert.equal(api.prepareReferenceRuntime(theme,validMap).ok,true);
  for(const format of ['llmario-theme-v1','llmario-theme-pack-v1','llmario-map-v1','llmcart-toybox-recipe',undefined]){
    assert(api.validateReferenceTheme({...theme,format}).some(error=>error.includes('unsupported theme format')));
    assert(api.validateReferenceEditorMap({...validMap,format},theme).some(error=>error.includes('unsupported map format')));
  }
});

test('malformed documents return useful diagnostics without throwing',()=>{
  assert.match(api.parseReferenceDocument('{','theme').errors[0],/not valid JSON/);
  assert.match(api.validateReferenceTheme(null)[0],/root/);
  assert.match(api.validateReferenceEditorMap(null,theme)[0],/root/);
  assert.equal(api.compileReferenceRuntime({},{}).ok,false);
});

test('remains standalone and leaves the legacy oracle unchanged',()=>{
  assert.match(html,/Reference theme\/map required/);
  assert.match(html,/compileReferenceRuntime/);
  assert(!/\bfetch\s*\(|XMLHttpRequest|import\s*\(/.test(html));
  assert(!html.includes('DEMO_CART'));
  assert(!html.includes('ART_RESOURCES'));
  assert(!html.includes('llmcart-toybox-recipe'));
  assert(legacy.includes('DEMO_CART'),'legacy oracle remains intact');
});
