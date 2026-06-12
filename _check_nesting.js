const fs = require('fs');
const h = fs.readFileSync('E:/project/储能/ess-platform/index.html', 'utf8');
const lines = h.split('\n');
let depth = 0;
for (let i = 854; i < 1138; i++) {
  const line = lines[i];
  const opens = (line.match(/<div[\s>]/g) || []).length;
  const closes = (line.match(/<\/div>/g) || []).length;
  depth += opens - closes;
}
console.log('Div depth at line 1137:', depth);
// Also check if page-aidc-design is inside page-mg-software
const aidcStart = h.indexOf('id="page-aidc-design"');
const mgSoftStart = h.indexOf('id="page-mg-software"');
const mgSoftEnd = h.indexOf('</div>', h.indexOf('swDeliveryList'));
console.log('mg-software starts at char:', mgSoftStart);
console.log('aidc-design starts at char:', aidcStart);
console.log('Is AIDC inside mg-software?', aidcStart > mgSoftStart && aidcStart < mgSoftEnd + 100);