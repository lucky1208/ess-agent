import { readFileSync } from 'fs';
const html = readFileSync('E:\\project\\储能\\ess-platform\\index.html', 'utf8');

// Find what's between main.content end and page-ch-design
const mainContentStart = html.indexOf('class="content"');
// Find </main> after mainContentStart
const mainEnd = html.indexOf('</main>', mainContentStart);
const chDesign = html.indexOf('id="page-ch-design"');

console.log('main.content: ' + mainContentStart + ' to ' + mainEnd);
console.log('page-ch-design: ' + chDesign);
console.log('ch-design after main end: ' + (chDesign > mainEnd));

// Check the structure between </main> and page-ch-design
const between = html.substring(mainEnd, chDesign);
console.log('Between main end and ch-design (' + between.length + ' chars):');
console.log(between.substring(0, 300));

// Find all top-level containers
const containerIds = ['page-config', 'page-devices', 'page-diagrams', 'page-cases', 
  'page-compliance', 'page-ai-design', 'page-ess-software',
  'page-mg-design', 'page-aidc-design', 'page-bs-design',
  'page-ch-design', 'page-ch-elec', 'page-ch-software',
  'page-vpp-unified', 'page-syn-unified'];

containerIds.forEach(id => {
  const pos = html.indexOf('id="' + id + '"');
  const inMain = pos > mainContentStart && pos < mainEnd;
  const inMc = pos > 3321397 && pos < 3328101;
  console.log(id + ': offset=' + pos + ' in_main=' + inMain + ' in_mc=' + inMc);
});
