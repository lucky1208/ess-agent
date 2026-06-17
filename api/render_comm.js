// api/render_comm.js
// =========================================================================
// ESS Agent — Communication Topology Diagram Renderer (Vercel Serverless)
// =========================================================================
// Endpoint: POST /api/render-comm
// Body:     { uem: <UEM JSON> }
// Returns:  { ok, svg, width, height, nodes, links, project_id }
//
// 输出 SVG 风格: 网络拓扑图 (节点 + 链路)
//   - 节点: Cloud / EMS / PCS / BMS / FAS / Meter / Switch / DG-Ctrl / PDU
//   - 每个设备节点: ID + 名称 + IP + 型号 (3 行文字)
//   - 链路: 协议 + 带宽 标签
//
// 与 render_svg.js (SLD) 和 render_arch.js (架构色块) 都不一样:
//   - SLD: 电气接线, 给工程师
//   - Arch: 系统架构色块, 给客户
//   - Comm: 通信网络拓扑, 给运维/调试
// =========================================================================

// ====================== 颜色方案 ======================
const COLOR_NODE_FILL   = '#ffffff';
const COLOR_NODE_BORDER = '#222';
const COLOR_NODE_TEXT   = '#1a1a1a';
const COLOR_TITLE_BG    = '#37474F';   // 深灰 — 标题栏
const COLOR_TITLE_FG    = '#ffffff';
const COLOR_BG          = '#fafafa';
const COLOR_IP_TEXT     = '#666666';   // 灰色 — IP 文字
const COLOR_MODEL_TEXT  = '#333333';   // 深灰 — 型号文字

const COLOR_IEC_61850   = '#D32F2F';   // 红 — 高速工业以太网
const COLOR_MODBUS      = '#1976D2';   // 蓝 — Modbus RTU/TCP
const COLOR_4G_WIFI     = '#388E3C';   // 绿 — 无线
const COLOR_ETHERNET    = '#7B1FA2';   // 紫 — 普通以太网
const COLOR_FIBER       = '#F57C00';   // 橙 — 光纤
const COLOR_CAN         = '#0288D1';   // 青 — CAN 总线

// 设备类型配色 (节点底色)
const DEVICE_COLORS = {
  cloud:   { fill: '#ECEFF1', border: '#37474F', icon: '#37474F' },  // 灰
  ems:     { fill: '#FFF3E0', border: '#E65100', icon: '#E65100' },  // 橙 — 主控
  switch:  { fill: '#F3E5F5', border: '#6A1B9A', icon: '#6A1B9A' },  // 紫
  pcs:     { fill: '#EDE7F6', border: '#5E35B1', icon: '#5E35B1' },  // 紫 — DC/AC
  bms:     { fill: '#E8F5E9', border: '#2E7D32', icon: '#2E7D32' },  // 绿 — 电池管理
  fas:     { fill: '#FFEBEE', border: '#C62828', icon: '#C62828' },  // 红 — 安全
  meter:   { fill: '#E3F2FD', border: '#1565C0', icon: '#1565C0' },  // 蓝 — 计量
  dgctrl:  { fill: '#FFF8E1', border: '#F57C00', icon: '#F57C00' },  // 黄 — 柴发控制
  pdu:     { fill: '#E0F2F1', border: '#00695C', icon: '#00695C' },  // 青绿 — PDU
};

const FONT_TITLE  = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="16" font-weight="bold"';
const FONT_NODE_ID     = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="13" font-weight="bold"';
const FONT_NODE_MODEL  = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="10"';
const FONT_NODE_IP     = 'font-family="Consolas, monospace" font-size="9"';
const FONT_LINK        = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="9" font-weight="bold"';
const FONT_LEGEND      = 'font-family="Microsoft YaHei, Arial, sans-serif" font-size="10"';

const WIDTH = 900;
const HEIGHT = 640;

// ====================== 工具函数 ======================
function safeNum(v, dflt = 0) {
  if (v === null || v === undefined || v === '') return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function escapeXml(s) {
  if (s === null || s === undefined) return '';
  return String(s)
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&apos;');
}

function safeSlice(s, n) {
  const str = String(s == null ? '' : s);
  return str.length > n ? str.slice(0, n - 1) + '…' : str;
}

// 协议识别: 返回 {type, color, dasharray, bandwidth, label}
function protocolInfo(name) {
  const n = String(name || '').toUpperCase();
  if (n.includes('IEC') && n.includes('61850')) {
    return { type: 'iec61850', color: COLOR_IEC_61850, dasharray: '', bandwidth: '100 Mbps', label: 'IEC 61850' };
  }
  if (n.includes('MODBUS')) {
    if (n.includes('TCP')) return { type: 'modbus_tcp', color: COLOR_MODBUS, dasharray: '', bandwidth: '100 Mbps', label: 'Modbus TCP' };
    return { type: 'modbus_rtu', color: COLOR_MODBUS, dasharray: '6,3', bandwidth: '115 kbps', label: 'Modbus RTU' };
  }
  if (n.includes('CAN')) {
    return { type: 'can', color: COLOR_CAN, dasharray: '3,2', bandwidth: '500 kbps', label: 'CAN' };
  }
  if (n.includes('4G') || n.includes('LTE') || n.includes('5G')) {
    return { type: '4g', color: COLOR_4G_WIFI, dasharray: '4,4', bandwidth: '100 Mbps', label: '4G/LTE' };
  }
  if (n.includes('WIFI') || n.includes('WI-FI')) {
    return { type: 'wifi', color: COLOR_4G_WIFI, dasharray: '4,4', bandwidth: '54 Mbps', label: 'WiFi' };
  }
  if (n.includes('FIBER') || n.includes('光') || n.includes('OLT')) {
    return { type: 'fiber', color: COLOR_FIBER, dasharray: '', bandwidth: '1 Gbps', label: '光纤' };
  }
  if (n.includes('ETHERNET') || n.includes('以太网')) {
    return { type: 'ethernet', color: COLOR_ETHERNET, dasharray: '', bandwidth: '100 Mbps', label: 'Ethernet' };
  }
  // 默认 Modbus RTU
  return { type: 'modbus_rtu', color: COLOR_MODBUS, dasharray: '6,3', bandwidth: '115 kbps', label: name || 'Modbus RTU' };
}

// ====================== 设备型号库 (按 type 给定典型型号) ======================
const DEVICE_MODELS = {
  cloud:   { vendor: '阿里云',   model: 'IoT 物联网平台' },
  ems:     { vendor: '和利时',   model: 'LEAP-EMS 8000' },
  switch:  { vendor: '赫斯曼',   model: 'RS20 8-port' },
  pcs:     { vendor: '阳光电源', model: 'SG125HV' },
  bms:     { vendor: '高特电子', model: 'Master BMS-2000' },
  bms_slave:{ vendor: '高特电子', model: 'Slave BMU-100' },
  fas:     { vendor: '海湾安全', model: 'GST200 主机' },
  meter:   { vendor: '安科瑞',   model: 'ACR330ELH' },
  dgctrl:  { vendor: '科迈',     model: 'DGC-2020' },
  pdu:     { vendor: '溯高美',   model: 'PDU 32A/3P' },
};

// IP 段分配 (192.168.X.Y 子网, 按设备类偏移)
const IP_BASE = {
  cloud:   '10.10.10.1',
  ems:     '192.168.1.1',
  switch:  '192.168.1.2',
  pcs:     101,    // 基址 192.168.1.101, 逐台 +1
  bms:     200,    // 192.168.1.200
  bms_slave: 201,  // 192.168.1.201
  fas:     150,    // 192.168.1.150
  meter:   180,    // 192.168.1.180
  dgctrl:  170,    // 192.168.1.170
  pdu:     210,    // 192.168.1.210
};

function buildDeviceIP(type, idx = 0) {
  if (type === 'pcs') return `192.168.1.${IP_BASE.pcs + idx}`;
  if (type === 'bms_slave') return `192.168.1.${IP_BASE.bms_slave + idx}`;
  if (typeof IP_BASE[type] === 'string') return IP_BASE[type];
  if (typeof IP_BASE[type] === 'number') return `192.168.1.${IP_BASE[type]}`;
  return '192.168.1.0';
}

function buildDeviceModel(type, idx = 0) {
  const m = DEVICE_MODELS[type] || { vendor: '通用', model: 'Standard' };
  if (type === 'pcs') return `${m.vendor} ${m.model}-${idx + 1}`;
  if (type === 'bms_slave') return `${m.vendor} ${m.model}#${idx + 1}`;
  return `${m.vendor} ${m.model}`;
}

// ====================== 从 UEM 推断节点/链路 ======================
function inferTopology(uem) {
  const elec = uem.electrical || {};
  const form = uem.form || uem.context || {};
  const scenario = (form.scenario || uem.scenario || elec.scenario || 'commercial').toLowerCase();
  const special = uem.special_requirements || [];
  const specialArr = Array.isArray(special) ? special : [String(special || '')];

  // 协议列表 (含必选 IEC 61850)
  const protocols = ['IEC 61850'];
  specialArr.forEach(s => {
    if (s) protocols.push(String(s));
  });
  // 去重
  const uniqProtocols = [...new Set(protocols.map(p => p.trim()).filter(Boolean))];

  // PCS 数量推算: 250kW/台
  const cap = safeNum(elec.capacity_kwh, 0);
  const power = safeNum(elec.power_kw, 0);
  const pcsCount = power > 0 ? Math.min(Math.max(2, Math.ceil(power / 250)), 4) : 2;  // 2-4 台

  // BMS 数量推算: 1 Master + ceil(cap / 500) Slave, 最多 4
  const bmsSlaveCount = cap > 0 ? Math.min(Math.max(1, Math.ceil(cap / 500)), 4) : 1;
  const showFAS = cap > 200 || power > 200;

  // ============ 构建节点 ============
  const nodes = [
    { id: 'CLOUD',     name: '云端 SCADA',  type: 'cloud',  level: 0, w: 130, h: 44,
      ip: buildDeviceIP('cloud'),  model: buildDeviceModel('cloud') },
    { id: 'EMS',       name: 'EMS-Central', type: 'ems',    level: 1, w: 130, h: 50,
      ip: buildDeviceIP('ems'),    model: buildDeviceModel('ems'),
      label: 'EMS-Central' },
    { id: 'SW',        name: '核心交换机',   type: 'switch', level: 2, w: 130, h: 50,
      ip: buildDeviceIP('switch'), model: buildDeviceModel('switch') },
  ];

  // 设备层
  // 推算 1 行最多能摆几台 (WIDTH=900, 边距 30, 节点宽 130 + 间距 10 = 140, 可摆 6 台)
  // 超过则分两行 (Lv 3.0 / Lv 3.1)
  const deviceW = 110;
  const deviceH = 56;
  const deviceGap = 14;
  const maxPerRow = 6;
  const totalDevices = pcsCount + 1 + bmsSlaveCount + (showFAS ? 1 : 0) + 1 + (scenario.startsWith('microgrid') ? 1 : 0) + (scenario.startsWith('aidc') ? 2 : 0);

  const yRow1 = 360;
  const yRow2 = 440;
  const xStart = 30;

  let cursor = 0;
  const colW = deviceW + deviceGap;
  const placed = [];  // {node, row, col}

  // PCS — 紫色, 摆前面
  for (let i = 0; i < pcsCount; i++) {
    const row = Math.floor(cursor / maxPerRow);
    const col = cursor % maxPerRow;
    const id = `PCS-${i + 1}`;
    const node = {
      id, name: id, type: 'pcs', level: 3,
      w: deviceW, h: deviceH,
      row, col,
      ip: buildDeviceIP('pcs', i),
      model: buildDeviceModel('pcs', i),
      label: `PCS-${i + 1}`,
    };
    nodes.push(node);
    placed.push({ id, row, col });
    cursor++;
  }

  // BMS Master + Slaves
  if (cap > 0) {
    const masterId = 'BMS-Master';
    const row = Math.floor(cursor / maxPerRow);
    const col = cursor % maxPerRow;
    nodes.push({
      id: masterId, name: masterId, type: 'bms', level: 3,
      w: deviceW, h: deviceH,
      row, col,
      ip: buildDeviceIP('bms'),
      model: buildDeviceModel('bms'),
      label: masterId,
    });
    placed.push({ id: masterId, row, col });
    cursor++;

    // Slaves
    for (let i = 0; i < bmsSlaveCount; i++) {
      const row2 = Math.floor(cursor / maxPerRow);
      const col2 = cursor % maxPerRow;
      const sid = `BMS-Slave-${i + 1}`;
      nodes.push({
        id: sid, name: sid, type: 'bms', level: 3,
        w: deviceW, h: deviceH,
        row: row2, col: col2,
        ip: buildDeviceIP('bms_slave', i),
        model: buildDeviceModel('bms_slave', i),
        label: sid,
        isSlave: true,
      });
      placed.push({ id: sid, row: row2, col: col2 });
      cursor++;
    }
  }

  // FAS
  if (showFAS) {
    const row = Math.floor(cursor / maxPerRow);
    const col = cursor % maxPerRow;
    const id = 'FAS-Main';
    nodes.push({
      id, name: id, type: 'fas', level: 3,
      w: deviceW, h: deviceH,
      row, col,
      ip: buildDeviceIP('fas'),
      model: buildDeviceModel('fas'),
      label: id,
    });
    placed.push({ id, row, col });
    cursor++;
  }

  // Meter — 永远有
  {
    const row = Math.floor(cursor / maxPerRow);
    const col = cursor % maxPerRow;
    const id = 'METER';
    nodes.push({
      id, name: '智能电表', type: 'meter', level: 3,
      w: deviceW, h: deviceH,
      row, col,
      ip: buildDeviceIP('meter'),
      model: buildDeviceModel('meter'),
      label: id,
    });
    placed.push({ id, row, col });
    cursor++;
  }

  // 微电网场景: 加柴发控制器
  if (scenario.startsWith('microgrid')) {
    const row = Math.floor(cursor / maxPerRow);
    const col = cursor % maxPerRow;
    const id = 'DG-CTRL';
    nodes.push({
      id, name: '柴发控制器', type: 'dgctrl', level: 3,
      w: deviceW, h: deviceH,
      row, col,
      ip: buildDeviceIP('dgctrl'),
      model: buildDeviceModel('dgctrl'),
      label: id,
    });
    placed.push({ id, row, col });
    cursor++;
  }

  // AIDC 场景: 加列头柜 PDU
  if (scenario.startsWith('aidc')) {
    for (let i = 0; i < 2; i++) {
      const row = Math.floor(cursor / maxPerRow);
      const col = cursor % maxPerRow;
      const id = `PDU-${i + 1}`;
      nodes.push({
        id, name: `列头柜 ${i + 1}`, type: 'pdu', level: 3,
        w: deviceW, h: deviceH,
        row, col,
        ip: buildDeviceIP('pdu') + (i ? String(i) : ''),
        model: buildDeviceModel('pdu'),
        label: id,
      });
      placed.push({ id, row, col });
      cursor++;
    }
  }

  // 坐标赋值
  const row1Count = placed.filter(p => p.row === 0).length;
  const row2Count = placed.filter(p => p.row === 1).length;
  const totalRow1Width = row1Count * colW - deviceGap;
  const totalRow2Width = row2Count * colW - deviceGap;
  // 居中摆放
  const xStartRow1 = Math.max(30, (WIDTH - totalRow1Width) / 2);
  const xStartRow2 = Math.max(30, (WIDTH - totalRow2Width) / 2);

  nodes.forEach(n => {
    if (n.level === 0) { n.x = (WIDTH - n.w) / 2; n.y = 50; }
    else if (n.level === 1) { n.x = (WIDTH - n.w) / 2; n.y = 140; }
    else if (n.level === 2) { n.x = (WIDTH - n.w) / 2; n.y = 240; }
    else if (n.level === 3) {
      const p = placed.find(pp => pp.id === n.id);
      if (p) {
        const startX = p.row === 0 ? xStartRow1 : xStartRow2;
        n.x = startX + p.col * colW;
        n.y = p.row === 0 ? yRow1 : yRow2;
      }
    }
  });

  // ============ 链路 ============
  const links = [];

  // Cloud <-> EMS — 4G/WiFi (无线上行)
  const uplink = specialArr.some(s => String(s).toUpperCase().includes('4G')) ? '4G' : 'WiFi';
  links.push({
    from: 'CLOUD', to: 'EMS',
    protocol: protocolInfo(uplink),
    label: protocolInfo(uplink).bandwidth,
  });

  // EMS <-> Switch — IEC 61850 (必选)
  links.push({
    from: 'EMS', to: 'SW',
    protocol: protocolInfo('IEC 61850'),
    label: '100 Mbps',
  });

  // Switch <-> PCS (每个 PCS 一条, IEC 61850)
  nodes.filter(n => n.type === 'pcs' && !n.isSlave).forEach(pcs => {
    links.push({
      from: 'SW', to: pcs.id,
      protocol: protocolInfo('IEC 61850'),
      label: '100 Mbps',
    });
  });

  // Switch <-> BMS Master (Modbus TCP, CAN 可选)
  if (nodes.find(n => n.id === 'BMS-Master')) {
    links.push({
      from: 'SW', to: 'BMS-Master',
      protocol: protocolInfo('Modbus TCP'),
      label: '10 Mbps',
    });
    // BMS Master <-> Slaves — CAN 总线
    nodes.filter(n => n.type === 'bms' && n.isSlave).forEach(slv => {
      links.push({
        from: 'BMS-Master', to: slv.id,
        protocol: protocolInfo('CAN'),
        label: '500 kbps',
        isInternal: true,
      });
    });
  }

  // Switch <-> FAS (Modbus RTU)
  if (nodes.find(n => n.id === 'FAS-Main')) {
    links.push({
      from: 'SW', to: 'FAS-Main',
      protocol: protocolInfo('Modbus RTU'),
      label: '115 kbps',
    });
  }

  // Switch <-> Meter (Modbus RTU)
  if (nodes.find(n => n.id === 'METER')) {
    links.push({
      from: 'SW', to: 'METER',
      protocol: protocolInfo('Modbus RTU'),
      label: '115 kbps',
    });
  }

  // Switch <-> DG-Ctrl
  if (nodes.find(n => n.id === 'DG-CTRL')) {
    links.push({
      from: 'SW', to: 'DG-CTRL',
      protocol: protocolInfo('Modbus RTU'),
      label: '115 kbps',
    });
  }

  // Switch <-> PDU
  nodes.filter(n => n.type === 'pdu').forEach(p => {
    links.push({
      from: 'SW', to: p.id,
      protocol: protocolInfo('Modbus TCP'),
      label: '10 Mbps',
    });
  });

  // 添加用户 special_requirements 中显式声明的协议
  const usedTypes = new Set(links.map(l => l.protocol.type));
  uniqProtocols.forEach(p => {
    const info = protocolInfo(p);
    if (!usedTypes.has(info.type) && info.type !== 'modbus_rtu') {
      if (info.type === 'fiber') {
        links.push({
          from: 'EMS', to: 'CLOUD',
          protocol: info,
          label: info.bandwidth + ' (备用)',
          isAux: true,
        });
      }
    }
  });

  return { nodes, links, protocols: uniqProtocols, scenario };
}

// ====================== 节点绘制 ======================
function renderNode(n) {
  const lines = [];
  const c = DEVICE_COLORS[n.type] || DEVICE_COLORS.cloud;

  if (n.type === 'cloud') {
    // Cloud 用椭圆
    const cx = n.x + n.w / 2;
    const cy = n.y + n.h / 2;
    const rx = n.w / 2;
    const ry = n.h / 2;
    lines.push(`  <ellipse cx="${cx}" cy="${cy}" rx="${rx}" ry="${ry}" fill="${c.fill}" stroke="${c.border}" stroke-width="2"/>`);
    lines.push(`  <text x="${cx}" y="${cy - 4}" text-anchor="middle" fill="${COLOR_NODE_TEXT}" ${FONT_NODE_ID}>${escapeXml(safeSlice(n.label || n.id, 14))}</text>`);
    lines.push(`  <text x="${cx}" y="${cy + 10}" text-anchor="middle" fill="${COLOR_IP_TEXT}" ${FONT_NODE_IP}>${escapeXml(n.ip)}</text>`);
    return lines.join('\n');
  }

  if (n.type === 'ems') {
    // EMS — 加粗边框, 突出主控
    lines.push(`  <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="6" ry="6" fill="${c.fill}" stroke="${c.border}" stroke-width="3"/>`);
    lines.push(`  <text x="${n.x + n.w / 2}" y="${n.y + 17}" text-anchor="middle" fill="${COLOR_NODE_TEXT}" ${FONT_NODE_ID}>${escapeXml(safeSlice(n.label || n.id, 14))}</text>`);
    lines.push(`  <text x="${n.x + n.w / 2}" y="${n.y + 32}" text-anchor="middle" fill="${COLOR_MODEL_TEXT}" ${FONT_NODE_MODEL}>${escapeXml(safeSlice(n.model, 18))}</text>`);
    lines.push(`  <text x="${n.x + n.w / 2}" y="${n.y + 45}" text-anchor="middle" fill="${COLOR_IP_TEXT}" ${FONT_NODE_IP}>${escapeXml(n.ip)}</text>`);
    return lines.join('\n');
  }

  if (n.type === 'switch') {
    // Switch — 普通方 + 端口指示
    lines.push(`  <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="4" ry="4" fill="${c.fill}" stroke="${c.border}" stroke-width="2"/>`);
    lines.push(`  <rect x="${n.x + 8}" y="${n.y + n.h / 2 - 3}" width="6" height="6" fill="#4CAF50"/>`);
    lines.push(`  <rect x="${n.x + n.w - 14}" y="${n.y + n.h / 2 - 3}" width="6" height="6" fill="#4CAF50"/>`);
    lines.push(`  <text x="${n.x + n.w / 2}" y="${n.y + 17}" text-anchor="middle" fill="${COLOR_NODE_TEXT}" ${FONT_NODE_ID}>${escapeXml(safeSlice(n.label || n.id, 14))}</text>`);
    lines.push(`  <text x="${n.x + n.w / 2}" y="${n.y + 32}" text-anchor="middle" fill="${COLOR_MODEL_TEXT}" ${FONT_NODE_MODEL}>${escapeXml(safeSlice(n.model, 18))}</text>`);
    lines.push(`  <text x="${n.x + n.w / 2}" y="${n.y + 45}" text-anchor="middle" fill="${COLOR_IP_TEXT}" ${FONT_NODE_IP}>${escapeXml(n.ip)}</text>`);
    return lines.join('\n');
  }

  // 设备层 (pcs/bms/fas/meter/dgctrl/pdu) — 圆角方 + 3 行文字
  lines.push(`  <rect x="${n.x}" y="${n.y}" width="${n.w}" height="${n.h}" rx="4" ry="4" fill="${c.fill}" stroke="${c.border}" stroke-width="1.5"/>`);

  // 类型图标 (左上角小色块, 区分主从)
  lines.push(`  <circle cx="${n.x + 11}" cy="${n.y + 11}" r="4" fill="${c.icon}"/>`);

  // ID (粗体)
  lines.push(`  <text x="${n.x + n.w / 2 + 6}" y="${n.y + 16}" text-anchor="middle" fill="${COLOR_NODE_TEXT}" ${FONT_NODE_ID}>${escapeXml(safeSlice(n.label || n.id, 14))}</text>`);

  // 型号
  lines.push(`  <text x="${n.x + n.w / 2}" y="${n.y + 32}" text-anchor="middle" fill="${COLOR_MODEL_TEXT}" ${FONT_NODE_MODEL}>${escapeXml(safeSlice(n.model, 18))}</text>`);

  // IP
  lines.push(`  <text x="${n.x + n.w / 2}" y="${n.y + 47}" text-anchor="middle" fill="${COLOR_IP_TEXT}" ${FONT_NODE_IP}>${escapeXml(n.ip)}</text>`);

  return lines.join('\n');
}

// ====================== 链路绘制 ======================
function renderLink(l, nodeMap) {
  const fromNode = nodeMap[l.from];
  const toNode = nodeMap[l.to];
  if (!fromNode || !toNode) return '';

  const fx = fromNode.x + fromNode.w / 2;
  const fy = fromNode.y + fromNode.h / 2;
  const tx = toNode.x + toNode.w / 2;
  const ty = toNode.y + toNode.h / 2;

  // 上下连接: 从 from 底部到 to 顶部
  let x1, y1, x2, y2;
  if (ty > fy) {
    x1 = fx; y1 = fromNode.y + fromNode.h;
    x2 = tx; y2 = toNode.y;
  } else {
    x1 = fx; y1 = fromNode.y;
    x2 = tx; y2 = toNode.y + toNode.h;
  }

  // 折线 (L 形)
  const midY = (y1 + y2) / 2;
  const path = `M ${x1} ${y1} L ${x1} ${midY} L ${x2} ${midY} L ${x2} ${y2}`;

  const proto = l.protocol;
  const lines = [];
  const dashAttr = proto.dasharray ? ` stroke-dasharray="${proto.dasharray}"` : '';
  const opacityAttr = l.isAux ? ' opacity="0.6"' : (l.isInternal ? ' opacity="0.85"' : '');
  const strokeWidth = proto.type === 'iec61850' ? 3
                    : proto.type === 'fiber' ? 3
                    : proto.type === 'modbus_rtu' ? 1.5
                    : proto.type === 'can' ? 1.5
                    : 2;

  lines.push(`  <path d="${path}" fill="none" stroke="${proto.color}" stroke-width="${strokeWidth}"${dashAttr}${opacityAttr} stroke-linecap="round"/>`);

  // 链路标签: 协议 + 带宽 (例 "IEC 61850 100 Mbps")
  const labelX = (x1 + x2) / 2;
  const labelY = midY - 6;
  const protoLabel = proto.label;
  const bwLabel = l.label || proto.bandwidth;
  const labelText = `${protoLabel} ${bwLabel}`;
  // 估算文字宽度
  const labelW = labelText.length * 6 + 10;
  lines.push(`  <rect x="${labelX - labelW / 2}" y="${labelY - 9}" width="${labelW}" height="13" rx="2" ry="2" fill="${COLOR_BG}" stroke="${proto.color}" stroke-width="0.5" opacity="0.95"/>`);
  lines.push(`  <text x="${labelX}" y="${labelY}" text-anchor="middle" fill="${proto.color}" ${FONT_LINK}>${escapeXml(labelText)}</text>`);

  return lines.join('\n');
}

// ====================== 主渲染 ======================
function renderCommSvg(uem) {
  const project = uem.project || {};
  const projectName = project.name || project.project_id || '储能项目';

  const { nodes, links, protocols, scenario } = inferTopology(uem);

  const nodeMap = {};
  nodes.forEach(n => { nodeMap[n.id] = n; });

  const out = [];
  out.push(`<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${WIDTH} ${HEIGHT}" width="${WIDTH}" height="${HEIGHT}" font-family="Microsoft YaHei, Arial, sans-serif">`);
  out.push(`  <defs>`);
  out.push(`    <linearGradient id="commBg" x1="0%" y1="0%" x2="0%" y2="100%">`);
  out.push(`      <stop offset="0%" stop-color="${COLOR_BG}"/>`);
  out.push(`      <stop offset="100%" stop-color="#e8eef3"/>`);
  out.push(`    </linearGradient>`);
  out.push(`    <marker id="arrowComm" markerWidth="8" markerHeight="8" refX="7" refY="4" orient="auto">`);
  out.push(`      <polygon points="0 0, 8 4, 0 8" fill="#444"/>`);
  out.push(`    </marker>`);
  out.push(`  </defs>`);

  // 背景
  out.push(`  <rect x="0" y="0" width="${WIDTH}" height="${HEIGHT}" fill="url(#commBg)"/>`);

  // 标题栏
  out.push(`  <rect x="0" y="0" width="${WIDTH}" height="32" fill="${COLOR_TITLE_BG}"/>`);
  out.push(`  <text x="15" y="22" fill="${COLOR_TITLE_FG}" ${FONT_TITLE}>通信拓扑图 — ${escapeXml(projectName)}</text>`);
  out.push(`  <text x="${WIDTH - 15}" y="22" text-anchor="end" fill="${COLOR_TITLE_FG}" font-family="Microsoft YaHei, Arial, sans-serif" font-size="11">节点: ${nodes.length} | 链路: ${links.length} | 场景: ${escapeXml(scenario)}</text>`);

  // 层级带
  // Cloud zone
  out.push(`  <rect x="20" y="40" width="${WIDTH - 40}" height="60" rx="6" ry="6" fill="#E1F5FE" opacity="0.4"/>`);
  out.push(`  <text x="30" y="55" fill="#0277BD" font-family="Microsoft YaHei, Arial, sans-serif" font-size="10" font-weight="bold">云端层 (Cloud)</text>`);

  // EMS zone
  out.push(`  <rect x="20" y="115" width="${WIDTH - 40}" height="65" rx="6" ry="6" fill="#FFF3E0" opacity="0.4"/>`);
  out.push(`  <text x="30" y="130" fill="#E65100" font-family="Microsoft YaHei, Arial, sans-serif" font-size="10" font-weight="bold">主控层 (EMS)</text>`);

  // Switch zone
  out.push(`  <rect x="20" y="205" width="${WIDTH - 40}" height="70" rx="6" ry="6" fill="#F3E5F5" opacity="0.4"/>`);
  out.push(`  <text x="30" y="220" fill="#6A1B9A" font-family="Microsoft YaHei, Arial, sans-serif" font-size="10" font-weight="bold">网络层 (Switch)</text>`);

  // Device zone — 大框, 容纳两行
  out.push(`  <rect x="20" y="295" width="${WIDTH - 40}" height="220" rx="6" ry="6" fill="#E8F5E9" opacity="0.4"/>`);
  out.push(`  <text x="30" y="310" fill="#2E7D32" font-family="Microsoft YaHei, Arial, sans-serif" font-size="10" font-weight="bold">设备层 (Field Devices)</text>`);

  // 链路 (在节点下面)
  links.forEach(l => {
    const svg = renderLink(l, nodeMap);
    if (svg) out.push(svg);
  });

  // 节点
  nodes.forEach(n => {
    out.push(renderNode(n));
  });

  // 图例 (右下角)
  const legendX = WIDTH - 200;
  const legendY = HEIGHT - 110;
  out.push(`  <rect x="${legendX}" y="${legendY}" width="190" height="100" rx="4" ry="4" fill="#ffffff" stroke="${COLOR_NODE_BORDER}" stroke-width="1" opacity="0.95"/>`);
  out.push(`  <text x="${legendX + 8}" y="${legendY + 14}" fill="${COLOR_NODE_TEXT}" font-family="Microsoft YaHei, Arial, sans-serif" font-size="10" font-weight="bold">图例 (Legend):</text>`);

  // 节点类型色块
  const legendEntries = [
    { type: 'pcs',    name: 'PCS (逆变器)' },
    { type: 'bms',    name: 'BMS (电池管理)' },
    { type: 'fas',    name: 'FAS (消防)' },
    { type: 'meter',  name: 'Meter (电表)' },
  ];
  legendEntries.forEach((e, i) => {
    const y = legendY + 28 + i * 14;
    const c = DEVICE_COLORS[e.type];
    out.push(`  <rect x="${legendX + 10}" y="${y - 7}" width="12" height="10" fill="${c.fill}" stroke="${c.border}" stroke-width="1"/>`);
    out.push(`  <text x="${legendX + 26}" y="${y + 2}" fill="${COLOR_NODE_TEXT}" ${FONT_LEGEND}>${escapeXml(e.name)}</text>`);
  });

  // 协议清单 (左侧底部)
  const protoY = HEIGHT - 30;
  out.push(`  <text x="10" y="${protoY}" fill="#555" ${FONT_LEGEND}>协议清单: ${protocols.map(escapeXml).join(' | ')}</text>`);

  // 链路类型说明 (左下)
  out.push(`  <text x="10" y="${HEIGHT - 12}" fill="#777" font-family="Microsoft YaHei, Arial, sans-serif" font-size="9">线条: 粗红=IEC 61850 | 细蓝虚=Modbus RTU | 蓝实=Modbus TCP | 青虚=CAN | 绿虚=4G/WiFi | 橙实=光纤</text>`);

  out.push(`</svg>`);
  return out.join('\n');
}

// ====================== Vercel Handler ======================
export default async function handler(req, res) {
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  let body = req.body;
  if (typeof body === 'string') {
    try { body = JSON.parse(body); } catch (e) {
      return res.status(400).json({ error: 'Invalid JSON body: ' + e.message });
    }
  }
  const uem = (body && body.uem) ? body.uem : body;
  if (!uem || typeof uem !== 'object') {
    return res.status(400).json({ error: 'Missing UEM JSON in body' });
  }

  try {
    const svg = renderCommSvg(uem);
    const { nodes, links, protocols, scenario } = inferTopology(uem);
    const projectId = (uem.project && (uem.project.project_id || uem.project.name)) || 'unknown';
    return res.status(200).json({
      ok: true,
      project_id: projectId,
      svg,
      width: WIDTH,
      height: HEIGHT,
      nodes: nodes.map(n => ({
        id: n.id, name: n.name, type: n.type, level: n.level,
        ip: n.ip, model: n.model, label: n.label || n.id,
      })),
      links: links.map(l => ({ from: l.from, to: l.to, protocol: l.protocol.label, bandwidth: l.label })),
      protocols,
      scenario,
      node_count: nodes.length,
      link_count: links.length,
    });
  } catch (e) {
    return res.status(500).json({ error: `Render comm error: ${e.name}: ${e.message}` });
  }
}

// ====================== 导出供测试使用 ======================
export {
  renderCommSvg,
  inferTopology,
  protocolInfo,
  renderNode,
  renderLink,
  buildDeviceIP,
  buildDeviceModel,
  DEVICE_MODELS,
};
