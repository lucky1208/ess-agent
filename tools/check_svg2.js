import { readFileSync } from 'fs';
const html = readFileSync('E:\\project\\储能\\ess-platform\\index.html', 'utf8');

// Find inline SVG elements with potential issues
// Look for <svg> blocks in the HTML (not inside <script>)
const svgBlockRe = /<svg\b[^>]*>[\s\S]*?<\/svg>/gi;
let m, count = 0, issues = [];

while ((m = svgBlockRe.exec(html)) !== null) {
  count++;
  const svg = m[0];
  const offset = m.index;
  
  // Check if inside a <script> tag
  const beforeText = html.substring(Math.max(0, offset - 500), offset);
  if (beforeText.lastIndexOf('<script') > beforeText.lastIndexOf('</script>')) continue;
  
  // Check for negative height/width
  const negMatch = svg.match(/(?:height|width)\s*=\s*["'](-\d+)/);
  if (negMatch) {
    issues.push('Negative dimension at offset ' + offset + ': ' + negMatch[0]);
  }
  
  // Check for path with empty or invalid d
  const pathMatch = svg.match(/<path[^>]*\bd\s*=\s*["']\s*["']/);
  if (pathMatch) {
    issues.push('Empty path d at offset ' + offset);
  }
}

console.log('Inline SVG blocks checked: ' + count);
issues.forEach(i => console.log(i));
if (issues.length === 0) console.log('No inline SVG issues found');