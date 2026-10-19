'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const fs=require('node:fs');
const vm=require('node:vm');

const html=fs.readFileSync('engine/reference_pack_engine.html','utf8');
const theme=JSON.parse(fs.readFileSync('themes/theme_marioai_reference_pack.llmtheme.txt','utf8'));
const boundarySource=html.match(/<script id="referencePackBoundary">([\s\S]*?)<\/script>/)[1];
const context={globalThis:{}};
vm.runInNewContext(boundarySource,context);
const api=context.globalThis.ReferencePackBoundary;
const plain=value=>JSON.parse(JSON.stringify(value));
const mapOf=(instances,extra={})=>({format:api.REFERENCE_MAP_FORMAT,mapVersion:1,theme:{id:theme.id,packVersion:theme.packVersion},worldBounds:{x:0,y:0,w:640,h:320},instances,markers:{start:{x:40,y:240},goal:null},...extra});
const goomba=(x,id)=>({placeable:'goomba',instanceId:id,values:{'transform.x':x,'transform.y':200,'walker.direction':'right','walker.patrolRange':40}});
const koopa=(x,id,flight={})=>({placeable:'koopaRed',instanceId:id,values:{'transform.x':x,'transform.y':200,'walker.direction':'right','walker.patrolRange':40,...flight}});

test('every capability a theme object names is registered, and the registry is the one door',()=>{
  const named=new Set(Object.values(theme.objects).flatMap(object=>object.capabilities||[]));
  assert.deepEqual(plain(api.BUILTIN_CAPABILITIES.unregistered([...named])),[],'nothing the theme names is left unimplemented or undeclared');
  const kinds=Object.fromEntries(api.BUILTIN_CAPABILITIES.names().map(name=>[name,api.BUILTIN_CAPABILITIES.get(name).kind]));
  for(const [name,kind] of Object.entries({patrol:'tick',winged:'tick',movingPlatform:'tick',walker:'tick',stompable:'contact',stompHazard:'contact',coin:'pickup',grow:'pickup',extraLife:'pickup',projectilePower:'pickup',flightPower:'pickup',solid:'flag',solidTop:'flag',shell:'flag',armored:'flag',climbable:'flag'}))
    assert.equal(kinds[name],kind,`${name} is a ${kind}`);
  assert.equal(typeof api.BUILTIN_CAPABILITIES.get('winged').contact,'function','a tick capability may also answer contacts');
  assert(api.BUILTIN_CAPABILITIES.get('patrol').builtIn);
  assert.equal(api.BUILTIN_CAPABILITIES.get('raccoon'),null,'no Mario-flavored capability name is built in');
});

test('built-in hooks close over nothing: recompiled alone, they behave the same',()=>{
  // A test-only check: each hook's text is evaluated in an empty context, where any outside reference would throw.
  const lone=new vm.createContext({});
  const recompile=(hook,source)=>vm.runInContext(`({${source}}).${hook}`,lone);
  const self=(extra={})=>({x:100,y:200,vx:0,vy:0,originX:100,originY:200,direction:-1,mirror:true,min:100,max:100,flying:false,falling:false,attachmentsVisible:true,mode:'walking',state:{},...extra});
  const p={'walker.patrolRange':40,'walker.direction':'right','flight.hasWings':true,'flight.flying':true,'movingPlatform.range':30,'movingPlatform.speed':2,'movingPlatform.path':[{x:0,y:0},{x:20,y:10},{x:30,y:0}]};
  const world={tick:3,bounds:{x:0,y:0,w:640,h:320},player:{x:0,y:0,w:24,h:24,vx:0,vy:0,face:1,form:'small',dead:false}};
  for(const name of api.BUILTIN_CAPABILITIES.names()){
    const definition=api.BUILTIN_CAPABILITIES.get(name);
    for(const hook of ['init','step','contact','collect']){
      if(!definition[hook])continue;
      const copy=recompile(hook,definition[hook].toString()),a=self(),b=self(),calls=[[],[]],player=i=>({form:'small',grow(){calls[i].push('grow')},setForm(f){calls[i].push(['setForm',f])},addCoins(n){calls[i].push(['addCoins',n])},addLife(n){calls[i].push(['addLife',n])}});
      if(definition.init&&hook!=='init'){definition.init(a,p);recompile('init',definition.init.toString())(b,p)}
      const args=i=>hook==='init'?[[a,b][i],p]:hook==='step'?[[a,b][i],world,p]:hook==='contact'?[[a,b][i],{kind:'player',x:0,y:0,w:24,h:24,vx:0,vy:4,form:'small'},'top',world]:[player(i),world,p];
      let original,recompiled;
      for(let frame=0;frame<(hook==='step'?20:1);frame++){original=definition[hook](...args(0));recompiled=copy(...args(1))}
      assert.deepEqual(plain({result:recompiled,self:b,calls:calls[1]}),plain({result:original,self:a,calls:calls[0]}),`${name}.${hook} uses only its arguments`);
    }
  }
  assert.equal(api.BUILTIN_CAPABILITIES.get('patrol').init.length,2);
  const patrolled=self();api.BUILTIN_CAPABILITIES.get('patrol').init(patrolled,{});assert.equal(patrolled.state.speed,api.DEFAULT_WALKER_SPEED,'patrol default speed is the engine walker default');
});

test('register validates names and hook shapes, and derives the kind from the hooks',()=>{
  const registry=api.createCapabilityRegistry({base:api.BUILTIN_CAPABILITIES});
  assert.equal(registry.register({name:'two words'}).ok,false);
  assert.equal(registry.register({name:'spin',step:'not a function'}).ok,false);
  assert.match(registry.register({name:'greedy',collect(){},step(){}}).errors[0],/only collect/);
  assert.equal(registry.register({name:'mark'}).definition.kind,'flag');
  assert.equal(registry.register({name:'hop',contact(){}}).definition.kind,'contact');
  assert.equal(registry.register({name:'drift',step(){}}).definition.kind,'tick');
  assert.equal(registry.get('patrol').builtIn,true,'the base still answers');
  assert.equal(registry.get('drift').builtIn,false);
  assert.equal(registry.has({capabilities:['drift','nope']},'nope'),false,'an unregistered name is never true');
  assert.deepEqual(plain(registry.unregistered(['drift','nope','patrol','nope'])),['nope']);
  assert.equal(api.BUILTIN_CAPABILITIES.get('drift'),null,'registering on a pack registry leaves the built-ins alone');
});

test('a theme object naming an unregistered capability compiles with a warning, and nothing implements it',()=>{
  const odd=plain(theme);odd.objects.goomba.capabilities=[...odd.objects.goomba.capabilities,'teleport'];
  const result=api.compileReferenceRuntime(odd,mapOf([goomba(200,'a'),goomba(300,'b')]));
  assert.equal(result.ok,true);
  const warnings=result.diagnostics.filter(item=>item.code==='unregistered-capability');
  assert.equal(warnings.length,1,'one warning per object, not per instance');assert.equal(warnings[0].severity,'warning');assert.match(warnings[0].message,/teleport/);
});

test('a throwing hook freezes only its unit, reports it, and everything else keeps going',()=>{
  const registry=api.createCapabilityRegistry({base:api.BUILTIN_CAPABILITIES});
  registry.register({name:'winged',step(self){if(self.tick>3)throw new Error('wing fell off')}});
  const runtime=api.compileReferenceRuntime(theme,mapOf([koopa(200,'k'),goomba(400,'g')]),{capabilities:registry}).runtime,behavior=api.createActorBehavior(runtime),[k,g]=behavior.actors;
  for(let i=0;i<10;i++)behavior.step(null,null);
  assert.deepEqual(plain(k.error),{capability:'winged',hook:'step',message:'wing fell off'});
  assert.equal(g.error,null);assert(Math.abs(g.x-404)<1e-9,'the other enemy kept walking');
  const frozenX=k.x;for(let i=0;i<10;i++)behavior.step(null,null);assert.equal(k.x,frozenX,'a frozen unit stops');
  assert.equal(runtime.capabilityErrors.length,1,'reported once');assert.equal(runtime.capabilityErrors[0].instanceIndex,k.instanceIndex);
  const drawn=behavior.commandAt(runtime.drawCommands.find(command=>command.instanceIndex===k.instanceIndex&&!command.attachment),0);
  assert.equal(drawn.frozen.capability,'winged','the frozen unit is drawn marked');
  const players=api.createPlayerBehavior(runtime),box=behavior.actorBox(k);Object.assign(players.player,{x:box.x,y:box.y,vy:0});
  assert.equal(behavior.collide(players.player,{x:box.x-1,y:box.y}),null,'a frozen enemy no longer hurts');
  behavior.reset();assert.equal(k.error,null,'restart unfreezes it');
});

test('a contact hook that answers with something that is not a verdict freezes its unit',()=>{
  const registry=api.createCapabilityRegistry({base:api.BUILTIN_CAPABILITIES});
  registry.register({name:'stompable',contact(){return'explode'}});
  const runtime=api.compileReferenceRuntime(theme,mapOf([goomba(200,'g')]),{capabilities:registry}).runtime,players=api.createPlayerBehavior(runtime),behavior=api.createActorBehavior(runtime,players),[g]=behavior.actors,box=behavior.actorBox(g);
  Object.assign(players.player,{x:box.x,y:box.y,vy:0});
  assert.equal(behavior.collide(players.player,{x:box.x-1,y:box.y}),null);
  assert.match(g.error.message,/not a verdict/);assert.equal(players.player.dead,false);
});

test('contact capabilities answer in order and the engine applies the first verdict',()=>{
  const registry=api.createCapabilityRegistry({base:api.BUILTIN_CAPABILITIES});
  registry.register({name:'patrol',init(self){self.state.range=0},contact(self,other){if(other.kind==='player')return'bounce'}});
  const runtime=api.compileReferenceRuntime(theme,mapOf([goomba(200,'g')]),{capabilities:registry}).runtime,players=api.createPlayerBehavior(runtime),behavior=api.createActorBehavior(runtime,players),[g]=behavior.actors,box=behavior.actorBox(g);
  Object.assign(players.player,{x:box.x,y:box.y,vy:0});
  assert.equal(behavior.collide(players.player,{x:box.x-1,y:box.y}).type,'bounce','patrol comes before stompable in the goomba, so its bounce wins');
  assert.equal(players.player.vy,-8.6);assert.equal(g.mode,'walking','a bounce leaves the unit as it was');
});

test('pickup capabilities reach the player only through the player API',()=>{
  const registry=api.createCapabilityRegistry({base:api.BUILTIN_CAPABILITIES});
  registry.register({name:'jackpot',collect(player,world){player.addCoins(5);world.player.addLife(1)}});
  registry.register({name:'cursed',collect(){throw new Error('nope')}});
  const runtime={playerSpawn:{x:100,y:100},bounds:{x:0,y:0,w:500,h:400},surfaces:{solid:[],solidTop:[]},capabilities:registry},players=api.createPlayerBehavior(runtime);
  assert.deepEqual(plain(players.applyPowerup({type:'powerupCollect',capabilities:['collectible','jackpot']})),{type:'coin',coins:5});
  assert.equal(players.player.lives,4);
  const pickup={capabilities:['cursed'],values:{}};
  assert.equal(players.applyPowerup({type:'powerupCollect',powerup:pickup,capabilities:['cursed']}),null);
  assert.equal(pickup.error.message,'nope');assert.equal(runtime.capabilityErrors.length,1);
});

test('a frozen unit is reported in the diagnostics and outlined, and the frame loop keeps running',async()=>{
  const operations={strokeRect:0};const ctx=new Proxy({},{get:(_,key)=>key==='strokeRect'?()=>operations.strokeRect++:()=>{}}),frames=[];
  const elements={screen:{width:960,height:480,getContext:()=>ctx},stage:{getBoundingClientRect:()=>({width:960,height:480})},diagnostics:{textContent:'',className:''},empty:{hidden:false},themeButton:{},mapButton:{},fitButton:{},coinCount:{value:'',textContent:''},livesCount:{value:'',textContent:''},themeFile:{files:[],value:''},mapFile:{files:[],value:''}};
  class FakeImage{set src(value){this._src=value;this.onload?.()}get src(){return this._src}}
  const window={ReferencePackBoundary:api},clock={t:0};
  vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script><\/body>/)[1],{window,document:{getElementById:id=>elements[id]},Image:FakeImage,devicePixelRatio:1,requestAnimationFrame(fn){frames.push(()=>fn(clock.t+=1000/60))},addEventListener(){},Map,Set,Math,Promise,console:{...console,error(){}}});
  const engine=window.ReferenceEngine;await engine.loadReferenceTheme(theme);engine.loadReferenceEditorMap(mapOf([goomba(300,'g')]));
  engine.state.actorBehavior.actors[0].state=null;
  for(let i=0;i<3;i++)frames.shift()();
  assert.match(elements.diagnostics.textContent,/goomba g froze: patrol\.step threw/);
  assert(operations.strokeRect>0,'the frozen unit is outlined');
  const tick=engine.state.tick;frames.shift()();assert.equal(engine.state.tick,tick+1,'the game keeps running');
});
