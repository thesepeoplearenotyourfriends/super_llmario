(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.LLMarioConstruction=api})(typeof globalThis!=='undefined'?globalThis:this,function(){
  'use strict';
  const TYPES=new Set(['terrain','resizable','span','fixed','parametric']);
  function entries(catalog){return catalog&&catalog.version===1&&catalog.families&&typeof catalog.families==='object'?catalog.families:{}}
  function validate(catalog){const errors=[];if(!catalog||catalog.version!==1)errors.push('constructionCatalog.version must be 1');for(const [id,e] of Object.entries(entries(catalog))){if(e.id&&e.id!==id)errors.push(id+': id must match key');if(!TYPES.has(e.type))errors.push(id+': unsupported type '+e.type);if(!e.name)errors.push(id+': name is required');if(e.ascii!=null&&typeof e.ascii!=='object')errors.push(id+': ascii must be an object or null')}return errors}
  function clamp(n,min,max){n=Math.round(Number(n)||min);return Math.max(min,Math.min(max==null?Infinity:max,n))}
  function part(role,x,y,w=1,h=1){return {role,x,y,w,h}}
  function construct(entry,size={}){if(!entry)throw Error('unknown construction family');const d=entry.dimensions||{},w=clamp(size.w,d.minW||1,d.maxW),h=clamp(size.h,d.minH||1,d.maxH),c=entry.components||{},out=[];
    if(entry.type==='fixed')for(const p of c.parts||[])out.push(part(p.role,p.x||0,p.y||0,p.w||1,p.h||1));
    else if(entry.type==='span'){if(w===1)out.push(part(c.single||c.middle||c.left,0,0));else{out.push(part(c.left,0,0));for(let x=1;x<w-1;x++)out.push(part(c.middle,x,0));out.push(part(c.right,w-1,0))}}
    else if(entry.type==='resizable'){for(const p of c.cap||[])out.push(part(p.role,p.x||0,p.y||0));for(let y=1;y<h;y++)for(const p of c.body||[])out.push(part(p.role,p.x||0,y));}
    else if(entry.type==='parametric'){const cap=c.cap||{};if(w===1)out.push(part(cap.single||cap.middle,0,0));else{out.push(part(cap.left,0,0));for(let x=1;x<w-1;x++)out.push(part(cap.middle,x,0));out.push(part(cap.right,w-1,0))}const stem=c.stem||{};for(let y=1;y<h;y++)for(let x=0;x<w;x++){let r=x===0?stem.left:x===w-1?stem.right:stem.middle;if(r)out.push(part(r,x,y))}}
    return out.filter(p=>p.role).map(p=>Object.assign(p,{family:entry.id||null}));
  }
  function terrainRole(entry,cells,x,y){const has=(dx,dy)=>cells.has((x+dx)+','+(y+dy)),top=has(0,-1),right=has(1,0),bottom=has(0,1),left=has(-1,0),key=[top,right,bottom,left].map(Boolean).map(Number).join(''),roles=entry.components&&entry.components.topology||{};return roles[key]||roles.default||null}
  function resolveTerrain(entry,cells,changed){const affected=new Set();for(const q of changed||cells){const [x,y]=typeof q==='string'?q.split(',').map(Number):[q.x,q.y];for(const [dx,dy] of [[0,0],[0,-1],[1,0],[0,1],[-1,0]]){const k=(x+dx)+','+(y+dy);if(cells.has(k))affected.add(k)}}return [...affected].sort().map(k=>{const [x,y]=k.split(',').map(Number);return {family:entry.id,role:terrainRole(entry,cells,x,y),x,y,w:1,h:1}}).filter(p=>p.role)}
  function resolveRole(theme,role){const e=Object.values(entries(theme&&theme.constructionCatalog)).find(f=>f.assets&&f.assets[role]);return e&&e.assets[role]||null}
  function asciiMaps(catalog){const imports={},exports={};for(const [id,e] of Object.entries(entries(catalog))){if(!e.ascii)continue;if(e.ascii.import)imports[e.ascii.import]=id;if(e.ascii.export)exports[id]=e.ascii.export}return {imports,exports}}
  return {validate,construct,resolveTerrain,terrainRole,resolveRole,asciiMaps};
});
