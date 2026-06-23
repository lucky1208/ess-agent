// build_evcc_bundle.js - 把 evcc_programs/ 下的 Python 文件打包成 base64 字符串
// 用法: node tools/build_evcc_bundle.js
// 输出: 把 EVCC_PYTHON_PROGRAMS 数据块打印到 stdout
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const PROGRAMS_DIR = path.join(ROOT, 'evcc_programs');

// 5 个程序 + README
const PROGRAMS = [
  {
    id: 'secc_server',
    name: 'SECC 充电桩服务器',
    desc: '桩端 SECC (Supply Equipment Communication Controller) 的 TCP 服务器,模拟 ISO 15118-2 / GBT 27930 充电握手、功率协商、CurrentDemand 循环、SessionStop 全流程。',
    runOn: 'Linux PC / 树莓派 / Jetson / Windows',
    deps: '纯 Python 3.8+ 标准库 (asyncio, json, socket)',
    filename: 'secc_server.py',
    runCmd: 'python3 secc_server.py --max-power 100',
  },
  {
    id: 'evcc_client',
    name: 'EVCC 车端模拟器',
    desc: '车端 EVCC (Electric Vehicle Communication Controller) 的 TCP 客户端,连接 SECC 完成完整充电会话,带电池 SOC 模拟、累计电能统计、充电曲线。',
    runOn: 'Linux PC / 树莓派 / Jetson / Windows',
    deps: '纯 Python 3.8+ 标准库 (asyncio, json)',
    filename: 'evcc_client.py',
    runCmd: 'python3 evcc_client.py --voltage 400 --current 250 --duration 30',
  },
  {
    id: 'can_monitor',
    name: 'CAN 总线监控 (GBT 27930 / UDS)',
    desc: '通过 Linux SocketCAN 实时监控充电桩 CAN 总线,自动解析 GBT 27930 报文 (CHM/BHM/BCL/BCS/BSM/CCS/CST/BSD) 和 UDS (ISO 14229) 诊断帧,支持报文统计和模拟注入。',
    runOn: 'Linux (SocketCAN 必需)',
    deps: '纯 Python 3.8+ 标准库 (socket, struct)',
    filename: 'can_monitor.py',
    runCmd: 'python3 can_monitor.py --iface vcan0 --simulate',
  },
  {
    id: 'ocpp_charge_point',
    name: 'OCPP 2.0.1 Charge Point',
    desc: 'OCPP 2.0.1 充电桩客户端,纯 stdlib 实现 WebSocket (无第三方依赖),支持 BootNotification / Heartbeat / TransactionEvent / MeterValues / StatusNotification,带事务追踪和模拟完整充电周期。',
    runOn: '任何平台 (CSMS 需 ws:// 服务)',
    deps: '纯 Python 3.8+ 标准库 (asyncio, socket, struct, secrets)',
    filename: 'ocpp_charge_point.py',
    runCmd: 'python3 ocpp_charge_point.py --csms ws://127.0.0.1:9000 --cp-id CP-DEMO --simulate',
  },
  {
    id: 'meter_reader',
    name: 'Modbus TCP 直流电表读取',
    desc: '通过 Modbus TCP (502) 读取直流电表 (Acrel AGF-ML 寄存器映射),返回 V/A/P/E/T/SOC,支持 CSV 日志、断线重连、采样间隔控制。',
    runOn: '任何平台 (只要能连电表)',
    deps: '纯 Python 3.8+ 标准库 (socket, struct, csv)',
    filename: 'meter_reader.py',
    runCmd: 'python3 meter_reader.py --host 192.168.1.100 --csv meter_log.csv',
  },
];

// 读 README
const readme = fs.readFileSync(path.join(PROGRAMS_DIR, 'README.md'), 'utf8');

// 生成 JS 代码
function b64(s) {
  return Buffer.from(s, 'utf8').toString('base64');
}

const lines = [];
lines.push('window.EVCC_PYTHON_PROGRAMS=window.EVCC_PYTHON_PROGRAMS||[');
PROGRAMS.forEach((p, idx) => {
  const code = fs.readFileSync(path.join(PROGRAMS_DIR, p.filename), 'utf8');
  lines.push('  {');
  lines.push(`    id: '${p.id}',`);
  lines.push(`    name: ${JSON.stringify(p.name)},`);
  lines.push(`    desc: ${JSON.stringify(p.desc)},`);
  lines.push(`    runOn: ${JSON.stringify(p.runOn)},`);
  lines.push(`    deps: ${JSON.stringify(p.deps)},`);
  lines.push(`    filename: '${p.filename}',`);
  lines.push(`    runCmd: ${JSON.stringify(p.runCmd)},`);
  lines.push(`    size: ${code.length},`);
  lines.push(`    codeB64: ${JSON.stringify(b64(code))},`);
  lines.push('  }' + (idx < PROGRAMS.length - 1 ? ',' : ''));
});
lines.push('];');
lines.push('');
lines.push(`window.EVCC_PYTHON_README=${JSON.stringify(readme)};`);
lines.push('');

const bundleCode = lines.join('\n');

// 写入 _evcc_bundle.js
fs.writeFileSync(path.join(ROOT, '_evcc_bundle.js'), bundleCode, 'utf8');
console.log(`Generated _evcc_bundle.js: ${bundleCode.length} bytes`);
console.log(`  - 5 programs (${PROGRAMS.reduce((sum, p) => sum + fs.statSync(path.join(PROGRAMS_DIR, p.filename)).size, 0)} bytes source)`);
console.log(`  - README.md (${readme.length} bytes)`);