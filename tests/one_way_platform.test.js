'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),C=require('../construction/catalog.js');
const engine=fs.readFileSync('engine/engine.html','utf8'),editor=fs.readFileSync('editor/editor.html','utf8');

function fn(source,name){const start=source.indexOf('function '+name+'(');assert(start>=0,'missing '+name);let brace=source.indexOf('{',start),depth=0,quote='',escape=false;for(let i=brace;i<source.length;i++){const ch=source[i];if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch===quote)quote='';continue}if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue}if(ch==='{')depth++;else if(ch==='}'&&!--depth)return source.slice(start,i+1)}throw Error('unterminated '+name)}
const oneWay={x:40,y:100,w:64,h:4,collision:{kind:'oneWayTop'},collisionOnly:true},solid={x:120,y:100,w:64,h:20},player={x:50,y:70,w:16,h:20,vx:0,vy:12,onGround:false};
const context=vm.createContext({platforms:[oneWay,solid],player,ACTIVE_CART:{resourceScenery:{}},floatingBlocks:[],String,isSlopePlatform:()=>false,aabb:(a,b)=>a.x<b.x+b.w&&a.x+a.w>b.x&&a.y<b.y+b.h&&a.y+a.h>b.y,imageSpriteSolid:()=>null,floatingSolid:()=>null,sceneryPipeSolid:x=>x});
vm.runInContext(['isOneWayTop','hitSolids','resolvePlayerOneWayTops'].map(n=>fn(engine,n)).join('\n'),context);
const hitSolids=vm.runInContext('hitSolids',context),land=vm.runInContext('resolvePlayerOneWayTops',context);

assert.deepEqual(Array.from(hitSolids({x:45,y:95,w:10,h:10})),[],'one-way volume and side never enter ordinary solid resolution');
assert.equal(hitSolids({x:125,y:95,w:10,h:10})[0],solid,'ordinary solid behavior remains in the full-solid query');
player.y=70;player.vy=12;player.y+=player.vy;assert.equal(land(70,12),true);assert.equal(player.y,80);assert.equal(player.vy,0);assert.equal(player.onGround,true,'falling feet crossing the plane land');
player.onGround=false;player.vy=1;player.y+=1;assert.equal(land(80,1),true);assert.equal(player.y,80);assert(player.onGround,'standing remains stable under gravity');
player.x=200;player.y=80;player.vy=2;player.onGround=false;player.y+=2;assert.equal(land(80,2),false);assert.equal(player.onGround,false,'walking beyond the cap falls');
player.x=50;player.y=106;player.vy=-12;player.y+=player.vy;assert.equal(land(106,-12),false);assert.equal(player.y,94,'upward travel and underside pass through without correction or bonk');
player.y=95;player.vy=0;assert.equal(land(95,0),false);assert.equal(player.y,95,'an actor already below/intersecting never snaps upward');
player.x=30;player.y=90;player.vx=15;player.x+=player.vx;assert.deepEqual(Array.from(hitSolids(player)),[],'lateral entry through the side is permeable');

const theme=JSON.parse(fs.readFileSync('themes/theme_marioai_nonempty.llmtheme.txt','utf8')),entry=theme.constructionCatalog.families['mushroom.platform'];
assert.equal(entry.authoringBinding.noun,'oneWayPlatform');
const root={platforms:[]},group='mushroom-7',origin={x:32,y:48};
let binding=C.updateBinding(root,entry,group,origin,{w:5,h:4},{semanticFamily:entry.id});
assert.deepEqual(binding.collision,{kind:'oneWayTop'});assert.equal(binding.x,32);assert.equal(binding.y,48);assert.equal(binding.w,80);assert.equal(binding.collisionOnly,true);
root.platforms.push({...binding,w:999});binding=C.updateBinding(root,entry,group,{x:48,y:64},{w:7,h:3});
assert.equal(root.platforms.length,1,'resize removes duplicate/stale logical bindings');assert.equal(binding.x,48);assert.equal(binding.y,64);assert.equal(binding.w,112);
const visuals=C.construct(entry,{w:7,h:3}).map(q=>({image:q.asset,visualOnly:true,constructionGroup:group}));
assert(visuals.every(v=>v.visualOnly&&!v.solid&&!v.collision),'cap and stem parts stay visual-only');assert.equal(root.platforms.filter(p=>p.constructionGroup===group).length,1,'one cap-wide logical surface only');
assert.equal(root.platforms.some(p=>/stem/i.test(String(p.image||''))),false,'stem has no collision object');
const saved=JSON.parse(JSON.stringify({platforms:root.platforms,resourceScenery:{sprites:visuals}}));assert.equal(saved.platforms[0].collision.kind,'oneWayTop');assert.equal(saved.platforms[0].constructionGroup,group,'save/reload preserves collision identity and group');

assert(editor.includes("collisionKind(r.it.obj&&r.it.obj.collision).toLowerCase()==='onewaytop'"),'Cartbench contour reads the actual logical collision kind');
assert(editor.includes("ctx.moveTo(p.x,p.y);ctx.lineTo(q.x,q.y);continue"),'one-way overlay is drawn as a top plane');
assert(!editor.includes('mushroom_platform.cap')||!fn(editor,'effectiveCollisionRect').includes('mushroom'),'collision overlay does not infer mushroom-cap hitboxes');
console.log('one-way platform regression tests passed');
