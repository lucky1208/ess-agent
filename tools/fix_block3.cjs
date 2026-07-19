const { readFileSync, writeFileSync } = require('fs');
let html = readFileSync('E:\\project\\储能\\ess-platform\\index.html', 'utf8');

// Block 3 is from offset ~3542414 to ~7303193
// It contains a copy of the page JS code with the OLD switchCategory
// We need to fix the mc.style.display settings in Block 3

const b3Start = html.indexOf('<script', 3542000);
const b3End = html.indexOf('</script>', b3Start);

console.log('Block 3 script: offset', b3Start, 'to', b3End);

// Find all mc.style.display='none' in Block 3 and replace with 'none' -> need to hide main-container for non-ess
// But actually, Block 3 has the OLD code without mainEl. We need to:
// 1. Add mainEl variable
// 2. Change mc.style.display for non-ess categories

const b3 = html.substring(b3Start, b3End);

// Count occurrences
const mcNoneCount = (b3.match(/mc\.style\.display='none'/g) || []).length;
const mcEmptyCount = (b3.match(/mc\.style\.display=''/g) || []).length;
console.log('Before fix - mc_none:', mcNoneCount, 'mc_empty:', mcEmptyCount);

// The issue: Block 3's switchCategory sets mc.style.display='none' for non-ess categories
// But it doesn't have mainEl, so main.content stays visible and covers the non-ess pages

// Strategy: Replace the entire switchCategory function in Block 3 with the corrected version
// Find the function in Block 3
const switchStart = b3.indexOf('function switchCategory(cat)');
if (switchStart === -1) {
  console.log('ERROR: switchCategory not found in Block 3');
  process.exit(1);
}

// Find the end of the function (next function declaration or closing brace at depth 0)
let depth = 0;
let pos = switchStart;
let funcEnd = -1;
let inFunction = false;
while (pos < b3.length) {
  if (b3.substring(pos, pos + 8) === 'function ') {
    if (inFunction && depth === 0) {
      funcEnd = pos;
      break;
    }
    inFunction = true;
  }
  if (b3[pos] === '{') depth++;
  if (b3[pos] === '}') {
    depth--;
    if (inFunction && depth === 0) {
      // Check if next non-whitespace is another function or end
      const after = b3.substring(pos + 1, pos + 20).trim();
      if (after.startsWith('function') || after.startsWith('//') || after === '') {
        funcEnd = pos + 1;
        break;
      }
    }
  }
  pos++;
}

console.log('switchCategory in B3: offset', switchStart, 'to', funcEnd);
console.log('Function length:', funcEnd - switchStart);

// Get the corrected switchCategory from Block 4
const b4Start = html.indexOf('<script', b3End);
const b4 = html.substring(b4Start);
const b4SwitchStart = b4.indexOf('function switchCategory(cat)');
let b4Depth = 0;
let b4Pos = b4SwitchStart;
let b4FuncEnd = -1;
let b4InFunc = false;
while (b4Pos < b4.length) {
  if (b4.substring(b4Pos, b4Pos + 8) === 'function ') {
    if (b4InFunc && b4Depth === 0) {
      b4FuncEnd = b4Pos;
      break;
    }
    b4InFunc = true;
  }
  if (b4[b4Pos] === '{') b4Depth++;
  if (b4[b4Pos] === '}') {
    b4Depth--;
    if (b4InFunc && b4Depth === 0) {
      const after = b4.substring(b4Pos + 1, b4Pos + 20).trim();
      if (after.startsWith('function') || after.startsWith('//') || after === '') {
        b4FuncEnd = b4Pos + 1;
        break;
      }
    }
  }
  b4Pos++;
}

const correctedFunc = b4.substring(b4SwitchStart, b4FuncEnd);
console.log('Corrected function length:', correctedFunc.length);

// Replace in Block 3
const oldFunc = b3.substring(switchStart, funcEnd);
const newB3 = b3.substring(0, switchStart) + correctedFunc + b3.substring(funcEnd);

// Verify
const newMcNone = (newB3.match(/mc\.style\.display='none'/g) || []).length;
const newMcEmpty = (newB3.match(/mc\.style\.display=''/g) || []).length;
const newMainEl = newB3.includes("mainEl=document.querySelector('main.content')");
console.log('After fix - mc_none:', newMcNone, 'mc_empty:', newMcEmpty, 'has_mainEl:', newMainEl);

// Reconstruct the full HTML
html = html.substring(0, b3Start) + newB3 + html.substring(b3End);

writeFileSync('E:\\project\\储能\\ess-platform\\index.html', html);
console.log('Block 3 switchCategory fixed!');