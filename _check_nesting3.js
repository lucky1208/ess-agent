const fs = require('fs');
const h = fs.readFileSync('E:/project/储能/ess-platform/index.html', 'utf8');
const lines = h.split('\n');
let depth = 0;
for (let i = 854; i < 1137; i++) {
  const opens = (lines[i].match(/<div[\s>]/g) || []).length;
  const closes = (lines[i].match(/<\/div>/g) || []).length;
  const prevDepth = depth;
  depth += opens - closes;
  if (i >= 1130) {
    console.log(`Line ${i+1}: opens=${opens} closes=${closes} depth=${depth} (was ${prevDepth})`);
  }
}
console.log('Total unclosed divs at line 1137:', depth);
console.log('Need', depth, 'closing </div> tags before AIDC pages');