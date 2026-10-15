#!/usr/bin/env node
'use strict';
// Offline reachability report for a reference map, using the engine's own simulateReachability.
// Usage: node scripts/reachability_report.js maps/demo.llmmap.txt [--from X,Y] [--profile standing|raccoonFlight]
//        [--theme path.llmtheme.txt] [--max-steps N] [--json]
const fs=require('node:fs'),path=require('node:path'),vm=require('node:vm');
const root=path.resolve(__dirname,'..');

function usage(message){if(message)console.error(message);console.error('usage: node scripts/reachability_report.js MAP [--from X,Y] [--profile standing|raccoonFlight] [--theme THEME] [--max-steps N] [--json]');process.exit(2)}
function parseArgs(argv){
  const options={profile:'standing',theme:path.join(root,'themes/theme_marioai_reference_pack.llmtheme.txt'),json:false,from:null,maxSteps:2000000,map:null};
  for(let i=0;i<argv.length;i++){const arg=argv[i],next=()=>argv[++i]??usage(`${arg} needs a value`);
    if(arg==='--json')options.json=true;else if(arg==='--profile')options.profile=next();else if(arg==='--theme')options.theme=next();else if(arg==='--max-steps')options.maxSteps=Number(next());
    else if(arg==='--from'){const [x,y]=next().split(',').map(Number);if(!Number.isFinite(x)||!Number.isFinite(y))usage('--from expects X,Y');options.from={x,y}}
    else if(arg.startsWith('--'))usage(`unknown option ${arg}`);else if(options.map)usage('only one map at a time');else options.map=arg}
  if(!options.map)usage();if(!['standing','raccoonFlight'].includes(options.profile))usage('profile must be standing or raccoonFlight');return options;
}
function loadEngine(){
  const html=fs.readFileSync(path.join(root,'engine/reference_pack_engine.html'),'utf8'),source=html.match(/<script id="referencePackBoundary">([\s\S]*?)<\/script>/)[1],context={globalThis:{}};
  vm.runInNewContext(source,context);return context.globalThis.ReferencePackBoundary;
}
const describe=span=>`#${span.id} ${span.source?span.source.placeable+(span.source.instanceId?` (${span.source.instanceId})`:''):'surface'} x${span.x}..${span.x+span.w} y${span.y}${span.kind==='oneWay'?' one-way':''}`;

const options=parseArgs(process.argv.slice(2)),api=loadEngine();
const theme=JSON.parse(fs.readFileSync(options.theme,'utf8')),map=JSON.parse(fs.readFileSync(options.map,'utf8')),from=options.from||map.markers?.start;
if(!from)usage('map has no start marker; pass --from X,Y');
const started=Date.now(),result=api.simulateReachability(theme,map,from,{profile:options.profile,maxSteps:options.maxSteps});
if(!result.ok){console.error(result.errors.join('\n'));process.exit(1)}

if(options.json)process.stdout.write(JSON.stringify(result,null,2)+'\n');else report();
function report(){
const spans=result.spans,reached=spans.filter(span=>span.hop!==null),byHop=new Map();
for(const span of reached)byHop.set(span.hop,[...(byHop.get(span.hop)||[]),span]);
const out=[];
out.push(`${path.basename(options.map)} · ${options.profile} from ${from.x},${from.y} · ${Date.now()-started} ms · ${result.stats.programs} programs / ${result.stats.steps} steps${result.stats.truncated?' · BUDGET HIT (partial)':''}`);
out.push(`${reached.length}/${spans.length} surfaces reachable${result.goal?` · goal ${result.goal.reachable?`reachable in ${result.goal.hop} move(s)`:'NOT reachable'}`:' · no goal marker'}`);
out.push('');out.push('Moves from start:');
for(const hop of [...byHop.keys()].sort((a,b)=>a-b))out.push(`  ${hop}: ${byHop.get(hop).map(describe).join('; ')}`);
const unreached=spans.filter(span=>span.hop===null);
if(unreached.length){out.push('');out.push('Unreachable:');for(const span of unreached)out.push(`  ${describe(span)}`)}
const pipes=result.edges.filter(edge=>edge.kind==='pipe'),seenPipes=new Set();
if(pipes.length){out.push('');out.push('Pipe routes:');for(const edge of pipes){if(seenPipes.has(edge.pipe))continue;seenPipes.add(edge.pipe);out.push(`  ${edge.pipe}: enter near ${edge.entry.x},${edge.entry.y} → land on ${describe(spans[edge.to])}`)}}
if(result.pockets.length){out.push('');out.push('Pockets (reachable, but no route back out):');for(const pocket of result.pockets)out.push(`  ${pocket.containsGoal?'[contains goal] ':''}${pocket.complete?'':'[partial] '}${pocket.spans.map(id=>describe(spans[id])).join('; ')}`)}
const needs=new Map();for(const edge of result.edges)for(const need of edge.needs)needs.set(need,(needs.get(need)||0)+1);
if(needs.size){out.push('');out.push(`Edge requirements (cheapest known): ${[...needs].map(([need,count])=>`${need} ×${count}`).join(', ')}`)}
process.stdout.write(out.join('\n')+'\n');
}
