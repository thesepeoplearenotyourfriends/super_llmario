'use strict';
const assert=require('node:assert/strict'),fs=require('node:fs'),vm=require('node:vm');
const editor=fs.readFileSync('editor/editor.html','utf8');
const theme=JSON.parse(fs.readFileSync('themes/theme_marioai_nonempty.llmtheme.txt','utf8'));
function fn(name){const start=editor.indexOf('function '+name+'(');assert(start>=0,'missing '+name);const brace=editor.indexOf('{',start);let depth=0,quote='',escape=false;for(let i=brace;i<editor.length;i++){const ch=editor[i];if(quote){if(escape)escape=false;else if(ch==='\\')escape=true;else if(ch===quote)quote='';continue}if(ch==='"'||ch==="'"||ch==='`'){quote=ch;continue}if(ch==='{')depth++;else if(ch==='}'&&!--depth)return editor.slice(start,i+1)}throw Error('unterminated '+name)}
const context=vm.createContext({themePack:theme,cart:{}});vm.runInContext(fn('validateAuthoringCatalog')+'\n'+fn('insertOptionEntries'),context);
const validate=vm.runInContext('validateAuthoringCatalog',context),entries=vm.runInContext('insertOptionEntries()',context);
assert.deepEqual(Array.from(validate(theme)),[],'reference catalog is valid');
assert.equal(entries.length,theme.authoringCatalog.entries.length,'palette is exactly the declared vocabulary');
assert(entries.every((e,i)=>e.value==='authoring:'+theme.authoringCatalog.entries[i].id));
assert(entries.every(e=>!e.value.startsWith('asset:')&&!e.value.startsWith('terrainFamilyAsset:')&&!e.value.startsWith('enemyTheme:')),'raw resources and animation frames do not leak');
assert(!entries.some(e=>/frame_|cap\.|stem\.|body\./.test(e.value)),'implementation components are absent');
function broken(change){const copy=structuredClone(theme);change(copy.authoringCatalog.entries,copy);return Array.from(validate(copy)).join('\n')}
assert.match(broken(es=>es.push({...es[0]})),/duplicate authoring id/);
assert.match(broken(es=>es[0].preview='missing.asset'),/missing preview resource/);
assert.match(broken(es=>es.find(e=>e.family).family='missing.family'),/missing construction family/);
assert.match(broken(es=>es[0].operation='script'),/unknown authoring operation/);
assert.match(broken(es=>es[0].kind='sparkleFrame'),/unknown authoring kind/);
console.log('MarioAI authoring catalog tests passed');
