---
name: glm-ems-strategy-v2
description: >
  EMS策略编译专业Skill v2.0（可执行版）。比v1.0更深入和可执行，包含4层执行架构、
  完整YAML配置模板、Python可执行伪代码、Modbus控制字定义、SOC按化学类型管理、
  并离网状态机、PLC梯形图逻辑、衰减模型、三重保障防逆流、需量控制15分钟滑动窗口、
  充电桩OCPP命令、光伏消纳策略、应急备电负荷分级、完整策略配置YAML模板、
  离线/在线仿真验证、常见错误纠正。适用场景：工商业储能、光储充一体、微电网EMS策略
  设计与部署。所有参数可直接加载到EMS系统执行。
---

# EMS策略编译专业Skill v2.0（可执行版）

## 目录

- [一、策略执行架构](#一策略执行架构)
- [二、削峰填谷策略](#二削峰填谷策略完整可执行配置)
- [三、防逆流策略](#三防逆流策略三重保障实现)
- [四、需量控制策略](#四需量控制策略)
- [五、SOC管理策略](#五soc管理策略按化学类型)
- [六、并离网切换策略](#六并离网切换策略完整状态机)
- [七、充电桩限功率策略](#七充电桩限功率策略)
- [八、光伏消纳最大化策略](#八光伏消纳最大化策略)
- [九、应急备电策略](#九应急备电策略)
- [十、完整策略配置YAML模板](#十完整策略配置yaml模板)
- [十一、策略验证与仿真](#十一策略验证与仿真)
- [十二、常见策略设计错误与纠正](#十二常见策略设计错误与纠正)

---

## 一、策略执行架构

### 1.1 四层执行架构

```
┌───────────────────────────────────────────────────────────────────┐
│ Layer 0: 硬件保护层 (P0, 最高优先级, 固件级, 不可被任何上层覆盖)    │
│   ├── BMS固件级保护 (电芯电压/温度/均衡, 响应<1ms)                 │
│   ├── PCS固件级保护 (过流/过压/过温/IGBT保护, 响应<1ms)            │
│   ├── 消防硬接线停机 (FSS→PCS E-Stop, 继电器直连, 响应<50ms)       │
│   ├── ESD紧急停机 (急停按钮→硬触点断开, 响应<10ms)                │
│   ├── 孤岛保护继电器 (防孤岛检测, 响应<100ms)                      │
│   └── 逆流继电器 (PCC反向功率检测, 响应<100ms)                     │
├───────────────────────────────────────────────────────────────────┤
│ Layer 1: 安全约束层 (P1, 毫秒级, 不可被Layer2/3覆盖)               │
│   ├── SOC保护边界 (充电截止/放电截止/过充保护/过放保护)             │
│   ├── 功率限幅 (PCS额定功率/SOC功率曲线/用户设定上限)              │
│   ├── 温度降额 (电池温度→可用功率映射, T>45℃开始降额)             │
│   ├── 频率约束 (并网:49.5~50.2Hz / 离网:V/f建压50Hz±0.5Hz)       │
│   └── 通信异常保护 (BMS/PCS/Meter通信中断→安全停机, 超时500ms)    │
├───────────────────────────────────────────────────────────────────┤
│ Layer 2: 运行模式层 (P2, 秒级, 互斥单选, 同一时刻仅一个模式生效)   │
│   ├── Mode-A: 削峰填谷 (Peak Shaving & Valley Filling)             │
│   ├── Mode-B: 防逆流 (Anti-Reverse Power Flow)                    │
│   ├── Mode-C: 需量管理 (Demand Charge Management)                  │
│   ├── Mode-D: 光伏消纳最大化 (PV Self-Consumption Max)             │
│   ├── Mode-E: 应急备电 (Emergency Backup, V/f源)                   │
│   ├── Mode-F: 电力现货/辅助服务 (Spot Market / Ancillary)          │
│   └── Mode-G: 自定义调度 (Custom Schedule)                         │
├───────────────────────────────────────────────────────────────────┤
│ Layer 3: 策略叠加层 (P3, 5秒级, 可叠加多个辅助策略)                │
│   ├── 充电桩智能限功率 (EV Smart Charging Limit)                    │
│   ├── 变压器负载率管理 (Transformer Loading Control)                │
│   ├── 需量预测矫正 (Demand Forecast Correction)                     │
│   ├── 参与频率调节 (Frequency Regulation, Δf响应)                   │
│   └── 功率平滑 (Power Smoothing, 抑制光伏波动)                     │
└───────────────────────────────────────────────────────────────────┘
```

### 1.2 执行周期与响应时间

```
层级       | 计算周期     | 指令下发周期 | 响应时间要求  | 执行实体
───────────┼─────────────┼─────────────┼──────────────┼────────────
Layer0     | 硬件中断     | <1ms        | <1ms         │ BMS/PCS固件
Layer1     | 100ms       | 100ms       | ≤200ms       │ EMS安全线程
Layer2     | 1s          | 1s          | ≤1s          │ EMS策略线程
Layer3     | 5s          | 5s          | ≤5s          │ EMS优化线程
```

### 1.3 冲突消解规则

```
优先级规则: P0 > P1 > P2 > P3

叠加速率限制:
  - 功率变化率 ≤ 10% × P_pcs_rated / min (防止PCS频繁调节)
  - 例: P_pcs_rated=500kW → 叠加速率 ≤ 50kW/min
  - 紧急模式下可放宽至 30% × P_pcs_rated / min

同层互斥规则:
  - Layer2内模式互斥, 同一时刻仅一个Mode生效
  - 模式切换必须有过渡态(STANDBY), 持续≥1s
  - Layer3内策略可叠加, 但叠加后总功率不超过PCS额定

功率限幅兜底:
  - P_pcs_command = clamp(P_pcs_calculated, -P_pcs_rated, +P_pcs_rated)
  - 叠加后功率: P_total = min(ΣP_layer3, P_pcs_rated - P_layer2)
```

### 1.4 层级间数据流

```python
def ems_execution_loop():
    while True:
        t_start = time.now()

        # Layer0: 硬件保护 (BMS/PCS固件自主执行, EMS仅读取状态)
        bms_status = read_bms_registers()
        pcs_status = read_pcs_registers()
        if bms_status.fault_level >= 3 or pcs_status.fault_level >= 3:
            emergency_shutdown()  # 硬件级急停, 不可被覆盖
            continue

        # Layer1: 安全约束 (100ms周期)
        soc = bms_status.soc
        temp = bms_status.max_cell_temp
        p_pcs_max_allowed = apply_soc_power_curve(soc)      # SOC-功率曲线限幅
        p_pcs_max_allowed = apply_temp_derating(temp, p_pcs_max_allowed)  # 温度降额
        p_pcs_max_allowed = apply_power_limit(p_pcs_max_allowed)  # 用户设定限幅

        # Layer2: 运行模式 (1s周期)
        current_mode = get_current_mode()
        p_pcs_mode = execute_mode(current_mode, soc, p_load, p_pv, p_pcc)

        # Layer3: 策略叠加 (5s周期)
        p_pcs_overlays = []
        for overlay in active_overlays:
            p_overlay = execute_overlay(overlay, soc, p_load, p_pv)
            p_pcs_overlays.append(p_overlay)
        p_pcs_overlay_sum = sum(p_pcs_overlays)
        p_pcs_overlay_sum = min(p_pcs_overlay_sum, p_pcs_max_allowed - abs(p_pcs_mode))

        # 合成最终指令
        p_pcs_final = p_pcs_mode + p_pcs_overlay_sum
        p_pcs_final = clamp(p_pcs_final, -p_pcs_max_allowed, +p_pcs_max_allowed)

        # 速率限制
        p_pcs_final = apply_ramp_rate(p_pcs_final, last_p_pcs_command, ramp_rate=0.10)

        # 下发PCS
        write_pcs_power_command(p_pcs_final)
        last_p_pcs_command = p_pcs_final

        # 周期控制
        elapsed = time.now() - t_start
        sleep(max(0, CYCLE_TIME - elapsed))
```

---

## 二、削峰填谷策略（完整可执行配置）

### 2.1 策略目标与算法核心

```
策略目标: 在低电价时段(谷段/平段)充电, 在高电价时段(峰段)放电,
         获取电价差收益, 同时降低用户侧峰值负荷, 减少需量电费。

算法核心:
  P_pcs(t) = f( SOC(t), P_load(t), P_pv(t), TimeSlot(t), Price(t) )

收益计算:
  R_day = Σ [ P_discharge(t) × Δt × (C_peak - C_valley) ] - C_cycle_degradation
  C_cycle_degradation = (E_bess × C_bess) / N_cycle_life  # 每次循环衰减成本
```

### 2.2 完整YAML配置模板

```yaml
strategy_peak_shaving_v2:
  id: "peak_shaving_v2"
  enabled: true
  version: "2.0"
  mode: "time_based"                    # time_based(按时段) / prediction_based(按预测) / hybrid(混合)
  description: "削峰填谷策略v2.0, 含完整功率计算与衰减模型"

  # ==================== 时段配置 ====================
  time_periods:
    peak:                                # 峰时段: 电价最高, 储能放电
      - { start: "09:00", end: "12:00" }
      - { start: "14:00", end: "19:00" }
    flat:                                # 平时段: 电价中等, 一般不动作
      - { start: "07:00", end: "09:00" }
      - { start: "12:00", end: "14:00" }
      - { start: "19:00", end: "24:00" }
    valley:                              # 谷时段: 电价最低, 储能充电
      - { start: "00:00", end: "07:00" }
    # 尖峰(可选, 部分省份有尖峰电价)
    sharp_peak:
      enabled: false
      periods:
        - { start: "10:00", end: "11:00" }
        - { start: "19:00", end: "21:00" }

  # ==================== 电价配置 ====================
  electricity_price:
    peak: 1.20                           # 峰电价 (元/kWh)
    flat: 0.80                           # 平电价 (元/kWh)
    valley: 0.40                         # 谷电价 (元/kWh)
    sharp_peak: 1.50                     # 尖峰电价 (元/kWh), 可选
    demand_charge: 35.0                  # 需量电费 (元/kVA/月)
    demand_contract: 800                 # 报装容量 (kVA)
    # 谷充峰放套利价差
    arbitrage_spread: 0.80              # peak - valley = 1.20 - 0.40

  # ==================== 充电参数 ====================
  charge:
    power_ratio: 1.0                     # 充电功率系数 (0~1.0), 1.0=PCS满功率充电
    power_kw: null                       # null=用PCS最大充电功率; 填数值=限功率
    soc_target: 90                       # 谷电充电目标SOC (%), LFP典型90%, NMC典型85%
    method: "constant_power"             # constant_power / dynamic / pv_surplus_only
    min_soc_to_charge: 5                 # 低于此SOC强制充电 (%)
    # 充电功率计算公式:
    # P_charge = min(
    #   P_pcs_rated × power_ratio,           # PCS额定限幅
    #   P_transformer_margin,                 # 变压器余量
    #   (SOC_max - SOC_now) × E_bess / Δt    # SOC空间限制
    # )

  # ==================== 放电参数 ====================
  discharge:
    power_ratio: 1.0                     # 放电功率系数 (0~1.0)
    power_kw: null                       # null=用PCS最大放电功率; 填数值=限功率
    soc_target: 10                       # 放电截止SOC (%), LFP典型10%, NMC典型15%
    method: "constant_power"             # constant_power / peak_shaving / load_following
    discharge_only_peak: true            # 仅峰时段放电? false=平段也放
    discharge_flat_ratio: 0.5            # 平段放电功率系数 (0~1.0), 相对额定功率
    # 放电功率计算公式:
    # P_discharge = min(
    #   P_pcs_rated × power_ratio,           # PCS额定限幅
    #   (SOC_now - SOC_min) × E_bess / Δt,   # SOC能量限制
    #   P_load                                # 不超过当前负荷(防逆流)
    # )

  # ==================== 负荷跟随模式 ====================
  load_following:
    enabled: false                       # 启用负荷跟随放电
    target_load_kw: 0                    # 目标净负荷(kW), 0=完全自供
    max_discharge_kw: null               # 最大放电功率限制
    # 放电功率: P_discharge = min(P_net_load, max_discharge_kw)

  # ==================== 放电深度与衰减 ====================
  cycle_life:
    battery_chemistry: "LFP"             # LFP / NMC / Lead_Carbon
    # LFP: 3000 cycles @ 90% DOD, NMC: 1500 cycles @ 80% DOD
    # 衰减模型: Q_loss(n) = a × n^0.5 × exp(Ea / (R × T))
    #   a: 衰减系数 (LFP≈0.03, NMC≈0.05)
    #   n: 循环次数
    #   Ea: 活化能 (LFP≈20kJ/mol, NMC≈30kJ/mol)
    #   R: 气体常数 8.314 J/(mol·K)
    #   T: 绝对温度 (K)
    degradation_model:
      a: 0.03                            # 衰减系数
      Ea_kj_per_mol: 20                  # 活化能 (kJ/mol)
      R: 8.314                           # 气体常数 (J/(mol·K))
      reference_temp_c: 25               # 参考温度 (℃)
    cycle_cost_per_kwh: 0.05             # 每kWh循环衰减成本 (元/kWh)
    max_dod_pct:                         # 最大放电深度 (%)
      LFP: 90                            # LFP允许DOD=90%
      NMC: 85                            # NMC允许DOD=85%
      Lead_Carbon: 80                    # 铅碳允许DOD=80%
    cycle_life_at_dod:                   # 不同DOD下的循环寿命
      LFP:
        dod_90: 3000                     # 90% DOD: 3000次
        dod_80: 4500                     # 80% DOD: 4500次
        dod_70: 6000                     # 70% DOD: 6000次
      NMC:
        dod_80: 1500                     # 80% DOD: 1500次
        dod_70: 2500                     # 70% DOD: 2500次
        dod_60: 4000                     # 60% DOD: 4000次

  # ==================== 防逆流子约束 ====================
  anti_reverse:
    enabled: true                        # 削峰填谷模式内嵌防逆流
    limit_kw: 0                          # 0=完全禁止反送; >0=允许反送此功率
    margin_kw: 10                        # 安全裕量 (kW)

  # ==================== 变压器容量约束 ====================
  transformer_limit:
    enabled: true
    capacity_kva: 1250                   # 变压器额定容量 (kVA)
    max_loading_pct: 80                  # 最大允许负载率 (%)
    # 可用余量: P_margin = capacity_kva × max_loading_pct - P_load_current

  # ==================== 节假日调度 ====================
  holiday_schedule:
    enabled: false
    holiday_list: []                     # YYYY-MM-DD 列表
    holiday_mode: "off"                  # off(停机) / valley_all_day(全天谷) / keep(照常)

  # ==================== 系统参数(必填) ====================
  system:
    pcs_rated_power_kw: 500              # PCS额定功率 (kW)
    bess_capacity_kwh: 1000              # 储能额定容量 (kWh)
    bess_usable_capacity_kwh: 900        # 可用容量 = E_bess × DOD (kWh)
    transformer_capacity_kva: 1250       # 变压器容量 (kVA)
    pcc_capacity_kw: 1000                # PCC关口容量 (kW)
```

### 2.3 削峰填谷功率计算公式详解

```
充电功率计算:
  P_charge = min(
    P_pcs_rated × charge.power_ratio,                          # ①PCS额定限幅
    P_transformer_margin,                                       # ②变压器余量
    (SOC_max - SOC_now) × E_bess / Δt_charge                   # ③SOC空间限制
  )
  其中:
    P_transformer_margin = Transformer_capacity × max_loading% - P_load
    Δt_charge = 剩余谷时段时长 (用于计算能否充满)
    充电方向: P_pcs > 0 (正值=充电)

放电功率计算:
  P_discharge = min(
    P_pcs_rated × discharge.power_ratio,                        # ①PCS额定限幅
    (SOC_now - SOC_min) × E_bess / Δt_discharge,                # ②SOC能量限制
    P_load_current                                              # ③不超过负荷(防逆流)
  )
  放电方向: P_pcs < 0 (负值=放电)

放电深度:
  DOD = 1 - SOC_min
  LFP允许DOD = 90% (SOC_min = 10%)
  NMC允许DOD = 85% (SOC_min = 15%)
  铅碳允许DOD = 80% (SOC_min = 20%)

日收益估算:
  R_day = P_discharge_avg × Δt_discharge × (C_peak - C_valley) - E_cycle × C_degradation
  其中:
    E_cycle = P_discharge_avg × Δt_discharge (kWh, 每日循环电量)
    C_degradation = cycle_cost_per_kwh (元/kWh)
    年收益 = R_day × 365 × 可用天数比
```

### 2.4 衰减模型详解

```
衰减模型: Q_loss(n) = a × n^0.5 × exp(Ea / (R × T))

参数说明:
  Q_loss: 容量衰减率 (%)
  a: 衰减系数 (LFP≈0.03, NMC≈0.05, 铅碳≈0.08)
  n: 累计等效循环次数 (100% DOD为1次循环)
  Ea: 活化能 (LFP≈20kJ/mol, NMC≈30kJ/mol, 铅碳≈15kJ/mol)
  R: 气体常数 8.314 J/(mol·K)
  T: 电池绝对温度 (K) = T(℃) + 273.15

温度修正系数:
  K_temp = exp(Ea/R × (1/T_ref - 1/T_actual))
  T_ref = 298.15K (25℃)
  高温加速衰减: 45℃时K_temp≈2.0, 55℃时K_temp≈4.0

寿命终点: Q_loss达到20%时电池退役 (SOH=80%)

等效循环计算:
  n_equiv = Σ(E_daily_discharge / E_bess_rated)
  例: 每日放电500kWh, E_bess=1000kWh → 每日0.5等效循环

衰减成本:
  C_cycle_per_kwh = (C_bess_total × 0.2) / (N_cycle_life × E_bess × DOD)
  例: LFP 1000kWh系统, 投资150万, 3000cycles@90%DOD
      C_cycle = (1500000 × 0.2) / (3000 × 1000 × 0.9) = 0.111 元/kWh
```

### 2.5 Python伪代码实现（完整充放电决策逻辑）

```python
import math
from dataclasses import dataclass
from typing import Optional
from enum import Enum

class TimeSlot(Enum):
    VALLEY = "valley"
    FLAT = "flat"
    PEAK = "peak"
    SHARP_PEAK = "sharp_peak"

class BatteryChemistry(Enum):
    LFP = "LFP"
    NMC = "NMC"
    LEAD_CARBON = "Lead_Carbon"

@dataclass
class PeakShavingConfig:
    pcs_rated_power_kw: float = 500.0
    bess_capacity_kwh: float = 1000.0
    transformer_capacity_kva: float = 1250.0
    transformer_max_loading_pct: float = 80.0
    charge_soc_target: float = 90.0
    discharge_soc_target: float = 10.0
    charge_power_ratio: float = 1.0
    discharge_power_ratio: float = 1.0
    discharge_only_peak: bool = True
    discharge_flat_ratio: float = 0.5
    anti_reverse_enabled: bool = True
    anti_reverse_limit_kw: float = 0.0
    anti_reverse_margin_kw: float = 10.0
    chemistry: BatteryChemistry = BatteryChemistry.LFP
    cycle_cost_per_kwh: float = 0.05
    price_peak: float = 1.20
    price_valley: float = 0.40

def get_soc_limits(chemistry: BatteryChemistry) -> dict:
    soc_limits = {
        BatteryChemistry.LFP: {
            "soc_max_charge": 90, "soc_min_discharge": 10,
            "soc_overcharge_protect": 95, "soc_overdischarge_protect": 3,
            "soc_emergency_stop": 5, "max_dod": 90
        },
        BatteryChemistry.NMC: {
            "soc_max_charge": 85, "soc_min_discharge": 15,
            "soc_overcharge_protect": 90, "soc_overdischarge_protect": 5,
            "soc_emergency_stop": 8, "max_dod": 85
        },
        BatteryChemistry.LEAD_CARBON: {
            "soc_max_charge": 95, "soc_min_discharge": 20,
            "soc_overcharge_protect": 98, "soc_overdischarge_protect": 10,
            "soc_emergency_stop": 15, "max_dod": 80
        },
    }
    return soc_limits[chemistry]

def calculate_charge_power(
    soc: float,
    p_load: float,
    p_pv: float,
    config: PeakShavingConfig,
    remaining_valley_hours: float
) -> float:
    soc_limits = get_soc_limits(config.chemistry)
    soc_max = soc_limits["soc_max_charge"]
    if soc >= soc_max:
        return 0.0

    # ① PCS额定限幅
    p_pcs_limit = config.pcs_rated_power_kw * config.charge_power_ratio

    # ② 变压器余量
    p_transformer_max = config.transformer_capacity_kva * config.transformer_max_loading_pct / 100.0
    p_transformer_margin = p_transformer_max - p_load + p_pv  # 光伏可抵消部分负荷
    p_transformer_margin = max(p_transformer_margin, 0)

    # ③ SOC空间限制
    if remaining_valley_hours > 0:
        soc_space = (soc_max - soc) / 100.0
        p_soc_limit = soc_space * config.bess_capacity_kwh / remaining_valley_hours
    else:
        p_soc_limit = p_pcs_limit

    p_charge = min(p_pcs_limit, p_transformer_margin, p_soc_limit)
    return max(p_charge, 0.0)

def calculate_discharge_power(
    soc: float,
    p_load: float,
    p_pv: float,
    config: PeakShavingConfig,
    remaining_peak_hours: float
) -> float:
    soc_limits = get_soc_limits(config.chemistry)
    soc_min = soc_limits["soc_min_discharge"]
    if soc <= soc_min:
        return 0.0

    # ① PCS额定限幅
    p_pcs_limit = config.pcs_rated_power_kw * config.discharge_power_ratio

    # ② SOC能量限制
    if remaining_peak_hours > 0:
        soc_energy = (soc - soc_min) / 100.0
        p_soc_limit = soc_energy * config.bess_capacity_kwh / remaining_peak_hours
    else:
        p_soc_limit = p_pcs_limit

    # ③ 不超过当前负荷 (防逆流基本约束)
    p_load_net = p_load - p_pv
    p_load_limit = max(p_load_net, 0)

    p_discharge = min(p_pcs_limit, p_soc_limit, p_load_limit)
    return max(p_discharge, 0.0)

def peak_shaving_decision(
    soc: float,
    p_load: float,
    p_pv: float,
    timeslot: TimeSlot,
    config: PeakShavingConfig,
    remaining_hours: float = 4.0
) -> float:
    """
    削峰填谷决策函数
    返回: P_pcs (正值=充电, 负值=放电, 0=待机)
    """
    # SOC安全检查
    soc_limits = get_soc_limits(config.chemistry)
    if soc <= soc_limits["soc_emergency_stop"] or soc >= soc_limits["soc_overcharge_protect"]:
        return 0.0  # SOC越限, 不动作

    p_pcs = 0.0

    if timeslot == TimeSlot.VALLEY:
        # 谷时段: 充电
        if soc < config.charge_soc_target:
            p_pcs = calculate_charge_power(soc, p_load, p_pv, config, remaining_hours)

    elif timeslot == TimeSlot.PEAK or timeslot == TimeSlot.SHARP_PEAK:
        # 峰时段: 放电
        if soc > config.discharge_soc_target:
            p_pcs = -calculate_discharge_power(soc, p_load, p_pv, config, remaining_hours)

    elif timeslot == TimeSlot.FLAT:
        # 平时段: 可选放电
        if not config.discharge_only_peak and soc > config.discharge_soc_target:
            p_discharge = calculate_discharge_power(soc, p_load, p_pv, config, remaining_hours)
            p_pcs = -(p_discharge * config.discharge_flat_ratio)

    # 防逆流约束
    if config.anti_reverse_enabled:
        p_grid = p_load - p_pv - p_pcs  # p_pcs<0时储能放电, 电网功率减小
        if p_grid < -(config.anti_reverse_limit_kw + config.anti_reverse_margin_kw):
            # 即将逆流, 调整PCS功率
            p_pcs_max_allowed = p_load - p_pv + config.anti_reverse_limit_kw + config.anti_reverse_margin_kw
            p_pcs = max(p_pcs, -p_pcs_max_allowed)  # 放电方向取小
            p_pcs = min(p_pcs, p_pcs_max_allowed)   # 充电方向也限制

    # 最终限幅
    p_pcs = max(-config.pcs_rated_power_kw, min(config.pcs_rated_power_kw, p_pcs))

    return p_pcs

def calculate_daily_revenue(
    discharge_power_kw: float,
    discharge_hours: float,
    charge_power_kw: float,
    charge_hours: float,
    config: PeakShavingConfig
) -> float:
    """
    日收益计算
    """
    revenue_discharge = discharge_power_kw * discharge_hours * config.price_peak
    cost_charge = charge_power_kw * charge_hours * config.price_valley
    cost_degradation = (discharge_power_kw * discharge_hours) * config.cycle_cost_per_kwh
    daily_revenue = (revenue_discharge - cost_charge) - cost_degradation
    return daily_revenue

def calculate_cycle_degradation(
    n_cycles: float,
    temp_c: float,
    chemistry: BatteryChemistry
) -> float:
    """
    衰减模型: Q_loss(n) = a × n^0.5 × exp(Ea / (R × T))
    返回: 容量衰减率 (%)
    """
    params = {
        BatteryChemistry.LFP: {"a": 0.03, "Ea": 20000},
        BatteryChemistry.NMC: {"a": 0.05, "Ea": 30000},
        BatteryChemistry.LEAD_CARBON: {"a": 0.08, "Ea": 15000},
    }
    p = params[chemistry]
    R = 8.314
    T = temp_c + 273.15
    Q_loss = p["a"] * (n_cycles ** 0.5) * math.exp(p["Ea"] / (R * T))
    return Q_loss * 100  # 转为百分比
```

### 2.6 各省典型峰谷时段参考

```
省份     | 峰时段                          | 平时段                          | 谷时段
────────┼────────────────────────────────┼────────────────────────────────┼──────────────
广东     | 10:00-12:00, 14:00-19:00      | 08:00-10:00, 12:00-14:00      | 00:00-08:00
         |                                | 19:00-24:00                   |
浙江     | 08:00-11:00, 13:00-19:00      | 11:00-13:00, 19:00-21:00      | 21:00-08:00
江苏     | 08:00-12:00, 17:00-21:00      | 12:00-17:00, 21:00-24:00      | 00:00-08:00
山东     | 08:30-11:30, 16:00-21:00      | 06:30-08:30, 11:30-16:00      | 23:00-06:30
         |                                | 21:00-23:00                   |
北京     | 10:00-15:00, 18:00-21:00      | 07:00-10:00, 15:00-18:00      | 23:00-07:00
         |                                | 21:00-23:00                   |
上海     | 08:00-11:00, 13:00-15:00      | 06:00-08:00, 11:00-13:00      | 22:00-06:00
         | 18:00-21:00                    | 15:00-18:00, 21:00-22:00      |
```

---

## 三、防逆流策略（三重保障实现）

### 3.1 三重保障架构

```
┌─────────────────────────────────────────────────────────────┐
│ 第1重: 策略层 (Layer2/3, 响应时间500ms)                      │
│   P_export-limit = max(0, P_load - P_pv - P_bess)           │
│   逆流阈值 = 5% × P_pcc                                     │
│   控制方式: 调节PCS充放电功率                                  │
├─────────────────────────────────────────────────────────────┤
│ 第2重: PCS层 (Layer1, 响应时间100ms)                         │
│   当P_export > 0时:                                          │
│     P_pcs_limit = P_pcs_current - P_export - margin          │
│   控制方式: PCS功率限幅寄存器                                  │
├─────────────────────────────────────────────────────────────┤
│ 第3重: 硬件层 (Layer0, 响应时间<100ms)                       │
│   逆流继电器动作值 = 3% × P_pcc                              │
│   动作时间 < 100ms                                           │
│   动作结果: 跳PCC断路器 (最后防线)                             │
└─────────────────────────────────────────────────────────────┘
```

### 3.2 策略层逻辑

```
检测PCC功率: P_pcc = P_load - P_pv - P_bess(放电为正)
  P_pcc > 0: 从电网取电 (正常)
  P_pcc < 0: 向电网反送 (逆流)
  P_pcc = 0: 零功率 (理想目标)

逆流阈值: P_threshold = 5% × P_pcc_capacity
  例: P_pcc = 1000kW → 阈值 = 50kW

策略层控制:
  当 P_pcc < -P_threshold (反送功率超过阈值):
    方案1: 降低PCS放电功率 → P_pcs_new = P_pcs_current + P_pcc + margin
    方案2: 增加PCS充电功率 → 用储能消纳光伏余电
    方案3: 如储能已满(SOC>SOC_max), 限制光伏出力: P_pv_limit = P_load + P_pcs

滞回控制 (防止频繁动作):
  逆流触发: P_pcc < -P_threshold
  逆流恢复: P_pcc > -(P_threshold - hysteresis)
  hysteresis = 2% × P_pcc_capacity
```

### 3.3 PCS层功率限幅

```
PCS层限幅逻辑 (通过Modbus寄存器控制):

  当 P_export > 0 (检测到逆流):
    P_pcs_limit = P_pcs_current - P_export - margin
    margin = 5kW (安全裕量)

  Modbus写入:
    地址 40101: PCS有功功率限幅值 (kW, 有符号)
    写入 P_pcs_limit

  限幅范围: -P_pcs_rated ≤ P_pcs_limit ≤ +P_pcs_rated
  响应时间: <100ms (PCS内部闭环)
```

### 3.4 硬件层逆流继电器

```
逆流继电器参数:
  动作值: 3% × P_pcc_capacity
  例: P_pcc = 1000kW → 动作值 = 30kW
  动作时间: <100ms (继电器固有动作时间+检测时间)
  动作结果: 跳PCC断路器, 储能转入离网运行
  复归: 手动复归 (需现场确认后复归)

  继电器型号推荐: 施耐德IC2000/ABB Emax2
  采样: PCC关口表CT+PT, 精度0.5S级
```

### 3.5 完整Modbus控制字定义

```
防逆流Modbus寄存器映射:

地址      | 名称                   | 类型   | 单位  | 说明
──────────┼───────────────────────┼───────┼──────┼────────────────────
40100     | 逆流保护使能            | U16    | -    | 0=禁用, 1=使能
40101     | 功率限幅值              | S16    | kW   | PCS有功功率限幅
40102     | 逆流继电器状态          | U16    | -    | 0=正常, 1=动作, 2=复归待确认
40103     | PCC有功功率             | S32    | kW   | PCC实时功率(正=取电,负=反送)
40104     | 逆流阈值设定            | U16    | kW   | 策略层逆流阈值(默认5%P_pcc)
40105     | 逆流继电器动作值        | U16    | kW   | 硬件层动作值(默认3%P_pcc)
40106     | 滞回宽度                | U16    | kW   | 滞回值(默认2%P_pcc)
40107     | 逆流保护动作计数        | U32    | 次   | 累计动作次数
40108     | 最近一次逆流功率        | S16    | kW   | 最近一次逆流时的反送功率
40109     | 最近一次逆流时间        | U32    | epoch| 最近一次逆流发生的Unix时间戳
40110     | 控制模式                | U16    | -    | 0=PCS优先, 1=光伏优先, 2=混合
```

### 3.6 防逆流策略YAML配置

```yaml
strategy_anti_reverse_v2:
  id: "anti_reverse_v2"
  enabled: true
  version: "2.0"
  description: "三重保障防逆流策略"

  # 逆流阈值
  pcc_capacity_kw: 1000                # PCC关口容量 (kW)
  reverse_threshold_pct: 5             # 策略层逆流阈值 (%P_pcc)
  relay_action_pct: 3                  # 硬件层继电器动作值 (%P_pcc)
  hysteresis_pct: 2                    # 滞回宽度 (%P_pcc)

  # 采样参数
  meter_device: "meter_pcc"
  meter_sample_interval_ms: 200
  filter_window_ms: 1000

  # 控制响应
  control_mode: "pcs_priority"         # pcs_priority / pv_priority / hybrid
  pcs_response_time_ms: 500
  pv_response_time_ms: 2000
  safety_margin_kw: 5

  # 多级控制
  control_stages:
    - level: 1
      threshold_pct: 5                 # 反送>5%P_pcc
      action: "reduce_pcs_discharge"
      ramp_rate_pct_per_s: 2           # 2%P_pcs/s
      timeout_s: 3
    - level: 2
      threshold_pct: 10
      action: "charge_bess"
      ramp_rate_pct_per_s: 5
      timeout_s: 1
    - level: 3
      threshold_pct: 20
      action: "curtail_pv"
      ramp_rate_pct_per_s: 10
      timeout_s: 0.5
    - level: 4
      threshold_pct: 50
      action: "trip_pcc"               # 跳闸PCC断路器
      timeout_s: 0

  # 故障安全
  failsafe:
    comm_loss_action: "stop_pcs"
    meter_fault_action: "stop_pcs"

  # Modbus寄存器
  modbus:
    enable_reg: 40100
    power_limit_reg: 40101
    relay_status_reg: 40102
    pcc_power_reg: 40103
    threshold_reg: 40104
    relay_action_reg: 40105
    hysteresis_reg: 40106
```

### 3.7 防逆流Python伪代码

```python
def anti_reverse_control(
    p_load: float,
    p_pv: float,
    p_pcs_current: float,
    pcc_capacity: float,
    soc: float,
    soc_max: float,
    config: dict
) -> float:
    """
    防逆流控制函数 (三重保障)
    返回: 调整后的PCS功率指令
    """
    p_threshold = pcc_capacity * config["reverse_threshold_pct"] / 100.0
    p_relay_action = pcc_capacity * config["relay_action_pct"] / 100.0
    p_hysteresis = pcc_capacity * config["hysteresis_pct"] / 100.0
    margin = config["safety_margin_kw"]

    # 计算PCC功率
    p_pcc = p_load - p_pv - p_pcs_current  # 正=取电, 负=反送
    p_export = -p_pcc  # 正=反送功率

    # 第1重: 策略层
    if p_export > p_threshold:
        # 逆流超阈值, 需要调节
        if p_pcs_current < 0:  # PCS正在放电
            # 方案1: 降低放电功率
            p_pcs_new = p_pcs_current + p_export + margin
            p_pcs_new = min(p_pcs_new, 0)  # 不超过0(不转为充电)
        else:  # PCS正在充电或待机
            if soc < soc_max:
                # 方案2: 增加充电功率消纳
                p_pcs_new = p_pcs_current + p_export + margin
            else:
                # 方案3: SOC已满, 需限制光伏
                p_pv_limit = p_load + abs(p_pcs_current)
                # 通过Modbus 40300限制光伏
                write_modbus(40300, int(p_pv_limit))
                p_pcs_new = p_pcs_current
    else:
        p_pcs_new = p_pcs_current

    # 第2重: PCS层限幅 (通过Modbus 40101)
    if p_export > 0:
        p_pcs_limit = p_pcs_current - p_export - margin
        write_modbus(40101, int(p_pcs_limit))

    # 第3重: 硬件层继电器
    if p_export > p_relay_action:
        # 逆流继电器动作, 跳PCC断路器
        write_modbus(40102, 1)  # 继电器状态=动作
        # 储能转入离网V/f模式
        switch_to_island_mode()

    return p_pcs_new
```

---

## 四、需量控制策略

### 4.1 策略逻辑

```
策略目标: 控制月最大需量(15分钟平均功率最大值), 降低需量电费。

需量电费计算:
  C_demand = D_month × C_demand_rate × 12 (年需量电费)
  D_month = max(P_15min_avg) (月内最大15分钟平均功率)
  C_demand_rate: 需量电价 (元/kVA/月, 典型35元/kVA/月)

控制目标:
  D_target = D_contract × 95% (留5%裕量)
  当P_realtime > D_target → 储能放电, 削减需量

节省计算:
  年节省 = (D_original - D_new) × C_demand_rate × 12
  例: D_original=800kVA, D_new=650kVA, C=35元/kVA/月
      年节省 = (800-650) × 35 × 12 = 63,000元/年
```

### 4.2 需量计算: 15分钟滑动窗口

```python
def calculate_demand_15min(p_samples: list, interval_s: float = 1.0) -> float:
    """
    15分钟滑动窗口需量计算
    p_samples: 功率采样序列 (kW)
    interval_s: 采样间隔 (秒)
    返回: 当前15分钟平均功率 (kW)
    """
    window_size = int(15 * 60 / interval_s)  # 15分钟窗口大小
    if len(p_samples) < window_size:
        window_size = len(p_samples)
    window = p_samples[-window_size:]
    p_avg_15min = sum(window) / len(window)
    return p_avg_15min

class DemandController:
    def __init__(self, config: dict):
        self.demand_contract = config["demand_contract_kva"]  # 报装容量
        self.demand_rate = config["demand_charge_rate"]       # 元/kVA/月
        self.demand_target = self.demand_contract * 0.95      # 控制目标
        self.demand_month_max = 0.0                           # 本月最大需量
        self.margin_kw = config.get("margin_kw", 20.0)       # 裕量

    def compute_discharge_power(self, p_realtime: float) -> float:
        """
        当P_realtime > D_target时, 计算所需放电功率
        返回: 储能放电功率 (kW), 0=无需放电
        """
        if p_realtime > self.demand_target:
            p_discharge = p_realtime - self.demand_target + self.margin_kw
            return p_discharge
        return 0.0

    def update_month_max(self, p_15min_avg: float):
        """更新月最大需量"""
        if p_15min_avg > self.demand_month_max:
            self.demand_month_max = p_15min_avg

    def estimate_annual_saving(self, demand_original: float, demand_new: float) -> float:
        """年需量电费节省"""
        return (demand_original - demand_new) * self.demand_rate * 12
```

### 4.3 需量控制YAML配置

```yaml
strategy_demand_control_v2:
  id: "demand_control_v2"
  enabled: true
  version: "2.0"

  demand_contract_kva: 800              # 报装容量 (kVA)
  demand_charge_rate: 35.0              # 需量电价 (元/kVA/月)
  demand_target_pct: 95                 # 控制目标 (%报装容量)
  margin_kw: 20                         # 放电裕量 (kW)

  # 15分钟滑动窗口
  sample_interval_s: 1                  # 功率采样间隔 (秒)
  window_duration_min: 15               # 窗口时长 (分钟)

  # 放电控制
  max_discharge_kw: 500                 # 最大放电功率 (kW)
  soc_min_for_discharge: 15             # 需量放电最低SOC (%)

  # 需量预测 (可选)
  demand_forecast:
    enabled: true
    method: "exponential_smoothing"      # exponential_smoothing / lstm / persistence
    alpha: 0.3                          # 指数平滑系数
    lookback_hours: 24                  # 历史数据回看时长
```

---

## 五、SOC管理策略（按化学类型）

### 5.1 SOC边界定义（三种化学类型）

```
参数              | LFP(磷酸铁锂)  | NMC(三元锂)    | 铅碳电池
──────────────────┼───────────────┼───────────────┼──────────
充电截止SOC       | 90%            | 85%            | 95%
放电截止SOC       | 10%            | 15%            | 20%
过充保护SOC       | 95%            | 90%            | 98%
过放保护SOC       | 3%             | 5%             | 10%
急停SOC           | 5%             | 8%             | 15%
允许DOD           | 90%            | 85%            | 80%
循环寿命@DOD      | 3000@90%DOD   | 1500@80%DOD   | 1500@80%DOD
日历寿命          | 15年           | 10年           | 12年
典型SOC工作范围   | 10%~90%       | 15%~85%       | 20%~95%
```

### 5.2 温度修正系数

```
电池温度    | 降额系数  | 动作
───────────┼──────────┼────────────────────
< -10℃    | 50%      | 低温降额(充电电流限制)
-10~0℃    | 80%      | 低温轻微降额
0~45℃     | 100%     | 正常工作范围
45~50℃    | 80%      | 高温降额(充放电功率×0.8)
50~55℃    | 50%      | 高温严重降额(充放电功率×0.5)
> 55℃     | 0%       | 停机(PCS停机, BMS断开接触器)
```

```python
def apply_temp_derating(temp_c: float, p_rated: float) -> float:
    """温度降额"""
    if temp_c < -10:
        return p_rated * 0.50
    elif temp_c < 0:
        return p_rated * 0.80
    elif temp_c <= 45:
        return p_rated * 1.00
    elif temp_c <= 50:
        return p_rated * 0.80
    elif temp_c <= 55:
        return p_rated * 0.50
    else:
        return 0.0  # 停机
```

### 5.3 SOC校准方法

```
方法1: 满充校准
  当SOC=100%(恒压充电终止电流<0.05C)时, 校准SOC=100%
  精度: ±1%
  触发: 每次满充后自动校准

方法2: 开路电压查表法
  SOC = f(OCV, Temperature)
  LFP OCV-SOC表 (25℃):
    SOC:  0%   10%  20%  30%  40%  50%  60%  70%  80%  90%  100%
    OCV: 2.50 2.87 3.00 3.05 3.10 3.20 3.25 3.28 3.30 3.35 3.40
  注意: LFP在20%~80%区间OCV非常平坦(~3.2V), 校准精度低
  NMC OCV-SOC表 (25℃):
    SOC:  0%   10%  20%  30%  40%  50%  60%  70%  80%  90%  100%
    OCV: 3.00 3.28 3.42 3.52 3.60 3.68 3.75 3.82 3.90 4.00 4.20
  精度: LFP ±10% (平坦区), NMC ±5%
  要求: 静置≥2小时后测量OCV

方法3: 安时积分+卡尔曼滤波
  SOC(t) = SOC(t-1) + ∫I(t)dt / Q_nominal
  卡尔曼滤波修正:
    预测: SOC_pred = SOC_prev + I×Δt/Q
    更新: SOC = SOC_pred + K×(OCV_measured - OCV_pred)
    K: 卡尔曼增益 (典型0.1~0.3)
  精度: ±3%
  优点: 实时在线校准, 不需要静置
```

### 5.4 SOC管理YAML配置

```yaml
soc_management_v2:
  version: "2.0"

  # 按化学类型的SOC边界
  chemistry: "LFP"                     # LFP / NMC / Lead_Carbon
  boundaries:
    LFP:
      soc_charge_cutoff: 90            # 充电截止 (%)
      soc_discharge_cutoff: 10         # 放电截止 (%)
      soc_overcharge_protect: 95       # 过充保护 (%)
      soc_overdischarge_protect: 3     # 过放保护 (%)
      soc_emergency_stop: 5            # 急停 (%)
      max_dod: 90                      # 最大放电深度 (%)
    NMC:
      soc_charge_cutoff: 85
      soc_discharge_cutoff: 15
      soc_overcharge_protect: 90
      soc_overdischarge_protect: 5
      soc_emergency_stop: 8
      max_dod: 85
    Lead_Carbon:
      soc_charge_cutoff: 95
      soc_discharge_cutoff: 20
      soc_overcharge_protect: 98
      soc_overdischarge_protect: 10
      soc_emergency_stop: 15
      max_dod: 80

  # 温度降额
  temp_derating:
    - { temp_min: -999, temp_max: -10, factor: 0.50 }
    - { temp_min: -10,  temp_max: 0,   factor: 0.80 }
    - { temp_min: 0,    temp_max: 45,  factor: 1.00 }
    - { temp_min: 45,   temp_max: 50,  factor: 0.80 }
    - { temp_min: 50,   temp_max: 55,  factor: 0.50 }
    - { temp_min: 55,   temp_max: 999, factor: 0.00 }  # 停机

  # SOC校准
  calibration:
    method: "coulomb_counting_kalman"  # full_charge / ocv_lookup / coulomb_counting_kalman
    kalman_gain: 0.2                   # 卡尔曼增益
    ocv_rest_time_hours: 2            # OCV测量静置时间
    full_charge_current_c_rate: 0.05  # 满充判定电流 (C率)
    calibration_interval_days: 7      # 定期校准间隔
```

---

## 六、并离网切换策略（完整状态机）

### 6.1 状态机定义

```
状态转移图:

  GRID_CONNECTED ──(电网异常)──→ ISLAND_DETECTING
       ↑                              │
       │                              ↓ (确认孤岛)
       │                         ISLAND_MODE
       │                              │
       │                              ↓ (电网恢复)
  SYNC_CHECKING ←── GRID_RECOVERING
       │
       │ (同期满足)
       ↓
  GRID_CONNECTED

状态说明:
  GRID_CONNECTED:     并网运行, PCS为PQ控制模式
  ISLAND_DETECTING:   孤岛检测中, 等待确认
  ISLAND_MODE:        离网运行, PCS为V/f控制模式
  GRID_RECOVERING:    电网恢复检测中, 等待稳定
  SYNC_CHECKING:      同期检查, 准备并网
```

### 6.2 孤岛检测条件

```
电压检测:
  |V| > 115% × V_nominal (持续100ms) → 孤岛
  |V| < 85% × V_nominal  (持续100ms) → 孤岛
  例: V_nominal=380V → V>437V或V<323V持续100ms

频率检测:
  f > 51.5Hz (持续200ms) → 孤岛
  f < 49.5Hz (持续200ms) → 孤岛

频率变化率检测 (df/dt):
  |df/dt| > 2 Hz/s → 立即判定孤岛 (无需等待)

相位突变检测:
  |Δφ| > 5° (单次突变) → 孤岛疑似

综合判定:
  电压异常 AND 频率异常 → 立即转ISLAND_MODE
  仅频率异常持续200ms → 转ISLAND_MODE
  df/dt > 2Hz/s → 立即转ISLAND_MODE
```

### 6.3 离网建压

```
储能V/f控制建压:
  目标电压: V = 380V (线电压)
  目标频率: f = 50Hz
  控制模式: V/f恒压恒频
  建压时间: <200ms (从孤岛检测确认到V/f建压完成)

负荷逐步投入 (防止冲击):
  步骤1: t=0ms, V/f建压, 投入一级负荷(消防/应急照明/通信)
  步骤2: t=100ms, 投入10%二级负荷
  步骤3: t=200ms, 投入20%二级负荷
  步骤4: t=300ms, 投入30%二级负荷
  ...
  步骤N: 每隔100ms投入10%, 直至全部二级负荷投入或达到PCS功率限制

  如P_load > P_pcs_rated: 切除非关键负荷(三级先切, 二级后切)
```

### 6.4 电网恢复条件

```
电网恢复判定 (持续稳定10秒):
  电压恢复: 95% × V_nominal ≤ V ≤ 105% × V_nominal
            361V ≤ V ≤ 399V
  频率恢复: 49.8Hz ≤ f ≤ 50.2Hz
  持续时间: ≥ 10s (连续满足, 任何一次不满足重新计时)

电网恢复后:
  转入SYNC_CHECKING状态, 准备同期并网
```

### 6.5 同期并网条件

```
同期检查 (三个条件同时满足):
  电压差: |ΔV| < 5% × V_nominal  → |ΔV| < 19V
  频率差: |Δf| < 0.2Hz
  相角差: |Δφ| < 5°

同期检查时间: 300ms (三个条件连续满足300ms)
合闸时间: <50ms (断路器固有合闸时间)

并网后切换:
  PCS从V/f模式切换到PQ模式
  切换过渡时间: <100ms
  切换过程功率波动: <10% × P_pcs_rated
```

### 6.6 PLC梯形图逻辑（文字描述）

```
=== 并离网切换PLC梯形图逻辑 ===

[网络1: 孤岛检测]
  条件: 电网电压V_grid > 437V  ─┤├──┐
        电网电压V_grid < 323V  ─┤├──┤──[ISLAND_DETECT线圈]
        电网频率f > 51.5Hz    ─┤├──┤
        电网频率f < 49.5Hz    ─┤├──┘
  延时: TON 100ms
  动作: 置位ISLAND_DETECT标志

[网络2: 频率变化率检测]
  条件: |df/dt| > 2.0 Hz/s  ─┤├──[ISLAND_IMMEDIATE线圈]
  延时: 无 (立即)
  动作: 立即置位ISLAND_MODE标志, 跳过ISLAND_DETECTING

[网络3: 离网模式进入]
  条件: ISLAND_DETECT ─┤├──┐
        AND 确认延时TON 100ms ─┤├──┘──[ISLAND_MODE线圈]
  动作:
    1. 断开PCC并网断路器 (K1线圈)
    2. PCS切换V/f控制模式
    3. 投入一级负荷 (K10线圈)
    4. 启动负荷逐步投入定时器

[网络4: 负荷逐步投入]
  条件: ISLAND_MODE ─┤├──┐
        AND 定时器每100ms触发 ─┤├──┘──[LOAD_STEP线圈]
  动作:
    每步投入10%二级负荷
    检查PCS功率是否超限
    如超限 → 切除三级负荷 → 切除部分二级负荷

[网络5: 电网恢复检测]
  条件: V_grid在361~399V之间 ─┤├──┐
        AND f在49.8~50.2Hz之间 ─┤├──┤──[GRID_RECOVER线圈]
        AND 连续满足10秒       ─┤├──┘
  动作: 置位GRID_RECOVERING标志

[网络6: 同期检查]
  条件: |ΔV| < 19V   ─┤├──┐
        AND |Δf| < 0.2Hz ─┤├──┤──[SYNC_OK线圈]
        AND |Δφ| < 5°   ─┤├──┘
  延时: TON 300ms (连续满足300ms)
  动作: 置位SYNC_OK标志

[网络7: 并网合闸]
  条件: SYNC_OK ─┤├──[CLOSE_PCC线圈]
  动作:
    1. 合PCC并网断路器 (K1线圈)
    2. PCS切换PQ控制模式
    3. 复位ISLAND_MODE标志
    4. 置位GRID_CONNECTED标志
  合闸时间要求: <50ms
```

### 6.7 并离网切换YAML配置

```yaml
strategy_grid_switching_v2:
  id: "grid_switching_v2"
  version: "2.0"

  # 孤岛检测
  island_detection:
    voltage_high_pct: 115              # 过压判定 (%Un)
    voltage_low_pct: 85                # 欠压判定 (%Un)
    voltage_delay_ms: 100              # 电压异常延时 (ms)
    freq_high_hz: 51.5                 # 过频判定 (Hz)
    freq_low_hz: 49.5                  # 欠频判定 (Hz)
    freq_delay_ms: 200                 # 频率异常延时 (ms)
    dfdt_threshold_hz_per_s: 2.0       # 频率变化率阈值 (Hz/s)

  # 离网建压
  island_mode:
    target_voltage_v: 380              # 建压目标线电压 (V)
    target_frequency_hz: 50.0          # 建压目标频率 (Hz)
    build_up_time_ms: 200              # 建压时间要求 (ms)
    load_step_interval_ms: 100         # 负荷逐步投入间隔 (ms)
    load_step_pct: 10                  # 每步投入负荷比例 (%)

  # 电网恢复
  grid_recovery:
    voltage_low_pct: 95                # 恢复电压下限 (%Un)
    voltage_high_pct: 105              # 恢复电压上限 (%Un)
    freq_low_hz: 49.8                  # 恢复频率下限 (Hz)
    freq_high_hz: 50.2                 # 恢复频率上限 (Hz)
    stability_duration_s: 10           # 持续稳定时间 (s)

  # 同期并网
  sync_check:
    voltage_diff_pct: 5                # 电压差限值 (%Un)
    freq_diff_hz: 0.2                  # 频率差限值 (Hz)
    phase_diff_deg: 5                  # 相角差限值 (度)
    check_duration_ms: 300             # 同期检查持续时间 (ms)
    breaker_close_time_ms: 50          # 合闸时间要求 (ms)

  # 负荷分级
  load_priority:
    level_1:                           # 一级: 必保
      - "fire_fighting"
      - "emergency_lighting"
      - "communication"
    level_2:                           # 二级: 可切
      - "office"
      - "air_conditioning"
    level_3:                           # 三级: 先切
      - "ev_charger"
      - "non_critical_load"
```

---

## 七、充电桩限功率策略

### 7.1 负荷优先级

```
优先级 | 负荷类型        | 典型功率    | 说明
──────┼─────────────────┼───────────┼──────────────────
  1   | 办公负荷        | 50~200kW   | 最高优先级, 不限制
  2   | 生产负荷        | 100~500kW  | 高优先级, 仅在极端情况限制
  3   | 空调负荷        | 50~300kW   | 中优先级, 可适度限制
  4   | 充电桩负荷      | 60~480kW   | 最低优先级, 优先限制
```

### 7.2 限功率触发与执行

```
触发条件:
  P_total = P_load + P_ev
  当 P_total > P_transformer × 95% → 触发充电桩限功率

降功率步长:
  每步降低: 10% × P_ev_rated
  步长间隔: 30秒
  目标: P_total < P_transformer × 90%

执行流程:
  1. 检测P_total > P_transformer × 95%
  2. 计算需降功率: P_reduce = P_total - P_transformer × 90%
  3. 对充电桩按优先级排序(快充桩先降, 慢充桩后降)
  4. 发送OCPP命令: ChangeAvailability或RemoteStopTransaction
  5. 等待30秒观察效果
  6. 如仍超限, 继续降功率
  7. 如P_total < P_transformer × 85%, 逐步恢复充电桩功率

恢复条件:
  P_total < P_transformer × 85% 持续5分钟 → 恢复充电桩功率
  恢复步长: 10% × P_ev_rated per 30s
```

### 7.3 OCPP1.6J命令

```
命令1: ChangeAvailability (改变充电桩可用性)
  用途: 将充电桩设为非可用(Inoperative), 不接受新充电会话
  请求: [2, uniqueId, "ChangeAvailability", {connectorId: 0, type: "Inoperative"}]
  响应: [3, uniqueId, {status: "Accepted"}]
  注意: 已在充电的会话不受影响

命令2: RemoteStopTransaction (远程停止充电会话)
  用途: 立即停止指定充电会话
  请求: [2, uniqueId, "RemoteStopTransaction", {transactionId: xxx}]
  响应: [3, uniqueId, {status: "Accepted"}]
  注意: 强制停止, 用户体验受影响

命令3: SetChargingProfile (设置充电功率限幅)
  用途: 限制充电桩最大充电功率
  请求: [2, uniqueId, "SetChargingProfile", {
    connectorId: 1,
    csChargingProfiles: {
      chargingProfileId: 1,
      stackLevel: 1,
      chargingProfileKind: "RelativeProfile",
      chargingProfilePurpose: "ChargePointMaxProfile",
      chargingSchedule: {
        startSchedule: "2024-01-01T00:00:00Z",
        chargingRateUnit: "W",
        chargingSchedulePeriod: [{startPeriod: 0, limit: 22000}]
      }
    }
  }]
  说明: limit=22000 表示限制到22kW (三相32A)
```

### 7.4 充电桩限功率YAML配置

```yaml
strategy_ev_limit_v2:
  id: "ev_limit_v2"
  version: "2.0"

  transformer_capacity_kva: 1250       # 变压器容量
  trigger_loading_pct: 95              # 触发限功率负载率 (%)
  target_loading_pct: 90               # 限功率目标负载率 (%)
  recover_loading_pct: 85              # 恢复功率负载率 (%)

  # 降功率步长
  step_reduction_pct: 10               # 每步降功率 (%P_ev_rated)
  step_interval_s: 30                  # 步长间隔 (s)
  recover_delay_min: 5                 # 恢复前等待 (min)

  # 充电桩列表
  ev_chargers:
    - id: "EV_001"
      type: "DC_fast"                  # DC_fast / AC_slow
      rated_power_kw: 120              # 额定功率 (kW)
      ocpp_id: "CP001"
      priority: 4                      # 优先级(越大越先降)
    - id: "EV_002"
      type: "DC_fast"
      rated_power_kw: 120
      ocpp_id: "CP002"
      priority: 4
    - id: "EV_003"
      type: "AC_slow"
      rated_power_kw: 7
      ocpp_id: "CP003"
      priority: 5                      # 慢充优先级更低(先降)

  # OCPP配置
  ocpp:
    version: "1.6J"
    central_system_url: "ws://ocpp-server:9000/CP{charger_id}"
    command_timeout_s: 10
```

### 7.5 充电桩限功率Python伪代码

```python
def ev_power_limit_control(
    p_load: float,
    p_ev: float,
    p_ev_chargers: list,
    transformer_kva: float,
    config: dict
) -> list:
    """
    充电桩限功率控制
    返回: 各充电桩功率限幅列表
    """
    p_total = p_load + p_ev
    p_trigger = transformer_kva * config["trigger_loading_pct"] / 100.0
    p_target = transformer_kva * config["target_loading_pct"] / 100.0

    charger_limits = []
    if p_total > p_trigger:
        p_reduce_needed = p_total - p_target
        # 按优先级排序(优先级高的先降)
        sorted_chargers = sorted(p_ev_chargers, key=lambda c: -c["priority"])
        remaining_reduce = p_reduce_needed
        for charger in sorted_chargers:
            if remaining_reduce <= 0:
                charger_limits.append({"id": charger["id"], "limit_kw": charger["rated_power_kw"]})
                continue
            step_kw = charger["rated_power_kw"] * config["step_reduction_pct"] / 100.0
            current_limit = charger["rated_power_kw"]
            while remaining_reduce > 0 and current_limit > 0:
                current_limit -= step_kw
                current_limit = max(current_limit, 0)
                remaining_reduce -= step_kw
            charger_limits.append({"id": charger["id"], "limit_kw": max(current_limit, 0)})
    else:
        for charger in p_ev_chargers:
            charger_limits.append({"id": charger["id"], "limit_kw": charger["rated_power_kw"]})

    return charger_limits
```

---

## 八、光伏消纳最大化策略

### 8.1 策略逻辑

```
目标: 最大化光伏自消纳, 减少弃光, 减少上网电量

场景1: 自消纳优先 (P_pv > P_load)
  P_charge = min(
    P_pv - P_load,                     # 光伏富余功率
    P_pcs_rated,                       # PCS额定限幅
    (SOC_max - SOC_now) × E_bess / Δt  # SOC空间限制
  )
  储能充电消纳光伏余电

场景2: 储能已满, 光伏仍富余
  当SOC > 90% 且 P_pv > P_load + P_pcs_rated:
  限制光伏出力: P_pv_limit = P_load + P_pcs_rated
  (储能已无法再充, 负荷+储能已无法消纳全部光伏)

场景3: 光伏不足 (P_pv < P_load)
  储能放电补充: P_discharge = min(P_load - P_pv, P_pcs_rated, SOC可用)
  优先使用储能放电, 减少从电网取电

上网限制:
  如不允许上网: P_pv_limit = P_load + P_bess_charge - P_bess_discharge
  如允许上网: 按上网限额控制
```

### 8.2 光伏限制方式

```
方式1: 降功率指令 (优先)
  通过Modbus寄存器40300下发光伏限功率值
  地址40300: 光伏有功功率限幅值 (kW)
  响应时间: <2s
  优点: 无需物理断开, 损失小
  缺点: 并非所有逆变器支持

方式2: 切并网逆变器 (后备)
  逐台断开光伏并网逆变器
  每台逆变器断开时间: <5s
  优点: 兼容性好
  缺点: 有冲击, 恢复慢

方式3: 调整逆变器功率因数
  通过降低功率因数减少有功输出
  适用于支持功率因数调节的逆变器
```

### 8.3 光伏消纳YAML配置

```yaml
strategy_pv_self_consume_v2:
  id: "pv_self_consume_v2"
  version: "2.0"

  # 自消纳优先
  charge_priority: "pv_surplus"         # pv_surplus / grid_valley / hybrid

  # 上网限制
  grid_export:
    allowed: false                      # 是否允许上网
    max_export_kw: 0                    # 上网功率限额 (kW)
    curtail_method: "modbus_power"      # modbus_power / inverter_switch / pf_adjust

  # 光伏限制Modbus
  pv_curtailment:
    modbus_address: 40300               # 限功率寄存器地址
    inverter_count: 5                   # 逆变器台数
    inverter_addresses: [40301, 40302, 40303, 40304, 40305]

  # SOC阈值
  soc_full_threshold: 90                # SOC>90%视为储能已满
```

---

## 九、应急备电策略

### 9.1 策略逻辑

```
触发: 电网失电 (检测到电压<85%Un或频率越限)

执行序列:
  Step 1: 电网失电检测 (≤100ms)
  Step 2: 断开PCC并网断路器 (≤50ms)
  Step 3: 储能V/f建压, V=380V, f=50Hz (≤200ms)
  Step 4: 投入一级负荷 (消防/应急照明/通信) (≤50ms)
  Step 5: 逐步投入二级负荷 (每100ms投10%)
  Step 6: 切除三级负荷 (充电桩等)

备电时长估算:
  T_backup = E_bess × (SOC_now - SOC_min) / P_critical_load
  例: E_bess=1000kWh, SOC=80%, SOC_min=10%, P_critical=200kW
      T = 1000 × (0.8 - 0.1) / 200 = 3.5小时

负荷分级:
  一级(必保): 消防/应急照明/通信/安防 → 绝不切除
  二级(可切): 办公/空调/生产 → 视储能余量决定
  三级(先切): 充电桩/非关键负荷 → 最先切除
```

### 9.2 应急备电YAML配置

```yaml
strategy_emergency_backup_v2:
  id: "emergency_backup_v2"
  version: "2.0"

  # 备电SOC预留
  soc_reserve_pct: 50                  # 平时SOC不低于50% (为备电预留)
  soc_min_backup_pct: 10               # 备电时最低SOC (%)

  # V/f建压参数
  island_mode:
    target_voltage_v: 380
    target_frequency_hz: 50.0
    build_up_time_ms: 200

  # 负荷分级
  load_classification:
    level_1_critical:                   # 一级: 必保, 绝不切除
      - { name: "消防系统", power_kw: 30 }
      - { name: "应急照明", power_kw: 10 }
      - { name: "通信系统", power_kw: 5 }
      - { name: "安防系统", power_kw: 8 }
      # 一级总功率: 53kW
    level_2_important:                  # 二级: 可切, 视储能余量
      - { name: "办公负荷", power_kw: 100 }
      - { name: "空调系统", power_kw: 150 }
      - { name: "生产负荷", power_kw: 200 }
      # 二级总功率: 450kW
    level_3_disposable:                 # 三级: 先切
      - { name: "充电桩", power_kw: 240 }
      - { name: "景观照明", power_kw: 20 }
      # 三级总功率: 260kW

  # 备电时长告警
  backup_duration_alarm:
    level_1_only_hours: 18.9            # 仅一级负荷备电时长
    level_1_2_hours: 1.56               # 一级+二级负荷备电时长
    min_backup_hours: 2                 # 最低备电时长要求
```

---

## 十、完整策略配置YAML模板

### 10.1 系统参数配置

```yaml
# ============================================================
# EMS策略完整配置模板 v2.0
# 可直接加载到EMS系统执行
# ============================================================

ems_config_v2:
  version: "2.0"
  description: "EMS策略完整配置模板, 含所有策略参数"

  # ==================== 系统参数 ====================
  system:
    project_name: "工商业储能项目"          # 项目名称
    pcs_rated_power_kw: 500               # PCS额定功率 (kW), 范围:50~2000
    pcs_count: 2                          # PCS台数, 范围:1~20
    pcs_total_power_kw: 1000              # PCS总功率 (kW) = pcs_rated_power_kw × pcs_count
    bess_capacity_kwh: 1000               # 储能额定容量 (kWh), 范围:50~10000
    bess_usable_capacity_kwh: 900         # 可用容量 (kWh) = E_bess × DOD
    battery_chemistry: "LFP"              # 电池化学类型: LFP/NMC/Lead_Carbon
    battery_cycle_life: 3000              # 循环寿命 (次@DOD), 范围:500~10000
    transformer_capacity_kva: 1250        # 变压器容量 (kVA), 范围:100~5000
    pcc_capacity_kw: 1000                 # PCC关口容量 (kW), 范围:50~5000
    pv_installed_kw: 500                  # 光伏装机容量 (kW), 范围:0~10000
    ev_charger_total_kw: 240              # 充电桩总功率 (kW), 范围:0~2000
```

### 10.2 完整策略配置

```yaml
  # ==================== 策略使能 ====================
  strategy_enable:
    peak_shaving: true                    # 削峰填谷使能
    anti_reverse: true                    # 防逆流使能
    demand_control: false                 # 需量控制使能
    pv_self_consume: true                 # 光伏消纳使能
    ev_limit: true                        # 充电桩限功率使能
    emergency_backup: true                # 应急备电使能
    grid_switching: true                  # 并离网切换使能

  # ==================== 削峰填谷 ====================
  peak_shaving:
    id: "peak_shaving_v2"
    enabled: true
    mode: "time_based"

    time_periods:
      peak:
        - { start: "09:00", end: "12:00" }
        - { start: "14:00", end: "19:00" }
      flat:
        - { start: "07:00", end: "09:00" }
        - { start: "12:00", end: "14:00" }
        - { start: "19:00", end: "24:00" }
      valley:
        - { start: "00:00", end: "07:00" }

    electricity_price:
      peak: 1.20                          # 元/kWh, 范围:0.5~2.0
      flat: 0.80                          # 元/kWh, 范围:0.3~1.5
      valley: 0.40                        # 元/kWh, 范围:0.1~0.8
      demand_charge: 35.0                 # 元/kVA/月, 范围:20~50
      demand_contract: 800                # kVA, 范围:100~5000

    charge:
      power_ratio: 1.0                    # 充电功率系数, 范围:0.1~1.0, 默认:1.0
      soc_target: 90                      # 充电目标SOC(%), 范围:80~95, 默认:90
      method: "constant_power"            # constant_power/dynamic/pv_surplus_only

    discharge:
      power_ratio: 1.0                    # 放电功率系数, 范围:0.1~1.0, 默认:1.0
      soc_target: 10                      # 放电截止SOC(%), 范围:5~20, 默认:10
      method: "constant_power"            # constant_power/peak_shaving/load_following
      discharge_only_peak: true           # 仅峰段放电, 默认:true
      discharge_flat_ratio: 0.5           # 平段放电比例, 范围:0~1.0, 默认:0.5

    transformer_limit:
      enabled: true
      capacity_kva: 1250                  # kVA, 范围:100~5000
      max_loading_pct: 80                 # %, 范围:50~95, 默认:80

  # ==================== 防逆流 ====================
  anti_reverse:
    id: "anti_reverse_v2"
    enabled: true
    pcc_capacity_kw: 1000                 # kW, 范围:50~5000
    reverse_threshold_pct: 5              # 策略层阈值(%P_pcc), 范围:1~10, 默认:5
    relay_action_pct: 3                   # 硬件层动作值(%P_pcc), 范围:1~5, 默认:3
    hysteresis_pct: 2                     # 滞回(%P_pcc), 范围:0.5~3, 默认:2
    safety_margin_kw: 5                   # 安全裕量(kW), 范围:1~20, 默认:5

    control_mode: "pcs_priority"          # pcs_priority/pv_priority/hybrid
    meter_sample_interval_ms: 200        # 采样间隔(ms), 范围:100~1000, 默认:200
    filter_window_ms: 1000               # 滤波窗(ms), 范围:500~5000, 默认:1000

    modbus:
      enable_reg: 40100
      power_limit_reg: 40101
      relay_status_reg: 40102
      pcc_power_reg: 40103

  # ==================== 需量控制 ====================
  demand_control:
    id: "demand_control_v2"
    enabled: false
    demand_contract_kva: 800              # kVA, 范围:100~5000
    demand_charge_rate: 35.0              # 元/kVA/月, 范围:20~50
    demand_target_pct: 95                 # 控制目标(%), 范围:80~98, 默认:95
    margin_kw: 20                         # 裕量(kW), 范围:5~50, 默认:20
    sample_interval_s: 1                  # 采样间隔(s), 范围:0.1~5, 默认:1
    window_duration_min: 15              # 窗口(min), 范围:10~30, 默认:15

  # ==================== SOC管理 ====================
  soc_management:
    chemistry: "LFP"                      # LFP/NMC/Lead_Carbon
    boundaries:
      LFP:
        soc_charge_cutoff: 90             # 充电截止(%), 默认:90
        soc_discharge_cutoff: 10          # 放电截止(%), 默认:10
        soc_overcharge_protect: 95        # 过充保护(%), 默认:95
        soc_overdischarge_protect: 3      # 过放保护(%), 默认:3
        soc_emergency_stop: 5             # 急停(%), 默认:5
      NMC:
        soc_charge_cutoff: 85
        soc_discharge_cutoff: 15
        soc_overcharge_protect: 90
        soc_overdischarge_protect: 5
        soc_emergency_stop: 8
      Lead_Carbon:
        soc_charge_cutoff: 95
        soc_discharge_cutoff: 20
        soc_overcharge_protect: 98
        soc_overdischarge_protect: 10
        soc_emergency_stop: 15

    calibration:
      method: "coulomb_counting_kalman"   # full_charge/ocv_lookup/coulomb_counting_kalman
      kalman_gain: 0.2                    # 范围:0.01~0.5, 默认:0.2
      calibration_interval_days: 7       # 范围:1~30, 默认:7

  # ==================== 并离网切换 ====================
  grid_switching:
    id: "grid_switching_v2"
    enabled: true

    island_detection:
      voltage_high_pct: 115              # %Un, 范围:105~130, 默认:115
      voltage_low_pct: 85                # %Un, 范围:70~95, 默认:85
      voltage_delay_ms: 100              # ms, 范围:50~500, 默认:100
      freq_high_hz: 51.5                 # Hz, 范围:50.5~55, 默认:51.5
      freq_low_hz: 49.5                  # Hz, 范围:45~50.5, 默认:49.5
      freq_delay_ms: 200                 # ms, 范围:100~1000, 默认:200
      dfdt_threshold_hz_per_s: 2.0       # Hz/s, 范围:0.5~5, 默认:2.0

    island_mode:
      target_voltage_v: 380              # V, 默认:380
      target_frequency_hz: 50.0          # Hz, 默认:50.0
      build_up_time_ms: 200              # ms, 范围:50~500, 默认:200
      load_step_interval_ms: 100         # ms, 范围:50~500, 默认:100
      load_step_pct: 10                  # %, 范围:5~25, 默认:10

    sync_check:
      voltage_diff_pct: 5                # %Un, 范围:1~10, 默认:5
      freq_diff_hz: 0.2                  # Hz, 范围:0.05~0.5, 默认:0.2
      phase_diff_deg: 5                  # 度, 范围:1~15, 默认:5
      check_duration_ms: 300             # ms, 范围:100~1000, 默认:300
      breaker_close_time_ms: 50          # ms, 范围:20~100, 默认:50

  # ==================== 充电桩限功率 ====================
  ev_limit:
    id: "ev_limit_v2"
    enabled: true
    transformer_capacity_kva: 1250       # kVA, 范围:100~5000
    trigger_loading_pct: 95              # %, 范围:85~100, 默认:95
    target_loading_pct: 90               # %, 范围:80~95, 默认:90
    recover_loading_pct: 85              # %, 范围:70~90, 默认:85
    step_reduction_pct: 10               # %, 范围:5~25, 默认:10
    step_interval_s: 30                  # s, 范围:5~120, 默认:30
    ocpp_version: "1.6J"                 # OCPP版本

  # ==================== 光伏消纳 ====================
  pv_self_consume:
    id: "pv_self_consume_v2"
    enabled: true
    charge_priority: "pv_surplus"         # pv_surplus/grid_valley/hybrid
    grid_export_allowed: false            # 是否允许上网
    max_export_kw: 0                     # 上网限额(kW), 范围:0~P_pcc
    soc_full_threshold: 90               # SOC满阈值(%), 范围:80~95, 默认:90
    pv_curtailment_modbus: 40300          # 光伏限功率Modbus地址

  # ==================== 应急备电 ====================
  emergency_backup:
    id: "emergency_backup_v2"
    enabled: true
    soc_reserve_pct: 50                   # 平时SOC预留(%), 范围:20~80, 默认:50
    soc_min_backup_pct: 10               # 备电最低SOC(%), 范围:3~20, 默认:10
    target_voltage_v: 380                # V, 默认:380
    target_frequency_hz: 50.0            # Hz, 默认:50.0
    build_up_time_ms: 200               # ms, 范围:50~500, 默认:200

    load_classification:
      level_1_critical:
        - { name: "消防系统", power_kw: 30 }
        - { name: "应急照明", power_kw: 10 }
        - { name: "通信系统", power_kw: 5 }
        - { name: "安防系统", power_kw: 8 }
      level_2_important:
        - { name: "办公负荷", power_kw: 100 }
        - { name: "空调系统", power_kw: 150 }
        - { name: "生产负荷", power_kw: 200 }
      level_3_disposable:
        - { name: "充电桩", power_kw: 240 }
        - { name: "景观照明", power_kw: 20 }

  # ==================== 通信配置 ====================
  communication:
    bms_protocol: "Modbus_RTU"           # Modbus_RTU / CAN / IEC61850
    bms_baudrate: 9600                   # 波特率
    bms_poll_interval_ms: 500            # BMS轮询间隔 (ms)
    pcs_protocol: "Modbus_TCP"           # Modbus_TCP / IEC61850 / CAN
    pcs_ip: "192.168.1.10"
    pcs_port: 502
    pcs_poll_interval_ms: 200            # PCS轮询间隔 (ms)
    meter_protocol: "Modbus_TCP"
    meter_ip: "192.168.1.20"
    meter_port: 502
    meter_poll_interval_ms: 200          # 电表轮询间隔 (ms)
    comm_loss_timeout_ms: 500            # 通信中断判定时间 (ms)
    comm_loss_action: "stop_pcs"          # stop_pcs / idle / last_command

  # ==================== 日志与监控 ====================
  logging:
    level: "INFO"                         # DEBUG/INFO/WARN/ERROR
    strategy_log_interval_s: 60           # 策略日志记录间隔 (s)
    power_data_log_interval_s: 5          # 功率数据记录间隔 (s)
    soc_log_interval_s: 30               # SOC记录间隔 (s)
    alarm_history_days: 90               # 告警历史保留天数
```

---

## 十一、策略验证与仿真

### 11.1 离线仿真

```
输入数据:
  1. 负荷曲线: P_load(t), 15分钟间隔, 典型日/峰值日/谷值日
  2. 光伏曲线: P_pv(t), 15分钟间隔, 晴天/阴天/雨天
  3. 电价曲线: C(t), 按时段分时电价
  4. 初始SOC: SOC_0 (典型50%~80%)

输出结果:
  1. 充放电曲线: P_pcs(t), 正=充电, 负=放电
  2. SOC曲线: SOC(t), 验证SOC在边界内
  3. PCC功率曲线: P_pcc(t), 验证无逆流
  4. 日收益: R_day (元)
  5. 月需量: D_month (kVA)
  6. 循环次数: N_cycle (等效)
  7. 累计衰减: Q_loss (%)

仿真步骤:
  for t = 0 to 24h (step = 15min):
    1. 读取P_load(t), P_pv(t), C(t)
    2. 判断时段
    3. 计算P_pcs = peak_shaving_decision(SOC, P_load, P_pv, timeslot)
    4. 更新SOC: SOC(t+Δt) = SOC(t) - P_pcs × Δt / E_bess
    5. 计算P_pcc = P_load - P_pv - P_pcs (验证防逆流)
    6. 累计收益: R += P_pcs_discharge × Δt × C(t)
    7. 记录数据点
```

### 11.2 在线验证

```
验证流程:
  Step 1: 策略配置审核 (静态检查)
    - 参数范围检查
    - SOC边界合理性
    - 时段重叠检查
    - 保护定值合理性

  Step 2: 小功率试运行 (10% × P_pcs_rated)
    - 限制PCS最大功率为10%额定
    - 运行24小时
    - 监控: SOC变化、PCC功率、温度、通信状态
    - 对比预期: 充放电时段是否正确, 功率方向是否正确

  Step 3: 逐步加大功率 (30% → 50% → 80% → 100%)
    - 每级运行4小时
    - 检查: 功率跟踪精度、响应时间、叠加效果

  Step 4: 全功率运行
    - 持续运行72小时
    - 评估: 日收益、需量控制效果、防逆流动作次数

  Step 5: 异常场景测试
    - 通信中断恢复
    - 电网电压异常
    - SOC边界触发
    - 并离网切换(如适用)
```

### 11.3 安全检查清单

```python
def validate_strategy_config(config: dict) -> list:
    """
    策略配置安全验证
    返回: 错误列表 (空=通过)
    """
    errors = []

    # 1. SOC边界检查
    chem = config["soc_management"]["chemistry"]
    bounds = config["soc_management"]["boundaries"][chem]
    if bounds["soc_discharge_cutoff"] >= bounds["soc_charge_cutoff"]:
        errors.append("SOC错误: 放电截止SOC >= 充电截止SOC")
    if bounds["soc_emergency_stop"] >= bounds["soc_discharge_cutoff"]:
        errors.append("SOC错误: 急停SOC >= 放电截止SOC")
    if bounds["soc_overcharge_protect"] <= bounds["soc_charge_cutoff"]:
        errors.append("SOC错误: 过充保护SOC <= 充电截止SOC")
    if bounds["soc_overdischarge_protect"] >= bounds["soc_emergency_stop"]:
        errors.append("SOC错误: 过放保护SOC >= 急停SOC")

    # 2. 功率越限检查
    if config["system"]["pcs_total_power_kw"] > config["system"]["transformer_capacity_kva"]:
        errors.append("功率错误: PCS总功率 > 变压器容量")

    # 3. 保护定值合理性
    ar = config["anti_reverse"]
    if ar["relay_action_pct"] >= ar["reverse_threshold_pct"]:
        errors.append("防逆流错误: 继电器动作值 >= 策略层阈值 (应更敏感)")

    # 4. 时段重叠检查
    periods = config["peak_shaving"]["time_periods"]
    all_periods = []
    for slot in ["peak", "flat", "valley"]:
        for p in periods[slot]:
            all_periods.append((slot, p["start"], p["end"]))
    for i in range(len(all_periods)):
        for j in range(i + 1, len(all_periods)):
            s1, e1 = all_periods[i][1], all_periods[i][2]
            s2, e2 = all_periods[j][1], all_periods[j][2]
            if s1 < e2 and s2 < e1:
                errors.append(f"时段重叠: {all_periods[i][0]}与{all_periods[j][0]}重叠")

    # 5. 电价合理性
    prices = config["peak_shaving"]["electricity_price"]
    if prices["valley"] >= prices["flat"]:
        errors.append("电价错误: 谷电价 >= 平电价")
    if prices["flat"] >= prices["peak"]:
        errors.append("电价错误: 平电价 >= 峰电价")

    # 6. 叠加速率检查
    pcs_rated = config["system"]["pcs_rated_power_kw"]
    ramp_limit = pcs_rated * 0.10  # 10%/min
    if ramp_limit < 10:  # 至少10kW/min
        errors.append(f"叠加速率过低: {ramp_limit}kW/min < 10kW/min")

    return errors
```

---

## 十二、常见策略设计错误与纠正

### 12.1 错误1: SOC边界设置过宽

```
错误: SOC工作范围0%~100%, 无任何保护裕量
后果: 电池过充过放, 寿命急剧缩短, 可能引发安全事故
纠正:
  - LFP: 10%~90% (DOD=90%, 循环3000次)
  - NMC: 15%~85% (DOD=85%, 循环1500次)
  - 铅碳: 20%~95% (DOD=80%, 循环1500次)
  - 过充保护: 充电截止SOC+5%
  - 过放保护: 放电截止SOC-5%
  - 急停: 放电截止SOC-5%再减5%

计算示例 (LFP 1000kWh, 投资150万):
  DOD=90%: 循环3000次, 寿命8.2年(日1循环)
  DOD=100%: 循环800次, 寿命2.2年(寿命缩短73%)
  损失: 150万 × (8.2-2.2)/8.2 = 109万元
```

### 12.2 错误2: 削峰填谷时段与实际电价时段不匹配

```
错误: 使用默认时段(如08-12峰), 但实际所在省份电价时段不同
后果: 在平电价时段放电(收益低), 在峰电价时段充电(成本高)
纠正:
  - 从当地电网电价文件自动导入时段
  - 参考本Skill第2.6节各省典型峰谷时段
  - 部分省份有尖峰/深谷电价, 需额外配置
  - 建议首次部署前向当地供电局确认最新时段

检查方法:
  对比实际电费账单中的分时电量与策略时段
  如偏差>10%, 需调整时段配置
```

### 12.3 错误3: 多策略叠加功率超PCS额定

```
错误: 削峰填谷放电500kW + 需量控制放电200kW = 700kW > PCS额定500kW
后果: PCS过载保护动作, 策略失效, 甚至PCS损坏
纠正:
  - 叠加后必须限幅: P_total = min(ΣP_strategies, P_pcs_rated)
  - 按优先级分配: 削峰填谷(优先) > 需量控制(次之) > 频率调节(再次)
  - 叠加速率限制: ≤10%P_pcs_rated/min

代码纠正:
  P_total = P_peak_shaving + P_demand_control + P_freq_regulation
  P_total = min(P_total, P_pcs_rated)  # 限幅
  P_total = apply_ramp_rate(P_total, P_last, ramp_rate=0.10)  # 速率限制
```

### 12.4 错误4: 防逆流阈值设置过低导致频繁动作

```
错误: 逆流阈值设为0kW(完全禁止), 无滞回, 无死区
后果: 负荷微小波动导致防逆流频繁动作, PCS反复调节, 设备磨损
纠正:
  - 策略层阈值: 5% × P_pcc (例: P_pcc=1000kW → 阈值50kW)
  - 滞回宽度: 2% × P_pcc (例: 20kW)
  - 控制死区: ±1kW (死区内不调节)
  - 滤波窗口: 1秒滑动平均 (抑制瞬时波动)

触发/恢复逻辑:
  触发: P_pcc < -50kW (反送超过50kW)
  恢复: P_pcc > -(50-20)kW = -30kW (反送降到30kW以下)
  死区: |P_pcc_command_change| < 1kW → 不下发新指令
```

### 12.5 错误5: 并离网切换无同期检查

```
错误: 电网恢复后直接合闸并网, 不检查电压差/频率差/相角差
后果: 非同期并网, 产生巨大冲击电流(可达10倍额定), 损坏PCS和断路器
纠正:
  必须满足三个同期条件:
    |ΔV| < 5% × V_nominal  → |ΔV| < 19V (380V系统)
    |Δf| < 0.2Hz
    |Δφ| < 5°
  同期检查时间: 连续满足300ms
  合闸时间: <50ms (断路器固有合闸时间)

同期失败处理:
  如300s内同期条件不满足:
    1. 调整储能V/f输出, 主动趋近电网
    2. 如仍无法同期, 告警"同期失败", 维持离网运行
    3. 人工确认后可强制并网(需授权)
```

### 12.6 错误6: 需量控制不考虑储能充电功率

```
错误: 需量控制仅考虑放电削峰, 忽略储能充电增加的需量
后果: 谷时段充电功率叠加到负荷上, 推高月最大需量, 需量电费反而增加
纠正:
  需量计算必须包含储能充电功率:
    P_total = P_load + P_bess_charge - P_bess_discharge
  谷时段充电功率限制:
    P_charge_limit = D_target - P_load (充电功率不超过需量目标-当前负荷)
  如P_load已接近D_target, 充电功率需大幅降额
```

### 12.7 错误7: 温度降额未考虑PCS侧

```
错误: 仅对电池温度降额, 忽略PCS/逆变器温度
后果: 电池温度正常但PCS过温, PCS过温保护动作, 策略失效
纠正:
  降额取两者最严格值:
    K_derate = min(K_battery_temp, K_pcs_temp)
  PCS温度降额曲线:
    T_pcs < 45℃: 100%
    45~55℃: 线性降额 100%→50%
    > 55℃: 停机
```

### 12.8 错误8: 通信中断处理不当

```
错误: 通信中断后继续按最后指令执行, 或PCS保持在当前功率
后果: 通信中断期间SOC可能越限, 或逆流无法控制
纠正:
  通信中断处理策略(可配置):
    1. "stop_pcs": PCS停机 (最安全, 推荐)
    2. "idle": PCS转待机 (功率归零)
    3. "last_command": 保持最后指令 (仅短时中断<30s可用)
  通信中断判定: 连续3次读取失败或超时500ms
  通信恢复后: 自动恢复策略执行, 重新读取SOC/功率状态
```

### 12.9 错误汇总表

```
编号 | 错误描述                      | 后果                     | 纠正措施
────┼──────────────────────────────┼─────────────────────────┼──────────────────────
 1  | SOC边界设置过宽(0~100%)       | 电池寿命缩短73%          | LFP:10~90%,NMC:15~85%
 2  | 峰谷时段与实际电价不匹配       | 收益降低甚至亏损         | 从电价文件自动导入
 3  | 多策略叠加功率超PCS额定        | PCS过载保护动作          | min(ΣP, P_pcs_rated)
 4  | 防逆流阈值过低无滞回           | PCS频繁调节,设备磨损     | 阈值5%P_pcc+滞回2%
 5  | 并离网切换无同期检查           | 非同期并网,损坏设备      | ΔV<5%+Δf<0.2Hz+Δφ<5°
 6  | 需量控制不考虑充电功率         | 需量电费反而增加         | P_total含P_charge
 7  | 温度降额未考虑PCS侧           | PCS过温保护动作          | min(K_batt, K_pcs)
 8  | 通信中断处理不当              | SOC越限/逆流失控         | 通信中断→PCS停机
```

---

## 附录A: 关键公式速查

```
削峰填谷充电功率:
  P_charge = min(P_pcs_rated×ratio, P_tf_margin, (SOC_max-SOC_now)×E_bess/Δt)

削峰填谷放电功率:
  P_discharge = min(P_pcs_rated×ratio, (SOC_now-SOC_min)×E_bess/Δt, P_load)

防逆流策略层:
  P_export_limit = max(0, P_load - P_pv - P_bess)

需量控制放电功率:
  P_discharge = P_realtime - D_target + margin

备电时长:
  T_backup = E_bess × (SOC_now - SOC_min) / P_critical_load

衰减模型:
  Q_loss(n) = a × n^0.5 × exp(Ea / (R × T))

温度降额:
  T>45℃:80%, T>50℃:50%, T>55℃:停机

同期条件:
  ΔV<5%Un, Δf<0.2Hz, Δφ<5°
```

## 附录B: Modbus寄存器速查

```
地址范围   | 用途                  | 说明
──────────┼──────────────────────┼────────────────────
40000-40099 | BMS状态寄存器        | SOC/温度/电压/报警
40100-40199 | 防逆流控制寄存器     | 使能/限幅/继电器/阈值
40200-40299 | PCS控制寄存器        | 功率指令/模式/状态
40300-40399 | 光伏控制寄存器       | 限功率/逆变器开关
40400-40499 | 充电桩控制寄存器     | OCPP桥接/功率限制
40500-40599 | 需量控制寄存器       | 需量值/目标/状态
40600-40699 | 并离网控制寄存器     | 模式/同期/断路器
40700-40799 | 策略使能寄存器       | 各策略使能/优先级
40800-40999 | 预留                | 未来扩展
```

## 附录C: 执行周期速查

```
层级   | 周期    | 响应要求  | 执行内容
──────┼────────┼──────────┼──────────────────────
Layer0 | <1ms   | <1ms     │ BMS/PCS固件级保护
Layer1 | 100ms  | ≤200ms   │ SOC边界/功率限幅/温度降额
Layer2 | 1s     | ≤1s      │ 运行模式(削峰填谷/防逆流/需量...)
Layer3 | 5s     | ≤5s      │ 策略叠加(EV限功率/变压器/频率...)
```
