import { readFileSync } from 'fs';
const html = readFileSync('E:\\project\\储能\\ess-platform\\index.html', 'utf8');
const mc = html.indexOf('class="main-container"');
const ids = ['page-mg-design', 'page-aidc-design', 'page-bs-design'];
ids.forEach(id => {
  const pos = html.indexOf('id="' + id + '"');
  console.log(id + ' offset=' + pos + ' inside_mc=' + (pos > mc));
});
