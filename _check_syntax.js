const fs = require('fs');
const html = fs.readFileSync('E:/project/储能/ess-platform/index.html', 'utf8');
const scriptRegex = /<script[^>]*>([\s\S]*?)<\/script>/g;
let match;
let blockIdx = 0;
while ((match = scriptRegex.exec(html)) !== null) {
  const code = match[1];
  if (code.trim().length === 0) continue;
  try {
    new Function(code);
    console.log('Block ' + blockIdx + ': OK (' + code.length + ' chars)');
  } catch (e) {
    console.log('Block ' + blockIdx + ': ERROR - ' + e.message);
    // Find the line with error
    const lines = code.split('\n');
    const lineMatch = e.message.match(/line (\d+)/);
    if (lineMatch) {
      const errLine = parseInt(lineMatch[1]);
      for (let i = Math.max(0, errLine - 3); i < Math.min(lines.length, errLine + 3); i++) {
        console.log((i + 1) + ': ' + lines[i]);
      }
    }
  }
  blockIdx++;
}