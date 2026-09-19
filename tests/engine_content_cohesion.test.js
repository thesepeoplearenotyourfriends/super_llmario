'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm'),childProcess=require('node:child_process');
const engine=fs.readFileSync('engine/engine.html','utf8');

function fn(source,name){const start=source.indexOf('function '+name+'(');assert(start>=0,'missing '+name);let paren=source.indexOf('(',start),pd=0,brace=-1;for(let i=paren;i<source.length;i++){if(source[i]==='(')pd++;else if(source[i]===')'&&!--pd){brace=source.indexOf('{',i);break}}let depth=0,quote='',escape=false;for(let i=brace;i<source.length;i++){const ch=source[i];if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch===quote)quote='';continue}if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue}if(ch==='{')depth++;else if(ch==='}'&&!--depth)return source.slice(start,i+1)}throw Error('unterminated '+name)}
function constObject(source,name){const start=source.indexOf('const '+name+' =');assert(start>=0,'missing '+name);const brace=source.indexOf('{',start);let depth=0,quote='',escape=false;for(let i=brace;i<source.length;i++){const ch=source[i];if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch===quote)quote='';continue}if(ch==='"'||ch==="'"){quote=ch;continue}if(ch==='{')depth++;else if(ch==='}'&&!--depth)return vm.runInNewContext('('+source.slice(brace,i+1)+')')}throw Error('unterminated '+name)}
function generatedDoc(source,name){const line=source.split('\n').find(value=>value.startsWith('const '+name+' = JSON.parse('));assert(line,'missing '+name);return vm.runInNewContext(line.slice(line.indexOf('=')+1,-1))}
const cloneData=x=>JSON.parse(JSON.stringify(x));
function mergeCartValue(base,incoming){if(Array.isArray(incoming))return cloneData(incoming);if(incoming&&typeof incoming==='object'){const out=base&&typeof base==='object'&&!Array.isArray(base)?cloneData(base):{};for(const k of Object.keys(incoming))out[k]=mergeCartValue(out[k],incoming[k]);return out}return incoming===undefined?cloneData(base):incoming}
const defaults=constObject(engine,'ENGINE_DEFAULT_AUDIO');
const demo={audio:defaults,recipes:{hero:{prefab:'physicsMascot'},platforms:{ground:{prefab:'physicsGrass'}}},resourceScenery:{trees:[{x:1}]},world:{width:100,groundY:90},playerSpawn:{x:1,y:2},platforms:[],floatingBlocks:[],coins:[],stars:[],enemies:[],signposts:[],portal:{x:80,y:20,w:10,h:20}};
const c=vm.createContext({console,JSON,ENGINE_DEFAULT_AUDIO:defaults,DEMO_CART:demo,LEVEL_FUNDAMENTALS:{},PENDING_MAP_LABEL:'map',isThemeDoc:x=>x.format==='llmario-theme-pack-v1',isMapDoc:x=>x.format==='llmario-map-v1',mapThemeIdOf:x=>x.theme,themeIdOf:x=>x.id,cloneData,mergeCartValue,normalizeMapMessages:m=>m.messages||{},convertTruthSlopePlatformsToSprites:x=>x,isPlainObject:x=>!!x&&typeof x==='object'&&!Array.isArray(x),normalizeCartridgePlacements:x=>x});
vm.runInContext(['buildCartFromThemeAndMap','normalizeCart'].map(n=>fn(engine,n)).join('\n'),c);
const build=vm.runInContext('buildCartFromThemeAndMap',c),normalize=vm.runInContext('normalizeCart',c);
const mapBase={format:'llmario-map-v1',theme:'test-theme',title:'Test',world:{width:100,groundY:90},playerSpawn:{x:1,y:2},platforms:[],floatingBlocks:[],coins:[],stars:[],enemies:[],signposts:[],portal:{x:80,y:20,w:10,h:20}};

// Standalone startup embeds the authoritative split documents and composes
// them through the existing split builder before the first animation frame.
const defaultTheme=generatedDoc(engine,'DEFAULT_THEME_DOC'),defaultMap=generatedDoc(engine,'DEFAULT_MAP_DOC');
const sourceTheme=JSON.parse(fs.readFileSync('themes/theme_marioai_nonempty.llmtheme.txt','utf8')),sourceMap=JSON.parse(fs.readFileSync('maps/map_marioai_reference.llmmap.txt','utf8'));
assert.deepEqual(cloneData(defaultTheme),sourceTheme);assert.deepEqual(cloneData(defaultMap),sourceMap);
assert.equal(defaultTheme.id,'marioai-semantic-nonempty');assert.equal(defaultMap.theme,defaultTheme.id);
const startup=engine.indexOf("if(!applyThemeMapIfReady()) throw new Error('Bundled default theme/map failed to initialize.')"),loop=engine.indexOf('engineBooted = true;\nloop();');
assert(startup>=0&&startup<loop);assert(engine.includes('let ACTIVE_CART = DEMO_CART;'));assert(engine.includes('const base = raw.splitSource ? {audio:ENGINE_DEFAULT_AUDIO} : DEMO_CART;'));
const defaultCart=build(defaultTheme,defaultMap);assert.deepEqual(cloneData(defaultCart.recipes),cloneData(defaultTheme.recipes));assert.notEqual(defaultCart.recipes.hero&&defaultCart.recipes.hero.prefab,'physicsMascot');
childProcess.execFileSync('python',['scripts/sync_engine_default_content.py','--check'],{stdio:'pipe'});

// Split documents own their complete visual identity and map scenery.
let cart=build({format:'llmario-theme-pack-v1',id:'test-theme',recipes:{hero:{prefab:'themeHero'}}},{...mapBase,resourceScenery:{shrubs:[{x:9}]}});
assert.deepEqual(cloneData(cart.recipes),{hero:{prefab:'themeHero'}});
assert.deepEqual(cloneData(cart.resourceScenery),{shrubs:[{x:9}]});
cart=normalize(cart);
assert.deepEqual(cloneData(cart.recipes),{hero:{prefab:'themeHero'}});
assert.deepEqual(cloneData(cart.resourceScenery.shrubs),[{x:9}]);
assert.deepEqual(cloneData(cart.resourceScenery.trees),[]);

// Engine defaults survive absent/partial theme audio, while map keys win last.
cart=build({format:'llmario-theme-pack-v1',id:'test-theme',recipes:{}},mapBase);
assert.deepEqual(cloneData(cart.audio.sfx.jump),cloneData(defaults.sfx.jump));
const themedCoin=[{role:'bell',note:1}],mapJump=[{role:'lead',note:2}];
cart=build({format:'llmario-theme-pack-v1',id:'test-theme',recipes:{},audio:{sfx:{coin:themedCoin}}},{...mapBase,audio:{sfx:{jump:mapJump}}});
assert.deepEqual(cloneData(cart.audio.sfx.coin),themedCoin);
assert.deepEqual(cloneData(cart.audio.sfx.jump),mapJump);
assert.deepEqual(cloneData(cart.audio.sfx.star),cloneData(defaults.sfx.star));

// Legacy monolithic carts keep compatibility inheritance, but supplied map
// scenery remains isolated from the embedded demo scenery.
const legacy=normalize({format:'llmcart-toybox-recipe',world:{width:120,groundY:90},playerSpawn:{x:2,y:3},platforms:[],floatingBlocks:[],coins:[],stars:[],enemies:[],signposts:[],portal:{x:90,y:20,w:10,h:20},recipes:{blocks:{custom:{prefab:'custom'}}},audio:{sfx:{coin:themedCoin}},resourceScenery:{shrubs:[{x:7}]}});
assert.equal(legacy.recipes.hero.prefab,'physicsMascot');
assert.equal(legacy.recipes.blocks.custom.prefab,'custom');
assert.deepEqual(cloneData(legacy.audio.sfx.jump),cloneData(defaults.sfx.jump));
assert.deepEqual(cloneData(legacy.audio.sfx.coin),themedCoin);
assert.deepEqual(cloneData(legacy.resourceScenery.shrubs),[{x:7}]);
assert.deepEqual(cloneData(legacy.resourceScenery.trees),[]);
console.log('engine content cohesion tests passed');
