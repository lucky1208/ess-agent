import { readFileSync } from 'fs';
const html = readFileSync('E:\\project\\储能\\ess-platform\\index.html', 'utf8');

// Check for negative height/width in SVG attributes
const negRe = /(?:height|width)\s*=\s*["'](-\d+[^"']*)["']/gi;
let m;
while ((m = negRe.exec(html)) !== null) {
  console.log('Negative dimension at offset ' + m.index + ': ' + m[0].substring(0, 80));
}

// Check for invalid path d attributes (starting with non-number/non-command)
const pathRe = /<path[^>]*\bd\s*=\s*["']([^"']+)/gi;
let badPaths = 0;
while ((m = pathRe.exec(html)) !== null) {
  const d = m[1].trim();
  if (d && !/^[MmZzLlHhVvCcSsQqTtAa0-9.\-\s,]/.test(d)) {
    badPaths++;
    if (badPaths <= 10) {
      console.log('Bad path d at offset ' + m.index + ': ' + d.substring(0, 60));
    }
  }
}
if (badPaths > 10) console.log('... and ' + (badPaths - 10) + ' more bad paths');
console.log('Total bad paths: ' + badPaths);