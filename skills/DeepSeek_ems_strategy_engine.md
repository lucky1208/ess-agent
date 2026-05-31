---
name: DeepSeek-ems-strategy-engine
description: >
  储能EMS策略编译引擎综合Skill v1.0。融合NLP策略描述→YAML配置自动编译管道、
  15省分时电价数据库(2024-2025)、3层控制架构(日级/小时级/秒级)、温度校正策略、
  多策略融合与冲突消解矩阵。覆盖削峰填谷、防逆流、需量控制、SOC管理、充电桩限功率、
  光伏消纳、应急备电、电力现货的全部策略模板。
  适用场景:工商业储能、光储充一体、微电网的EMS策略设计与部署。
  适用对象:EMS策略工程师、项目经理、运营人员。
---

# EMS策略编译引擎综合Skill v1.0

## 目录

- [一、EMS策略体系总览](#一ems策略体系总览)
- [二、15省分时电价数据库(2024-2025)](#二十五省分时电价数据库2024-2025)
- [三、NLP→YAML策略编译Pipeline](#三nlpyaml策略编译pipeline)
- [四、3层控制架构](#四3层控制架构)
- [五、削峰填谷策略](#五削峰填谷策略)
- [六、防逆流策略](#六防逆流策略)
- [七、需量控制策略](#七需量控制策略)
- [八、SOC管理与温度校正策略](#八soc管理与温度校正策略)
- [九、充电桩限功率策略](#九充电桩限功率策略)
- [十、光伏消纳最大化策略](#十光伏消纳最大化策略)
- [十一、应急备电策略](#十一应急备电策略)
- [十二、电力现货/辅助服务策略](#十二电力现货辅助服务策略)
- [十三、多策略融合与冲突消解矩阵](#十三多策略融合与冲突消解矩阵)
- [十四、策略参数边界与安全约束总表](#十四策略参数边界与安全约束总表)
- [十五、完整YAML/JSON配置模板](#十五完整yamljson配置模板)
- [十六、策略验证与仿真检查清单](#十六策略验证与仿真检查清单)
- [十七、常见策略设计错误](#十七常见策略设计错误)

---

## 一、EMS策略体系总览

### 1.1 3层控制架构

```
EMS策略层级架构:
┌─────────────────────────────────────────────────────────┐
│ Layer 0: 安全保护层 (最高优先级, 不可被覆盖)             │
│   ├── BMS故障分级保护 (一级↓预警/二级↓停机/三级↓急停)   │
│   ├── 消防联动停机 (FSS→硬接线)                         │
│   ├── ESD紧急停机                                       │
│   ├── 防孤岛保护                                         │
│   └── 电网异常保护 (电压/频率越限)                       │
├─────────────────────────────────────────────────────────┤
│ Layer 1: 系统约束层                                     │
│   ├── SOC保护边界 (充放电截止SOC)                        │
│   ├── 功率限幅 (PCS额定功率/用户设定)                    │
│   ├── 温度降额 (电池/PCS高温降额曲线)                     │
│   └── 通信异常保护 (通信中断→安全停机)                    │
├─────────────────────────────────────────────────────────┤
│ Layer 2: 模式运行层 (单选, 互斥的运营模式)               │
│   ├── Mode-A: 削峰填谷                                   │
│   ├── Mode-B: 防逆流                                     │
│   ├── Mode-C: 需量管理                                   │
│   ├── Mode-D: 光伏消纳                                   │
│   ├── Mode-E: 应急备电                                   │
│   ├── Mode-F: 电力现货                                   │
│   └── Mode-G: 自定义调度                                 │
├─────────────────────────────────────────────────────────┤
│ Layer 3: 辅助优化层 (叠加在主模式上)                     │
│   ├── 充电桩智能限功率                                    │
│   ├── 变压器负载率管理                                    │
│   └── 需量预测矫正                                        │
└─────────────────────────────────────────────────────────┘
```

### 1.2 策略执行周期与响应时间

| 策略类型 | 计算周期 | 指令下发周期 | 响应时间要求 |
|---------|---------|------------|------------|
| 削峰填谷(日前) | 日级 | 1min | ≤5s |
| 削峰填谷(日内) | 5min | 15s | ≤3s |
| 防逆流 | 1s | 500ms | ≤500ms |
| 需量控制 | 1min | 15s | ≤3s |
| SOC管理 | 实时 | 500ms | 立即 |
| 充电桩限功率 | 10s | 5s | ≤2s |
| 光伏消纳 | 5s | 5s | ≤2s |
| 应急备电 | 事件 | 立即 | ≤200ms |
| 现货交易 | 15min | 5min | ≤30s |

---

## 二、15省分时电价数据库(2024-2025)

### 2.1 各省分时电价速查表

> **数据来源**:各省发改委/电网公司官方网站公开发布数据
> **版本**:2025Q1

| 省份 | 编码 | 峰段时段 | 平段时段 | 谷段时段 | 尖峰 |
|------|------|---------|---------|---------|------|
| **广东** | GD | 8-12,18-23 | 0-8(非谷) | 0-8 | 14-17,19-21(夏/冬) |
| **江苏** | JS | 8-9,11-18,21-23 | 6-8,23-24 | 0-6 | 9-11,18-21(7-8月) |
| **浙江** | ZJ | 8-11,13-15,17-23 | 0-8(非谷) | 0-8 | 11-13,15-17 |
| **山东** | SD | 8-10,12-15,17-22 | 6-8,22-24 | 0-6 | 10-12,15-17(夏/冬) |
| **北京** | BJ | 8-11,13-17,19-23 | 0-8,17-19 | 0-8 | 无尖峰 |
| **上海** | SH | 8-9,11-18,21-23 | 6-8,18-19 | 0-6 | 9-11,19-21 |
| **四川** | SC | 8-11,13-15,17-22 | 0-8 | 0-8 | 11-13,15-17 |
| **湖南** | HN | 8-10,12-19,21-23 | 0-8,23-24 | 0-8 | 10-12,19-21(冬) |
| **河南** | HA | 8-11,13-17,20-23 | 0-8,23-24 | 0-8 | 11-13,17-20 |
| **湖北** | HB | 8-9,11-19,21-23 | 6-8,23-24 | 0-6 | 9-11,19-21 |
| **陕西** | SX | 8-10,12-18,20-23 | 0-8,23-24 | 0-8 | 10-12,18-20 |
| **安徽** | AH | 8-11,13-17,19-23 | 0-8 | 0-8 | 11-13,17-19 |
| **福建** | FJ | 8-10,12-19,21-23 | 0-8 | 0-8 | 10-12,19-21(7-9/12-1) |
| **河北** | HE | 8-11,13-17,19-23 | 0-8 | 0-8 | 11-13,17-19 |
| **辽宁** | LN | 8-10,12-17,19-23 | 0-8 | 0-8 | 10-12,17-19(冬) |

### 2.2 各省详细电价(元/kWh)

#### 【广东】粤发改价格〔2023〕225号

```
尖峰: 1.4328  (夏季7-8月/冬季12-1月, 14-17时/19-21时)
峰段: 1.0728  (8-12时, 18-23时)
平段: 0.6692
谷段: 0.2254  (0-8时)
代理购电综合价格 = 平段电价 + 0.043元
偏差考核: 偏差率>5%部分按2元/kWh考核
```

#### 【江苏】苏发改价格〔2023〕1034号

```
尖峰: 1.2897  (7-8月, 9-11时/18-21时, +0.132元附加)
峰段: 1.1577  (8-9, 11-18, 21-23)
平段: 0.7235
谷段: 0.2894  (0-6时)
偏差考核: 偏差率>3%部分按1.5元/kWh
```

#### 【浙江】浙发改价格〔2024〕89号

```
尖峰: 1.3856  (11-13, 15-17)
峰段: 1.1085  (8-11, 13-15, 17-23)
平段: 0.7010
谷段: 0.2944  (0-8时)
夏季(7-8月)平段下调0.12元, 冬季(12-1月)尖峰上浮0.05元
```

#### 【山东】鲁发改价格〔2023〕831号

```
尖峰: 1.2532  (10-12, 15-17, 夏/冬尖峰月)
峰段: 1.0732  (8-10, 12-15, 17-22)
平段: 0.6924
谷段: 0.3116  (0-6时)
夏季尖峰(7-8月)加0.18元, 冬季尖峰(12-1月)加0.10元
容量电费: 30元/kW·月
```

### 2.3 代理购电综合配置模板

```yaml
agency_procurement_config:
  enabled: true
  provinces:
    GD:
      base_agency_price: 0.7122
      service_fee: 0.043
      deviation_penalty: 2.0       # 元/kWh, 偏差率>5%
    JS:
      base_agency_price: 0.7665
      service_fee: 0.040
      deviation_penalty: 1.5       # 偏差率>3%
    ZJ:
      base_agency_price: 0.7390
      service_fee: 0.038
      deviation_penalty: 1.8
    SD:
      base_agency_price: 0.7374
      service_fee: 0.045
      capacity_charge_per_kw: 30.0
      deviation_penalty: 1.8
    SH:
      base_agency_price: 0.7755
      service_fee: 0.048
      demand_charge: 40.0
    SC:
      base_agency_price: 0.6760
      service_fee: 0.035
      seasonal_flex: true
```

### 2.4 电价数据更新机制

```yaml
electricity_price_update:
  auto_check:
    enabled: true
    frequency: quarterly
    sources: ["各省发改委官网"]
  version_control:
    current_version: "2025Q1"
    last_updated: "2025-01-15"
  historical_data:
    retention: 24months
```

---

## 三、NLP→YAML策略编译Pipeline

### 3.1 自然语言→策略参数映射表

| 用户输入(自然语言) | 映射策略ID | 核心参数 |
|-------------------|----------|---------|
| "削峰填谷, 谷电充电, 峰电放电" | Mode-A | peak_periods, valley_periods |
| "不允许向电网反送电" | Mode-B | reverse_power_limit=0 |
| "反送不超过变压器容量5%" | Mode-B | reverse_power_limit=5% |
| "每月需量不得超过800kVA" | Mode-C | demand_limit=800 |
| "变压器负载率不超过80%" | Mode-C | transformer_limit=80% |
| "SOC保持在20%到90%" | Layer1-SOC | soc_min=20, soc_max=90 |
| "应急备电, 平时SOC不低于50%" | Mode-E | soc_reserve=50 |
| "光伏尽量自发自用" | Mode-D | pv_self_consume=true |
| "电价低时多充电" | Mode-A | valley_charge=true |
| "消防报警后立即全部停机" | Layer0-FSS | fss_shutdown=immediate |
| "电池温度超过45度降功率一半" | Layer1-TEMP | temp_derate: 45°C@50% |
| "电池温度超过55度停机" | Layer0-TEMP | temp_shutdown: 55°C |

### 3.2 策略匹配决策树

```
输入: 用户自然语言描述
  │
  ├── 包含"反送/逆流/倒送"等关键词?
  │   └── 是 → 启用Mode-B(防逆流), 提取反送功率限制值
  ├── 包含"需量/变压器负载率/容量费"等关键词?
  │   └── 是 → 启用Mode-C(需量管理), 提取限值
  ├── 包含"削峰/填谷/分时电价/谷电充"等关键词?
  │   └── 是 → 启用Mode-A(削峰填谷), 提取时段+电价
  ├── 包含"应急/备电/保电/关键负荷"等关键词?
  │   └── 是 → 启用Mode-E(应急备电), 提取SOC预留值
  ├── 包含"光伏消纳/自发自用"等关键词?
  │   └── 是 → 启用Mode-D(光伏消纳)
  ├── 包含"SOC/电池/截止/边界"等关键词?
  │   └── 是 → 设置Layer1-SOC保护边界
  └── 默认 → 推荐Mode-A(削峰填谷)作为基础策略
```

### 3.3 策略编译Pipeline(6阶段)

```yaml
compilation_pipeline:
  stages:
    - name: "parse_natural_language"
      description: "解析NLP策略描述 → 结构化意图"
    - name: "resolve_provincial_tou"
      description: "加载对应省份分时电价日历"
    - name: "generate_yaml_config"
      description: "生成结构化YAML配置"
    - name: "validate_schema"
      description: "YAML Schema校验(必填字段/值范围/省份识别)"
    - name: "compile_to_binary"
      description: "编译为EMS可执行格式"
    - name: "simulate_validation"
      description: "仿真验证策略有效性(年收益/循环次数/冲突率)"
```

---

## 四、3层控制架构

### 4.1 日级调度层(Day-Ahead Scheduling)

```yaml
day_ahead_scheduling:
  enabled: true
  execution_time: "00:00"
  inputs:
    tou_calendar: "provincial_electricity_price_library"
    weather_forecast:
      source: "weather_api"
      horizon_hours: 48
    load_forecast:
      method: "similar_day + correction"
    pv_forecast:
      method: "clear_sky_index × weather_correction"
  optimization_algorithm:
    method: "MILP"
    solver: "gurobi"
    objective: "maximize_daily_revenue"
    execution_time_limit_sec: 120
```

### 4.2 小时级调度层(Intra-Day Optimization)

```yaml
intraday_scheduling:
  enabled: true
  execution_cycle: "15min"
  rolling_optimization:
    horizon_hours: 4
    update_interval_min: 15
    replan_trigger:
      - "actual_load_vs_forecast deviation > 15%"
      - "pv_generation_vs_forecast deviation > 20%"
      - "grid_price_significant_change"
      - "equipment_status_change"
  fast_response:
    pv_overgeneration:
      detection_threshold_kw: 200
      response_action: "increase_charge_power"
      response_delay_sec: 30
    load_surge:
      detection_threshold_kw: 300
      response_action: "increase_discharge_power"
      response_delay_sec: 60
```

### 4.3 秒级控制层(Real-Time Control)

```yaml
real_time_control:
  enabled: true
  execution_cycle: "1sec"
  control_objectives:
    - objective: "track_dispatch_command"
      tolerance_kw: 50
      tolerance_sec: 5
    - objective: "maintain_grid_frequency"
      target_hz: 50.0
      droop_slope: 0.04
      activation_threshold_hz: ±0.1
    - objective: "prevent_islanding"
```

---

## 五、削峰填谷策略

### 5.1 策略逻辑

```
算法核心:
  P_pcs(t) = f( SOC(t), P_load(t), P_pv(t), TimeSlot(t), Price(t) )

运行时序:
  1. 判断当前时段(峰/平/谷/尖峰)
  2. 计算净负荷: P_net = P_load - P_pv
  3. 根据SOC和时段决定PCS功率:
     - 谷时段+SOC<充电上限 → P_pcs = +P_charge
     - 峰时段+SOC>放电下限 → P_pcs = -P_discharge
     - 尖峰时段+SOC>放电下限 → P_pcs = -P_discharge(优先)
  4. 约束检查(防逆流/需量/SOC)
  5. 下发PCS功率指令
```

### 5.2 削峰填谷算法(伪代码)

```python
def peak_shaving_algorithm(soc, p_load, p_pv, timeslot, config):
    p_net = p_load - p_pv
    if not soc_check(soc, config.soc_min, config.soc_max):
        return 0
    p_pcs = 0
    if timeslot == "valley":
        if soc < config.charge.soc_target:
            p_pcs = +config.charge.power_ratio * PCS_CHARGE_MAX
    elif timeslot == "peak":
        if soc > config.discharge.soc_target:
            if config.discharge.method == "load_following":
                p_pcs = -min(max(p_net, 0), config.discharge.max_discharge_kw)
            else:
                p_pcs = -config.discharge.power_ratio * PCS_DISCHARGE_MAX
    p_pcs = apply_constraints(p_pcs, soc, p_net, config)
    return p_pcs
```

### 5.3 策略配置模板

```yaml
peak_shaving_valley_filling:
  enabled: true
  priority: 1
  target_soc:
    normal: {upper: 0.95, lower: 0.20}
    peak_boost: {upper: 0.90, trigger_ahead_min: 60}
  schedulable_windows:
    charge_window:
      - {start: "00:00", end: "07:59", allowed: true}
      - {start: "23:00", end: "23:59", allowed: true}
    discharge_window:
      - {start: "08:00", end: "22:59", allowed: true}
  power_limits:
    charge_power: {normal: 1000.0, min_power: 100.0}
    discharge_power: {normal: 1000.0, min_power: 100.0}
  revenue_calculation:
    pcs_round_trip_efficiency: 0.96
    battery_cycle_cost: 0.15  # 元/Ah
    auxiliary_power: 30.0      # kW
  optimization:
    primary_goal: "maximize_revenue"
    secondary_goals:
      - "minimize_battery_degradation"
      - "maintain_emergency_reserve"
```

---

## 六、防逆流策略

### 6.1 控制原理

```
目标: 确保PCC处不向电网反送功率

检测PCC功率: P_pcc = P_load - P_pv - P_pcs(放电方向)
当检测到 P_pcc < 0 时:
  方案1: 降低PCS放电功率
  方案2: 增加PCS充电功率(消纳光伏余电)
  方案3: 如储能已满, 降低光伏发电(限功率)
```

### 6.2 参数配置

```yaml
strategy_anti_reverse:
  enabled: true
  priority: "critical"
  reverse_power_limit_kw: 0
  safety_margin_kw: 5
  meter_device: "meter_pcc"
  meter_sample_interval_ms: 200
  response:
    mode: "pcs_priority"
    pcs_response_time_ms: 500
    deadband_kw: 1
  control_stages:
    - {level: 1, threshold_kw: -5, action: "reduce_pcs_discharge", ramp: 10, timeout: 3}
    - {level: 2, threshold_kw: -10, action: "charge_bess", ramp: 20, timeout: 1}
    - {level: 3, threshold_kw: -20, action: "curtail_pv", ramp: 50, timeout: 0.5}
    - {level: 4, threshold_kw: -50, action: "trip_pcc"}
  failsafe:
    comm_loss_action: "stop_pcs"
```

### 6.3 与削峰填谷的协调

```
冲突: 峰时段放电时, 如果光伏大+负荷小, 可能导致反送
协调方案:
  1. 优先级: 防逆流 > 削峰填谷
  2. 先用削峰填谷计算P_pcs_ideal
  3. 计算预期PCC净功率P_pcc_expected
  4. 如果P_pcc_expected < -reverse_limit:
     → 修正P_pcs = max(P_pcs_ideal, -(P_pv-P_load+reverse_limit+margin))
```

---

## 七、需量控制策略

### 7.1 策略逻辑

```
策略目标: 控制用户侧从电网的最大需量不超过合同约定值
需量定义: 15分钟滑动窗口平均功率最大值

控制原理:
  实时监测PCC流入功率的滑动窗口平均值
  当预测值接近需量限值时, 启动储能放电降低电网取电功率
```

### 7.2 参数配置

```yaml
strategy_demand_management:
  enabled: true
  demand_limit_kva: 800
  control_limit_kva: 750     # 控制目标(留50kVA裕量)
  demand_window_min: 15
  prediction:
    method: "sliding_average"
    window_seconds: 900       # 15分钟滑动窗口
    lookahead_seconds: 120
  control:
    trigger_threshold_pct: 90
    target_demand_kva: 700
    hysteresis_kva: 20
    pv_curtail_if_needed: true
  transformer:
    max_load_ratio: 0.80
    alarm_ratio: 0.75
```

### 7.3 需量控制算法

```python
def demand_control(soc, p_load_history, p_pv, p_pcs_current, config):
    current_demand = np.mean(p_load_history[-900:])
    trend = np.polyfit(range(120), p_load_history[-120:], 1)[0]
    predicted_demand = current_demand + trend * config.prediction.lookahead_seconds
    limit = config.control_limit_kva
    trigger = limit * config.control.trigger_threshold_pct / 100
    if predicted_demand < trigger - config.control.hysteresis_kva:
        return None
    excess = predicted_demand - config.control.target_demand_kva
    p_discharge_needed = min(excess, config.control.pcs_max_discharge_kw)
    if soc < config.soc_min_discharge:
        p_discharge_needed = 0
    return -p_discharge_needed
```

---

## 八、SOC管理与温度校正策略

### 8.1 SOC边界分类

| 层级 | 上限 | 下限 | 说明 |
|------|------|------|------|
| 保护层(硬边界) | 100% | 0% | BMS自动停机 |
| 运行层(软边界) | 95% | 10% | EMS控制范围 |
| 优化层 | 90% | 20% | 日常调度推荐 |

### 8.2 不同电池化学的SOC阈值

| 参数 | LFP(磷酸铁锂) | NMC(三元锂) | LTO(钛酸锂) |
|------|------------|-----------|-----------|
| 正常工作SOC范围 | 10%~95% | 15%~90% | 5%~95% |
| 推荐SOC范围 | 20%~90% | 20%~85% | 10%~90% |
| 过充保护阈值 | 3.65V | 4.25V | 2.85V |
| 过放保护阈值 | 2.50V | 3.00V | 1.50V |
| 充电温度范围 | 0°C~55°C | 0°C~45°C | -30°C~55°C |
| 放电温度范围 | -20°C~60°C | -20°C~60°C | -40°C~65°C |

### 8.3 温度校正/降额策略

```yaml
temperature_correction:
  charge_temperature_correction:
    # 充电功率温度降额(LFP)
    - {temp_c: 45, charge_power_ratio: 1.0}
    - {temp_c: 48, charge_power_ratio: 0.75}
    - {temp_c: 50, charge_power_ratio: 0.50}
    - {temp_c: 53, charge_power_ratio: 0.25}
    - {temp_c: 55, charge_power_ratio: 0.0}   # 停止充电

  discharge_temperature_correction:
    # 放电功率温度降额(LFP)
    - {temp_c: 50, discharge_power_ratio: 1.0}
    - {temp_c: 53, discharge_power_ratio: 0.7}
    - {temp_c: 55, discharge_power_ratio: 0.4}
    - {temp_c: 60, discharge_power_ratio: 0.0}  # 停止放电

  low_temperature_charge_limit:
    # 低温充电限制(LFP析锂保护)
    - {temp_c: 0, max_charge_current_ratio: 0.0}   # 禁止充电
    - {temp_c: 5, max_charge_current_ratio: 0.1}   # 0.1C充电
    - {temp_c: 10, max_charge_current_ratio: 0.3}  # 0.3C充电
    - {temp_c: 15, max_charge_current_ratio: 0.5}  # 0.5C充电
    - {temp_c: 20, max_charge_current_ratio: 1.0}  # 正常充电
```

### 8.4 SOC日历管理

```yaml
calendar_soc:
  enabled: true
  targets:
    - {time: "07:00", soc_target: 90}   # 峰电开始前充满
    - {time: "09:00", soc_target: 80}   # 峰电放电中
    - {time: "12:00", soc_target: 40}   # 午间峰谷间隙
    - {time: "17:00", soc_target: 90}   # 晚峰开始前充满
    - {time: "22:00", soc_target: 30}   # 峰电结束
    - {time: "23:00", soc_target: 30}   # 谷电充电开始
  reserve:
    emergency_soc_pct: 20
    black_start_soc_pct: 25
```

### 8.5 SOC估计与校准

```yaml
soc_estimation:
  methods:
    - name: "coulomb_counting"
      formula: "SOC(t) = SOC(0) + ∫(I×η)/C_rated dt"
    - name: "ocv_lookup"
      trigger_condition: "current < 0.05C 持续 30min"
    - name: "ekf"
      description: "扩展卡尔曼滤波(融合安时积分+OCV)"

  calibration:
    trigger_method: "ocv_lookup"
    calibration_points: [{soc: 20}, {soc: 50}, {soc: 80}]
    max_soc_drift_pct: 5
```

---

## 九、充电桩限功率策略

### 9.1 触发条件

```
触发条件(任一满足即触发):
  1. 变压器负载率 > 80%
  2. 当前需量 > 需量限值的90%
  3. 电网限电指令(调度/需量预案)
  4. 储能SOC < 30%(无法补充功率缺口)
  5. 光伏发电不足(阴雨天)
```

### 9.2 参数配置

```yaml
strategy_ev_power_limit:
  enabled: true
  triggers:
    transformer_overload: {enabled: true, max_load_ratio: 0.80}
    demand_approaching: {enabled: true, threshold_pct: 90}
    bess_soc_low: {enabled: true, soc_threshold_pct: 30}
  limiting:
    strategy: "proportional"    # proportional/priority/queue
    proportional:
      min_power_per_charger_kw: 20
      reduction_ratio: [0.8, 0.5, 0.3]
  recovery:
    hysteresis_minutes: 5
    ramp_up_rate_kw_per_s: 5
```

### 9.3 充电桩功率分配算法

```python
def ev_power_allocation(p_transformer_available, p_pv, p_bess_discharge, ev_chargers, config):
    p_total_available = p_transformer_available + p_pv + min(p_bess_discharge, 0)
    p_ev_total_requested = sum(c["requested_power"] for c in ev_chargers if c["in_use"])
    if p_ev_total_requested <= p_total_available:
        return {c["id"]: c["requested_power"] for c in ev_chargers}
    if config.limiting.strategy == "proportional":
        ratio = p_total_available / p_ev_total_requested
        allocation = {}
        for c in ev_chargers:
            allocated = max(c["requested_power"] * ratio, 0)
            if allocated < config.limiting.proportional.min_power_per_charger_kw:
                allocated = 0
            allocation[c["id"]] = allocated
    elif config.limiting.strategy == "priority":
        sorted_chargers = sorted(ev_chargers, key=lambda x: x["priority"])
        remaining = p_total_available
        allocation = {}
        for c in sorted_chargers:
            allocated = min(c["requested_power"], remaining)
            allocation[c["id"]] = allocated
            remaining -= allocated
    return allocation
```

---

## 十、光伏消纳最大化策略

### 10.1 能量流动优先级

```
1. 光伏 → 负荷 (直接供给, 无转换损耗)
2. 光伏 → 储能 (消纳余电, DC耦合效率高)
3. 储能 → 负荷 (光伏不足时释放)
4. 光伏 → 电网 (仅当储能满且允许反送)
5. 电网 → 负荷 (光伏+储能不足)
```

### 10.2 参数配置

```yaml
strategy_pv_self_consumption:
  enabled: true
  self_consumption:
    target_rate_pct: 95
    priority_sequence:
      - "direct_load"
      - "charge_bess"
      - "heat_water"
      - "export_grid"
  curtailment:
    method: "soc_based"
    trigger_soc: 95
    curtail_mode: "soft"
    ramp_rate_pct_per_s: 1
    min_pv_operation_pct: 10
  bess_priority_charge:
    enabled: true
    charge_soc_target: 95
  pv_forecast:
    enabled: true
    method: "weather_based"
    update_interval_min: 15
    cloud_cover_adjust: true
```

---

## 十一、应急备电策略

### 11.1 策略逻辑

```
策略目标: 电网故障/计划停电时, 以储能作为应急电源, 保障关键负荷供电

适用范围:
  - 电网突然停电(非计划)
  - 计划停电检修
  - 限电拉闸(调度指令)
  - 自然灾害预警
```

### 11.2 参数配置

```yaml
strategy_emergency_backup:
  enabled: true
  priority: 0                   # 最高优先级
  trigger:
    grid_outage:
      auto_detect: true
      voltage_threshold_pct: 60
      frequency_threshold_hz: 2.0
      detection_time_ms: 1000
  backup:
    soc_reserve_min_pct: 50
    critical_loads_kw: 100
    max_backup_duration_h: 4
    load_shedding:
      enabled: true
      stages:
        - {level: 1, loads: ["security","fire_alarm","comm_rack"], power_kw: 5, priority: "critical"}
        - {level: 2, loads: ["emergency_lighting","control_power"], power_kw: 10, priority: "high"}
        - {level: 3, loads: ["production_critical"], power_kw: 50, priority: "medium"}
        - {level: 4, loads: ["hvac","general_lighting"], power_kw: 35, priority: "low"}
    diesel_integration:
      enabled: false
      auto_start_after_s: 60
  recovery:
    grid_restored:
      auto_resync: false
      manual_confirm: true
```

### 11.3 应急放电持续时间估算

```
可用放电时间 T(h) = (SOC_current - SOC_min) × BESS_Capacity(kWh) / P_critical_load(kW)

例: BESS=2000kWh, SOC_current=80%, SOC_min=10%, P_critical=100kW
→ T = (80%-10%) × 2000 / 100 = 14小时
```

---

## 十二、电力现货/辅助服务策略

### 12.1 日前调度优化模型

```
目标函数(最大化日收益):
  Max Σ[ P_discharge(t)×Price(t) - P_charge(t)×Price(t) - Degradation(t) ]

约束条件:
  SOC_min ≤ SOC(t) ≤ SOC_max
  -P_discharge_max ≤ P_pcs(t) ≤ P_charge_max
  SOC(t+1) = SOC(t) + (η_charge×P_charge - P_discharge/η_discharge)×Δt/E_cap
  P_grid(t) + P_pv(t) - P_load(t) - P_charge(t) + P_discharge(t) = 0
```

### 12.2 调频辅助服务

```yaml
frequency_regulation:
  enabled: false
  regulation_range_kw: 200
  droop_coefficient: 0.04
  regulation_deadband_hz: 0.033
  soc_operating_range: [30, 80]
```

---

## 十三、多策略融合与冲突消解矩阵

### 13.1 策略优先级表

| 优先级 | 策略 | 说明 |
|-------|------|------|
| 0 | 安全保护(消防/ESD/防孤岛/电网异常) | 不可覆盖 |
| 1 | 应急备电(Mode-E) | 安全保障 |
| 2 | 防逆流(Mode-B) | 合同/政策约束 |
| 3 | 需量控制(Mode-C) | 经济性约束 |
| 4 | 削峰填谷(Mode-A) | 经济运行 |
| 5 | 光伏消纳最大化(Mode-D) | |
| 6 | 充电桩限功率(Layer 3) | |
| 7 | 电力现货/辅助服务(Mode-F) | |

### 13.2 冲突消解示例

**场景1: 削峰填谷(放电) vs 防逆流**
```
当前: 峰时段, 光伏很大, 负荷很小
Mode-A提议: PCS放电500kW
Mode-B检测: 放电会导致反送200kW
消解: Mode-B优先级>Mode-A, PCS降功率至300kW
→ P_final = -300kW
```

**场景2: 需量控制(放电) vs SOC保护**
```
当前: 需量接近上限, SOC=15%
Mode-C提议: PCS放电200kW
Layer1-SOC: SOC<20%, 降低放电功率50%
消解: Layer1约束层优先, PCS放电100kW
→ P_final = -100kW
```

**场景3: 应急备电 vs 削峰填谷**
```
当前: 电网停电
Mode-E: PCS放电给关键负荷100kW
Mode-A: (峰时段放500kW—已无关)
消解: Mode-E优先级>Mode-A
→ P_final = -100kW (仅关键负荷)
```

### 13.3 策略融合配置

```yaml
strategy_fusion:
  enabled: true
  conflict_resolution:
    algorithm: "priority_based_with_smoothing"
    rules:
      - scenario: "peak_hour + demand_threshold_exceeded"
        decision: "demand_control overrides peak_shaving_charge"
      - scenario: "valley_hour + emergency_reserve_below"
        decision: "emergency_charge overrides peak_shaving_discharge"
      - scenario: "concurrent_discharge_from_multiple_strategies"
        decision: "sum capped at battery_power_kw × 1.0, 按优先级分配"
    smoothing:
      enabled: true
      mode: "ramp_rate_limiting"
      max_charge_ramp_kw_per_min: 200
      max_discharge_ramp_kw_per_min: 200
  weights:
    optimization_weights:
      peak_valley_revenue: 0.50
      demand_savings: 0.20
      battery_longevity: 0.20
      grid_stability: 0.10
  real_time_decision:
    execution_cycle_sec: 5
    decision_tree:
      - level: 1
        check: "grid_available?"
        yes: "continue_normal_strategy"
        no: "trigger_islanding_sequence"
      - level: 2
        check: "soc >= emergency_reserve?"
        no: "stop_all_discharge, start_charge"
      - level: 3
        check: "demand_exceeds_threshold?"
        yes: "trigger_demand_control"
      - level: 4
        check: "current_price_tier == peak?"
        yes: "execute_discharge_if_soc_sufficient"
```

---

## 十四、策略参数边界与安全约束总表

### 14.1 全局安全约束(不可覆盖)

```yaml
safety_constraints:
  pcs:
    frequency_max_hz: 50.5
    frequency_min_hz: 49.5
  battery:
    soc_max_charge: 95.0
    soc_min_discharge: 5.0
    cell_voltage_max_mv: 3650   # LFP
    cell_voltage_min_mv: 2500
    cell_temp_max_c: 55.0
    cell_temp_min_c: -20.0
    charge_temp_min_c: 0.0
    temp_derate_start_c: 45.0
    insulation_min_kohm_per_v: 0.5
  transformer:
    max_load_ratio: 1.0
    overload_10min_ratio: 1.2
  grid:
    anti_islanding_enabled: true
    anti_islanding_timeout_s: 2.0
    lvrt_enabled: true
    hvrt_enabled: true
```

### 14.2 策略参数边界

| 参数 | 最小值 | 默认值 | 最大值 | 单位 |
|------|-------|-------|-------|------|
| soc_max_charge | 80 | 95 | 100 | % |
| soc_min_discharge | 0 | 10 | 50 | % |
| charge_power_ratio | 0.1 | 1.0 | 1.0 | — |
| reverse_power_limit_kw | 0 | 0 | 500 | kW |
| demand_limit_kva | 0 | — | 5000 | kVA |
| transformer_max_load_pct | 50 | 80 | 100 | % |
| temp_derate_start_c | 30 | 45 | 55 | °C |
| temp_shutdown_c | 40 | 55 | 65 | °C |
| emergency_soc_reserve | 5 | 20 | 80 | % |
| black_start_soc_min | 10 | 25 | 50 | % |

---

## 十五、完整YAML/JSON配置模板

### 15.1 完整策略配置文件(精简版)

```yaml
config_version: "1.0"
site_id: "station-shanghai-001"

safety:
  soc: {hard_max: 100.0, hard_min: 0.0, charge_max: 95.0, discharge_min: 5.0}
  cell_voltage: {max_mv: 3650, min_mv: 2500}
  temperature: {max_c: 55.0, min_discharge_c: -20.0, min_charge_c: 0.0, derate_start_c: 45.0}
  transformer: {max_load_ratio: 1.0, capacity_kva: 1250}
  anti_islanding: {enabled: true, timeout_s: 2.0}
  fire_safety: {hardwire_shutdown: true}

system:
  rated_pcs_power_kw: 630
  bess_capacity_kwh: 2500
  pv_capacity_kwp: 500
  transformer_capacity_kva: 1250

soc_management:
  enabled: true
  chemistry: "LFP"
  operating_range: {max_pct: 90.0, min_pct: 20.0}
  calendar_targets:
    - {time: "07:00", soc: 90}
    - {time: "12:00", soc: 50}
    - {time: "17:00", soc: 90}
    - {time: "22:00", soc: 30}
  emergency_reserve: {soc_pct: 20, black_start_soc_pct: 25}

peak_shaving:
  enabled: true
  priority: 4
  charge: {power_ratio: 1.0, soc_target: 95.0}
  discharge: {power_ratio: 1.0, soc_target: 15.0, method: "constant_power"}

anti_reverse:
  enabled: true
  priority: 2
  reverse_power_limit_kw: 0
  safety_margin_kw: 5

demand_management:
  enabled: true
  priority: 3
  demand_limit_kva: 800
  control_limit_kva: 750

emergency_backup:
  enabled: true
  priority: 1
  soc_reserve_min_pct: 20
  critical_loads_kw: 100
  auto_resync: false

communication:
  bms_heartbeat_timeout_s: 5
  pcs_heartbeat_timeout_s: 3
  meter_heartbeat_timeout_s: 3
  on_communication_loss:
    bms: "emergency_stop"
    pcs: "set_power_zero"
    meter: "stop_charging"
```

### 15.2 JSON格式(API对接)

```json
{
  "config_version": "1.0",
  "site_id": "station-shanghai-001",
  "safety": {
    "soc": {"charge_max": 95.0, "discharge_min": 5.0},
    "temperature": {"max_c": 55.0, "derate_start_c": 45.0}
  },
  "strategies": {
    "peak_shaving": {"enabled": true, "priority": 4},
    "anti_reverse": {"enabled": true, "priority": 2},
    "demand_management": {"enabled": true, "priority": 3},
    "emergency_backup": {"enabled": true, "priority": 1}
  }
}
```

---

## 十六、策略验证与仿真检查清单

### 16.1 策略静态检查(设计审查)

```
□ 1.  所有策略的enable/disable状态是否与需求一致?
□ 2.  SOC保护边界是否在电池化学允许范围内?
□ 3.  温度保护阈值是否合理?
□ 4.  PCS功率限幅是否在设备额定范围内?
□ 5.  变压器容量约束是否已配置?
□ 6.  防逆流限制值是否与合同一致?
□ 7.  需量限制值是否与供电合同一致?
□ 8.  策略优先级设置是否合理?
□ 9.  通信故障后的故障安全策略是否已定义?
□ 10. 峰谷时段设置是否与当地电价一致?
□ 11. 弃光策略的SOC阈值是否合理?
□ 12. 策略参数是否都在有效范围内?
```

### 16.2 策略动态检查(仿真/测试)

```
□ 13. 正常工作日24h仿真: SOC是否在设定范围内?
□ 14. 光伏0出力场景: 储能是否能从谷电充电?
□ 15. 光伏满发场景: 防逆流是否能控制?
□ 16. 负荷尖峰场景: 需量控制是否触发?
□ 17. 电网失电场景: 是否转入应急模式?
□ 18. 通信中断场景: PCS是否安全停机?
□ 19. SOC接近下限场景: 是否停止放电?
□ 20. 多策略同时触发: 融合后的功率是否合理?
```

---

## 十七、常见策略设计错误

### 17.1 参数类错误

| 错误 | 后果 | 纠正 |
|------|------|------|
| SOC充电上限=100%, 无降额 | 电池过充, 缩短寿命 | 设置90-95%, ≥90%降功率 |
| SOC放电下限=0% | 电池过放, 永久损坏 | 设置10-15%硬下限 |
| 防逆流限值=0但margin=0 | 瞬时波动超调→频繁触发 | 设margin≥5kW |
| 需量控制没有回滞 | 频繁启停PCS | 设回滞≥20kVA |
| 温度保护仅设停机、无降额 | 频繁停机影响生产 | 先45°C降额50%, 55°C停机 |
| 峰谷时段照搬标准、未核对当地 | 套利计算错误 | 必须按当地最新电价文件设置 |
| 应急SOC预留过大(>80%) | 储能大部分时间不可用 | 预留20-30%即可 |

### 17.2 逻辑类错误

| 错误 | 后果 | 纠正 |
|------|------|------|
| 防逆流与削峰填谷同时全功率放电 | 必然反送 | 防逆流优先级>削峰填谷 |
| 应急备电SOC与其他策略冲突 | 紧急时储能不足 | 应急备电最高优先级 |
| 充电桩不限功率+变压器过载 | 变压器跳闸 | 变压器负载率触发限功率 |
| PCS通信中断不间断运行 | 失控 | 通信中断→安全停机 |
| 策略切换无斜率限制 | 功率冲击 | 所有切换加ramp_rate限制 |

---

*版本:v1.0*
*适用范围:工商业储能/光储充/微电网EMS策略设计与部署*
*数据来源:各省发改委/电网公司官方网站公开发布数据(2024-2025)*
