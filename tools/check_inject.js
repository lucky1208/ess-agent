// tools/check_inject.js - 验证 inject_evcc_bundle.js 注入结果
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const html = fs.readFileSync(path.join(__dirname, '..', 'dist', 'index.html'), 'utf8');

const checks = [
  ['EVCC_PYTHON_PROGRAMS bundle', 'window.EVCC_PYTHON_PROGRAMS=window.EVCC_PYTHON_PROGRAMS||['],
  ['SECC_CHIPS still intact', 'window.SECC_CHIPS=window.SECC_CHIPS||['],
  ['renderEvccChipsPanel', 'function renderEvccChipsPanel()'],
  ['renderEvccProgramPanel', 'function renderEvccProgramPanel()'],
  ['showEvccSubTab exposed', 'window.showEvccSubTab=function(tab)'],
  ['downloadEvccProgram', 'function downloadEvccProgram(idx)'],
  ['downloadEvccAllZip', 'function downloadEvccAllZip()'],
  ['startEvccDemo', 'async function startEvccDemo()'],
  ['chips tab button', "showEvccSubTab('chips')"],
  ['program tab button', "showEvccSubTab('program')"],
  ['demo tab button', "showEvccSubTab('demo')"],
  ['bom tab button', "showEvccSubTab('bom')"],
  ['CRC32 zip', 'function crc32(buf)'],
  ['secc_server.py in bundle', 'secc_server.py'],
  ['evcc_client.py in bundle', 'evcc_client.py'],
  ['can_monitor.py in bundle', 'can_monitor.py'],
  ['ocpp_charge_point.py in bundle', 'ocpp_charge_point.py'],
  ['meter_reader.py in bundle', 'meter_reader.py'],
  ['README in bundle', 'EVCC / SECC 可运行 Python 程序包'],
  ['sub-tabs sub-tab CSS', 'sub-tab active'],
];

let pass = 0, fail = 0;
checks.forEach(([name, needle]) => {
  const ok = html.indexOf(needle) >= 0;
  console.log((ok ? 'OK   ' : 'FAIL ') + name + (ok ? '' : '   missing: ' + needle));
  if (ok) pass++; else fail++;
});
console.log(`\n${pass}/${pass + fail} passed. Total bytes: ${html.length}`);