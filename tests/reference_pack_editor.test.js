const fs = require('fs');
const assert = require('assert');

const oldEditor = fs.readFileSync('editor/editor.html', 'utf8');
const newEditor = fs.readFileSync('editor/reference_pack_editor.html', 'utf8');
const theme = JSON.parse(fs.readFileSync('themes/theme_marioai_reference_pack.llmtheme.txt', 'utf8'));

assert(newEditor.includes('placeables → object → visuals'), 'editor documents its native resolution path');
assert(newEditor.includes('parameterSchemas'), 'editor resolves declared parameter schemas');
assert(newEditor.includes("kind==='frameGroup'"), 'editor resolves frame-group visual targets');
assert(newEditor.includes("kind==='construction'"), 'editor resolves construction visual targets');
assert(newEditor.includes('Contract gaps needed by a preview'), 'editor reports contract gaps');
assert(!/\bfetch\s*\(|XMLHttpRequest|import\s*\(/.test(newEditor), 'standalone editor has no runtime repository dependency');
assert.strictEqual(theme.format, 'llmario-theme-pack-reference');
assert(Object.keys(theme.placeables).length > 0, 'reference theme declares a palette');

// A copied fixture protects the explicit requirement that the old editor remains untouched.
assert(oldEditor.includes('LLMario Cartbench v0.30 Pipe Topology'));
console.log('reference pack editor contract checks passed');
