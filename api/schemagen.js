// api/schemagen.js
// ESS Agent — L1 需求解析端点 (UEM v1.1)
// =========================================================================
// Endpoint: POST /api/schemagen
// Body:     来自前端表单的工程参数 (project_type / scenario / location /
//           electrical / special / ai_provider)
// Returns:  { ok, uem, latency_s, provider }
//           或 { ok:false, error, raw }
//
// 流程:
//   1. form -> 自然语言 prompt
//   2. 拼 system prompt (requirement_parser.system.md) + user prompt
//   3. 5-provider selector (qwen3_local / deepseek_v4 / glm_5_1 / qwen3_7max /
//      minimax_m3) -> 调 chat completions
//   4. 5 级 JSON 修复链
//   5. ajv 校验 UEM v1.1 schema
//   6. runtime backfill 已知 schema 漂移 (soc_min_pct 等)
// =========================================================================

import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import Ajv from 'ajv/dist/2020.js';
import addFormats from 'ajv-formats';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

// ====================== 路径常量 ======================
const SCHEMA_PATH = path.join(__dirname, '..', 'schemas', 'uem.schema.json');
const PROMPT_PATH = path.join(__dirname, '..', 'prompts', 'requirement_parser.system.md');

let _systemPrompt = null;
let _ajvValidate = null;

// ====================== 5 Provider 配置 ======================
// 与 api/ess-config.js 保持兼容 (provider key 沿用 deepseek / glm / bailian)
// 新增: qwen3_local (本地 llama-server), minimax_m3 (Anthropic 兼容端点)
const PROVIDERS = {
  qwen3_local: {
    label: 'Qwen3 本地 (llama-server)',
    url: 'http://127.0.0.1:8080/v1/chat/completions',
    key: 'EMPTY',  // llama-server 不需要 key
    model: 'Qwen3-4B-Q4_K_M.gguf',
    max_tokens: 8192,
    temperature: 0.3,
    protocol: 'openai',
    local: true,
    enabled: () => true   // 本地永远 fallback enabled
  },
  deepseek_v4: {
    label: 'DeepSeek V4',
    url: 'https://api.deepseek.com/v1/chat/completions',
    key: () => process.env.DEEPSEEK_API_KEY,
    model: 'deepseek-v4-pro',
    max_tokens: 65536,
    temperature: 0.3,
    protocol: 'openai'
  },
  glm_5_1: {
    label: '智谱 GLM-5.1',
    url: 'https://open.bigmodel.cn/api/paas/v4/chat/completions',
    key: () => process.env.GLM_API_KEY,
    model: 'glm-5.1',
    max_tokens: 65536,
    temperature: 0.3,
    protocol: 'openai'
  },
  qwen3_7max: {
    label: '阿里云 Qwen3-7Max',
    url: 'https://dashscope.aliyuncs.com/compatible-mode/v1/chat/completions',
    key: () => process.env.BAILIAN_API_KEY,
    model: 'qwen3-7-max',
    max_tokens: 16384,
    temperature: 0.3,
    protocol: 'openai'
  },
  minimax_m3: {
    label: 'MiniMax-M3 (Anthropic 兼容)',
    url: 'https://api.minimaxi.com/anthropic/v1/messages',
    key: () => process.env.MINIMAX_API_KEY,
    model: 'MiniMax-M3',
    max_tokens: 65536,
    thinking: { type: 'disabled' },   // M3 关掉 thinking,避免 32K 思考吞 content
    protocol: 'anthropic'
  },
  // 终极兜底: 模板化生成 UEM,不依赖任何 LLM / API key
  // 触发场景: Vercel 沙箱跑不到用户本地 llama-server + 4 个云端 LLM 都没配 key
  rules_engine: {
    label: '规则引擎 (模板兜底)',
    url: null,
    key: null,
    model: 'rules-engine-v1.1',
    protocol: 'rules',
    local: true,
    enabled: () => true
  }
};

// ====================== Lazy loaders ======================
function loadSystemPrompt() {
  if (_systemPrompt !== null) return _systemPrompt;
  try {
    _systemPrompt = fs.readFileSync(PROMPT_PATH, 'utf-8');
  } catch (e) {
    console.error('[schemagen] failed to load system prompt:', e.message);
    _systemPrompt = '';
  }
  return _systemPrompt;
}

function loadValidator() {
  if (_ajvValidate !== null) return _ajvValidate;
  try {
    const schema = JSON.parse(fs.readFileSync(SCHEMA_PATH, 'utf-8'));
    const ajv = new Ajv({ allErrors: true, strict: false, allowUnionTypes: true });
    addFormats(ajv);
    _ajvValidate = ajv.compile(schema);
  } catch (e) {
    console.error('[schemagen] failed to load ajv schema:', e.message);
    _ajvValidate = null;
  }
  return _ajvValidate;
}

// ====================== Form -> 自然语言 prompt ======================
function formToPromptText(form) {
  const lines = [];
  const elec = form.electrical || {};
  const loc = form.location || {};
  const sp = form.special || {};

  // 项目类型
  const typeMap = {
    ess: '储能系统',
    microgrid: '微电网',
    aidc: '数据中心',
    hybrid: '混合 (储能+发电+负载)'
  };
  const projType = typeMap[form.project_type] || form.project_type || '储能';
  const scenMap = {
    commercial: '工商业',
    industrial: '工业园区',
    residential: '家用',
    utility: '电网侧 / 调频电站',
    aidc_colocation: 'AIDC 托管',
    aidc_selfbuilt: 'AIDC 自建',
    microgrid: '微电网 (光储柴)'
  };
  const scenario = scenMap[form.scenario] || form.scenario || '工商业';

  // 容量/功率/时长
  const capStr = elec.capacity_kwh ? `${elec.capacity_kwh} 度电 (${elec.capacity_kwh} kWh)` : '容量待定';
  const powerStr = elec.power_kw ? `${elec.power_kw} 千瓦 (${elec.power_kw} kW)` : '功率待定';
  const durationStr = elec.duration_h ? `,时长 ${elec.duration_h} 小时` : '';
  const voltageStr = elec.voltage_level || '电压待定';
  const phasesStr = elec.phases ? `${elec.phases} 相` : '';

  // 并网模式
  const gridModeMap = {
    grid_tied: '并网',
    off_grid: '离网',
    hybrid: '并离网切换'
  };
  const gridMode = gridModeMap[elec.grid_mode] || elec.grid_mode || '并网';

  // 地点
  const locParts = [];
  if (loc.province) locParts.push(loc.province);
  if (loc.altitude_m !== undefined && loc.altitude_m !== null) locParts.push(`海拔 ${loc.altitude_m} 米`);
  if (loc.min_temp_c !== undefined && loc.min_temp_c !== null) locParts.push(`最低温 ${loc.min_temp_c}°C`);
  if (loc.max_temp_c !== undefined && loc.max_temp_c !== null) locParts.push(`最高温 ${loc.max_temp_c}°C`);
  const locStr = locParts.length ? locParts.join(',') : '中国境内';

  // 主需求句
  lines.push(`做一个${scenario}${projType}项目,${capStr},${powerStr}${durationStr},接入${voltageStr}电网 (${phasesStr}),${gridMode}模式。`);
  if (locParts.length) lines.push(`项目地点:${locStr}。`);

  // 光伏/风电/柴发/负载
  if (elec.pv_kw) lines.push(`配套光伏 ${elec.pv_kw} kW。`);
  if (elec.wind_kw) lines.push(`配套风电 ${elec.wind_kw} kW。`);
  if (elec.diesel_kw) lines.push(`配套柴油机 ${elec.diesel_kw} kW。`);
  if (elec.load_kw) lines.push(`负载 ${elec.load_kw} kW (类型 ${elec.load_type || '未指定'})。`);

  // 特殊项
  const specBits = [];
  if (sp.iec_61850) specBits.push('需要 IEC 61850 通信协议');
  if (sp.tn_s) specBits.push('采用 TN-S 接地系统');
  if (sp.low_temp_battery) specBits.push('低温电池 (-20°C 以下可用)');
  if (sp.altitude_derate) specBits.push('高海拔降容');
  if (sp.islanded) specBits.push('海岛/偏远地区');
  if (sp.tier) specBits.push(`AIDC Tier ${sp.tier}`);
  if (sp.redundancy) specBits.push(`冗余 ${sp.redundancy}`);
  if (specBits.length) lines.push(`特殊要求:${specBits.join(';')}。`);

  // 提示 v1.1 字段 (避免 LLM 漏掉)
  lines.push('请按 v1.1 完整 schema 输出 UEM JSON,所有默认值 (frequency_hz/power_factor/efficiency/soc_min/soc_max/thdi_pct/altitude_m/temperature/protection/compliance/drawings/metadata) 都必须填,不要留 null。');

  return lines.join('\n');
}

// ====================== Rules Engine (兜底,无 LLM 也能出图) ======================
// 从 formToPromptText 生成的自然语言 prompt 里反解出关键参数
// (不要求 100% 精确,只取关键字段;其他用合理默认值)
function decodeFormFromPrompt(promptText) {
  const form = { electrical: {}, location: {} };
  if (!promptText) return form;
  // 容量
  const capMatch = promptText.match(/(\d+(?:\.\d+)?)\s*度电/);
  if (capMatch) form.electrical.capacity_kwh = Number(capMatch[1]);
  // 功率
  const powerMatch = promptText.match(/(\d+(?:\.\d+)?)\s*千瓦/);
  if (powerMatch) form.electrical.power_kw = Number(powerMatch[1]);
  // 电压
  if (/10\s*kV|10kV/.test(promptText)) form.electrical.voltage_level = '10kV';
  else if (/35\s*kV|35kV/.test(promptText)) form.electrical.voltage_level = '35kV';
  else if (/400V/.test(promptText)) form.electrical.voltage_level = '400V';
  else if (/380V/.test(promptText)) form.electrical.voltage_level = '380V';
  else if (/690V/.test(promptText)) form.electrical.voltage_level = '690V';
  // 并网模式
  if (/并离网切换|hybrid/i.test(promptText)) form.electrical.grid_mode = 'hybrid';
  else if (/离网/.test(promptText)) form.electrical.grid_mode = 'off_grid';
  else form.electrical.grid_mode = 'grid_tied';
  // 场景
  if (/工商业/.test(promptText)) form.scenario = 'commercial';
  else if (/工业园/.test(promptText)) form.scenario = 'industrial';
  else if (/家用/.test(promptText)) form.scenario = 'residential';
  else if (/电网侧|调频/.test(promptText)) form.scenario = 'utility';
  else if (/数据中心|AIDC/.test(promptText)) form.scenario = 'aidc_colocation';
  else if (/微电网/.test(promptText)) form.scenario = 'microgrid';
  // 项目类型
  if (/微电网/.test(promptText)) form.project_type = 'microgrid';
  else if (/数据中心|AIDC/.test(promptText)) form.project_type = 'aidc';
  else form.project_type = 'ess';
  // 光伏
  const pvMatch = promptText.match(/配套光伏\s*(\d+(?:\.\d+)?)\s*kW/);
  if (pvMatch) form.electrical.pv_kw = Number(pvMatch[1]);
  // 负载
  const loadMatch = promptText.match(/负载\s*(\d+(?:\.\d+)?)\s*kW/);
  if (loadMatch) form.electrical.load_kw = Number(loadMatch[1]);
  // 地点
  if (/江苏/.test(promptText)) form.location.province = '江苏';
  else if (/广东/.test(promptText)) form.location.province = '广东';
  else if (/内蒙古/.test(promptText)) form.location.province = '内蒙古';
  else if (/新疆/.test(promptText)) form.location.province = '新疆';
  return form;
}

// 模板生成 UEM v1.1 (不依赖 LLM,无 key 也能出图)
function generateRulesUem(form) {
  form = form || {};
  const elec = form.electrical || {};
  const cap = Number(elec.capacity_kwh) || 2000;
  const pwr = Number(elec.power_kw) || 1000;
  const scen = form.scenario || 'commercial';
  const isAidc = scen === 'aidc_colocation' || scen === 'aidc_selfbuilt';
  const isMicrogrid = scen === 'microgrid';
  const isBss = form.project_type === 'battery_swap' || /换电|swap/i.test(form.name || '') || scen === 'heavy_truck_logistics' || scen === 'mining' || scen === 'port';
  const today = new Date();
  const dateStr = today.getFullYear() +
    String(today.getMonth() + 1).padStart(2, '0') +
    String(today.getDate()).padStart(2, '0');
  const id = `PRJ-${dateStr}-${String(Math.floor(Math.random() * 900) + 100)}`;

  // 推导时长
  const dur = cap > 0 && pwr > 0 ? +(cap / pwr).toFixed(2) : 2;
  // 场景合理默认值
  let voltage = elec.voltage_level;
  if (!voltage) voltage = isAidc || isBss ? '10kV' : (cap > 5000 ? '10kV' : (cap > 100 ? '400V' : '380V'));
  let gridMode = elec.grid_mode || (isMicrogrid ? 'hybrid' : 'grid_tied');

  // ====================== 换电站分支 (v1.2) ======================
  if (isBss) {
    const moduleKw = 30;
    const modulesPerSlot = 2;
    const totalSlots = 16;
    const totalModules = totalSlots * modulesPerSlot;
    const trKva = Math.ceil((pwr * 1.1) / 100) * 100 || 1300;
    return {
      schema_version: '1.2',
      project: {
        id,
        name: (form.name || 'XX物流园重卡换电站'),
        type: 'battery_swap',
        scenario: scen === 'commercial' ? 'heavy_truck_logistics' : scen,
        standard: 'GB',
        revision: 'Rev.A',
        designer: '卢继雄',
        location: { country: 'CN', province: (form.location && form.location.province) || '江苏', altitude_m: 50 }
      },
      electrical: {
        capacity_kwh: cap,
        power_kw: pwr,
        duration_h: dur,
        voltage_level: voltage,
        grid_mode: gridMode,
        phases: 3,
        frequency_hz: 50,
        power_factor: 0.95,
        efficiency_pct: 92,
        thdi_pct: 5,
        soc_min_pct: 10,
        soc_max_pct: 90
      },
      sources: { pv_kw: 0, grid_capacity_kw: pwr },
      loads: { total_kw: pwr, type: 'mixed', peak_kw: pwr, daily_kwh: pwr * 8 },
      swap_station: {
        mv_switchgear: { type: 'KYN28-12', incoming_voltage_kv: 10, protection: ['differential', 'overcurrent', 'instantaneous'], metering_class: '0.5S' },
        transformer: { qty: 1, capacity_kva: trKva, hv_kv: 10, lv_kv: 0.4, type: 'Dry-type SCB13', connection: 'Dyn11' },
        lv_distribution: {
          panel_type: 'GCS', main_breaker_a: 2500,
          feeders: [
            { name: 'ChargingModules', power_kw: pwr, breaker_a: Math.ceil(pwr * 1000 / (400 * Math.sqrt(3) * 0.85) * 1.25) },
            { name: 'SwapRobot-1', power_kw: 75, breaker_a: 160 },
            { name: 'SwapRobot-2', power_kw: 75, breaker_a: 160 },
            { name: 'HVAC', power_kw: 30, breaker_a: 63 },
            { name: 'Lighting', power_kw: 10, breaker_a: 32 },
            { name: 'FireFighting', power_kw: 15, breaker_a: 32 }
          ]
        },
        dc_distribution: { bus_voltage_v: 750, rated_current_a: 1600, insulation_monitor: true },
        charging_system: { total_modules: totalModules, module_power_kw: moduleKw, modules_per_slot: modulesPerSlot, rack_count: 1, rack_layout: { rows: 3, cols: 6 } },
        battery_cabin: {
          layout: { rows: 3, cols: 6, total_slots: totalSlots },
          slot_states: [
            { slot_id: 'R1C1', state: 'FULL', soc_pct: 100 }, { slot_id: 'R1C2', state: 'FULL', soc_pct: 100 },
            { slot_id: 'R1C3', state: 'FULL', soc_pct: 100 }, { slot_id: 'R1C4', state: 'FULL', soc_pct: 100 },
            { slot_id: 'R1C5', state: 'FULL', soc_pct: 100 }, { slot_id: 'R1C6', state: 'CHARGING', soc_pct: 75 },
            { slot_id: 'R2C1', state: 'CHARGING', soc_pct: 60 }, { slot_id: 'R2C2', state: 'CHARGING', soc_pct: 50 },
            { slot_id: 'R2C3', state: 'CHARGING', soc_pct: 80 }, { slot_id: 'R2C4', state: 'CHARGING', soc_pct: 45 },
            { slot_id: 'R2C5', state: 'CHARGING', soc_pct: 90 }, { slot_id: 'R2C6', state: 'IDLE', soc_pct: 0 },
            { slot_id: 'R3C1', state: 'IDLE', soc_pct: 0 }, { slot_id: 'R3C2', state: 'IDLE', soc_pct: 0 },
            { slot_id: 'R3C3', state: 'IDLE', soc_pct: 0 }, { slot_id: 'R3C4', state: 'FAULTY', soc_pct: 0 }
          ]
        },
        swap_area: {
          bay_count: 2, swap_time_min: 6,
          robots: [
            { id: 'ROB-01', type: 'gantry_3axis', power_kw: 75 },
            { id: 'ROB-02', type: 'gantry_3axis', power_kw: 75 }
          ]
        },
        communication: { ems_proto: 'IEC104', bms_proto: 'CAN2.0B', pcs_proto: 'ModbusTCP', robot_proto: 'ModbusTCP' },
        grounding: { system_type: 'TN-S', resistance_ohm: 4.0, main_bus: 'TMY-40x4' }
      },
      protection: {
        overcurrent: true, instantaneous: true, earth_fault: true,
        overcurrent_setting: { setting_pct: 110, delay_s: 1.0 },
        instantaneous_setting: { setting_pct: 600, delay_s: 0.05 },
        earth_fault_setting: { setting_pct: 30, delay_s: 0.2 }
      },
      compliance: { score: 95, grade: 'B', standards: ['GB 50059', 'GB 50054'], violations: [] },
      drawings: { sld_required: true, architecture_required: true, communication_required: true },
      special_requirements: ['KYN28-12 中压柜', 'GCS 低压配电', 'DC750V 充电母线', 'IEC104 通信协议', 'TN-S 接地 (≤4Ω)'],
      metadata: {
        rules_version: 'v1.2',
        llm_model: 'rules-engine-v1.2',
        llm_raw_output: '(generated by rules engine — no LLM API key configured, template-based fallback for battery_swap)',
        generated_at: today.toISOString()
      }
    };
  }

  return {
    schema_version: '1.1',
    project: {
      id,
      name: (form.name || 'AI 方案演示项目'),
      type: isAidc ? 'aidc' : (isMicrogrid ? 'microgrid' : 'ess'),
      scenario: scen,
      standard: 'GB',
      revision: 'Rev.A',
      location: { country: 'CN', province: (form.location && form.location.province) || '江苏', altitude_m: 50 }
    },
    electrical: {
      capacity_kwh: cap,
      power_kw: pwr,
      duration_h: dur,
      voltage_level: voltage,
      grid_mode: gridMode,
      phases: 3,
      frequency_hz: 50,
      power_factor: 0.95,
      efficiency_pct: 92,
      thdi_pct: 5,
      soc_min_pct: 10,
      soc_max_pct: 90
    },
    sources: {
      pv_kw: Number(elec.pv_kw) || 0,
      wind_kw: Number(elec.wind_kw) || 0,
      diesel_kw: Number(elec.diesel_kw) || (isMicrogrid && !elec.pv_kw ? 500 : 0),
      hydro_kw: 0,
      grid_capacity_kw: pwr
    },
    loads: {
      total_kw: Number(elec.load_kw) || pwr,
      type: isAidc ? 'it_load' : (isMicrogrid ? 'mixed' : 'general'),
      peak_kw: pwr,
      daily_kwh: pwr * 8,
      ev_charger_kw: 0,
      critical_load_kw: isAidc ? pwr : 0
    },
    aidc_specific: isAidc ? {
      tier: 'III',
      redundancy: '2N',
      it_load_kw: pwr,
      pue_target: 1.3,
      ups_topology: 'modular',
      cooling_type: 'water',
      generator_transfer_time_ms: 10000
    } : null,
    protection: {
      overcurrent: true,
      instantaneous: true,
      earth_fault: true,
      overcurrent_setting: { setting_pct: 110, delay_s: 1.0 },
      instantaneous_setting: { setting_pct: 600, delay_s: 0.05 },
      earth_fault_setting: { setting_pct: 30, delay_s: 0.2 }
    },
    compliance: {
      score: 95,
      grade: 'B',
      standards: ['GB 51048-2024', 'GB 50054-2011', 'GB/T 36276-2018'],
      violations: []
    },
    drawings: {
      sld_required: true,
      architecture_required: true,
      communication_required: true
    },
    special_requirements: gridMode !== 'off_grid'
      ? ['IEC 61850 (国标 GB/T 36276)']
      : ['Modbus RTU/TCP'],
    metadata: {
      rules_version: 'v1.1',
      llm_model: 'rules-engine-v1.1',
      llm_raw_output: '(generated by rules engine — no LLM API key configured, template-based fallback)',
      generated_at: today.toISOString()
    }
  };
}

// ====================== Provider 调用层 ======================
const FETCH_TIMEOUT_MS = 60_000;  // 单 provider 最长 60s
const LOCAL_TIMEOUT_MS = 5_000;   // 本地 llama-server 默认短超时 (开发机常关)

function fetchWithTimeout(url, options, timeoutMs = FETCH_TIMEOUT_MS) {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), timeoutMs);
  return fetch(url, { ...options, signal: controller.signal })
    .finally(() => clearTimeout(timer));
}

async function callProvider(providerKey, messages, rawForm) {
  const cfg = PROVIDERS[providerKey];
  if (!cfg) throw new Error(`Unknown provider: ${providerKey}`);

  // rules engine 不走 HTTP,直接生成 UEM
  if (cfg.protocol === 'rules') {
    // 从 messages.user 里反解 form (formToPromptText 的输出),并 merge rawForm 字段 (name/project_type)
    const decoded = decodeFormFromPrompt(messages[messages.length - 1]?.content || '');
    const form = Object.assign({}, decoded, rawForm || {});
    return { content: JSON.stringify(generateRulesUem(form)), raw: { rules_engine: true } };
  }

  // 取 key (local 跳过)
  let apiKey = null;
  if (typeof cfg.key === 'function') apiKey = cfg.key();
  else if (cfg.key) apiKey = cfg.key;
  if (!cfg.local && !apiKey) throw new Error(`API key for ${providerKey} not configured`);

  if (cfg.protocol === 'anthropic') {
    return await callAnthropic(cfg, messages, apiKey);
  }
  return await callOpenAI(cfg, messages, apiKey);
}

// Fallback chain: 在 callProvider 失败时,自动降级
async function callProviderWithFallback(requestedKey, messages, rawForm) {
  const tried = new Set();
  const order = [];
  // 优先用户指定,再按优先级 fallback; rules_engine 永远最后兜底
  const priority = ['deepseek_v4', 'glm_5_1', 'qwen3_7max', 'minimax_m3', 'qwen3_local', 'rules_engine'];
  if (requestedKey && priority.includes(requestedKey)) order.push(requestedKey);
  for (const k of priority) if (k !== requestedKey && k !== 'rules_engine') order.push(k);

  let lastErr = null;
  for (const k of order) {
    if (tried.has(k)) continue;
    tried.add(k);
    const cfg = PROVIDERS[k];
    const apiKey = typeof cfg.key === 'function' ? cfg.key() : cfg.key;
    if (!cfg.local && !apiKey) {
      console.log(`[schemagen] skip ${k} (no API key)`);
      continue;
    }
    try {
      console.log(`[schemagen] trying ${k}...`);
      const result = await callProvider(k, messages, rawForm);
      return { ...result, provider_used: k };
    } catch (e) {
      console.warn(`[schemagen] ${k} failed: ${e.message?.slice(0, 200)}`);
      lastErr = e;
    }
  }

  // 终极兜底: rules_engine(模板生成,不抛错)
  console.log('[schemagen] all LLM providers failed, falling back to rules_engine template');
  try {
    const decoded = decodeFormFromPrompt(messages[messages.length - 1]?.content || '');
    const form = Object.assign({}, decoded, rawForm || {});
    const result = { content: JSON.stringify(generateRulesUem(form)), raw: { rules_engine: true } };
    return { ...result, provider_used: 'rules_engine' };
  } catch (e) {
    console.error('[schemagen] rules_engine fallback also failed:', e.message);
    throw lastErr || new Error('All providers + rules_engine failed');
  }
}

async function callOpenAI(cfg, messages, apiKey) {
  const body = {
    model: cfg.model,
    messages,
    temperature: cfg.temperature,
    max_tokens: cfg.max_tokens,
    stream: false
  };
  if (cfg.thinking) body.thinking = cfg.thinking;

  const headers = { 'Content-Type': 'application/json' };
  if (apiKey && apiKey !== 'EMPTY') headers['Authorization'] = `Bearer ${apiKey}`;

  const timeout = cfg.local ? LOCAL_TIMEOUT_MS : FETCH_TIMEOUT_MS;
  const resp = await fetchWithTimeout(cfg.url, {
    method: 'POST',
    headers,
    body: JSON.stringify(body)
  }, timeout);

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`OpenAI-compat API error ${resp.status}: ${errText.slice(0, 500)}`);
  }

  const data = await resp.json();
  // OpenAI 风格: choices[0].message.content (M3 有时给 reasoning_content 而 content 为空)
  const msg = data.choices?.[0]?.message;
  if (!msg) throw new Error('No message in response');
  let content = msg.content || msg.reasoning_content || '';
  return { content, raw: data };
}

async function callAnthropic(cfg, messages, apiKey) {
  // 拆 system message
  const systemMsg = messages.find(m => m.role === 'system');
  const userMessages = messages.filter(m => m.role !== 'system').map(m => ({
    role: m.role,
    content: [{ type: 'text', text: m.content }]
  }));

  const body = {
    model: cfg.model,
    max_tokens: cfg.max_tokens,
    system: systemMsg?.content || '',
    messages: userMessages
  };
  if (cfg.thinking) body.thinking = cfg.thinking;

  const resp = await fetchWithTimeout(cfg.url, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-api-key': apiKey,
      'anthropic-version': '2023-06-01'
    },
    body: JSON.stringify(body)
  });

  if (!resp.ok) {
    const errText = await resp.text();
    throw new Error(`Anthropic API error ${resp.status}: ${errText.slice(0, 500)}`);
  }

  const data = await resp.json();
  // Anthropic 风格: content[] 数组, type=text 或 type=thinking
  let content = '';
  let reasoning = '';
  for (const block of (data.content || [])) {
    if (block.type === 'text') content += block.text;
    else if (block.type === 'thinking') reasoning += block.thinking;
  }
  // M3 经常 content=0 全在 reasoning, 用 reasoning 兜底
  if (!content && reasoning) content = reasoning;
  return { content, raw: data };
}

// ====================== 5 级 JSON 修复链 ======================
// (源自 ess-agent 实战经验: M3 输出经常拆多段、夹中文、JSON 后面追加解释)
// L0: 智能多对象重组 (按字段签名合并)
// L1: 栈平衡截断 (找第一个完整 { ... })
// L2: 清尾随逗号 / 行注释 / 块注释 / 控制字符
// L3: 转义 SVG/JSON 字符串内未转义的双引号
// L4: 补全截断 (找 </svg> 或平衡 { } )
// L5: 正则 \{[\s\S]*\} 抓最外层

function tryParseJson(s) {
  if (!s || typeof s !== 'string') return null;
  try { return JSON.parse(s); } catch (e) { return null; }
}

function stripCodeFence(s) {
  return s.replace(/^```(?:json)?\s*/i, '').replace(/```\s*$/g, '').trim();
}

// L1: 栈平衡截断
function stackBalanceExtract(s) {
  let depth = 0;
  let inStr = false;
  let escape = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (escape) { escape = false; continue; }
    if (c === '\\' && inStr) { escape = true; continue; }
    if (c === '"') { inStr = !inStr; continue; }
    if (inStr) continue;
    if (c === '{') depth++;
    else if (c === '}') {
      depth--;
      if (depth === 0) return s.slice(0, i + 1);
    }
  }
  return null;
}

// L2: 清理 (尾随逗号 / 行注释 / 块注释 / 控制字符)
function cleanJsonNoise(s) {
  return s
    // 控制字符 (保留 \n \r \t)
    .replace(/[\x00-\x08\x0B\x0C\x0E-\x1F]/g, '')
    // 行注释 // ...
    .replace(/^\s*\/\/.*$/gm, '')
    // 块注释 /* ... */
    .replace(/\/\*[\s\S]*?\*\//g, '')
    // 尾随逗号 ,] 或 ,}
    .replace(/,(\s*[\]}])/g, '$1');
}

// L3: 转义未转义双引号 (在字符串内)
// 找到 "key": "value" 模式,如果 value 含未转义 " 则转义
function escapeUnescapedQuotes(s) {
  // 只针对 "...": "..."  结构的 value 部分
  return s.replace(/(":\s*")((?:[^"\\]|\\.)*?)(",?\s*[\n}\]])/g, (m, p1, p2, p3) => {
    // p2 内如果有未转义 " (不在 \\ 之后) 则转义
    const fixed = p2.replace(/(?<!\\)"/g, '\\"');
    return p1 + fixed + p3;
  });
}

// L4: 补全截断 (平衡未闭合的 { })
function repairTruncation(s) {
  const open = (s.match(/{/g) || []).length;
  const close = (s.match(/}/g) || []).length;
  if (open > close) {
    return s + '}'.repeat(open - close);
  }
  // 删尾部多余的 }
  while ((s.match(/}/g) || []).length > (s.match(/{/g) || []).length) {
    s = s.replace(/}\s*$/, '');
  }
  return s;
}

// L0: 多对象智能重组 — 按字段签名分类
function reassembleMultiObject(content) {
  // 提取所有顶层 JSON 对象 (栈平衡)
  const objects = [];
  let pos = 0;
  while (pos < content.length) {
    // 找下一个 {
    const start = content.indexOf('{', pos);
    if (start === -1) break;
    const sub = content.slice(start);
    const balanced = stackBalanceExtract(sub);
    if (!balanced) break;
    const obj = tryParseJson(balanced);
    if (obj && typeof obj === 'object') {
      objects.push(obj);
    }
    pos = start + (balanced?.length || 1);
  }
  if (objects.length <= 1) return objects[0] || null;

  // 按字段签名合并
  const result = {};
  const bomArr = [];
  let economicsDetail = null;
  let archDiagram = null;
  let wiringDiagram = null;
  let commDiagram = null;

  for (const obj of objects) {
    if (obj.bus && (obj.nodes || obj.links)) {
      archDiagram = obj;
    } else if (obj.voltage && (obj.components || obj.connections)) {
      wiringDiagram = obj;
    } else if (obj.layers) {
      commDiagram = obj;
    } else if (obj.annualRevenue || obj.payback || obj.irr) {
      economicsDetail = obj;
    } else if (obj.item && obj.qty !== undefined) {
      bomArr.push(obj);
    } else {
      // 顶层 UEM 字段
      Object.assign(result, obj);
    }
  }

  if (archDiagram) result.archDiagram = archDiagram;
  if (wiringDiagram) result.wiringDiagram = wiringDiagram;
  if (commDiagram) result.commDiagram = commDiagram;
  if (economicsDetail) result.economicsDetail = economicsDetail;
  if (bomArr.length) result.bom = bomArr;

  return Object.keys(result).length > 0 ? result : objects[0];
}

// 主解析函数
function parseUemFromLlm(content) {
  if (!content) throw new Error('Empty LLM response');
  let text = String(content).trim();

  // 0. 预处理: 去 code fence
  text = stripCodeFence(text);

  // L0: 多对象智能重组
  const reassembled = reassembleMultiObject(text);
  if (reassembled && typeof reassembled === 'object') {
    return reassembled;
  }

  // L1: 栈平衡截断
  const balanced = stackBalanceExtract(text);
  if (balanced) {
    let parsed = tryParseJson(balanced);
    if (parsed) return parsed;
  }

  // L2: 清理
  let cleaned = cleanJsonNoise(text);
  const balanced2 = stackBalanceExtract(cleaned);
  if (balanced2) {
    let parsed = tryParseJson(balanced2);
    if (parsed) return parsed;
  }

  // L3: 转义双引号
  let escaped = escapeUnescapedQuotes(cleaned);
  const balanced3 = stackBalanceExtract(escaped);
  if (balanced3) {
    let parsed = tryParseJson(balanced3);
    if (parsed) return parsed;
  }

  // L4: 补全截断
  let repaired = repairTruncation(escaped);
  parsed = tryParseJson(repaired);
  if (parsed) return parsed;

  // L5: 正则最外层
  const m = text.match(/\{[\s\S]*\}/);
  if (m) {
    parsed = tryParseJson(m[0]);
    if (parsed) return parsed;
  }

  throw new Error('All 6 levels of JSON repair failed');
}

// ====================== Runtime backfill (兼容 schema v1.0/v1.1 漂移) ======================
// schema 用 soc_min_pct/efficiency_pct, prompt 老版本用 soc_min/efficiency
// 这里双写保证 ajv 通过
function runtimeBackfill(uem) {
  if (!uem || typeof uem !== 'object') return uem;
  const elec = uem.electrical || {};
  // efficiency
  if (elec.efficiency !== undefined && elec.efficiency_pct === undefined) {
    // 0.88 (fraction) -> 88 (percent)
    if (elec.efficiency <= 1.5) elec.efficiency_pct = Math.round(elec.efficiency * 100);
    else elec.efficiency_pct = elec.efficiency;
  }
  // soc
  if (elec.soc_min !== undefined && elec.soc_min_pct === undefined) {
    elec.soc_min_pct = elec.soc_min;
  }
  if (elec.soc_max !== undefined && elec.soc_max_pct === undefined) {
    elec.soc_max_pct = elec.soc_max;
  }
  // thdi
  if (elec.thdi_pct !== undefined && elec.thdi === undefined) {
    elec.thdi = elec.thdi_pct;
  }
  // frequency
  if (elec.frequency_hz !== undefined && elec.frequency === undefined) {
    elec.frequency = elec.frequency_hz;
  }
  // power_factor
  if (elec.power_factor !== undefined && elec.pf === undefined) {
    elec.pf = elec.power_factor;
  }
  uem.electrical = elec;

  // 注入 R-special-001 (通信协议必填),Track B 规则
  if (!Array.isArray(uem.special_requirements)) {
    uem.special_requirements = [];
  }
  const gridMode = elec.grid_mode || 'grid_tied';
  // 换电站场景: 用 IEC104 + CAN2.0B 而不是通用 IEC 61850
  if (uem.project && uem.project.type === 'battery_swap') {
    if (!uem.special_requirements.some(s => /IEC\s*104/i.test(s))) {
      uem.special_requirements.push('IEC 104 通信协议 (国标 DL/T 634.5104)');
    }
    if (!uem.special_requirements.some(s => /CAN\s*2\.0\s*B/i.test(s))) {
      uem.special_requirements.push('CAN 2.0B 总线 (电池管理)');
    }
    if (!uem.special_requirements.some(s => /TN-S/i.test(s) || /接地/i.test(s))) {
      uem.special_requirements.push('TN-S 接地系统 (≤4Ω)');
    }
  } else if (gridMode !== 'off_grid') {
    if (!uem.special_requirements.some(s => /IEC\s*61850/i.test(s))) {
      uem.special_requirements.push('IEC 61850 (国标 GB/T 36276)');
    }
  } else {
    if (!uem.special_requirements.some(s => /Modbus/i.test(s))) {
      uem.special_requirements.push('Modbus RTU/TCP');
    }
  }

  // metadata.llm_raw_output 自动填
  if (!uem.metadata) uem.metadata = {};
  if (!uem.metadata.llm_raw_output) {
    uem.metadata.llm_raw_output = '(set by L1)';
  }
  if (!uem.metadata.rules_version) {
    uem.metadata.rules_version = (uem.schema_version === '1.2') ? 'v1.2' : 'v1.1';
  }

  return uem;
}

// ====================== Provider 选择 (含 fallback) ======================
function pickProvider(requestedKey) {
  // 显式请求
  if (requestedKey && PROVIDERS[requestedKey]) {
    const cfg = PROVIDERS[requestedKey];
    const apiKey = typeof cfg.key === 'function' ? cfg.key() : cfg.key;
    if (cfg.local || apiKey) return requestedKey;
    console.warn(`[schemagen] requested provider "${requestedKey}" has no API key, falling back to qwen3_local`);
  }
  // 自动选有 key 的 (优先级: deepseek > glm > qwen3_7max > minimax_m3 > qwen3_local)
  const priority = ['deepseek_v4', 'glm_5_1', 'qwen3_7max', 'minimax_m3', 'qwen3_local'];
  for (const k of priority) {
    const cfg = PROVIDERS[k];
    const apiKey = typeof cfg.key === 'function' ? cfg.key() : cfg.key;
    if (cfg.local || apiKey) return k;
  }
  return 'qwen3_local';
}

// ====================== Main handler ======================
export default async function handler(req, res) {
  // CORS
  res.setHeader('Access-Control-Allow-Origin', '*');
  res.setHeader('Access-Control-Allow-Methods', 'POST, OPTIONS');
  res.setHeader('Access-Control-Allow-Headers', 'Content-Type');
  if (req.method === 'OPTIONS') return res.status(200).end();
  if (req.method !== 'POST') return res.status(405).json({ ok: false, error: 'Method not allowed' });

  const t0 = Date.now();
  let providerUsed = 'qwen3_local';

  try {
    const form = req.body || {};
    if (!form.electrical && !form.project_type) {
      return res.status(400).json({ ok: false, error: 'Missing form payload (need project_type + electrical)' });
    }

    // 1) 选 provider
    providerUsed = pickProvider(form.ai_provider);
    console.log(`[schemagen] provider=${providerUsed}`);

    // 2) 拼 prompt
    const systemPrompt = loadSystemPrompt();
    const userPrompt = formToPromptText(form);

    // 2.5) schema_version 升级到 v1.2 (如果 LLM 返回 v1.1 但 project.type=battery_swap,强制升级)
    // 由 runtimeBackfill 后续统一处理

    // 3) 调 LLM (带 fallback)
    const messages = [
      { role: 'system', content: systemPrompt },
      { role: 'user', content: userPrompt }
    ];
    const { content, provider_used } = await callProviderWithFallback(providerUsed, messages, form);
    if (provider_used) providerUsed = provider_used;

    // 4) 5 级 JSON 修复链
    let uem;
    try {
      uem = parseUemFromLlm(content);
    } catch (e) {
      return res.status(502).json({
        ok: false,
        error: 'JSON parse failed after 6-level repair: ' + e.message,
        raw: String(content).slice(0, 4000),
        provider: providerUsed
      });
    }

    // 5) 注入 metadata 模型名 + v1.2 升级
    if (!uem.metadata) uem.metadata = {};
    uem.metadata.llm_model = PROVIDERS[providerUsed]?.model || providerUsed;
    if (uem.project && uem.project.type === 'battery_swap' && (!uem.schema_version || uem.schema_version === '1.1')) {
      uem.schema_version = '1.2';
      console.log('[schemagen] upgraded UEM schema_version to 1.2 for battery_swap');
    }

    // 6) runtime backfill (soc_min_pct 等)
    uem = runtimeBackfill(uem);

    // 7) ajv 校验
    const validate = loadValidator();
    if (!validate) {
      return res.status(500).json({ ok: false, error: 'Schema validator not loaded' });
    }
    const valid = validate(uem);
    if (!valid) {
      const errs = (validate.errors || []).slice(0, 10).map(e => ({
        path: e.instancePath || e.schemaPath,
        message: e.message,
        params: e.params
      }));
      return res.status(422).json({
        ok: false,
        error: 'UEM schema validation failed',
        validation_errors: errs,
        uem_partial: uem,
        provider: providerUsed
      });
    }

    // 8) 成功
    return res.status(200).json({
      ok: true,
      uem,
      latency_s: Math.round((Date.now() - t0) / 100) / 10,
      provider: providerUsed
    });

  } catch (e) {
    console.error('[schemagen] error:', e);
    return res.status(500).json({
      ok: false,
      error: e.message || 'Internal error',
      provider: providerUsed,
      latency_s: Math.round((Date.now() - t0) / 100) / 10
    });
  }
}
