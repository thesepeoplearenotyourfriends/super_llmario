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

test('registration is the vocabulary: the contract lists exactly the built-ins, and the pack registers the rest',()=>{
  assert.deepEqual([...theme.contract.engineVocabulary.capabilities].sort(),plain(api.BUILTIN_CAPABILITIES.names()),'the theme vocabulary mirrors the engine built-ins, no more and no less');
  const {registry,diagnostics}=api.capabilityRegistryFor(theme);
  assert.deepEqual(plain(diagnostics),[]);
  const named=new Set(Object.values(theme.objects).flatMap(object=>object.capabilities||[]));
  assert.deepEqual(plain(registry.unregistered([...named])),[],'nothing a theme object names is left unimplemented');
  const kinds=Object.fromEntries(registry.names().map(name=>[name,registry.get(name).kind]));
  for(const [name,kind] of Object.entries({patrol:'tick',winged:'tick',movingPlatform:'tick',walker:'tick',orbit:'tick',stompable:'contact',stompHazard:'contact',coin:'pickup',grow:'pickup',extraLife:'pickup',projectilePower:'pickup',flightPower:'pickup',solid:'flag',solidTop:'flag',shell:'flag',armored:'flag',climbable:'flag',breakable:'flag'}))
    assert.equal(kinds[name],kind,`${name} is a ${kind}`);
  assert.equal(typeof registry.get('winged').contact,'function','a tick capability may also answer contacts');
  assert(registry.get('patrol').builtIn);
  assert.equal(api.BUILTIN_CAPABILITIES.get('orbit'),null,'orbit exists only as pack source');
  assert.equal(registry.get('orbit').builtIn,false);assert.equal(registry.get('orbit').source,theme.capabilities.orbit.source,'the registry keeps the source text it was made from');
  assert.equal(api.BUILTIN_CAPABILITIES.get('raccoon'),null,'no Mario-flavored capability name is built in');
  assert.strictEqual(api.capabilityRegistryFor(theme),api.capabilityRegistryFor(theme),'one registry per theme document');
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

const orbitMap=(values,extra={})=>mapOf([{placeable:'orbitPlatform',instanceId:'o',values:{'transform.x':200,'transform.y':120,'extent.width':3,...values}}],{markers:{start:{x:40,y:300},goal:null},...extra});

test('the orbit platform goes around its circle at its speed, either way, and restarts where it was placed',()=>{
  for(const direction of ['clockwise','counterclockwise']){
    const runtime=api.compileReferenceRuntime(theme,orbitMap({'orbit.radius':40,'orbit.speed':2,'orbit.direction':direction})).runtime,moving=api.createMovingPlatformBehavior(runtime),[orbit]=moving.platforms;
    assert(orbit,'the pack capability makes an ordinary carrier');assert.deepEqual({x:orbit.x,y:orbit.y},{x:200,y:120},'it starts where it was placed');
    const start={...orbit.surface},center={x:200,y:160};
    moving.step();
    assert(direction==='clockwise'?orbit.x>200:orbit.x<200,`${direction} sets off the right way from the top`);assert(orbit.y>120);
    let far=0;for(let i=0;i<200;i++){moving.step();far=Math.max(far,Math.abs(Math.hypot(orbit.x-center.x,orbit.y-center.y)-40))}
    assert(far<1e-9,'it stays on its circle');
    assert.deepEqual({x:orbit.surface.x-start.x,y:orbit.surface.y-start.y},{x:orbit.x-200,y:orbit.y-120},'collision follows it');
    const lap=Math.ceil(2*Math.PI*40/2);moving.reset();for(let i=0;i<lap;i++)moving.step();
    assert(Math.hypot(orbit.x-200,orbit.y-120)<2,'one lap at speed 2 takes circumference/2 frames');
    moving.reset();assert.deepEqual({x:orbit.x,y:orbit.y,angle:orbit.state.angle},{x:200,y:120,angle:-Math.PI/2});assert.deepEqual(plain(orbit.surface),plain(start));
  }
  const holding=api.createMovingPlatformBehavior(api.compileReferenceRuntime(theme,orbitMap({'orbit.radius':0})).runtime),still=holding.platforms[0];
  for(let i=0;i<10;i++)holding.step();assert.deepEqual({x:still.x,y:still.y},{x:200,y:120},'zero radius holds still');
});

test('the orbit platform carries a player standing on it like the moving platforms do',()=>{
  const runtime=api.compileReferenceRuntime(theme,orbitMap({'orbit.radius':40,'orbit.speed':1.5})).runtime,players=api.createPlayerBehavior(runtime),moving=api.createMovingPlatformBehavior(runtime,players),[orbit]=moving.platforms,p=players.player;
  Object.assign(p,{x:orbit.surface.x+orbit.surface.w/2-p.w/2,y:orbit.surface.y-p.h,vy:0,onGround:true});
  for(let i=0;i<120;i++){moving.step();players.step({})}
  assert.equal(p.onGround,true,'still riding after most of a lap');assert.equal(p.y+p.h,orbit.surface.y,'feet on the platform');
  assert(Math.abs(p.x+p.w/2-(orbit.surface.x+orbit.surface.w/2))<1,'carried sideways with it');
});

test('pack capability source sees its arguments and plain JavaScript, not the page',()=>{
  const odd=plain(theme);odd.capabilities.peek={source:"({ step(self) { self.state.saw = [typeof window, typeof document, typeof fetch, typeof globalThis, typeof localStorage, typeof Function, typeof Math, typeof JSON] } })"};
  odd.objects.goomba.capabilities=['peek',...odd.objects.goomba.capabilities];
  const behavior=api.createActorBehavior(api.compileReferenceRuntime(odd,mapOf([goomba(200,'g')])).runtime);behavior.step(null,null);
  assert.deepEqual(plain(behavior.actors[0].state.saw),['undefined','undefined','undefined','undefined','undefined','undefined','object','object']);
});

test('broken or impostor pack capabilities are reported, left unregistered, and the level still runs',()=>{
  const odd=plain(theme);
  odd.capabilities.broken={source:'({ step(self) { self.x += })'};
  odd.capabilities.extra={source:'({ step(self) {}, draw() {} })'};
  odd.capabilities.patrol={source:'({ step(self) { self.x += 100 } })'};
  odd.objects.goomba.capabilities=['broken',...odd.objects.goomba.capabilities];
  const result=api.compileReferenceRuntime(odd,mapOf([goomba(200,'g')]));
  assert.equal(result.ok,true);
  const codes=result.diagnostics.map(item=>`${item.code}:${item.capability}`);
  assert(codes.includes('pack-capability-invalid:broken'));assert(codes.includes('pack-capability-invalid:extra'));
  assert(codes.includes('pack-capability-shadows-builtin:patrol'),'a pack cannot replace a built-in');
  assert(codes.includes('unregistered-capability:broken'),'the object that names it is told nothing implements it');
  const behavior=api.createActorBehavior(result.runtime);behavior.step(null,null);assert.equal(behavior.actors[0].x,200.4,'the built-in patrol still walks it');
  assert.match(api.validateReferenceTheme({...theme,capabilities:[]}).join(' '),/capabilities must be an object/);
});

test('the demo map places an orbit platform',()=>{
  const demo=JSON.parse(fs.readFileSync('maps/demo.llmmap.txt','utf8')),result=api.compileReferenceRuntime(theme,demo);
  assert.equal(result.ok,true);assert.deepEqual(plain(result.diagnostics.filter(item=>item.severity==='error')),[]);
  const moving=api.createMovingPlatformBehavior(result.runtime),orbit=moving.platforms.find(platform=>platform.instance.placeable==='orbitPlatform');
  assert(orbit);const before={x:orbit.x,y:orbit.y};for(let i=0;i<30;i++)moving.step();assert.notDeepEqual({x:orbit.x,y:orbit.y},before);
});

test('the editor flags capability names nothing registers',()=>{
  const editor=fs.readFileSync('editor/reference_pack_editor.html','utf8'),semanticsContext={structuredClone,globalThis:{}};
  vm.runInNewContext(editor.match(/<script id="contractSemantics">([\s\S]*?)<\/script>/)[1],semanticsContext);const semantics=semanticsContext.globalThis.ReferencePackSemantics;
  assert.deepEqual(plain(semantics.unregisteredCapabilities(theme)),[],'the shipped theme names only registered capabilities');
  assert(semantics.registeredCapabilities(theme).has('orbit'),'pack capabilities count as registered');
  const odd=plain(theme);odd.objects.goomba.capabilities.push('teleport');delete odd.capabilities;
  assert.deepEqual(plain(semantics.unregisteredCapabilities(odd)),[{object:'goomba',capability:'teleport'},{object:'orbitPlatform',capability:'orbit'}]);
  assert(editor.includes('semantics.unregisteredCapabilities(theme)'),'theme load reports them as contract issues');
});

function playing(themeDocument,map){
  const frames=[],noop=()=>{},elements={screen:{width:960,height:480,getContext:()=>new Proxy({},{get:()=>noop})},stage:{getBoundingClientRect:()=>({width:960,height:480})},diagnostics:{textContent:'',className:''},empty:{hidden:false},themeButton:{},mapButton:{},fitButton:{},coinCount:{value:'',textContent:''},livesCount:{value:'',textContent:''},themeFile:{files:[],value:''},mapFile:{files:[],value:''}};
  class FakeImage{set src(value){this._src=value;this.onload?.()}get src(){return this._src}}
  const window={ReferencePackBoundary:api},clock={t:0};
  vm.runInNewContext(html.match(/<script>\s*([\s\S]*?)<\/script><\/body>/)[1],{window,document:{getElementById:id=>elements[id]},Image:FakeImage,devicePixelRatio:1,requestAnimationFrame(fn){frames.push(()=>fn(clock.t+=1000/60))},addEventListener:noop,Map,Set,Math,Promise,console:{...console,error:noop}});
  const engine=window.ReferenceEngine;return{engine,elements,run:async n=>{await engine.loadReferenceTheme(themeDocument);engine.loadReferenceEditorMap(map)},step:n=>{for(let i=0;i<n;i++)frames.shift()()}};
}
const orbitSource=theme.capabilities.orbit.source;

test('live edit: new capability code reaches running units without respawning them',async()=>{
  const t=plain(theme),game=playing(t,orbitMap({'orbit.radius':40,'orbit.speed':1}));await game.run();game.step(20);
  const orbit=()=>game.engine.state.platformBehavior.platforms[0],before={angle:orbit().state.angle,x:orbit().x,state:orbit().state};
  const faster=orbitSource.replace('s.angle += s.rate','s.angle += 3 * s.rate'),result=game.engine.reloadCapability('orbit',{description:'faster',source:faster});
  assert.equal(result.ok,true);assert.equal(result.units,1);
  assert.strictEqual(orbit().state,before.state,'the same unit and the same state: nothing respawned');assert.equal(orbit().state.angle,before.angle);
  game.step(10);assert(Math.abs(orbit().state.angle-(before.angle+30/40))<1e-9,'the next frames run the new code');
  assert.equal(game.engine.state.theme.capabilities.orbit.source,faster,'restart keeps the edit');assert.match(game.elements.diagnostics.textContent,/reloaded live: 1 unit/);
  game.engine.restartLevel();game.step(10);assert(Math.abs(orbit().state.angle-(-Math.PI/2+30/40))<1e-9,'and so does a restart, from a fresh init');
});

test('live edit: a refused edit changes nothing, a fix thaws the units it froze, and a new capability gets its init',async()=>{
  const t=plain(theme);t.objects.goomba.capabilities=['bob',...t.objects.goomba.capabilities];t.capabilities.broken={source:'({ step(self) { self.x += self.state.missing.value } })'};t.objects['koopa.red'].capabilities=['broken',...t.objects['koopa.red'].capabilities];
  const game=playing(t,mapOf([goomba(200,'g'),koopa(400,'k')]));await game.run();game.step(5);
  const [g,k]=game.engine.state.actorBehavior.actors;assert.equal(k.error.capability,'broken','the koopa froze on its broken capability');const frozenX=k.x;
  assert.equal(game.engine.reloadCapability('orbit',{source:'({ step( })'}).ok,false);assert.equal(game.engine.state.runtime.capabilities.get('orbit').source,orbitSource,'a source that does not compile leaves the old code running');
  assert.match(game.engine.reloadCapability('patrol',{source:'({ step() {} })'}).errors[0],/built in/);
  const fixed=game.engine.reloadCapability('broken',{source:'({ step(self) { self.state.fixed = (self.state.fixed || 0) + 1 } })'});
  assert.deepEqual({ok:fixed.ok,thawed:fixed.thawed},{ok:true,thawed:1});game.step(5);assert.equal(k.error,null);assert.notEqual(k.x,frozenX,'the unfrozen koopa walks again');assert.equal(k.state.fixed,5);
  const bob=game.engine.reloadCapability('bob',{source:'({ init(self) { self.state.base = self.y }, step(self) { self.state.bobs = (self.state.bobs || 0) + 1 } })'});
  assert.equal(bob.added,true);assert.equal(g.state.base,g.y,'a capability that arrives live runs its init on the units that name it');game.step(3);assert.equal(g.state.bobs,3);
});

test('the editor keeps capability source as text in the theme and refuses built-in names',()=>{
  const editor=fs.readFileSync('editor/reference_pack_editor.html','utf8'),context={globalThis:{},structuredClone};vm.runInNewContext(editor.match(/<script id="unitPacks">([\s\S]*?)<\/script>/)[1],context);const units=context.globalThis.ReferencePackUnits;
  const next=units.setCapabilitySource(theme,'drift',{description:'d',source:'({ step(self) { self.x += 1 } })'},{builtIns:theme.contract.engineVocabulary.capabilities});
  assert.deepEqual(plain(next.capabilities.drift),{description:'d',source:'({ step(self) { self.x += 1 } })'});assert.equal(theme.capabilities.drift,undefined,'the original theme is untouched');
  assert.throws(()=>units.setCapabilitySource(theme,'patrol',{source:'({})'},{builtIns:theme.contract.engineVocabulary.capabilities}),/built in/);
  assert.throws(()=>units.setCapabilitySource(theme,'drift',{source:'  '}),/source text/);
  assert(editor.includes('engine.reloadCapability(name,entry)'),'Apply hands the text to a game sharing the page');
});
