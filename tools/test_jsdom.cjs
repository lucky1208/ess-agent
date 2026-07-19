const { readFileSync } = require('fs');
const html = readFileSync('E:\\project\\储能\\ess-platform\\dist\\index.html', 'utf8');

const mcEnd = 3329388; // main-container end offset
const chDesignStart = 3478299; // page-ch-design start offset
const between = html.substring(mcEnd + 6, chDesignStart);

// Find elements with display:block or display:'' (not display:none)
const re = /<div[^>]*style="([^"]*)"[^>]*>/g;
let m;
while ((m = re.exec(between)) !== null) {
  const style = m[1];
  if (!style.includes('display:none') && !style.includes('display: none')) {
    const fullTag = m[0];
    const idMatch = fullTag.match(/id="([^"]+)"/);
    const classMatch = fullTag.match(/class="([^"]+)"/);
    const offset = mcEnd + 6 + m.index;
    console.log('VISIBLE div at offset ' + offset + ': id=' + (idMatch?idMatch[1]:'none') + ' class=' + (classMatch?classMatch[1]:'none'));
    console.log('  style: ' + style.substring(0, 100));
    console.log('  tag: ' + fullTag.substring(0, 150));
  }
}

// Also check for <main> elements
const mainRe = /<main[^>]*>/g;
while ((m = mainRe.exec(between)) !== null) {
  console.log('MAIN element at offset ' + (mcEnd + 6 + m.index) + ': ' + m[0]);
}

// Check the </main> tag
const mainCloseRe = /<\/main>/g;
while ((m = mainCloseRe.exec(between)) !== null) {
  console.log('</main> at offset ' + (mcEnd + 6 + m.index));
}
