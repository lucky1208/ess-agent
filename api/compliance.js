// api/compliance.js
// ESS Agent — Compliance Rule Engine (Node.js port of AI auto-schematic v1.1)
// =========================================================================
// Endpoint: POST /api/compliance
// Body:     { uem: <UEM JSON> }   (or just the UEM JSON directly)
// Returns:  { summary, rule_results, failing_rules, markdown, compliance_status }
//
// Rules:    25 rules ported 1:1 from src/rule_definitions.py
// Standards: GB 51048 / GB 50054 / GB 50059 / GB 50060 / GB 50062 / GB 50065
//            / GB 50016 / GB/T 14549 / GB/T 15543 / GB/T 15945
//            / GB/T 36276 / IEC 61850 / IEEE 519 / TIA-942
//
// Includes: L3 compile_uem() port (ess / microgrid / aidc / hybrid)
//           so we run end-to-end without spawning Python.
// =========================================================================

// ====================== L3 COMPILER PORT ======================
const CELL_VOLTAGE = 3.2;       // LFP cell (V)
const CELL_CAPACITY_AH = 280;   // 280 Ah standard
const DC_BUS_VOLTAGE = 768;     // 1500V 体系低压端
const PCS_EFFICIENCY = 0.98;
const XF_EFFICIENCY = 0.985;
const OVERLOAD_FACTOR = 1.25;
const REDUNDANCY_PCS = 1;
const BREAKER_STANDARDS = [16, 20, 25, 32, 40, 50, 63, 80, 100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500, 3150];
const XF_STANDARDS = [100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500];

function calcBatteryConfig(capacityKwh, dcBus = DC_BUS_VOLTAGE, cellV = CELL_VOLTAGE, cellAh = CELL_CAPACITY_AH) {
  const perPackVoltage = dcBus;
  const stringsSeries = Math.ceil(perPackVoltage / cellV);
  const perPackKwh = (stringsSeries * cellV * cellAh) / 1000;
  const packsParallel = Math.ceil(capacityKwh / perPackKwh);
  return {
    strings_series: stringsSeries,
    packs_parallel: packsParallel,
    per_pack_kwh: Math.round(perPackKwh * 10) / 10,
    per_pack_voltage: Math.round(perPackVoltage * 10) / 10,
    cell_count: stringsSeries * packsParallel
  };
}

function selectPcsCount(powerKw, pcsUnitKw = 125, redundancy = REDUNDANCY_PCS) {
  let pcsCount = Math.ceil(powerKw / pcsUnitKw);
  pcsCount += redundancy;
  return { count: pcsCount, unit: pcsUnitKw };
}

function calcBreaker(currentA, factor = OVERLOAD_FACTOR) {
  const target = currentA * factor;
  for (const s of BREAKER_STANDARDS) {
    if (s >= target) return s;
  }
  return BREAKER_STANDARDS[BREAKER_STANDARDS.length - 1];
}

function voltageToLevelV(vStr) {
  if (!vStr) return 0;
  const s = String(vStr).toUpperCase().replace(/\s+/g, '');
  if (s.endsWith('KV')) return parseFloat(s.slice(0, -2)) * 1000;
  if (s.endsWith('V')) return parseFloat(s.slice(0, -1));
  return 0;
}

function compileEss(uem) {
  const components = [];
  const connections = [];
  const project = uem.project || {};
  const elec = uem.electrical || {};
  if (!elec.capacity_kwh || !elec.power_kw) {
    return { components: [], connections: [], note: 'insufficient data' };
  }
  const cap = elec.capacity_kwh;
  const power = elec.power_kw;
  const voltage = elec.voltage_level || '380V';
  const gridMode = elec.grid_mode || 'grid_tied';
  const durationH = elec.duration_h || (cap / power);

  // 1) Battery
  const bat = calcBatteryConfig(cap);
  components.push({
    id: 'BAT', category: 'battery_rack', ref: `BAT-${bat.packs_parallel}P`,
    model: `LFP-${Math.floor(bat.per_pack_kwh)}kWh-${Math.floor(bat.per_pack_voltage)}V`,
    qty: bat.packs_parallel,
    params: {
      strings_series: bat.strings_series,
      cell_voltage: CELL_VOLTAGE, cell_ah: CELL_CAPACITY_AH,
      per_pack_kwh: bat.per_pack_kwh, per_pack_voltage: bat.per_pack_voltage,
      total_capacity_kwh: Math.round(bat.packs_parallel * bat.per_pack_kwh * 10) / 10,
      duration_h: Math.round(durationH * 10) / 10
    }
  });

  // 2) PCS
  const { count: pcsCount, unit: pcsUnit } = selectPcsCount(power);
  components.push({
    id: 'PCS', category: 'pcs', ref: 'PCS', model: `PCS-${Math.floor(pcsUnit)}kW`,
    qty: pcsCount,
    params: { unit_kw: pcsUnit, total_kw: pcsCount * pcsUnit, efficiency: PCS_EFFICIENCY, redundancy: 'N+1' }
  });

  // 3) DC bus
  components.push({
    id: 'DC_BUS', category: 'bus', ref: 'DC+', model: `DC-${Math.floor(DC_BUS_VOLTAGE)}V-${Math.floor(power)}kW`,
    qty: 1,
    params: {
      voltage_v: DC_BUS_VOLTAGE,
      current_a: Math.round(power * 1000 / DC_BUS_VOLTAGE * 1.25 * 10) / 10,
      type: 'dc'
    }
  });

  // 4) AC bus + breaker
  const lvSideV = 380;
  const acCurrent = power * 1000 / (lvSideV * Math.sqrt(3) * 0.85);
  const acCb = calcBreaker(acCurrent);
  components.push({
    id: 'AC_BUS', category: 'bus', ref: 'AC-LV', model: `AC-${lvSideV}V-${Math.floor(power)}kW`,
    qty: 1, params: { voltage_v: lvSideV, breaker_a: acCb }
  });

  // 5) Transformer
  if (String(voltage).includes('kV') && voltage !== '380V') {
    let xfRatingKva = Math.floor(power * 1.1);
    for (const s of XF_STANDARDS) { if (s >= xfRatingKva) { xfRatingKva = s; break; } }
    components.push({
      id: 'XF', category: 'transformer', ref: 'T1',
      model: `${xfRatingKva}kVA-${lvSideV}V/${voltage}`, qty: 1,
      params: {
        lv_voltage_v: lvSideV, hv_voltage_v: voltageToLevelV(voltage),
        rating_kva: xfRatingKva, efficiency: XF_EFFICIENCY,
        vector_group: gridMode === 'grid_tied' ? 'Dy11' : 'Dyn11'
      }
    });
  }

  // 6) Main breaker
  components.push({
    id: 'QF', category: 'protection', ref: 'QF1', model: `ACB-${acCb}A`, qty: 1,
    params: { type: 'ACB', rated_current_a: acCb, breaking_capacity_ka: 50 }
  });

  // 7) Disconnector
  components.push({
    id: 'QS', category: 'switching', ref: 'QS1',
    model: `DC-Disconnect-${Math.floor(power * 1000 / DC_BUS_VOLTAGE * 1.25)}A`, qty: 1,
    params: { type: 'DC_disconnect', rated_current_a: Math.round(power * 1000 / DC_BUS_VOLTAGE * 1.25 * 10) / 10 }
  });

  // 8) EMS + FAS
  components.push({ id: 'EMS', category: 'controller', ref: 'EMS', model: 'EMS-Standard', qty: 1, params: { function: 'SCADA + 能量管理 + 保护' } });
  components.push({ id: 'FAS', category: 'protection', ref: 'FAS', model: 'FAS-ESS-Standard', qty: 1, params: { function: '消防: 气体灭火 + 温感烟感' } });

  // Connections
  connections.push({ from: 'BAT+', to: 'DC_BUS+', type: 'power', cable: 'DC-battery', length_m: 10 });
  connections.push({ from: 'DC_BUS+', to: 'PCS-DC+', type: 'power', cable: 'DC-link', length_m: 5 });
  connections.push({ from: 'PCS-AC', to: 'AC_BUS', type: 'power', cable: 'AC-low', length_m: 5 });
  connections.push({ from: 'AC_BUS', to: 'QF1', type: 'power', cable: 'AC-main', length_m: 2 });
  if (String(voltage).includes('kV') && voltage !== '380V') {
    connections.push({ from: 'QF1', to: 'T1-LV', type: 'power', cable: 'AC-tran-lv', length_m: 5 });
    connections.push({ from: 'T1-HV', to: 'GRID', type: 'power', cable: 'AC-tran-hv', length_m: null });
  }
  return { components, connections };
}

function compileMicrogrid(uem) {
  const components = [];
  const connections = [];
  const elec = uem.electrical || {};
  const cap = elec.capacity_kwh || 0;
  const power = elec.power_kw || 0;
  const pvKw = elec.pv_kw || 0;
  const dieselKw = elec.diesel_kw || 0;
  const windKw = elec.wind_kw || 0;
  const voltage = elec.voltage_level || '380V';
  const loadKw = elec.load_kw || 0;

  if (pvKw > 0) {
    const invCount = Math.ceil(pvKw / 50);
    components.push({ id: 'PV', category: 'source', ref: 'PV', model: `PV-${Math.floor(pvKw)}kWp`, qty: 1, params: { capacity_kw: pvKw, inverter_qty: invCount } });
  }
  if (windKw > 0) {
    components.push({ id: 'WT', category: 'source', ref: 'WT', model: `WT-${Math.floor(windKw)}kW`, qty: 1, params: { capacity_kw: windKw, note: '进 special_requirements' } });
  }
  if (dieselKw > 0) {
    components.push({ id: 'GEN', category: 'source', ref: 'G1', model: `Genset-${Math.floor(dieselKw)}kW`, qty: 1, params: { rating_kw: dieselKw, fuel: 'diesel' } });
  }
  if (cap > 0 && power > 0) {
    const bat = calcBatteryConfig(cap);
    components.push({
      id: 'BAT', category: 'battery_rack', ref: `BAT-${bat.packs_parallel}P`,
      model: `LFP-${Math.floor(bat.per_pack_kwh)}kWh`, qty: bat.packs_parallel,
      params: { per_pack_kwh: bat.per_pack_kwh, packs_parallel: bat.packs_parallel, strings_series: bat.strings_series }
    });
    const { count, unit } = selectPcsCount(power);
    components.push({ id: 'PCS', category: 'pcs', ref: 'PCS', model: `PCS-${Math.floor(unit)}kW`, qty: count, params: { unit_kw: unit, total_kw: count * unit } });
  }
  components.push({ id: 'AC_BUS', category: 'bus', ref: 'AC', model: `AC-${voltage}-${Math.floor(power + pvKw + dieselKw + windKw)}kW`, qty: 1, params: { voltage_v: voltageToLevelV(voltage) } });
  if (loadKw > 0) {
    components.push({ id: 'LOAD', category: 'load', ref: 'LOAD', model: `Load-${Math.floor(loadKw)}kW`, qty: 1, params: { load_kw: loadKw } });
  }
  components.push({ id: 'EMS', category: 'controller', ref: 'EMS', model: 'EMS-Microgrid', qty: 1, params: { function: '微网能量管理 + 保护 + 柴发启停' } });
  // 隔离开关 (380V 侧)
  if (loadKw > 0) {
    const loadCurrent = loadKw * 1000 / (380 * Math.sqrt(3) * 0.85);
    const cb = calcBreaker(loadCurrent);
    components.push({ id: 'QS', category: 'switching', ref: 'QS-MICRO', model: `隔离开关-${cb}A`, qty: 1, params: { type: 'disconnector', rated_current_a: cb } });
  }
  // 消防 (电池舱)
  if (cap > 0) {
    components.push({ id: 'FAS', category: 'protection', ref: 'FAS', model: 'FAS-Microgrid-Standard', qty: 1, params: { function: '消防: 气体灭火 + 温感烟感' } });
  }
  for (const src of ['PV', 'WT', 'GEN']) {
    if (components.find(c => c.id === src)) connections.push({ from: src, to: 'AC_BUS', type: 'power', cable: `AC-${src}` });
  }
  if (components.find(c => c.id === 'PCS')) {
    connections.push({ from: 'BAT', to: 'PCS', type: 'power', cable: 'DC-link' });
    connections.push({ from: 'PCS', to: 'AC_BUS', type: 'power', cable: 'AC-pcs' });
  }
  if (components.find(c => c.id === 'LOAD')) connections.push({ from: 'AC_BUS', to: 'LOAD', type: 'power', cable: 'AC-load' });
  return { components, connections };
}

function compileAidc(uem) {
  const components = [];
  const elec = uem.electrical || {};
  const tier = uem.tier || {};
  const loadKw = elec.load_kw || 0;
  const voltage = elec.voltage_level || '10kV';
  const redundancy = tier.redundancy || 'N+1';

  const mainsCount = (redundancy === 'N+1' || redundancy === '2N+1') ? 2 : (redundancy === '2N' ? 4 : 1);
  for (let i = 0; i < mainsCount; i++) {
    components.push({ id: `MAINS-${i+1}`, category: 'source', ref: `QS${i+1}`, model: `市电进线-${i+1}-${voltage}`, qty: 1, params: { voltage, redundancy } });
  }
  const xfCount = (redundancy === 'N+1' || redundancy === '2N+1') ? 2 : (redundancy === '2N' ? 4 : 1);
  const xfUnitKva = Math.ceil(loadKw * 1.25 / xfCount);
  for (let i = 0; i < xfCount; i++) {
    components.push({ id: `XF-${i+1}`, category: 'transformer', ref: `T${i+1}`, model: `干变-${xfUnitKva}kVA`, qty: 1, params: { rating_kva: xfUnitKva, vector_group: 'Dyn11' } });
  }
  const upsTopology = tier.ups_topology || 'online_double';
  if (upsTopology === 'online_double') {
    for (let i = 0; i < 2; i++) {
      components.push({ id: `UPS-${i+1}`, category: 'controller', ref: `UPS${i+1}`, model: `UPS-在线双变换-${Math.floor(loadKw/2)}kW`, qty: 1, params: { topology: 'online_double', bus: `Bus-${i+1}` } });
    }
    components.push({ id: 'STS', category: 'switching', ref: 'STS', model: `STS-${Math.floor(loadKw)}kW`, qty: 1, params: { transfer_ms: 4 } });
  }
  components.push({ id: 'PDU', category: 'load', ref: 'PDU', model: `列头柜-${Math.floor(loadKw)}kW`, qty: 1, params: { load_kw: loadKw, load_type: 'it_load' } });
  components.push({ id: 'AC_BUS', category: 'bus', ref: 'AC-IT', model: `AC-380V-${Math.floor(loadKw)}kW`, qty: 1, params: { voltage_v: 380, load_type: 'it_load' } });
  if (loadKw > 0) {
    const itCurrent = loadKw * 1000 / (380 * Math.sqrt(3) * 0.9);
    const cbAmp = calcBreaker(itCurrent);
    components.push({ id: 'QF', category: 'protection', ref: 'QF-MAIN', model: `ACB-${cbAmp}A`, qty: 1, params: { type: 'ACB', rated_current_a: cbAmp, breaking_capacity_ka: 65 } });
    components.push({ id: 'QS', category: 'switching', ref: 'QS-MAIN', model: `隔离开关-${cbAmp}A`, qty: 1, params: { type: 'disconnector', rated_current_a: cbAmp } });
  }
  if (elec.capacity_kwh) {
    const bat = calcBatteryConfig(elec.capacity_kwh);
    const { count, unit } = selectPcsCount(elec.power_kw || loadKw);
    components.push({ id: 'ESS', category: 'battery_rack', ref: 'ESS', model: `LFP-${Math.floor(bat.per_pack_kwh)}kWh`, qty: bat.packs_parallel, params: { total_kwh: Math.round(bat.packs_parallel * bat.per_pack_kwh * 10) / 10 } });
    components.push({ id: 'PCS', category: 'pcs', ref: 'PCS', model: `PCS-${Math.floor(unit)}kW`, qty: count, params: { total_kw: count * unit } });
  }
  return { components, connections: [] };
}

function compileUem(uem) {
  const ptype = (uem.project && uem.project.type) || 'ess';
  if (ptype === 'ess') return compileEss(uem);
  if (ptype === 'microgrid') return compileMicrogrid(uem);
  if (ptype === 'aidc') return compileAidc(uem);
  if (ptype === 'hybrid') {
    // hybrid = ess + microgrid 组合
    const ess = compileEss(uem);
    const mg = compileMicrogrid(uem);
    const seen = new Set(ess.components.map(c => c.id));
    for (const c of mg.components) {
      if (!seen.has(c.id)) { ess.components.push(c); seen.add(c.id); }
    }
    return ess;
  }
  return { components: [], connections: [], note: `unknown type ${ptype}` };
}

// ====================== L4 RULE ENGINE PORT ======================
function pass(msg) { return { status: 'pass', severity: 'info', message: msg }; }
function fail(msg) { return { status: 'fail', severity: 'error', message: msg }; }
function warn(msg) { return { status: 'fail', severity: 'warning', message: msg }; }
function info(msg) { return { status: 'pass', severity: 'info', message: msg }; }
function skip(reason) { return { status: 'skip', severity: 'info', message: `skipped: ${reason}` }; }

function getCategory(c, cat) { return c.category === cat; }
function getById(c, id) { return c.id === id; }

// R001: 电池串联数范围 (GB 51048 §6.4)
function checkBatteryStringsSeries(uem, compiled) {
  const bat = compiled.components.find(c => getCategory(c, 'battery_rack'));
  if (!bat) return skip('无电池配置');
  const s = (bat.params && bat.params.strings_series) || 0;
  if (s < 100 || s > 240) return fail(`电池串联数 ${s} 超出工程范围 100-240`);
  return pass(`电池串联数 ${s} 在工程范围内`);
}

// R002: 电池并联包数
function checkBatteryPacksParallel(uem, compiled) {
  const bat = compiled.components.find(c => getCategory(c, 'battery_rack'));
  if (!bat) return skip('无电池配置');
  const p = bat.qty || 0;
  if (p < 1 || p > 20) return fail(`电池并联包数 ${p} 超出工程范围 1-20`);
  return pass(`电池并联包数 ${p} 合理`);
}

// R003: 储能时长范围
function checkDurationH(uem) {
  const d = uem.electrical && uem.electrical.duration_h;
  if (d == null) return skip('未指定 duration_h');
  if (d < 0.25 || d > 12) return fail(`储能时长 ${d}h 超出工程范围 0.25-12h`);
  return pass(`储能时长 ${d}h 合理`);
}

// R004: SOC 范围 (GB 51048 §6.5)
function checkSocRange(uem) {
  const socMin = uem.electrical && uem.electrical.soc_min;
  const socMax = uem.electrical && uem.electrical.soc_max;
  if (socMin == null || socMax == null) return skip('未指定 SOC 范围');
  if (socMin >= socMax) return fail(`SOC 范围无效: min=${socMin} >= max=${socMax}`);
  if (socMin < 0 || socMax > 100) return fail(`SOC 范围超界: [${socMin}, ${socMax}], 必须在 0-100% 内`);
  if (socMin < 5) return warn(`SOC 下限 ${socMin}% < 5%, 深度放电将显著缩短电池寿命`);
  if (socMax > 95) return warn(`SOC 上限 ${socMax}% > 95%, 过充风险`);
  return pass(`SOC 范围 [${socMin}%, ${socMax}%] 合理`);
}

// R005: 电压等级 (GB 50059)
function checkVoltageLevel(uem) {
  const v = uem.electrical && uem.electrical.voltage_level;
  if (!v) return skip('未指定 voltage_level');
  const valid = ['380V', '400V', '6kV', '10kV', '35kV'];
  if (!valid.includes(v)) return fail(`电压等级 ${v} 非标准等级, 推荐: ${valid.join('/')}`);
  return pass(`电压等级 ${v} 符合 GB 50059`);
}

// R006: DC 母线电压 ≤1500V
function checkDcBusVoltage(uem, compiled) {
  const bus = compiled.components.find(c => getById(c, 'DC_BUS'));
  if (!bus) return skip('无直流母线');
  const v = (bus.params && bus.params.voltage_v) || 0;
  if (v > 1500) return fail(`直流母线电压 ${v}V 超过 1500V, 不符合工程惯例`);
  return pass(`直流母线电压 ${v}V 符合 ≤1500V 要求`);
}

// R007: PCS 单台功率
function checkPcsUnitSize(uem, compiled) {
  const pcs = compiled.components.find(c => getCategory(c, 'pcs'));
  if (!pcs) return skip('无 PCS');
  const u = (pcs.params && pcs.params.unit_kw) || 0;
  if (u < 50 || u > 250) return warn(`PCS 单台功率 ${u}kW 偏离常见 50-250kW 范围, 需特殊订货`);
  return pass(`PCS 单台功率 ${u}kW 符合常规模块规格`);
}

// R008: PCS N+1 冗余
function checkPcsRedundancy(uem, compiled) {
  const ptype = (uem.project && uem.project.type) || '';
  if (!['ess', 'aidc', 'hybrid'].includes(ptype)) return skip('微网/海岛项目 PCS 冗余非强制');
  const pcs = compiled.components.find(c => getCategory(c, 'pcs'));
  if (!pcs) return skip('无 PCS');
  if (ptype === 'aidc') {
    const tierRed = ((uem.tier && uem.tier.redundancy) || 'N+1');
    if (!['N+1', '2N+1', '2N'].includes(tierRed)) return fail(`AIDC 项目冗余 ${tierRed} 不符合 TIA-942`);
    return pass(`AIDC 冗余 ${tierRed} 符合 TIA-942`);
  }
  const red = (pcs.params && pcs.params.redundancy) || '';
  if (red !== 'N+1') return warn(`ESS 项目 PCS 冗余声明为 ${red || '未指定'}, 建议 N+1`);
  return pass(`PCS 配置 N+1 冗余 (共 ${pcs.qty} 台)`);
}

// R009: 断路器整定 (GB 50054)
function checkBreakerSetting(uem, compiled) {
  const qf = compiled.components.find(c => c.id === 'QF' || c.id === 'QF1' || c.id === 'QF-MAIN');
  if (!qf) return skip('无断路器');
  const inA = (qf.params && qf.params.rated_current_a) || 0;
  if (!BREAKER_STANDARDS.includes(inA)) {
    const nearest = BREAKER_STANDARDS.reduce((a, b) => Math.abs(b - inA) < Math.abs(a - inA) ? b : a);
    return fail(`断路器整定 ${inA}A 非标准值, 圆整到 ${nearest}A`);
  }
  const breaking = (qf.params && qf.params.breaking_capacity_ka) || 0;
  if (breaking < 25) return warn(`断路器分断能力 ${breaking}kA < 25kA, 不满足 10kV 站要求`);
  return pass(`断路器 ${inA}A, 分断 ${breaking}kA, 符合 GB 50054`);
}

// R010: 三段保护 (GB 50062)
function checkProtectionZones(uem) {
  const ptype = (uem.project && uem.project.type) || '';
  const gridMode = (uem.electrical && uem.electrical.grid_mode) || 'grid_tied';
  if (!['ess', 'aidc'].includes(ptype) || gridMode !== 'grid_tied') return skip('非并网项目, 保护配置可选');
  const prot = uem.protection || {};
  if (!prot || Object.keys(prot).length === 0) return warn('并网项目未声明 protection 字段, 建议配置过流/速断/接地三段保护');
  const required = ['overcurrent', 'instantaneous', 'earth_fault'];
  const missing = required.filter(r => !prot[r]);
  if (missing.length > 0) return fail(`并网项目缺少保护段: ${missing.join(', ')}, 违反 GB 50062`);
  return pass('三段保护 (过流/速断/接地) 配置完整');
}

// R011: 变压器容量
function checkTransformerRating(uem, compiled) {
  const xf = compiled.components.find(c => getCategory(c, 'transformer'));
  if (!xf) return skip('无升压变压器');
  const pcs = compiled.components.find(c => getCategory(c, 'pcs'));
  const pcsTotal = (pcs && pcs.params && pcs.params.total_kw) || 0;
  const xfKva = (xf.params && xf.params.rating_kva) || 0;
  if (pcsTotal > 0 && xfKva < pcsTotal * 1.1) {
    return fail(`变压器 ${xfKva}kVA < PCS 总额 ${pcsTotal}kW × 1.1 = ${(pcsTotal * 1.1).toFixed(0)}kVA`);
  }
  return pass(`变压器 ${xfKva}kVA ≥ PCS ${pcsTotal}kW × 1.1 倍`);
}

// R012: 系统效率
function checkEfficiency(uem) {
  const eff = uem.electrical && uem.electrical.efficiency;
  if (eff == null) return skip('未指定系统效率');
  if (eff < 0.8) return fail(`系统效率 ${(eff * 100).toFixed(0)}% < 80%, 不合理`);
  if (eff < 0.85) return warn(`系统效率 ${(eff * 100).toFixed(0)}% 偏低 (< 85%), 建议优化`);
  return pass(`系统效率 ${(eff * 100).toFixed(0)}% 符合工程规范`);
}

// R013: 功率因数 (GB/T 15543)
function checkPowerFactor(uem) {
  const pf = uem.electrical && uem.electrical.power_factor;
  if (pf == null) return skip('未指定功率因数');
  const gridMode = (uem.electrical && uem.electrical.grid_mode) || 'grid_tied';
  const threshold = gridMode === 'grid_tied' ? 0.95 : 0.85;
  const label = gridMode === 'grid_tied' ? '并网' : '离网';
  if (pf < threshold) return fail(`${label}项目功率因数 ${pf} < ${threshold} (GB/T 15543)`);
  return pass(`${label}项目功率因数 ${pf} 满足 ≥ ${threshold} 要求`);
}

// R014: 谐波 (GB/T 14549 / IEEE 519)
function checkHarmonics(uem) {
  if ((uem.electrical && uem.electrical.grid_mode) !== 'grid_tied') return skip('离网项目谐波非强制');
  const thd = uem.electrical && uem.electrical.thdi_pct;
  if (thd == null) return skip('未指定 THDi');
  if (thd > 5) return fail(`并网 THDi ${thd}% > 5%, 违反 GB/T 14549`);
  if (thd > 3) return warn(`并网 THDi ${thd}% 接近限值 5%`);
  return pass(`并网 THDi ${thd}% 满足 GB/T 14549 要求`);
}

// R015: 频率合规 (GB/T 15945)
function checkFrequency(uem) {
  const f = uem.electrical && uem.electrical.frequency_hz;
  if (f == null) return skip('未指定频率');
  const country = ((uem.project && uem.project.location) && uem.project.location.country) || 'CN';
  if (country === 'CN' && f !== 50) return fail(`中国项目频率 ${f}Hz 应为 50Hz (GB/T 15945)`);
  if (['US', 'JP', 'TW'].includes(country) && f !== 60) return fail(`${country} 项目频率 ${f}Hz 应为 60Hz`);
  return pass(`频率 ${f}Hz 符合 ${country} 国标`);
}

// R016: 海拔降容 (GB 50060)
function checkAltitudeDerating(uem, compiled) {
  const loc = (uem.project && uem.project.location) || {};
  const alt = loc.altitude_m;
  if (alt == null) return skip('未指定海拔');
  if (alt <= 1000) return pass(`海拔 ${alt}m ≤ 1000m, 无需降容`);
  const derate = 1 - (alt - 1000) / 100 * 0.005;
  const pcs = compiled.components.find(c => getCategory(c, 'pcs'));
  if (pcs) {
    const unitKw = (pcs.params && pcs.params.unit_kw) || 0;
    const deratedKw = Math.round(unitKw * derate * 10) / 10;
    return pass(`海拔 ${alt}m 需降容: PCS ${unitKw}kW → ${deratedKw}kW (系数 ${derate.toFixed(3)}, GB 50060)`);
  }
  return warn(`海拔 ${alt}m 需降容 (系数 ${derate.toFixed(3)}), 但无 PCS 配置可降容`);
}

// R017: 温度降容
function checkTemperatureDerating(uem) {
  const env = (uem.project && uem.project.location) || {};
  const tMin = env.min_temp_c;
  const tMax = env.max_temp_c;
  if (tMin == null && tMax == null) return skip('未指定环境温度');
  const msgs = [];
  if (tMin != null && tMin < -20) msgs.push(`低温 ${tMin}°C < -20°C, 需配置低温电池 (加热膜/低冷凝液冷)`);
  if (tMax != null && tMax > 40) msgs.push(`高温 ${tMax}°C > 40°C, 设备需降容或加强散热`);
  if (msgs.length > 0) return warn(msgs.join('; '));
  return pass(`环境温度范围 [${tMin}°C, ${tMax}°C] 在常规范围内`);
}

// R018: AIDC Tier 必填 (TIA-942)
function checkAidcTierRequired(uem) {
  if ((uem.project && uem.project.type) !== 'aidc') return skip('非 AIDC 项目');
  const tier = uem.tier || {};
  if (!tier || Object.keys(tier).length === 0) return fail('AIDC 项目缺少 tier 配置 (TIA-942 必填)');
  if (!tier.redundancy) return fail('AIDC 项目缺少 tier.redundancy (TIA-942 必填)');
  if (!tier.ups_topology) return fail('AIDC 项目缺少 tier.ups_topology (TIA-942 必填)');
  return pass(`AIDC Tier 配置: redundancy=${tier.redundancy}, ups=${tier.ups_topology}`);
}

// R019: AIDC Tier 冗余级别
function checkAidcTierRedundancy(uem) {
  if ((uem.project && uem.project.type) !== 'aidc') return skip('非 AIDC 项目');
  const tierNum = ((uem.tier && uem.tier.level) || '').replace('Tier ', '').trim();
  const red = (uem.tier && uem.tier.redundancy) || '';
  if (tierNum === 'III' && !['N+1', '2N+1'].includes(red)) return fail(`Tier III 冗余 ${red} 应为 N+1 (TIA-942)`);
  if (tierNum === 'IV' && !['2N', '2N+1'].includes(red)) return fail(`Tier IV 冗余 ${red} 应为 2N (TIA-942)`);
  if (['I', 'II'].includes(tierNum) && red === '2N') return warn(`Tier ${tierNum} 配置 2N 过于保守, 经济性差`);
  return pass(`Tier ${tierNum} 冗余 ${red} 符合 TIA-942`);
}

// R020: 接地系统 (GB 50065)
function checkGrounding(uem) {
  const ptype = (uem.project && uem.project.type) || '';
  if (!['ess', 'aidc'].includes(ptype)) return skip('非储能/数据中心项目');
  const reqs = uem.special_requirements || [];
  const hasTns = reqs.some(s => String(s).includes('TN-S') || String(s).toLowerCase().includes('tns'));
  if (!hasTns) return info('建议在 special_requirements 中显式声明 TN-S 接地系统 (GB 50065)');
  return pass('已声明 TN-S 接地系统');
}

// R021: 消防必配 (GB 50016)
function checkFireProtection(uem, compiled) {
  const bat = compiled.components.find(c => getCategory(c, 'battery_rack'));
  const fas = compiled.components.find(c => c.id === 'FAS');
  if (!bat) return skip('无电池配置, 消防非强制');
  if (!fas) return fail('电池舱未配置 FAS 消防系统 (GB 50016 必配)');
  const fn = (fas.params && fas.params.function) || '';
  if (!fn.includes('气体灭火') && !fn.includes('温感')) return warn('消防系统配置不完整, 建议包含气体灭火 + 温感烟感');
  return pass(`消防配置: ${fn}`);
}

// R022: 通信协议 (IEC 61850)
function checkCommunication(uem) {
  const gridMode = (uem.electrical && uem.electrical.grid_mode) || 'grid_tied';
  const special = uem.special_requirements || [];
  const specialStr = special.map(s => String(s)).join(' ');
  if (gridMode === 'grid_tied') {
    if (!specialStr.includes('61850')) return warn('并网项目建议在 special_requirements 中声明支持 IEC 61850');
    return pass('并网项目声明支持 IEC 61850');
  }
  if (!specialStr.toLowerCase().includes('modbus')) return info('离网项目建议声明 Modbus RTU/TCP 通信');
  return pass('离网项目声明 Modbus 通信');
}

// R023: 拓扑匹配
function checkTopologyMatch(uem) {
  const ptype = (uem.project && uem.project.type) || '';
  const scenario = (uem.project && uem.project.scenario) || '';
  const gridMode = (uem.electrical && uem.electrical.grid_mode) || 'grid_tied';
  if (ptype === 'ess' && !['grid_tied', 'grid_forming', 'off_grid'].includes(gridMode)) return fail(`ESS 项目 grid_mode ${gridMode} 非法`);
  if (ptype === 'microgrid' && gridMode === 'grid_tied') return info('微网项目使用 grid_tied 模式, 建议显式声明离网/并网切换能力');
  return pass(`项目类型 ${ptype} × 场景 ${scenario} × 模式 ${gridMode} 匹配`);
}

// R024: BOM 完整性
function checkBomCompleteness(uem, compiled) {
  const cats = new Set(compiled.components.map(c => c.category));
  const required = [];
  if (uem.electrical && uem.electrical.capacity_kwh) required.push('battery_rack');
  if (uem.electrical && uem.electrical.power_kw) required.push('pcs');
  const ptype = (uem.project && uem.project.type) || '';
  if (['ess', 'aidc'].includes(ptype)) required.push('bus', 'protection');
  const missing = required.filter(r => !cats.has(r));
  if (missing.length > 0) return fail(`BOM 缺少关键类别: ${missing.join(', ')}`);
  return pass(`BOM 包含所有关键类别: ${required.join(', ')}`);
}

// R025: 容量功率比
function checkCapacityPowerRatio(uem) {
  const cap = uem.electrical && uem.electrical.capacity_kwh;
  const p = (uem.electrical && (uem.electrical.power_kw || uem.electrical.load_kw)) || 0;
  if (!cap || !p || cap <= 0 || p <= 0) return skip('容量或功率未指定');
  const ratio = cap / p;
  if (ratio < 0.25) return fail(`容量功率比 ${ratio.toFixed(2)}h < 0.25h, 短时放电场景需特殊设计`);
  if (ratio > 12) return fail(`容量功率比 ${ratio.toFixed(2)}h > 12h, 超出常规储能时长`);
  return pass(`容量功率比 ${ratio.toFixed(2)}h 在合理范围`);
}

const RULE_REGISTRY = [
  { id: 'R001', name: '电池串联数范围', category: '电池系统', standard: 'GB 51048 §6.4', severity: 'error', func: (u, c) => checkBatteryStringsSeries(u, c) },
  { id: 'R002', name: '电池并联包数', category: '电池系统', standard: '工程惯例', severity: 'error', func: (u, c) => checkBatteryPacksParallel(u, c) },
  { id: 'R003', name: '储能时长范围', category: '电池系统', standard: 'GB 51048 / 工程惯例', severity: 'error', func: checkDurationH },
  { id: 'R004', name: 'SOC 范围', category: '电池系统', standard: 'GB 51048 §6.5', severity: 'warning', func: checkSocRange },
  { id: 'R005', name: '电压等级合规', category: '电压等级', standard: 'GB 50059', severity: 'error', func: checkVoltageLevel },
  { id: 'R006', name: 'DC 母线电压 ≤1500V', category: '电压等级', standard: 'GB 50060 / 工程惯例', severity: 'error', func: (u, c) => checkDcBusVoltage(u, c) },
  { id: 'R007', name: 'PCS 单台功率', category: 'PCS 选型', standard: '工程惯例', severity: 'warning', func: (u, c) => checkPcsUnitSize(u, c) },
  { id: 'R008', name: 'PCS N+1 冗余', category: 'PCS 选型', standard: 'GB 51048 / TIA-942', severity: 'error', func: (u, c) => checkPcsRedundancy(u, c) },
  { id: 'R009', name: '断路器整定', category: '保护', standard: 'GB 50054', severity: 'error', func: (u, c) => checkBreakerSetting(u, c) },
  { id: 'R010', name: '三段保护', category: '保护', standard: 'GB 50062', severity: 'error', func: checkProtectionZones },
  { id: 'R011', name: '变压器容量', category: '保护', standard: '工程惯例', severity: 'error', func: (u, c) => checkTransformerRating(u, c) },
  { id: 'R012', name: '系统效率', category: '电能质量', standard: '工程规范', severity: 'warning', func: checkEfficiency },
  { id: 'R013', name: '功率因数', category: '电能质量', standard: 'GB/T 15543', severity: 'error', func: checkPowerFactor },
  { id: 'R014', name: '谐波', category: '电能质量', standard: 'GB/T 14549 / IEEE 519', severity: 'error', func: checkHarmonics },
  { id: 'R015', name: '频率合规', category: '电能质量', standard: 'GB/T 15945', severity: 'error', func: checkFrequency },
  { id: 'R016', name: '海拔降容', category: '环境', standard: 'GB 50060', severity: 'warning', func: (u, c) => checkAltitudeDerating(u, c) },
  { id: 'R017', name: '温度降容', category: '环境', standard: '厂家规范', severity: 'warning', func: checkTemperatureDerating },
  { id: 'R018', name: 'AIDC Tier 必填', category: '系统配置', standard: 'TIA-942', severity: 'error', func: checkAidcTierRequired },
  { id: 'R019', name: 'AIDC Tier 冗余', category: '系统配置', standard: 'TIA-942 / Uptime Institute', severity: 'error', func: checkAidcTierRedundancy },
  { id: 'R020', name: '接地系统', category: '系统配置', standard: 'GB 50065', severity: 'info', func: checkGrounding },
  { id: 'R021', name: '消防必配', category: '系统配置', standard: 'GB 50016', severity: 'error', func: (u, c) => checkFireProtection(u, c) },
  { id: 'R022', name: '通信协议', category: '系统配置', standard: 'IEC 61850 / GB/T 36276', severity: 'info', func: checkCommunication },
  { id: 'R023', name: '拓扑匹配', category: '内部一致性', standard: '内部规则', severity: 'info', func: checkTopologyMatch },
  { id: 'R024', name: 'BOM 完整性', category: '内部一致性', standard: '内部规则', severity: 'error', func: (u, c) => checkBomCompleteness(u, c) },
  { id: 'R025', name: '容量功率比', category: '内部一致性', standard: '工程惯例', severity: 'error', func: checkCapacityPowerRatio }
];

const SEVERITY_ORDER = { error: 0, warning: 1, info: 2 };

function runAllRules(uem, compiled) {
  const results = [];
  for (const rule of RULE_REGISTRY) {
    let checkResult;
    try {
      checkResult = rule.func(uem, compiled);
    } catch (e) {
      checkResult = { status: 'fail', severity: 'error', message: `规则执行异常: ${e.name}: ${e.message}` };
    }
    results.push({
      rule_id: rule.id,
      rule_name: rule.name,
      category: rule.category,
      standard: rule.standard,
      severity: rule.severity,
      result: checkResult
    });
  }
  return results;
}

function summarizeResults(results) {
  const total = results.length;
  const passCount = results.filter(r => r.result.status === 'pass').length;
  const failCount = results.filter(r => r.result.status === 'fail').length;
  const skipCount = results.filter(r => r.result.status === 'skip').length;
  const errorCount = results.filter(r => r.result.status === 'fail' && r.result.severity === 'error').length;
  const warningCount = results.filter(r => r.result.status === 'fail' && r.result.severity === 'warning').length;
  const infoCount = results.filter(r => r.result.status === 'pass' && r.severity === 'info').length;
  const deducted = errorCount * 5 + warningCount * 2;
  const complianceScore = Math.max(0, 100 - deducted);
  const evaluated = total - skipCount;
  const passRate = evaluated > 0 ? Math.round(passCount / evaluated * 1000) / 1000 : 0;
  return {
    total, pass: passCount, fail: failCount, skip: skipCount,
    errors: errorCount, warnings: warningCount, infos: infoCount,
    pass_rate: passRate, compliance_score: complianceScore
  };
}

function getFailingRules(results) {
  const failing = results.filter(r => r.result.status === 'fail');
  failing.sort((a, b) => (SEVERITY_ORDER[a.result.severity] || 99) - (SEVERITY_ORDER[b.result.severity] || 99));
  return failing;
}

function buildJsonReport(uem, compiled) {
  const results = runAllRules(uem, compiled);
  const summary = summarizeResults(results);
  const failing = getFailingRules(results);
  let status;
  if (summary.errors === 0 && summary.warnings === 0) status = 'pass';
  else if (summary.errors === 0) status = 'pass_with_warnings';
  else status = 'fail';
  return {
    project_id: (uem.project && uem.project.id) || 'unknown',
    project_name: uem.project && uem.project.name,
    project_type: uem.project && uem.project.type,
    scenario: uem.project && uem.project.scenario,
    schema_version: uem.schema_version || 'unknown',
    generated_at: new Date().toISOString(),
    summary,
    compliance_status: status,
    rule_results: results,
    failing_rules: failing.map(r => ({
      rule_id: r.rule_id,
      rule_name: r.rule_name,
      category: r.category,
      standard: r.standard,
      severity: r.result.severity,
      message: r.result.message
    }))
  };
}

function buildMarkdownReport(report) {
  const lines = [];
  const summary = report.summary;
  lines.push(`# 合规检查报告 — ${report.project_id}`);
  lines.push('');
  if (report.project_name) lines.push(`**项目名称**: ${report.project_name}`);
  lines.push(`**项目类型**: ${report.project_type} / ${report.scenario || 'N/A'}`);
  lines.push(`**Schema 版本**: ${report.schema_version}`);
  lines.push(`**生成时间**: ${report.generated_at}`);
  lines.push('');

  const statusEmoji = { pass: 'PASS', pass_with_warnings: 'WARN', fail: 'FAIL' };
  const statusLabel = { pass: '通过', pass_with_warnings: '通过(有警告)', fail: '不通过' };
  lines.push(`## 合规判定: ${statusEmoji[report.compliance_status]} ${statusLabel[report.compliance_status]}`);
  lines.push('');
  lines.push(`### 综合评分: **${summary.compliance_score}/100**`);
  lines.push('');
  lines.push('| 指标 | 数量 |');
  lines.push('|------|------|');
  lines.push(`| 规则总数 | ${summary.total} |`);
  lines.push(`| 通过 | ${summary.pass} |`);
  lines.push(`| 失败 | ${summary.fail} |`);
  lines.push(`| 跳过 | ${summary.skip} |`);
  lines.push(`| **错误** | **${summary.errors}** |`);
  lines.push(`| **警告** | **${summary.warnings}** |`);
  lines.push(`| 提示 | ${summary.infos} |`);
  lines.push(`| 通过率 | ${(summary.pass_rate * 100).toFixed(1)}% |`);
  lines.push('');

  if (report.failing_rules.length > 0) {
    lines.push(`## 待解决问题 (${report.failing_rules.length} 条)`);
    lines.push('');
    lines.push('| 严重等级 | 规则 | 类别 | 标准 | 问题描述 |');
    lines.push('|---------|------|------|------|---------|');
    for (const r of report.failing_rules) {
      const sev = r.severity === 'error' ? 'ERROR' : 'WARN';
      lines.push(`| ${sev} | ${r.rule_id} ${r.rule_name} | ${r.category} | ${r.standard} | ${r.message} |`);
    }
    lines.push('');
  } else {
    lines.push('## 所有规则均通过');
    lines.push('');
  }

  lines.push('## 详细检查结果');
  lines.push('');
  const byCat = {};
  for (const r of report.rule_results) {
    if (!byCat[r.category]) byCat[r.category] = [];
    byCat[r.category].push(r);
  }
  for (const cat of Object.keys(byCat)) {
    lines.push(`### ${cat}`);
    lines.push('');
    lines.push('| 状态 | 规则 | 标准 | 描述 |');
    lines.push('|------|------|------|------|');
    for (const r of byCat[cat]) {
      let badge;
      if (r.result.status === 'pass') badge = 'OK';
      else if (r.result.status === 'fail' && r.result.severity === 'error') badge = 'ERR';
      else if (r.result.status === 'fail' && r.result.severity === 'warning') badge = 'WARN';
      else badge = 'SKIP';
      lines.push(`| ${badge} | ${r.rule_id} ${r.rule_name} | ${r.standard} | ${r.result.message} |`);
    }
    lines.push('');
  }

  const standardsUsed = [...new Set(report.rule_results.map(r => r.standard))].sort();
  lines.push('## 引用标准清单');
  lines.push('');
  for (const s of standardsUsed) lines.push(`- ${s}`);
  lines.push('');
  lines.push('---');
  lines.push('*本报告由 ESS Agent 规则引擎自动生成, 仅供工程设计参考。最终设计须经设计院/审图机构审核确认。*');
  return lines.join('\n');
}

// ====================== HANDLER ======================
export default async function handler(req, res) {
  // CORS preflight
  if (req.method === 'OPTIONS') {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
    return res.status(200).end();
  }

  if (req.method !== 'POST') {
    return res.status(405).json({ error: 'Method not allowed. Use POST.' });
  }

  // Parse body — accept both {uem: {...}} and bare UEM
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
    // L3 compile
    const compiled = compileUem(uem);
    // L4 rules → report
    const report = buildJsonReport(uem, compiled);
    report.markdown = buildMarkdownReport(report);
    return res.status(200).json({
      ok: true,
      project_id: report.project_id,
      project_type: report.project_type,
      compliance_status: report.compliance_status,
      summary: report.summary,
      rule_results: report.rule_results,
      failing_rules: report.failing_rules,
      markdown: report.markdown
    });
  } catch (e) {
    return res.status(500).json({ error: `Compliance engine error: ${e.name}: ${e.message}` });
  }
}
