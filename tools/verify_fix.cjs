const { readFileSync } = require('fs');
const html = readFileSync('E:\\project\\储能\\ess-platform\\index.html', 'utf8');

// Find Block 3 (the inline client-render-svg.js block)
const re = /<script[^>]*>([\s\S]*?)<\/script>/gi;
let m, idx = 0;
while ((m = re.exec(html)) !== null) {
  idx++;
  const code = m[1].trim();
  if (code.length < 100) continue;
  try {
    new Function(code);
  } catch (e) {
    console.log('Block ' + idx + ' ERROR: ' + e.message + ' (offset ' + m.index + ', len ' + code.length + ')');
    // Find the error location
    const errorLineMatch = e.message.match(/position (\d+)/);
    if (errorLineMatch) {
      const pos = parseInt(errorLineMatch[1]);
      console.log('Error near: ' + code.substring(Math.max(0, pos - 50), pos + 50));
    }
  }
}
