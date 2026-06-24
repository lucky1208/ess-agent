// tools/inject_evcc_bundle.js - 把 _evcc_bundle.js 注入到 index.html
// 注入位置: SECC_CHIPS 定义结束后
// 同时注入: EVCC 渲染函数(在 chCoolingSkillJump 后)
import fs from 'fs';
import path from 'path';
import {fileURLToPath} from 'url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.join(__dirname, '..');
const INDEX_HTML = path.join(ROOT, 'index.html');
const DIST_HTML = path.join(ROOT, 'dist', 'index.html');

const bundle = fs.readFileSync(path.join(ROOT, '_evcc_bundle.js'), 'utf8');

// 渲染函数 + zip 打包函数(独立 script 块,避免污染主 <script>)
const RENDER_AND_DOWNLOAD = `
<script>
(function(){
  // ========== EVCC 渲染函数 ==========
  function evccEsc(s){return String(s==null?'':s).replace(/[&<>\"']/g,function(c){return {'&':'&amp;','<':'&lt;','>':'&gt;','\"':'&quot;',"'":'&#39;'}[c];});}

  function renderEvccChipsPanel(){
    var panel=document.getElementById('chEvccPanel-chips');
    if(!panel)return;
    var html='<div class="mg-grid">';
    html+='<div class="mg-card mg-col-6"><h3>EVCC 选型 (车载端) - '+EVCC_CHIPS.length+' 个主流方案</h3><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px">';
    EVCC_CHIPS.forEach(function(c){
      html+='<div style="padding:10px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;border-left:3px solid var(--blue)">';
      html+='<div style="font-size:13px;font-weight:700;color:var(--blue)">'+evccEsc(c.name)+'</div>';
      html+='<div style="font-size:10px;color:var(--text2);margin-top:4px">厂商: '+evccEsc(c.vendor)+' / 内核: '+evccEsc(c.mcu)+'</div>';
      html+='<div style="font-size:11px;color:var(--text1);margin-top:6px">接口: '+evccEsc(c.interfaces)+'</div>';
      html+='<div style="font-size:10px;color:var(--text2);margin-top:4px">协议: '+evccEsc(c.protocols)+'</div>';
      html+='<div style="font-size:10px;color:var(--text2);margin-top:4px;font-style:italic">'+evccEsc(c.features)+'</div>';
      html+='</div>';
    });
    html+='</div></div>';
    html+='<div class="mg-card mg-col-6"><h3>SECC 选型 (桩端) - '+SECC_CHIPS.length+' 个主流方案</h3><div style="display:grid;grid-template-columns:repeat(2,1fr);gap:8px;margin-top:10px">';
    SECC_CHIPS.forEach(function(c){
      html+='<div style="padding:10px;background:var(--bg3);border:1px solid var(--border);border-radius:6px;border-left:3px solid var(--purple)">';
      html+='<div style="font-size:13px;font-weight:700;color:var(--purple)">'+evccEsc(c.name)+'</div>';
      html+='<div style="font-size:10px;color:var(--text2);margin-top:4px">厂商: '+evccEsc(c.vendor)+' / 内核: '+evccEsc(c.mcu)+'</div>';
      html+='<div style="font-size:11px;color:var(--text1);margin-top:6px">接口: '+evccEsc(c.interfaces)+'</div>';
      html+='<div style="font-size:10px;color:var(--text2);margin-top:4px">协议: '+evccEsc(c.protocols)+'</div>';
      html+='<div style="font-size:10px;color:var(--text2);margin-top:4px;font-style:italic">'+evccEsc(c.features)+'</div>';
      html+='</div>';
    });
    html+='</div></div>';
    html+='<div class="mg-card mg-col-12" style="margin-top:16px"><h3>协议适配矩阵 (EVCC × SECC)</h3><table class="result-table" style="font-size:11px;margin-top:10px"><tr><th>协议</th><th>EVCC 支持</th><th>SECC 支持</th><th>适用地区</th></tr>';
    [{n:'ISO 15118-2 (PnC 即插即充)',e:'S32K3/TMS570/RH850',s:'i.MX6/RK3568/AM62',r:'EU/US'},{n:'ISO 15118-20 (PnC V2X)',e:'S32K3/RH850',s:'i.MX6/AM62',r:'EU/US (2025+)'},{n:'DIN 70121',e:'S32K3/TMS570',s:'i.MX6/RK3568',r:'DE/EU'},{n:'GB/T 27930-2015',e:'TMS570/RH850',s:'RK3568',r:'CN'},{n:'CHAdeMO 1.2/2.0',e:'RH850',s:'AM62',r:'JP'},{n:'CCS1 (北美)',e:'S32K3',s:'i.MX6/RK3568',r:'US'},{n:'CCS2 (欧标)',e:'S32K3/RH850',s:'i.MX6/RK3568/AM62',r:'EU'},{n:'NACS (特斯拉)',e:'S32K3',s:'RK3568',r:'US'}].forEach(function(p){
      html+='<tr><td style="font-weight:600">'+p.n+'</td><td style="font-size:10px">'+p.e+'</td><td style="font-size:10px">'+p.s+'</td><td>'+p.r+'</td></tr>';
    });
    html+='</table></div>';
    html+='</div>';
    panel.innerHTML=html;
  }

  function renderEvccBoardPanel(){
    var panel=document.getElementById('chEvccPanel-board');
    if(!panel)return;
    var html='<div class="mg-grid">';
    // EVCC 板
    html+='<div class="mg-card mg-col-6"><h3>EVCC 板 (车载端) - 外设接口清单</h3>';
    html+='<svg viewBox="0 0 500 320" xmlns="http://www.w3.org/2000/svg" style="width:100%;background:#0d1117;border-radius:6px;margin-top:10px">';
    html+='<rect x="50" y="40" width="400" height="240" rx="6" fill="#1a1d23" stroke="#4a90d9" stroke-width="2"/>';
    html+='<text x="250" y="65" text-anchor="middle" fill="#4a90d9" font-size="14" font-weight="700">EVCC 板</text>';
    html+='<text x="250" y="82" text-anchor="middle" fill="#94a3b8" font-size="9">NXP S32K344 / TI TMS570</text>';
    // 接口列表
    var evccIfaces=[
      {x:60,y:100,w:120,h:30,label:'CAN-FD #1',sub:'TJA1044'},
      {x:200,y:100,w:120,h:30,label:'CAN-FD #2',sub:'→ VCU'},
      {x:340,y:100,w:100,h:30,label:'100BASE-T1',sub:'车载以太网'},
      {x:60,y:140,w:120,h:30,label:'PLC (QCA7005)',sub:'ISO15118 HomePlug'},
      {x:200,y:140,w:120,h:30,label:'CP/PP AFE',sub:'TLF35584'},
      {x:340,y:140,w:100,h:30,label:'SPI Flash',sub:'16MB Boot'},
      {x:60,y:180,w:120,h:30,label:'TPM 2.0',sub:'Secure Element'},
      {x:200,y:180,w:120,h:30,label:'GPIO×8',sub:'电子锁/LED'},
      {x:340,y:180,w:100,h:30,label:'USB 2.0',sub:'调试/OTA'},
      {x:60,y:220,w:160,h:30,label:'SWD/JTAG',sub:'ARM Cortex 调试'},
      {x:240,y:220,w:100,h:30,label:'PMIC',sub:'TLF35584 ASIL-D'},
      {x:360,y:220,w:80,h:30,label:'12V/24V',sub:'电源'}
    ];
    evccIfaces.forEach(function(f){
      html+='<g><rect x="'+f.x+'" y="'+f.y+'" width="'+f.w+'" height="'+f.h+'" rx="3" fill="rgba(74,144,217,.1)" stroke="#4a90d9" stroke-width="1"/><text x="'+(f.x+f.w/2)+'" y="'+(f.y+13)+'" text-anchor="middle" fill="#4a90d9" font-size="9" font-weight="600">'+f.label+'</text><text x="'+(f.x+f.w/2)+'" y="'+(f.y+25)+'" text-anchor="middle" fill="#94a3b8" font-size="7">'+f.sub+'</text></g>';
    });
    html+='</svg>';
    html+='<table class="result-table" style="font-size:11px;margin-top:12px"><tr><th>接口</th><th>规格</th><th>用途</th></tr>';
    [['<b>2× CAN-FD</b>','TJA1044 (5Mbps)','与 BCU/VCU 通信: BMS 数据、整车状态'],[ '<b>1× 车载以太网</b>','100BASE-T1','T-Box 数据上传、车云通信'],[ '<b>1× PLC</b>','QCA7005 (HomePlug Green PHY)','ISO 15118 高层协议 over 充电线缆'],[ '<b>CP/PP AFE</b>','TLF35584 + ADC','充电控制导引、Proximity Pilot 检测'],[ '<b>1× SPI Flash</b>','16MB NOR','Bootloader + 公钥证书存储'],[ '<b>1× Secure Element</b>','TPM 2.0 / NXP SE05x','Plug & Charge 私钥保护、签名运算'],[ '<b>GPIO×8</b>','3.3V/5V','电子锁、枪锁、LED 指示、按钮'],[ '<b>USB 2.0</b>','OTG','固件升级、日志导出'],[ '<b>SWD/JTAG</b>','ARM Cortex 10-pin','Cortex-M7 调试 (OpenSDA / J-Link)'],[ '<b>PMIC</b>','TLF35584 ASIL-D','车规电源、看门狗、复位']].forEach(function(r){
      html+='<tr><td>'+r[0]+'</td><td style="font-size:10px">'+r[1]+'</td><td style="font-size:10px">'+r[2]+'</td></tr>';
    });
    html+='</table></div>';
    // SECC 板
    html+='<div class="mg-card mg-col-6"><h3>SECC 板 (桩端) - 外设接口清单</h3>';
    html+='<svg viewBox="0 0 500 320" xmlns="http://www.w3.org/2000/svg" style="width:100%;background:#0d1117;border-radius:6px;margin-top:10px">';
    html+='<rect x="50" y="40" width="400" height="240" rx="6" fill="#1a1d23" stroke="#a78bfa" stroke-width="2"/>';
    html+='<text x="250" y="65" text-anchor="middle" fill="#a78bfa" font-size="14" font-weight="700">SECC 板</text>';
    html+='<text x="250" y="82" text-anchor="middle" fill="#94a3b8" font-size="9">RK3568 / i.MX 8M Plus</text>';
    var seccIfaces=[
      {x:60,y:100,w:120,h:30,label:'CAN-FD #1',sub:'→ VCU'},
      {x:200,y:100,w:120,h:30,label:'CAN-FD #2',sub:'→ BCU'},
      {x:340,y:100,w:100,h:30,label:'千兆以太网',sub:'RJ45 + PoE'},
      {x:60,y:140,w:120,h:30,label:'4G/5G',sub:'移远 EC200N'},
      {x:200,y:140,w:120,h:30,label:'WiFi/BT',sub:'RTL8822CS'},
      {x:340,y:140,w:100,h:30,label:'HDMI',sub:'7寸 LCD'},
      {x:60,y:180,w:120,h:30,label:'CP/PP AFE',sub:'+绝缘检测'},
      {x:200,y:180,w:120,h:30,label:'RS485 ×2',sub:'电表/CDU'},
      {x:340,y:180,w:100,h:30,label:'USB 2.0 ×2',sub:'读卡器/调试'},
      {x:60,y:220,w:120,h:30,label:'SD 卡槽',sub:'系统/日志'},
      {x:200,y:220,w:120,h:30,label:'PLC (QCA7005)',sub:'ISO15118'},
      {x:340,y:220,w:100,h:30,label:'JTAG',sub:'ARM A55'}
    ];
    seccIfaces.forEach(function(f){
      html+='<g><rect x="'+f.x+'" y="'+f.y+'" width="'+f.w+'" height="'+f.h+'" rx="3" fill="rgba(167,139,250,.1)" stroke="#a78bfa" stroke-width="1"/><text x="'+(f.x+f.w/2)+'" y="'+(f.y+13)+'" text-anchor="middle" fill="#a78bfa" font-size="9" font-weight="600">'+f.label+'</text><text x="'+(f.x+f.w/2)+'" y="'+(f.y+25)+'" text-anchor="middle" fill="#94a3b8" font-size="7">'+f.sub+'</text></g>';
    });
    html+='</svg>';
    html+='<table class="result-table" style="font-size:11px;margin-top:12px"><tr><th>接口</th><th>规格</th><th>用途</th></tr>';
    [['<b>2× CAN-FD</b>','TJA1044','VCU + BCU 双 CAN 隔离'],[ '<b>千兆以太网</b>','RTL8111H + PoE','上位机 / 路由器 / NTP 时间同步'],[ '<b>4G/5G 模块</b>','移远 EC200N/RM500Q','OCPP 后端连接、远程升级'],[ '<b>WiFi/BT</b>','RTL8822CS','刷卡器、APP 扫码充电'],[ '<b>HDMI</b>','7寸 1024×600','触摸屏显示'],[ '<b>CP/PP AFE</b>','+绝缘检测 IMD','充电控制 + 安全联锁'],[ '<b>2× RS485</b>','Modbus RTU','直流电表 / 液冷 CDU'],[ '<b>USB 2.0 ×2</b>','Host','读卡器、U 盘升级'],[ '<b>SD 卡槽</b>','SDHC','系统镜像、日志'],[ '<b>PLC</b>','QCA7005','ISO 15118 高层协议 (与 EVCC 配对)']].forEach(function(r){
      html+='<tr><td>'+r[0]+'</td><td style="font-size:10px">'+r[1]+'</td><td style="font-size:10px">'+r[2]+'</td></tr>';
    });
    html+='</table></div>';
    html+='</div>';
    html+='<div class="mg-card" style="margin-top:16px"><h3>典型应用拓扑 (EVCC + SECC + 车 + 桩)</h3>';
    html+='<svg viewBox="0 0 900 280" xmlns="http://www.w3.org/2000/svg" style="width:100%;background:#0d1117;border-radius:6px;margin-top:10px">';
    html+='<rect x="40" y="60" width="180" height="160" rx="6" fill="rgba(74,144,217,.1)" stroke="#4a90d9" stroke-width="2"/><text x="130" y="90" text-anchor="middle" fill="#4a90d9" font-size="13" font-weight="700">车端 EVCC</text><text x="130" y="115" text-anchor="middle" fill="#94a3b8" font-size="10">电池 BMS</text><text x="130" y="135" text-anchor="middle" fill="#94a3b8" font-size="10">充电枪 CC1/CC2</text><text x="130" y="155" text-anchor="middle" fill="#94a3b8" font-size="10">CP/PP 信号</text><text x="130" y="175" text-anchor="middle" fill="#94a3b8" font-size="10">整车 CAN</text>';
    html+='<rect x="680" y="60" width="180" height="160" rx="6" fill="rgba(167,139,250,.1)" stroke="#a78bfa" stroke-width="2"/><text x="770" y="90" text-anchor="middle" fill="#a78bfa" font-size="13" font-weight="700">桩端 SECC</text><text x="770" y="115" text-anchor="middle" fill="#94a3b8" font-size="10">VCU/BCU</text><text x="770" y="135" text-anchor="middle" fill="#94a3b8" font-size="10">电表/液冷</text><text x="770" y="155" text-anchor="middle" fill="#94a3b8" font-size="10">OCPP 后端</text><text x="770" y="175" text-anchor="middle" fill="#94a3b8" font-size="10">显示屏</text>';
    html+='<text x="450" y="60" text-anchor="middle" fill="#fff" font-size="13" font-weight="700">充电线缆 (Power Line + PLC + CAN)</text>';
    html+='<path d="M 220 140 L 680 140" stroke="#50c878" stroke-width="3" marker-end="url(#evccArr)"/><text x="450" y="130" text-anchor="middle" fill="#50c878" font-size="11" font-weight="600">DC+ / DC-</text>';
    html+='<path d="M 220 160 L 680 160" stroke="#f59e0b" stroke-width="2" stroke-dasharray="4,4" marker-end="url(#evccArr2)"/><text x="450" y="178" text-anchor="middle" fill="#f59e0b" font-size="10">CP/PP (PLC @ 8.5kHz)</text>';
    html+='<defs><marker id="evccArr" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#50c878"/></marker><marker id="evccArr2" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto"><path d="M0,0 L8,4 L0,8" fill="#f59e0b"/></marker></defs>';
    html+='</svg></div>';
    panel.innerHTML=html;
  }

  function renderEvccProgramPanel(){
    var panel=document.getElementById('chEvccPanel-program');
    if(!panel)return;
    var html='';
    html+='<div class="mg-card" style="background:linear-gradient(135deg,rgba(74,144,217,.15),rgba(167,139,250,.15))"><div style="display:flex;justify-content:space-between;align-items:center;flex-wrap:wrap;gap:12px"><div><div style="font-size:16px;font-weight:700;color:var(--text1)">5 个可独立运行的 Python 程序</div><div style="font-size:12px;color:var(--text2);margin-top:4px">EVCC ↔ SECC 全链路通信 - ISO 15118-2 / GBT 27930 / OCPP 2.0.1 / CAN / Modbus - 纯 Python 3.8+ 标准库零依赖</div></div><div style="display:flex;gap:8px;flex-wrap:wrap"><button class="btn btn-primary" style="padding:8px 16px;font-size:12px" onclick="downloadEvccAllZip()">📦 打包下载全部 (zip)</button><button class="btn" style="padding:8px 16px;font-size:12px" onclick="downloadEvccReadme()">📖 下载 README</button></div></div></div>';
    EVCC_PYTHON_PROGRAMS.forEach(function(p,i){
      var code=atob(p.codeB64);
      var lines=code.split('\\n').length;
      var kb=(p.size/1024).toFixed(1);
      html+='<div class="mg-card" style="margin-top:12px">';
      html+='<div style="display:flex;justify-content:space-between;align-items:flex-start;gap:12px;flex-wrap:wrap">';
      html+='<div style="flex:1;min-width:280px"><div style="font-size:14px;font-weight:700;color:var(--blue)">📄 '+evccEsc(p.name)+'</div>';
      html+='<div style="font-size:11px;color:var(--text2);margin-top:4px">'+evccEsc(p.desc)+'</div>';
      html+='<div style="font-size:10px;color:var(--text2);margin-top:6px"><b>运行平台:</b> '+evccEsc(p.runOn)+' &nbsp;|&nbsp; <b>依赖:</b> '+evccEsc(p.deps)+' &nbsp;|&nbsp; <b>行数:</b> '+lines+' &nbsp;|&nbsp; <b>大小:</b> '+kb+' KB</div>';
      html+='<div style="font-size:10px;color:var(--green);margin-top:4px"><b>运行命令:</b> <code style="background:var(--bg3);padding:2px 6px;border-radius:3px;color:var(--green)">'+evccEsc(p.runCmd)+'</code></div>';
      html+='</div>';
      html+='<div style="display:flex;gap:6px;flex-wrap:wrap"><button class="btn" style="padding:6px 12px;font-size:11px" onclick="toggleEvccCode(\\'evcc-code-'+p.id+'\\')">👁 查看代码</button><button class="btn btn-primary" style="padding:6px 12px;font-size:11px" onclick="downloadEvccProgram('+i+')">⬇ 下载 .py</button></div>';
      html+='</div>';
      html+='<pre id="evcc-code-'+p.id+'" style="display:none;margin-top:10px;padding:12px;background:#0a0c0f;color:#a5d6ff;border-radius:6px;overflow-x:auto;max-height:400px;font-size:10px;line-height:1.4;font-family:Consolas,Monaco,monospace">'+evccEsc(code)+'</pre>';
      html+='</div>';
    });
    panel.innerHTML=html;
  }

  function renderEvccDemoPanel(){
    var panel=document.getElementById('chEvccPanel-demo');
    if(!panel)return;
    var html='<div class="mg-card"><h3>本地通信演示 (无需安装)</h3>';
    html+='<div style="font-size:12px;color:var(--text2);margin-bottom:12px">本页内嵌一个简化的 ISO 15118-2 握手演示,点 Start 模拟 EVCC ↔ SECC 完整握手,纯前端 JavaScript 实现</div>';
    html+='<div style="display:flex;gap:12px;margin-bottom:12px;flex-wrap:wrap"><button class="btn btn-primary" id="evcc-demo-start" onclick="startEvccDemo()">▶ Start 模拟握手</button><button class="btn" onclick="clearEvccDemo()">🗑 清空日志</button></div>';
    html+='<div style="display:grid;grid-template-columns:1fr 1fr;gap:12px"><div><div style="font-size:12px;font-weight:600;color:var(--blue);margin-bottom:6px">📡 SECC (桩端)</div><div id="evcc-demo-secc-log" style="background:#0a0c0f;color:#a5d6ff;padding:12px;border-radius:6px;height:280px;overflow-y:auto;font-family:Consolas,monospace;font-size:10px"></div></div><div><div style="font-size:12px;font-weight:600;color:var(--purple);margin-bottom:6px">🚗 EVCC (车端)</div><div id="evcc-demo-evcc-log" style="background:#0a0c0f;color:#a5d6ff;padding:12px;border-radius:6px;height:280px;overflow-y:auto;font-family:Consolas,monospace;font-size:10px"></div></div></div>';
    html+='<div style="margin-top:12px"><div style="font-size:12px;font-weight:600;color:var(--green);margin-bottom:6px">📊 充电会话状态</div><div id="evcc-demo-state" style="background:var(--bg3);padding:12px;border-radius:6px;font-size:11px">未启动</div></div>';
    html+='</div>';
    panel.innerHTML=html;
  }

  function renderEvccBomPanel(){
    var panel=document.getElementById('chEvccPanel-bom');
    if(!panel)return;
    var boms=[
      {cat:'EVCC 主控板 (车端)',items:[{n:'NXP S32K344 评估板 (FS32K344EVB)',m:'FS32K344EVB',q:1,u:'块',s:'$200'},{n:'QCA7005 PLC 模块',m:'QCA7005-IMX',q:1,u:'块',s:'$30'},{n:'TPM 2.0 安全芯片',m:'NXP SE05x',q:1,u:'个',s:'$8'},{n:'TLF35584 PMIC (ASIL-D)',m:'TLF35584',q:1,u:'个',s:'$15'},{n:'TJA1044 CAN-FD 收发器',m:'TJA1044',q:2,u:'个',s:'$3×2'}]},
      {cat:'SECC 主控板 (桩端)',items:[{n:'RK3568 核心板 + 底板',m:'迅为 RK3568',q:1,u:'套',s:'¥400'},{n:'移远 EC200N 4G 模块',m:'EC200N',q:1,u:'块',s:'¥80'},{n:'RTL8822CS WiFi/BT',m:'RTL8822CS',q:1,u:'块',s:'¥30'},{n:'QCA7005 PLC 模块',m:'QCA7005-IMX',q:1,u:'块',s:'$30'},{n:'千兆以太网 PHY',m:'RTL8111H',q:1,u:'块',s:'¥8'}]},
      {cat:'人机界面',items:[{n:'7寸 HDMI LCD (1024×600)',m:'微雪 7HDMI',q:1,u:'块',s:'¥280'},{n:'电容触摸屏',m:'GT911',q:1,u:'块',s:'¥15'},{n:'RFID 读卡器 (13.56MHz)',m:'MFRC522',q:1,u:'块',s:'¥12'},{n:'4G 天线',m:'SMA 全频段',q:1,u:'根',s:'¥10'}]},
      {cat:'测试与调试工具',items:[{n:'J-Link 调试器',m:'J-Link BASE',q:1,u:'块',s:'¥450'},{n:'Vector VN1610 CAN 接口',m:'VN1610',q:1,u:'块',s:'€800'},{n:'Wireshark + wireshark-ocpp 插件',m:'WS-OCPP',q:1,u:'套',s:'免费'},{n:'Modbus 调试工具 mbpoll',m:'mbpoll',q:1,u:'套',s:'免费'}]}
    ];
    var html='<div class="mg-card"><h3>EVCC/SECC 开发套件 BOM <button class="btn btn-primary" style="float:right;padding:6px 12px;font-size:11px" onclick="downloadEvccBom()">⬇ 导出 CSV</button></h3>';
    var allRows=[];
    boms.forEach(function(b){
      html+='<div style="margin-top:12px"><div style="font-size:12px;font-weight:600;color:var(--blue);margin-bottom:6px">'+b.cat+'</div><table class="result-table" style="font-size:11px"><tr><th>设备</th><th>型号</th><th>数量</th><th>单价</th></tr>';
      b.items.forEach(function(it){
        html+='<tr><td style="color:var(--text1)">'+it.n+'</td><td>'+it.m+'</td><td>'+it.q+' '+it.u+'</td><td>'+it.s+'</td></tr>';
        allRows.push({cat:b.cat,n:it.n,m:it.m,q:it.q+' '+it.u,s:it.s});
      });
      html+='</table></div>';
    });
    html+='</div>';
    panel.innerHTML=html;
    window._evccBomData=allRows;
  }

  // ========== 下载函数 ==========
  window.downloadEvccProgram=function(idx){
    var p=EVCC_PYTHON_PROGRAMS[idx];
    if(!p){alert('程序不存在');return;}
    var code=atob(p.codeB64);
    var blob=new Blob([code],{type:'text/x-python;charset=utf-8'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;a.download=p.filename;a.click();
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }
  window.downloadEvccReadme=function(){
    var blob=new Blob([EVCC_PYTHON_README],{type:'text/markdown;charset=utf-8'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;a.download='README.md';a.click();
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }

  // 最小 zip 打包(无压缩,STORE 方法)
  // CRC32 table
  var _crcTable=[];
  for(var i=0;i<256;i++){
    var c=i;
    for(var k=0;k<8;k++){c=(c&1)?(0xedb88320^(c>>>1)):(c>>>1);}
    _crcTable[i]=c;
  }
  function crc32(buf){
    var crc=0xffffffff;
    for(var i=0;i<buf.length;i++){crc=_crcTable[(crc^buf[i])&0xff]^(crc>>>8);}
    return (crc^0xffffffff)>>>0;
  }
  function makeZip(files){
    // files: [{name:'foo.py', data:Uint8Array}, ...]
    var localHeaders=[];
    var central=[];
    var offset=0;
    var now=new Date();
    var dosTime=((now.getHours()&31)<<11)|((now.getMinutes()&63)<<5)|((now.getSeconds()>>1)&31);
    var dosDate=((now.getFullYear()-1980)<<9)|(((now.getMonth()+1)&15)<<5)|(now.getDate()&31);
    files.forEach(function(f){
      var nameBuf=new TextEncoder().encode(f.name);
      var data=f.data;
      var crc=crc32(data);
      // Local file header
      var lh=new Uint8Array(30+nameBuf.length);
      var dv=new DataView(lh.buffer);
      dv.setUint32(0,0x04034b50,true);  // signature
      dv.setUint16(4,20,true);  // version needed
      dv.setUint16(6,0,true);  // flags
      dv.setUint16(8,0,true);  // compression (STORE)
      dv.setUint16(10,dosTime,true);
      dv.setUint16(12,dosDate,true);
      dv.setUint32(14,crc,true);
      dv.setUint32(18,data.length,true);  // compressed
      dv.setUint32(22,data.length,true);  // uncompressed
      dv.setUint16(26,nameBuf.length,true);
      dv.setUint16(28,0,true);  // extra length
      lh.set(nameBuf,30);
      localHeaders.push(lh);
      // Central directory header
      var ch=new Uint8Array(46+nameBuf.length);
      var dv2=new DataView(ch.buffer);
      dv2.setUint32(0,0x02014b50,true);   // signature
      dv2.setUint16(4,20,true);            // version made by
      dv2.setUint16(6,20,true);            // version needed
      dv2.setUint16(8,0,true);             // general purpose bit flag
      dv2.setUint16(10,0,true);            // compression method (STORE=0)
      dv2.setUint16(12,dosTime,true);      // last mod file time
      dv2.setUint16(14,dosDate,true);      // last mod file date
      dv2.setUint32(16,crc,true);          // crc-32
      dv2.setUint32(20,data.length,true);  // compressed size
      dv2.setUint32(24,data.length,true);  // uncompressed size
      dv2.setUint16(28,nameBuf.length,true); // file name length
      dv2.setUint16(30,0,true);            // extra field length
      dv2.setUint16(32,0,true);            // file comment length
      dv2.setUint16(34,0,true);            // disk number start
      dv2.setUint16(36,0,true);            // internal file attributes
      dv2.setUint32(38,0,true);            // external file attributes
      dv2.setUint32(42,offset,true);       // relative offset of local header
      ch.set(nameBuf,46);
      central.push(ch);
      offset += lh.length+data.length;
    });
    // EOCD
    var cdSize=central.reduce(function(s,c){return s+c.length;},0);
    var eocd=new Uint8Array(22);
    var dv3=new DataView(eocd.buffer);
    dv3.setUint32(0,0x06054b50,true);
    dv3.setUint16(4,0,true);
    dv3.setUint16(6,0,true);
    dv3.setUint16(8,files.length,true);
    dv3.setUint16(10,files.length,true);
    dv3.setUint32(12,cdSize,true);
    dv3.setUint32(16,offset,true);
    dv3.setUint16(20,0,true);
    // Concatenate
    var total=offset+cdSize+22;
    var out=new Uint8Array(total);
    var p=0;
    localHeaders.forEach(function(lh,i){
      out.set(lh,p);p+=lh.length;
      out.set(files[i].data,p);p+=files[i].data.length;
    });
    central.forEach(function(c){out.set(c,p);p+=c.length;});
    out.set(eocd,p);
    return out;
  }
  window.downloadEvccAllZip=function(){
    var files=[];
    files.push({name:'README.md',data:new TextEncoder().encode(EVCC_PYTHON_README)});
    EVCC_PYTHON_PROGRAMS.forEach(function(p){
      files.push({name:p.filename,data:new TextEncoder().encode(atob(p.codeB64))});
    });
    var zipBytes=makeZip(files);
    var blob=new Blob([zipBytes],{type:'application/zip'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;a.download='evcc-secc-programs.zip';a.click();
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }
  window.downloadEvccBom=function(){
    var rows=window._evccBomData||[];
    var csv='类别,设备,型号,数量,单价\\n';
    rows.forEach(function(r){csv+=r.cat+','+r.n+','+r.m+','+r.q+','+r.s+'\\n';});
    var blob=new Blob(['\\ufeff'+csv],{type:'text/csv;charset=utf-8'});
    var url=URL.createObjectURL(blob);
    var a=document.createElement('a');
    a.href=url;a.download='EVCC-SECC-BOM.csv';a.click();
    setTimeout(function(){URL.revokeObjectURL(url);},1000);
  }
  window.toggleEvccCode=function(id){
    var el=document.getElementById(id);
    if(el)el.style.display=(el.style.display==='none'||!el.style.display)?'block':'none';
  }

  // ========== 子 tab 切换 ==========
  window.showEvccSubTab=function(tab){
    ['chips','board','program','demo','bom'].forEach(function(t){
      var p=document.getElementById('chEvccPanel-'+t);
      if(p)p.style.display=(t===tab)?'block':'none';
    });
    var tabs=['chips','board','program','demo','bom'];
    document.querySelectorAll('#page-ch-evcc .sub-tab').forEach(function(el,i){
      el.classList.toggle('active',tabs[i]===tab);
    });
    if(tab==='chips')renderEvccChipsPanel();
    if(tab==='board')renderEvccBoardPanel();
    if(tab==='program')renderEvccProgramPanel();
    if(tab==='demo')renderEvccDemoPanel();
    if(tab==='bom')renderEvccBomPanel();
  };

  // 暴露关键函数到 window (便于调试和外部调用)
  window._evccInternals={
    makeZip:makeZip,
    crc32:crc32,
    downloadEvccProgram:downloadEvccProgram,
    downloadEvccAllZip:downloadEvccAllZip,
    downloadEvccReadme:downloadEvccReadme,
    downloadEvccBom:downloadEvccBom,
    renderEvccChipsPanel:renderEvccChipsPanel,
    renderEvccBoardPanel:renderEvccBoardPanel,
    renderEvccProgramPanel:renderEvccProgramPanel,
    renderEvccDemoPanel:renderEvccDemoPanel,
    renderEvccBomPanel:renderEvccBomPanel,
    startEvccDemo:window.startEvccDemo,
    toggleEvccCode:toggleEvccCode,
  };

  // ========== 演示 ==========
  var _demoTimer=null;
  function appendLog(elId,line,color){
    var el=document.getElementById(elId);
    if(!el)return;
    var span=document.createElement('div');
    span.style.color=color||'#a5d6ff';
    var t=new Date();
    var ts=(t.getHours()<10?'0':'')+t.getHours()+':'+(t.getMinutes()<10?'0':'')+t.getMinutes()+':'+(t.getSeconds()<10?'0':'')+t.getSeconds();
    span.textContent='['+ts+'] '+line;
    el.appendChild(span);
    el.scrollTop=el.scrollHeight;
  }
  window.clearEvccDemo=function(){
    ['evcc-demo-secc-log','evcc-demo-evcc-log'].forEach(function(id){
      var el=document.getElementById(id);if(el)el.innerHTML='';
    });
    var st=document.getElementById('evcc-demo-state');if(st)st.textContent='已清空';
  }
  window.startEvccDemo=async function(){
    clearEvccDemo();
    var btn=document.getElementById('evcc-demo-start');
    if(btn){btn.disabled=true;btn.textContent='⏳ 握手进行中...';}
    var stEl=document.getElementById('evcc-demo-state');
    function setState(text){if(stEl)stEl.innerHTML=text;}

    function delay(ms){return new Promise(function(r){setTimeout(r,ms);});}

    try {
      appendLog('evcc-demo-evcc-log','=== EVCC 启动 ===','#a78bfa');
      appendLog('evcc-demo-secc-log','=== SECC 启动 (监听 15118) ===','#4a90d9');
      await delay(500);
      appendLog('evcc-demo-evcc-log','→ SDP_REQUEST (发现 SECC)','#50c878');
      appendLog('evcc-demo-secc-log','← SDP_REQUEST (桩端响应 IP/PORT)','#4a90d9');
      setState('1️⃣ SDP 协商完成');
      await delay(400);
      appendLog('evcc-demo-evcc-log','→ SUPPORTED_APP_PROTOCOL_REQ','#50c878');
      appendLog('evcc-demo-secc-log','← SUPPORTED_APP_PROTOCOL_REQ (选择 ISO 15118-2)','#4a90d9');
      setState('2️⃣ 应用层协议: ISO 15118-2');
      await delay(400);
      appendLog('evcc-demo-evcc-log','→ SESSION_SETUP_REQ (evcc_id=EVCC-1234)','#50c878');
      appendLog('evcc-demo-secc-log','← SESSION_SETUP_REQ (session_id=...uuid)','#4a90d9');
      setState('3️⃣ 会话建立');
      await delay(400);
      appendLog('evcc-demo-evcc-log','→ SERVICE_DISCOVERY_REQ','#50c878');
      appendLog('evcc-demo-secc-log','← auth_options=[EIM, PnC], modes=[DC_extended]','#4a90d9');
      await delay(400);
      appendLog('evcc-demo-evcc-log','→ PAYMENT_SERVICE_SELECTION_REQ (selected=EIM)','#50c878');
      appendLog('evcc-demo-secc-log','← OK','#4a90d9');
      await delay(400);
      appendLog('evcc-demo-evcc-log','→ AUTHORIZATION_REQ (id_token=RFID-12345)','#50c878');
      appendLog('evcc-demo-secc-log','← authorization_status=Accepted','#50c878');
      setState('4️⃣ 授权通过');
      await delay(400);
      appendLog('evcc-demo-evcc-log','→ CHARGE_PARAMETER_DISCOVERY_REQ (400V×250A)','#50c878');
      appendLog('evcc-demo-secc-log','← agreed: 400V × 200A = 80kW (桩端限制 100kW)','#4a90d9');
      setState('5️⃣ 充电参数协商: 400V × 200A = 80kW @ ¥0.85/kWh');
      await delay(400);
      appendLog('evcc-demo-evcc-log','→ POWER_DELIVERY_REQ (ready_to_charge=true)','#50c878');
      appendLog('evcc-demo-secc-log','← EVSE_Ongoing (开始输出 DC)','#4a90d9');
      setState('6️⃣ 充电中...');

      for(var tick=0;tick<5;tick++){
        await delay(600);
        var soc=(20+tick*1).toFixed(1);
        var energy=(tick*0.022).toFixed(3);
        appendLog('evcc-demo-evcc-log','← POWER_DELIVERY_REQ (tick='+tick+') SOC='+soc+'% E='+energy+' kWh','#50c878');
        appendLog('evcc-demo-secc-log','→ [tick '+tick+'] 输出 400V×200A, 累计 '+energy+' kWh','#4a90d9');
      }
      await delay(400);
      appendLog('evcc-demo-evcc-log','→ POWER_DELIVERY_REQ (ready_to_charge=false)','#50c878');
      appendLog('evcc-demo-secc-log','← EVSE_Shutdown','#4a90d9');
      await delay(400);
      appendLog('evcc-demo-evcc-log','→ SESSION_STOP_REQ','#50c878');
      appendLog('evcc-demo-secc-log','← summary: 0.110 kWh, 6s, ¥0.09','#4a90d9');
      setState('✅ 充电会话结束 - 累计 0.110 kWh, 用时 6s, 费用 ¥0.09');
    } catch(e) {
      appendLog('evcc-demo-evcc-log','错误: '+e.message,'#ef4444');
    } finally {
      if(btn){btn.disabled=false;btn.textContent='▶ Start 模拟握手';}
    }
  }

  // 初始渲染
  setTimeout(function(){
    var p=document.getElementById('page-ch-evcc');
    if(p && p.style.display!=='none'){renderEvccChipsPanel();}
  },100);

  console.log('[EVCC Agent] loaded - '+(window.EVCC_PYTHON_PROGRAMS?window.EVCC_PYTHON_PROGRAMS.length:0)+' python programs, '+(window.EVCC_PYTHON_README?'README ready':'no readme'));
})();
</script>
`;

let html = fs.readFileSync(INDEX_HTML, 'utf8');

// 注入点 1: 在 SECC_CHIPS 结束后, 插入 Python programs 数据
// 用 marker 标记,确保 idempotent
const BUNDLE_START = '/* === EVCC_BUNDLE_START === */';
const BUNDLE_END = '/* === EVCC_BUNDLE_END === */';
const RENDER_START = '<!-- EVCC_RENDER_START -->';
const RENDER_END = '<!-- EVCC_RENDER_END -->';

// 清理旧的 bundle 注入
const oldBundleStart = html.indexOf(BUNDLE_START);
if (oldBundleStart >= 0) {
  const oldBundleEnd = html.indexOf(BUNDLE_END, oldBundleStart);
  if (oldBundleEnd >= 0) {
    html = html.substring(0, oldBundleStart) + html.substring(oldBundleEnd + BUNDLE_END.length);
    console.log('  [cleanup] removed old bundle injection');
  }
}
// 清理旧的 render 注入
const oldRenderStart = html.indexOf(RENDER_START);
if (oldRenderStart >= 0) {
  const oldRenderEnd = html.indexOf(RENDER_END, oldRenderStart);
  if (oldRenderEnd >= 0) {
    html = html.substring(0, oldRenderStart) + html.substring(oldRenderEnd + RENDER_END.length);
    console.log('  [cleanup] removed old render injection');
  }
}

const anchor1 = 'window.SECC_CHIPS=window.SECC_CHIPS||[';
if (!html.includes(anchor1)) {
  console.error('ERROR: 找不到 SECC_CHIPS 锚点');
  process.exit(1);
}
// 找到 SECC_CHIPS 数组结束的 ];  注入在它后面
const seccIdx = html.indexOf('window.SECC_CHIPS=window.SECC_CHIPS||[');
if (seccIdx < 0) {
  console.error('ERROR: 找不到 SECC_CHIPS 定义');
  process.exit(1);
}
// 找 ];  紧跟 SECC_CHIPS 数组结束(第一个 ])
const seccArrStart = seccIdx;
const seccArrEnd = html.indexOf('];', seccArrStart);
if (seccArrEnd < 0) {
  console.error('ERROR: 找不到 SECC_CHIPS 数组结束');
  process.exit(1);
}
// 注入 bundle(在 ];  之后)
const injectPoint1 = seccArrEnd + 2;
// 把 bundle 中的 window.EVCC_PYTHON_PROGRAMS 等保留为 global 变量赋值
const bundleWithMarker = BUNDLE_START + '\n' + bundle + BUNDLE_END + '\n';
html = html.slice(0, injectPoint1) + '\n\n' + bundleWithMarker + '\n' + html.slice(injectPoint1);
console.log(`[1/2] 注入 bundle @ SECC_CHIPS 末尾 +${bundleWithMarker.length} chars`);

// 注入点 2: 在 </body> 前插入 RENDER_AND_DOWNLOAD 脚本块
const bodyEnd = html.lastIndexOf('</body>');
if (bodyEnd < 0) {
  console.error('ERROR: 找不到 </body>');
  process.exit(1);
}
const renderWithMarker = RENDER_START + '\n' + RENDER_AND_DOWNLOAD + '\n' + RENDER_END + '\n';
html = html.slice(0, bodyEnd) + '\n' + renderWithMarker + '\n' + html.slice(bodyEnd);
console.log(`[2/2] 注入渲染脚本 @ </body> 前 +${renderWithMarker.length} chars`);

// 同步替换 page-ch-evcc 内容为多 tab 结构
// 注意: index.html 用 CRLF,这里 evccOld 用 \r\n 才能匹配
const evccOld = `<div id="page-ch-evcc" class="charging-content" style="display:none;padding:24px 32px">
<div class="sec-title">EVCC/SECC Agent</div>
<div style="font-size:12px;color:var(--text2);margin-bottom:16px">电动汽车控制器(EVCC)与供电设备控制器(SECC)选型，支持ISO 15118即插即充</div>
<div class="mg-grid">
<div class="mg-card mg-col-6"><h3>EVCC选型 (车载端)</h3>
<table class="result-table" style="font-size:11px">
<tr><th>芯片/方案</th><th>适用接口</th><th>特点</th></tr>
<tr><td>NXP S32K3</td><td>CCS1/CCS2</td><td>支持ISO15118-20, 高集成度</td></tr>
<tr><td>Vector MICROSAR</td><td>CCS/GB</td><td>协议栈成熟, AUTOSAR架构</td></tr>
<tr><td>EcoG</td><td>CCS2</td><td>即插即充PnC方案, 支持V2G</td></tr>
</table></div>
<div class="mg-card mg-col-6"><h3>SECC选型 (桩端)</h3>
<table class="result-table" style="font-size:11px">
<tr><th>芯片/方案</th><th>适用接口</th><th>特点</th></tr>
<tr><td>TI C2000</td><td>GB/T 27930</td><td>国产标准首选, 高性价比</td></tr>
<tr><td>STM32H7</td><td>CCS/GB</td><td>高性能, 支持多路CAN</td></tr>
<tr><td>NXP LPC55S</td><td>CCS1/CCS2</td><td>海外市场主流, OCPP集成</td></tr>
</table></div></div></div>`.replace(/\n/g, '\r\n');

const evccNew = `<div id="page-ch-evcc" class="charging-content" style="display:none;padding:24px 32px">
<div class="sec-title">EVCC/SECC Agent</div>
<div style="font-size:12px;color:var(--text2);margin-bottom:16px">电动汽车控制器(EVCC)与供电设备控制器(SECC)硬件+软件全栈方案：芯片选型 + 电路板外设接口 + 可运行 Python 程序 + 通信演示</div>
<nav class="sub-tabs" style="padding:0;margin-bottom:16px;border-radius:6px;overflow:hidden">
<div class="sub-tab active" onclick="showEvccSubTab('chips')">🧩 芯片选型</div>
<div class="sub-tab" onclick="showEvccSubTab('board')">🔌 电路板接口</div>
<div class="sub-tab" onclick="showEvccSubTab('program')">🐍 可运行程序</div>
<div class="sub-tab" onclick="showEvccSubTab('demo')">▶ 通信演示</div>
<div class="sub-tab" onclick="showEvccSubTab('bom')">🛒 开发板BOM</div>
</nav>
<div id="chEvccPanel-chips"></div>
<div id="chEvccPanel-board" style="display:none"></div>
<div id="chEvccPanel-program" style="display:none"></div>
<div id="chEvccPanel-demo" style="display:none"></div>
<div id="chEvccPanel-bom" style="display:none"></div>
</div>`;

if (!html.includes(evccOld)) {
  console.error('ERROR: 找不到原 page-ch-evcc 内容,跳过替换');
} else {
  html = html.replace(evccOld, evccNew);
  console.log('[3/3] 替换 page-ch-evcc 内容');
}

// 写回 index.html
fs.writeFileSync(INDEX_HTML, html, 'utf8');
console.log(`Done. index.html: ${html.length} bytes`);

// 同步到 dist/index.html
fs.writeFileSync(DIST_HTML, html, 'utf8');
console.log(`Synced dist/index.html: ${html.length} bytes`);