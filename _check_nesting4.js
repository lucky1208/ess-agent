const fs = require('fs');
const h = fs.readFileSync('E:/project/储能/ess-platform/index.html', 'utf8');
const lines = h.split('\n');
let depth = 0;
let startLine = -1;
for (let i = 0; i < lines.length; i++) {
  if (lines[i].includes('id="page-mg-software"')) {
    startLine = i;
    depth = 1;
    continue;
  }
  if (startLine >= 0) {
    const opens = (lines[i].match(/<div[\s>]/g) || []).length;
    const closes = (lines[i].match(/<\/div>/g) || []).length;
    depth += opens - closes;
    if (depth <= 0) {
      console.log('page-mg-software closes at line', i + 1, ':', lines[i].trim().substring(0, 80));
      break;
    }
  }
}
// Check AIDC is now outside
const aidcStart = h.indexOf('id="page-aidc-design"');
const mgSoftEnd = h.indexOf('</div></div>\n\n<!-- ========== AIDC PAGES');
console.log('AIDC is after mg-software close:', aidcStart > mgSoftEnd);