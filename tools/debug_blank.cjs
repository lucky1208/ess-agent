// Simulate what happens when switchCategory('charging') is called
// Check if page-ch-design becomes visible

const fs = require('fs');
const html = fs.readFileSync('E:\\project\\储能\\ess-platform\\index.html', 'utf8');

// Find the structure: where is page-ch-design relative to main-container and main.content?
const mcStart = html.indexOf('class="main-container"');
const mainStart = html.indexOf('<main class="content"');
const mainEnd = html.indexOf('</main>', mainStart);
const chDesign = html.indexOf('id="page-ch-design"');

console.log('main-container at:', mcStart);
console.log('main.content at:', mainStart, 'to', mainEnd);
console.log('page-ch-design at:', chDesign);
console.log('page-ch-design AFTER main.content:', chDesign > mainEnd);

// Check what's between </main></div> and page-ch-design
const afterMainEnd = mainEnd + 7; // after </main>
const afterDivEnd = html.indexOf('</div>', afterMainEnd) + 6; // after the closing </div> of main-container
console.log('\nAfter main-container closes (offset ' + afterDivEnd + '):');
console.log(html.substring(afterDivEnd, afterDivEnd + 200));

// Check if there's a wrapper div around all non-ess pages
// Look for the structure after main-container
let pos = afterDivEnd;
let depth = 0;
let foundIds = [];
while (pos < html.length && pos < afterDivEnd + 500000) {
  const idMatch = html.substring(pos, pos + 200).match(/id="([^"]+)"/);
  if (idMatch && !foundIds.includes(idMatch[1])) {
    foundIds.push(idMatch[1]);
    if (foundIds.length <= 20) {
      console.log('Found id="' + idMatch[1] + '" at offset ' + pos);
    }
  }
  pos++;
}
console.log('Total IDs found in non-ess area:', foundIds.length);

// KEY CHECK: Is page-ch-design a direct child of body or inside some wrapper?
// Find what contains page-ch-design
const beforeCh = html.substring(Math.max(0, chDesign - 500), chDesign);
const lastDivOpen = beforeCh.lastIndexOf('<div');
const lastDivId = beforeCh.substring(lastDivOpen).match(/id="([^"]+)"/);
console.log('\nNearest parent div before page-ch-design:', lastDivId ? lastDivId[1] : 'no id');

// Check if there's a CSS issue: does body have overflow:hidden?
const bodyCss = html.match(/body\s*\{[^}]*\}/g);
if (bodyCss) {
  bodyCss.forEach(c => {
    if (c.includes('overflow')) console.log('Body CSS with overflow:', c);
  });
}

// Check the actual rendered position
// When main-container is display:none and main.content is display:none,
// the next visible element should be at the top of the page
// But is there something else blocking it?
console.log('\n=== Checking for blocking elements ===');
// Check if there's a fixed/absolute positioned element covering the page
const fixedElements = html.match(/position:\s*fixed[^;]*z-index[^;]*\d{3,}/g);
if (fixedElements) {
  console.log('Fixed high-z-index elements:', fixedElements.length);
  fixedElements.slice(0, 5).forEach(e => console.log(' ', e.substring(0, 80)));
}