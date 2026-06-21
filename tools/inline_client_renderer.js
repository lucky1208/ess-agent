// tools/inline_client_renderer.js
// Plan B (round 2): inline dist/client-render-svg.js into dist/index.html & index.html
//   - replaces <script src="client-render-svg.js"></script> with <script>...full content...</script>
//   - dist/client-render-svg.js can be deleted afterwards (kept in repo for traceability)
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');

const renderer = fs.readFileSync(path.join(ROOT, 'dist', 'client-render-svg.js'), 'utf8');
const inlineBlock = `<script>\n// === Plan B (round 2): client-render-svg.js inlined into HTML to bypass CDN dependency ===\n${renderer}\n</script>`;

for (const htmlPath of ['dist/index.html', 'index.html']) {
  const full = path.join(ROOT, htmlPath);
  let src = fs.readFileSync(full, 'utf8');
  const before = src.length;
  // Remove the old <script src="client-render-svg.js"></script>
  src = src.replace(/<script src="client-render-svg\.js"><\/script>\n?/, '');
  // Insert the inline block immediately after the mermaid script tag
  src = src.replace(
    /(<script src="https:\/\/cdn\.jsdelivr\.net\/npm\/mermaid@11\/dist\/mermaid\.min\.js"><\/script>)/,
    '$1\n' + inlineBlock
  );
  fs.writeFileSync(full, src, 'utf8');
  console.log(`OK: ${htmlPath}  ${before} -> ${src.length}  (+${src.length - before} bytes)`);
}