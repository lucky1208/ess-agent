// Smoke test: load dist/client-render-svg.js in node and call window.EssAgentRenderSld
import fs from 'node:fs';
import vm from 'node:vm';

// Mock window + document
const sandbox = {
  window: {},
  console,
};
sandbox.window.console = console;

const src = fs.readFileSync('dist/client-render-svg.js', 'utf8');
vm.createContext(sandbox);
vm.runInContext(src, sandbox);

const uem = JSON.parse(fs.readFileSync('_test_req.json', 'utf8'));

const result = sandbox.window.EssAgentRenderSld(uem, 'sld');
console.log('result.ok =', result.ok);
if (!result.ok) {
  console.log('error =', result.error);
  console.log('stack =', result.stack);
  process.exit(1);
}
console.log('size_kb =', result.size_kb);
console.log('components =', result.components);
console.log('connections =', result.connections);
console.log('symbols_loaded =', result.symbols_loaded);
console.log('latency_ms =', result.latency_ms);
console.log('svg head =', result.svg.slice(0, 500));
console.log('svg len =', result.svg.length);
console.log('has <path>:', result.svg.includes('<path'));
console.log('has base64 PNG:', result.svg.includes('data:image/png;base64'));

if (result.svg.length > 5000 && result.svg.includes('<path') && !result.svg.includes('data:image/png;base64')) {
  console.log('\n*** SMOKE PASSED ***');
  fs.writeFileSync('_smoke_out.svg', result.svg);
  console.log('Written to _smoke_out.svg');
} else {
  console.log('\n*** SMOKE FAILED ***');
  process.exit(1);
}