// api/compile_uem.js
// =========================================================================
// Shared UEM Compiler — single source of truth for all 3 renderers
// =========================================================================
// All renderers (render_svg, render_arch, render_comm) MUST import this
// module to derive device counts, voltages, and component names from UEM.
// This eliminates inconsistencies caused by each renderer reimplementing
// the same parsing logic with different constants.
// =========================================================================

const CELL_VOLTAGE = 3.2;
const CELL_CAPACITY_AH = 280;
const DC_BUS_VOLTAGE = 768;
const PCS_UNIT_KW = 125;
const REDUNDANCY_PCS = 1;

function voltageToLevelV(s) {
  if (!s) return 0;
  const x = String(s).toUpperCase().replace(/\s+/g, '');
  if (x.endsWith('KV')) return parseFloat(x.slice(0, -2)) * 1000;
  if (x.endsWith('V')) return parseFloat(x.slice(0, -1));
  return 0;
}

function safeNum(v, dflt = 0) {
  if (v === null || v === undefined || v === '') return dflt;
  const n = Number(v);
  return Number.isFinite(n) ? n : dflt;
}

function nextStandard(kva) {
  const std = [100, 125, 160, 200, 250, 315, 400, 500, 630, 800, 1000, 1250, 1600, 2000, 2500];
  for (const s of std) { if (s >= kva) return s; }
  return kva;
}

// ====================== compileEss ======================
function compileEss(uem) {
  const components = [];
  const connections = [];
  const elec = uem.electrical || {};
  if (!elec.capacity_kwh || !elec.power_kw) return { components, connections };
  const cap = elec.capacity_kwh;
  const power = elec.power_kw;
  const voltage = elec.voltage_level || '380V';
  const durationH = elec.duration_h || (cap / power);

  const stringsSeries = Math.ceil(DC_BUS_VOLTAGE / CELL_VOLTAGE);
  const perPackKwh = (stringsSeries * CELL_VOLTAGE * CELL_CAPACITY_AH) / 1000;
  const packsParallel = Math.ceil(cap / perPackKwh);

  components.push({
    id: 'BAT', category: 'battery_rack', ref: `BAT-${packsParallel}P`,
    model: `LFP-${Math.floor(perPackKwh)}kWh-${Math.floor(DC_BUS_VOLTAGE)}V`,
    qty: packsParallel,
    params: {
      total_kwh: Math.round(packsParallel * perPackKwh * 10) / 10,
      per_pack_kwh: perPackKwh,
      packs_parallel: packsParallel,
      strings_series: stringsSeries,
      duration_h: Math.round(durationH * 10) / 10,
      cell_voltage: CELL_VOLTAGE,
      cell_capacity_ah: CELL_CAPACITY_AH,
      dc_bus_voltage: DC_BUS_VOLTAGE,
    }
  });

  const pcsCount = Math.ceil(power / PCS_UNIT_KW) + REDUNDANCY_PCS;
  components.push({
    id: 'PCS', category: 'pcs', ref: 'PCS',
    model: `PCS-${PCS_UNIT_KW}kW`,
    qty: pcsCount,
    params: {
      unit_kw: PCS_UNIT_KW,
      total_kw: pcsCount * PCS_UNIT_KW,
      redundancy: 'N+1',
    }
  });

  components.push({
    id: 'DC_BUS', category: 'dc_bus', ref: 'DC+',
    model: `DC-${DC_BUS_VOLTAGE}V-${Math.floor(power)}kW`,
    qty: 1,
    params: { voltage_v: DC_BUS_VOLTAGE, type: 'dc' }
  });

  const lvSideV = 380;
  components.push({
    id: 'AC_BUS', category: 'ac_bus', ref: 'AC-LV',
    model: `AC-${lvSideV}V-${Math.floor(power)}kW`,
    qty: 1,
    params: { voltage_v: lvSideV }
  });

  if (String(voltage).toUpperCase().includes('KV') && voltage !== '380V') {
    const xfKva = nextStandard(power * 1.1);
    components.push({
      id: 'XF', category: 'transformer', ref: 'T1',
      model: `${xfKva}kVA-${lvSideV}V/${voltage}`,
      qty: 1,
      params: { rating_kva: xfKva, lv_voltage_v: lvSideV, hv_voltage_v: voltageToLevelV(voltage) }
    });
  }

  components.push({
    id: 'QF', category: 'protection', ref: 'QF1',
    model: `ACB-${Math.round(power * 1000 / (lvSideV * Math.sqrt(3) * 0.85) * 1.25)}A`,
    qty: 1,
    params: { type: 'ACB' }
  });

  components.push({
    id: 'GRID', category: 'source', ref: 'GRID',
    model: voltage, qty: 1,
    params: { voltage_level: voltage }
  });

  connections.push({ from: 'BAT', to: 'DC_BUS' });
  connections.push({ from: 'DC_BUS', to: 'PCS' });
  connections.push({ from: 'PCS', to: 'AC_BUS' });
  connections.push({ from: 'AC_BUS', to: 'QF' });
  if (components.find(c => c.id === 'XF')) {
    connections.push({ from: 'QF', to: 'XF' });
    connections.push({ from: 'GRID', to: 'XF' });
  } else {
    connections.push({ from: 'GRID', to: 'QF' });
  }

  return { components, connections };
}

// ====================== compileMicrogrid ======================
function compileMicrogrid(uem) {
  const components = [];
  const connections = [];
  const elec = uem.electrical || {};
  const cap = elec.capacity_kwh || 0;
  const power = elec.power_kw || 0;
  const pvKw = elec.pv_kw || 0;
  const windKw = elec.wind_kw || 0;
  const dieselKw = elec.diesel_kw || 0;
  const loadKw = elec.load_kw || 0;

  if (pvKw > 0) components.push({ id: 'PV', category: 'pv', ref: 'PV', model: `PV-${Math.floor(pvKw)}kWp`, qty: 1, params: { capacity_kw: pvKw } });
  if (windKw > 0) components.push({ id: 'WT', category: 'source', ref: 'WT', model: `WT-${Math.floor(windKw)}kW`, qty: 1, params: { capacity_kw: windKw } });
  if (dieselKw > 0) components.push({ id: 'GEN', category: 'source', ref: 'G1', model: `Genset-${Math.floor(dieselKw)}kW`, qty: 1, params: { rating_kw: dieselKw } });

  if (cap > 0 && power > 0) {
    const stringsSeries = Math.ceil(DC_BUS_VOLTAGE / CELL_VOLTAGE);
    const perPackKwh = (stringsSeries * CELL_VOLTAGE * CELL_CAPACITY_AH) / 1000;
    const packsParallel = Math.ceil(cap / perPackKwh);
    components.push({
      id: 'BAT', category: 'battery_rack', ref: `BAT-${packsParallel}P`,
      model: `LFP-${Math.floor(perPackKwh)}kWh`,
      qty: packsParallel,
      params: { total_kwh: Math.round(packsParallel * perPackKwh * 10) / 10 }
    });
    const pcsCount = Math.ceil(power / PCS_UNIT_KW) + 1;
    components.push({
      id: 'PCS', category: 'pcs', ref: 'PCS',
      model: `PCS-${PCS_UNIT_KW}kW`,
      qty: pcsCount,
      params: { unit_kw: PCS_UNIT_KW, total_kw: pcsCount * PCS_UNIT_KW, redundancy: 'N+1' }
    });
  }

  // DC Bus (if battery present)
  if (cap > 0) {
    components.push({ id: 'DC_BUS', category: 'dc_bus', ref: 'DC+', model: `DC-${DC_BUS_VOLTAGE}V-${Math.floor(power)}kW`, qty: 1, params: { voltage_v: DC_BUS_VOLTAGE, type: 'dc' } });
  }

  const voltage = elec.voltage_level || '380V';
  const lvSideV = 380;
  components.push({
    id: 'AC_BUS', category: 'bus', ref: 'AC',
    model: `AC-${lvSideV}V-${Math.floor(power + pvKw + dieselKw + windKw)}kW`,
    qty: 1,
    params: { voltage_v: lvSideV }
  });

  // Transformer for kV-level projects
  if (String(voltage).toUpperCase().includes('KV') && voltage !== '380V') {
    const xfKva = nextStandard(power * 1.1);
    components.push({
      id: 'XF', category: 'transformer', ref: 'T1',
      model: `${xfKva}kVA-${lvSideV}V/${voltage}`,
      qty: 1,
      params: { rating_kva: xfKva, lv_voltage_v: lvSideV, hv_voltage_v: voltageToLevelV(voltage) }
    });
  }

  // Protection
  components.push({
    id: 'QF', category: 'protection', ref: 'QF1',
    model: `ACB-${Math.round(power * 1000 / (lvSideV * Math.sqrt(3) * 0.85) * 1.25)}A`,
    qty: 1,
    params: { type: 'ACB' }
  });

  // Grid connection
  components.push({
    id: 'GRID', category: 'source', ref: 'GRID',
    model: voltage, qty: 1,
    params: { voltage_level: voltage }
  });

  if (loadKw > 0) components.push({ id: 'LOAD', category: 'load', ref: 'LOAD', model: `Load-${Math.floor(loadKw)}kW`, qty: 1, params: { load_kw: loadKw } });

  // Connections
  for (const src of ['PV', 'WT', 'GEN']) {
    if (components.find(c => c.id === src)) connections.push({ from: src, to: 'AC_BUS' });
  }
  if (components.find(c => c.id === 'PCS')) {
    if (components.find(c => c.id === 'DC_BUS')) connections.push({ from: 'BAT', to: 'DC_BUS' });
    connections.push({ from: components.find(c => c.id === 'DC_BUS') ? 'DC_BUS' : 'BAT', to: 'PCS' });
    connections.push({ from: 'PCS', to: 'AC_BUS' });
  }
  connections.push({ from: 'AC_BUS', to: 'QF' });
  if (components.find(c => c.id === 'XF')) {
    connections.push({ from: 'QF', to: 'XF' });
    connections.push({ from: 'GRID', to: 'XF' });
  } else {
    connections.push({ from: 'GRID', to: 'QF' });
  }
  if (components.find(c => c.id === 'LOAD')) connections.push({ from: 'AC_BUS', to: 'LOAD' });
  return { components, connections };
}

// ====================== compileAidc ======================
function compileAidc(uem) {
  const components = [];
  const elec = uem.electrical || {};
  const tier = uem.tier || {};
  const loadKw = elec.load_kw || 0;
  const voltage = elec.voltage_level || '10kV';
  const redundancy = tier.redundancy || 'N+1';
  const mainsCount = (redundancy === 'N+1' || redundancy === '2N+1') ? 2 : (redundancy === '2N' ? 4 : 1);
  for (let i = 0; i < mainsCount; i++) {
    components.push({ id: `MAINS-${i+1}`, category: 'source', ref: `QS${i+1}`, model: `市电进线-${i+1}-${voltage}`, qty: 1, params: { voltage } });
  }
  components.push({ id: 'AC_BUS', category: 'bus', ref: 'AC-IT', model: `AC-380V-${Math.floor(loadKw)}kW`, qty: 1, params: { voltage_v: 380 } });
  components.push({ id: 'PDU', category: 'load', ref: 'PDU', model: `列头柜-${Math.floor(loadKw)}kW`, qty: 1, params: { load_kw: loadKw } });
  const connections = [];
  for (let i = 0; i < mainsCount; i++) connections.push({ from: `MAINS-${i+1}`, to: 'AC_BUS' });
  connections.push({ from: 'AC_BUS', to: 'PDU' });
  return { components, connections };
}

// ====================== compileBatterySwap ======================
function compileBatterySwap(uem) {
  const components = [];
  const connections = [];
  const ss = uem.swap_station || {};
  const mv = ss.mv_switchgear || {};
  const tr = ss.transformer || {};
  const lv = ss.lv_distribution || {};
  const dc = ss.dc_distribution || {};
  const chg = ss.charging_system || {};
  const cab = ss.battery_cabin || {};
  const swa = ss.swap_area || {};
  const lay = cab.layout || (chg.rack_layout || { rows: 3, cols: 6 });
  const totalSlots = lay.total_slots || (chg.total_modules && chg.modules_per_slot ? Math.floor(chg.total_modules / chg.modules_per_slot) : (lay.rows * lay.cols)) || 16;
  const slots = cab.slot_states || [];

  // MV side
  const mvKv = mv.incoming_voltage_kv || 10;
  components.push({ id: 'GRID', category: 'source', ref: 'GRID', model: `${mvKv}kV 市电`, qty: 1, zone: 'mv', params: { voltage_level: `${mvKv}kV` } });
  components.push({ id: 'MV_SWGR', category: 'switchgear', ref: 'KYN28-12', model: `${mv.type || 'KYN28-12'} ${mvKv}kV 进线柜`, qty: 1, zone: 'mv', params: { voltage_kv: mvKv, panel_type: mv.type || 'KYN28-12', protection: mv.protection || ['overcurrent', 'instantaneous'] } });
  components.push({ id: 'MV_PT', category: 'metering', ref: 'PT1', model: `PT柜 ${mv.metering_class || '0.5S'}`, qty: 1, zone: 'mv', params: { metering_class: mv.metering_class || '0.5S' } });

  // Transformer
  const trKva = tr.capacity_kva || 1300;
  components.push({ id: 'TR', category: 'transformer', ref: 'T1', model: `${tr.type || 'SCB13'} ${trKva}kVA ${tr.hv_kv || 10}/${tr.lv_kv || 0.4}kV`, qty: tr.qty || 1, zone: 'mv,lv', params: { rating_kva: trKva, hv_voltage_v: (tr.hv_kv || 10) * 1000, lv_voltage_v: (tr.lv_kv || 0.4) * 1000, type: tr.type || 'Dry-type SCB13', connection: tr.connection || 'Dyn11' } });

  // LV side
  const lvKv = tr.lv_kv || 0.4;
  components.push({ id: 'LV_SWGR', category: 'switchgear', ref: 'GCS', model: `${lv.panel_type || 'GCS'} 低压配电柜`, qty: 1, zone: 'lv', params: { panel_type: lv.panel_type || 'GCS', main_breaker_a: lv.main_breaker_a || 2500 } });
  components.push({ id: 'AC_BUS', category: 'bus', ref: 'AC-LV', model: `AC-${lvKv*1000}V`, qty: 1, zone: 'lv,dc', params: { voltage_v: lvKv * 1000 } });

  // Charging modules
  const totalModules = chg.total_modules || 32;
  const modulesPerSlot = chg.modules_per_slot || 2;
  const moduleKw = chg.module_power_kw || 30;
  for (let r = 1; r <= (chg.rack_count || 1); r++) {
    components.push({ id: `CM_RACK-${r}`, category: 'charger', ref: `CM-R${r}`, model: `充电模块架 ${totalModules / (chg.rack_count || 1)}×${moduleKw}kW`, qty: 1, zone: 'dc', params: { modules: totalModules / (chg.rack_count || 1), module_kw: moduleKw, modules_per_slot: modulesPerSlot } });
  }
  components.push({ id: 'CHG_CTRL', category: 'controller', ref: 'CCU', model: `充电控制器 ${totalModules} 模块`, qty: 1, zone: 'dc', params: { managed_modules: totalModules } });

  // DC distribution
  components.push({ id: 'DC_BUS', category: 'dc_bus', ref: 'DC+', model: `DC-${dc.bus_voltage_v || 750}V`, qty: 1, zone: 'dc', params: { voltage_v: dc.bus_voltage_v || 750, insulation_monitor: dc.insulation_monitor !== false } });

  // Battery cabin
  for (let i = 0; i < totalSlots; i++) {
    const slotId = `SLOT-${String(i+1).padStart(2, '0')}`;
    const slotState = slots[i] || { state: 'IDLE', soc_pct: 0 };
    components.push({ id: slotId, category: 'battery_slot', ref: slotId, model: `LFP-${moduleKw * modulesPerSlot}kWh (${slotState.state})`, qty: 1, zone: 'dc', params: { slot_index: i + 1, state: slotState.state, soc_pct: slotState.soc_pct, slot_id: slotState.slot_id || slotId } });
  }
  components.push({ id: 'BAT_CAB', category: 'battery_cabin', ref: 'BC', model: `电池仓 ${lay.rows || 3}×${lay.cols || 6} = ${totalSlots} 仓位`, qty: 1, zone: 'dc', params: { rows: lay.rows || 3, cols: lay.cols || 6, total_slots: totalSlots } });

  // Swap area
  const bayCount = swa.bay_count || 2;
  for (let b = 1; b <= bayCount; b++) {
    components.push({ id: `BAY-${b}`, category: 'swap_bay', ref: `BAY-${b}`, model: `换电工位 ${b}`, qty: 1, zone: 'dc', params: { bay_index: b, swap_time_min: swa.swap_time_min || 6 } });
  }
  for (const rob of (swa.robots || [])) {
    components.push({ id: rob.id || `ROB-${Math.random().toString(36).slice(2,6)}`, category: 'robot', ref: rob.id || 'ROB', model: `${rob.type || 'gantry_3axis'} ${rob.power_kw || 75}kW`, qty: 1, zone: 'dc', params: { type: rob.type || 'gantry_3axis', power_kw: rob.power_kw || 75 } });
  }

  // Connections
  connections.push({ from: 'GRID', to: 'MV_SWGR' });
  connections.push({ from: 'MV_SWGR', to: 'MV_PT' });
  connections.push({ from: 'MV_SWGR', to: 'TR' });
  connections.push({ from: 'TR', to: 'LV_SWGR' });
  connections.push({ from: 'LV_SWGR', to: 'AC_BUS' });
  for (let r = 1; r <= (chg.rack_count || 1); r++) {
    connections.push({ from: 'AC_BUS', to: `CM_RACK-${r}` });
  }
  connections.push({ from: 'AC_BUS', to: 'CHG_CTRL' });
  connections.push({ from: 'CM_RACK-1', to: 'DC_BUS' });
  connections.push({ from: 'CHG_CTRL', to: 'DC_BUS' });
  connections.push({ from: 'DC_BUS', to: 'BAT_CAB' });
  for (let b = 1; b <= bayCount; b++) {
    connections.push({ from: 'BAT_CAB', to: `BAY-${b}` });
    connections.push({ from: 'AC_BUS', to: `BAY-${b}` });
  }
  for (const rob of (swa.robots || [])) {
    const rid = rob.id || null;
    if (rid && components.find(c => c.id === rid)) {
      connections.push({ from: 'AC_BUS', to: rid });
    }
  }

  return { components, connections };
}

// ====================== inferTopology ======================
function inferTopology(components, connections, uem) {
  const result = { added: 0, rules: [], components: [] };
  if (!Array.isArray(components) || components.length === 0) return result;

  const elec = (uem && uem.electrical) || {};
  const hasCat = (cat) => components.some(c => c.category === cat);
  const existingIds = new Set(components.map(c => c.id));
  const newComps = [];
  let seq = 1;
  const uniqId = (prefix) => {
    let id;
    do { id = `${prefix}-AUTO-${seq++}`; }
    while (existingIds.has(id) || newComps.some(c => c.id === id));
    return id;
  };

  if (hasCat('pcs') && !components.some(c => c.category === 'protection' && /pcs|pcs-ac|pcb/i.test(c.ref || c.id || ''))) {
    newComps.push({
      id: uniqId('QF'), category: 'protection', ref: 'QF-PCS',
      model: 'ACB-PCS', qty: 1, auto: true, rule: 'R1', layer_hint: 5,
      params: { type: 'ACB', scope: 'PCS AC-side short-circuit and overload protection' }
    });
    result.rules.push('R1 PCS AC-side ACB');
  }

  if (hasCat('pcs') && !hasCat('ct')) {
    newComps.push({
      id: uniqId('CT'), category: 'ct', ref: 'CT-PCS',
      model: 'CT-PCS', qty: 1, auto: true, rule: 'R2', layer_hint: 3,
      params: { scope: 'PCS AC-side current measurement and differential protection' }
    });
    result.rules.push('R2 PCS AC-side CT');
  }

  if (hasCat('transformer') && !hasCat('surge_arrester')) {
    newComps.push({
      id: uniqId('LA'), category: 'surge_arrester', ref: 'LA',
      model: 'LA-HV', qty: 1, auto: true, rule: 'R3', layer_hint: 1,
      params: { scope: 'Transformer HV-side lightning protection' }
    });
    result.rules.push('R3 Transformer HV surge arrester');
  }

  if (hasCat('transformer') && !components.some(c => c.category === 'disconnector')) {
    newComps.push({
      id: uniqId('QS'), category: 'disconnector', ref: 'QS',
      model: 'QS-LV', qty: 1, auto: true, rule: 'R4', layer_hint: 7,
      params: { scope: 'Transformer LV-side safe isolation' }
    });
    result.rules.push('R4 Transformer LV disconnector');
  }

  if (hasCat('battery_rack') && !hasCat('bms')) {
    newComps.push({
      id: uniqId('BMS'), category: 'bms', ref: 'BMS',
      model: 'BMS-Master', qty: 1, auto: true, rule: 'R5', layer_hint: 0,
      params: { scope: 'Cell-level monitoring, balancing, SOC/SOH' }
    });
    result.rules.push('R5 Battery BMS');
  }

  if ((uem.project && (uem.project.type === 'ess' || uem.project.type === 'industrial')) || (uem.project && uem.project.type === 'microgrid')) {
    if (!hasCat('ems')) {
      newComps.push({
        id: uniqId('EMS'), category: 'ems', ref: 'EMS',
        model: 'EMS-Central', qty: 1, auto: true, rule: 'R6', layer_hint: 0,
        params: { scope: 'Dispatch optimization, SCADA, grid services' }
      });
      result.rules.push('R6 Top-level EMS');
    }
  }

  const voltageStr = String(elec.voltage_level || '');
  if (/(10|35|110)\s*kV/i.test(voltageStr) && !hasCat('pt')) {
    newComps.push({
      id: uniqId('PT'), category: 'pt', ref: 'PT',
      model: 'PT-HV', qty: 1, auto: true, rule: 'R7', layer_hint: 1,
      params: { scope: 'HV voltage metering + synchronizing check' }
    });
    result.rules.push('R7 HV PT');
  }

  if (hasCat('dc_bus') && !hasCat('fuse')) {
    newComps.push({
      id: uniqId('FU'), category: 'fuse', ref: 'FU-DC',
      model: 'DC-Fuse', qty: 1, auto: true, rule: 'R8', layer_hint: 2,
      params: { scope: 'DC bus short-circuit protection' }
    });
    result.rules.push('R8 DC bus fuse');
  }

  result.added = newComps.length;
  result.components = newComps;
  return result;
}

// ====================== Main Entry ======================
function compileUem(uem) {
  const ptype = (uem.project && uem.project.type) || 'ess';
  let compiled;
  if (ptype === 'ess' || ptype === 'industrial') compiled = compileEss(uem);
  else if (ptype === 'microgrid') compiled = compileMicrogrid(uem);
  else if (ptype === 'aidc') compiled = compileAidc(uem);
  else if (ptype === 'hybrid') {
    const ess = compileEss(uem);
    const mg = compileMicrogrid(uem);
    const seen = new Set(ess.components.map(c => c.id));
    for (const c of mg.components) if (!seen.has(c.id)) { ess.components.push(c); seen.add(c.id); }
    compiled = ess;
  } else if (ptype === 'battery_swap') compiled = compileBatterySwap(uem);
  else return { components: [], connections: [], note: `unknown type ${ptype}` };

  const inferred = inferTopology(compiled.components, compiled.connections || [], uem);
  compiled.inferred = inferred;
  return compiled;
}

// ====================== Exports ======================
export {
  compileUem, compileEss, compileMicrogrid, compileAidc, compileBatterySwap,
  inferTopology, voltageToLevelV, safeNum, nextStandard,
  CELL_VOLTAGE, CELL_CAPACITY_AH, DC_BUS_VOLTAGE, PCS_UNIT_KW, REDUNDANCY_PCS,
};
