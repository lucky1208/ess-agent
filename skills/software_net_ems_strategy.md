---
name: software-net-ems-strategy
description: >
  EMS能量管理策略编译Skill。将自然语言描述的运营目标(削峰填谷、防逆流、需量控制、
  SOC边界管理、充电桩限功率、应急备电、光伏消纳最大化)自动转换为可执行的策略
  配置(YAML/JSON/结构化参数表)。覆盖所有储能运营场景的策略模板、参数边界、安全
  约束、异常处理逻辑。包含SOC管理阈值规范(按电池化学类型)、峰谷时段电价快速配置、
  多目标冲突消解规则、策略优先级与叠加速率控制。适用场景：工商业储能、光储充一体、
  微电网的EMS策略设计与部署。
  使用本skill可确保策略输出可直接加载到EMS系统执行。
---

# EMS策略编译专业Skill v1.0

## 目录

- [一、EMS策略体系总览](#一ems策略体系总览)
- [二、NLP到策略的语义映射表](#二nlp到策略的语义映射表)
- [三、削峰填谷策略](#三削峰填谷策略)
- [四、防逆流策略](#四防逆流策略)
- [五、需量控制策略](#五需量控制策略)
- [六、SOC管理策略](#六soc管理策略)
- [七、充电桩限功率策略](#七充电桩限功率策略)
- [八、光伏消纳最大化策略](#八光伏消纳最大化策略)
- [九、应急备电策略](#九应急备电策略)
- [十、电力现货/辅助服务策略](#十电力现货辅助服务策略)
- [十一、多策略融合与冲突消解](#十一多策略融合与冲突消解)
- [十二、策略参数边界与安全约束总表](#十二策略参数边界与安全约束总表)
- [十三、策略配置YAML/JSON模板](#十三策略配置yamljson模板)
- [十四、策略验证与仿真检查清单](#十四策略验证与仿真检查清单)
- [十五、常见策略设计错误](#十五常见策略设计错误)

---

## 一、EMS策略体系总览

### 1.1 策略分类与优先级

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
│   ├── Mode-A: 削峰填谷 (Peak Shaving & Valley Filling)   │
│   ├── Mode-B: 防逆流 (Anti-Reverse Power)                │
│   ├── Mode-C: 需量管理 (Demand Charge Management)        │
│   ├── Mode-D: 光伏消纳 (PV Self-Consumption Max)         │
│   ├── Mode-E: 应急备电 (Emergency Backup)                │
│   ├── Mode-F: 电力现货 (Spot Market Trading)             │
│   └── Mode-G: 自定义 (Custom Schedule)                   │
├─────────────────────────────────────────────────────────┤
│ Layer 3: 辅助优化层 (叠加在主模式上)                     │
│   ├── 充电桩智能限功率                                    │
│   ├── 变压器负载率管理                                    │
│   └── 需量预测矫正                                        │
└─────────────────────────────────────────────────────────┘
```

### 1.2 策略执行周期与响应时间

```
策略类型          | 计算周期 | 指令下发周期 | 响应时间要求 | 适用场景
─────────────────┼────────┼────────────┼────────────┼──────────
削峰填谷(日前)    | 日级    | 1 min       | ≤ 5s       | 预调度
削峰填谷(日内)    | 5 min  | 15s         | ≤ 3s       | 实时调节
防逆流           | 1s     | 500ms       | ≤ 500ms    | 实时控
需量控制         | 1 min  | 15s         | ≤ 3s       | 实时控
SOC管理          | 实时   | 500ms       | 立即        | BMS级实时
充电桩限功率     | 10s    | 5s          | ≤ 2s       | 准实时
光伏消纳         | 5s     | 5s          | ≤ 2s       | 准实时
应急备电         | 事件   | 立即         | ≤ 200ms    | 紧急
现货交易         | 15 min | 5 min       | ≤ 30s      | 电力市场
```

---

## 二、NLP到策略的语义映射表

### 2.1 自然语言→策略参数映射

```
用户输入(自然语言)                          | 映射策略ID    | 核心参数
───────────────────────────────────────────┼─────────────┼──────────────────
"削峰填谷, 谷电充电, 峰电放电"              | Mode-A       | peak_periods, valley_periods
"不允许向电网反送电"                        | Mode-B       | reverse_power_limit=0
"反送功率不超过变压器容量的5%"              | Mode-B       | reverse_power_limit=5%
"每月需量不得超过800kVA"                    | Mode-C       | demand_limit=800
"变压器负载率不超过80%"                     | Mode-C       | transformer_limit=80%
"SOC保持在20%到90%之间"                    | Layer1-SOC   | soc_min=20, soc_max=90
"应急备电, 平时SOC不低于50%"                | Mode-E       | soc_reserve=50, mode=backup
"光伏尽量自发自用, 不浪费"                  | Mode-D       | pv_self_consume=true
"电价低时多充电"                            | Mode-A       | valley_charge=true
"电价高时放电"                              | Mode-A       | peak_discharge=true
"充电桩功率在变压器负载率高时降低"          | Layer3-EV    | ev_power_limit_by_transformer
"消防报警后立即全部停机"                    | Layer0-FSS   | fss_shutdown=immediate
"通信中断后PCS停机"                         | Layer1-COM   | comm_loss_action=stop
"晚上11点到早上7点充电"                     | Mode-A       | charge_window=[23:00,07:00]
"上午9点到11点, 下午2点到4点放电"           | Mode-A       | discharge_windows
"SOC低于10%禁止放电, 高于95%禁止充电"       | Layer1-SOC   | soc_min_discharge=10, soc_max_charge=95
"电池温度超过45度降功率一半"                | Layer1-TEMP  | temp_derate: 45°C@50%
"电池温度超过55度停机"                      | Layer0-TEMP  | temp_shutdown: 55°C
"分时电价: 峰1.2元, 平0.8元, 谷0.4元"      | Mode-A       | price: [1.2, 0.8, 0.4]
"按需量电费35元/kVA/月"                     | Mode-C       | demand_charge_rate=35
```

### 2.2 策略匹配决策树

```
输入: 用户自然语言描述
  │
  ├── 包含"反送/逆流/倒送"等关键词？
  │   └── 是 → 启用Mode-B(防逆流), 提取反送功率限制值
  │
  ├── 包含"需量/变压器负载率/容量费"等关键词？
  │   └── 是 → 启用Mode-C(需量管理), 提取限值
  │
  ├── 包含"削峰/填谷/分时电价/谷电充"等关键词？
  │   └── 是 → 启用Mode-A(削峰填谷), 提取时段+电价
  │
  ├── 包含"应急/备电/保电/关键负荷"等关键词？
  │   └── 是 → 启用Mode-E(应急备电), 提取SOC预留值
  │
  ├── 包含"光伏消纳/自发自用/不要浪费光伏"等关键词？
  │   └── 是 → 启用Mode-D(光伏消纳), 设置自发自用优先
  │
  ├── 包含"充电桩/限功率/降功率"等关键词？
  │   └── 是 → 启用Layer3-EV, 提取功率限制条件
  │
  ├── 包含"SOC/电池/截止/边界"等关键词？
  │   └── 是 → 设置Layer1-SOC保护边界
  │
  └── 默认 → 推荐Mode-A(削峰填谷)作为基础策略
```

---

## 三、削峰填谷策略

### 3.1 策略逻辑

```
策略目标: 在低电价时段(谷/平)充电, 在高电价时段(峰)放电, 获取电价差收益,
          同时降低用户侧峰值负荷。

算法核心:
  P_pcs(t) = f( SOC(t), P_load(t), P_pv(t), TimeSlot(t), Price(t) )

运行时序:
  1. 判断当前时段(峰/平/谷)
  2. 计算净负荷: P_net = P_load - P_pv
  3. 根据SOC和时段决定PCS功率:
     - 谷时段 + SOC<充电上限 → P_pcs = +P_charge (充电)
     - 峰时段 + SOC>放电下限 → P_pcs = -P_discharge (放电)
     - 平时段 → P_pcs = 0 (或微调)
  4. 约束检查(防逆流/需量/SOC)
  5. 下发PCS功率指令
```

### 3.2 参数配置

```yaml
strategy_peak_shaving:
  id: "peak_shaving_v1"
  enabled: true
  mode: "time_based"              # time_based(按时段) / prediction_based(按预测)

  # 时段定义(中国典型大工业分时)
  time_periods:
    peak:
      - { start: "09:00", end: "12:00" }
      - { start: "17:00", end: "22:00" }
    flat:
      - { start: "08:00", end: "09:00" }
      - { start: "12:00", end: "17:00" }
      - { start: "22:00", end: "23:00" }
    valley:
      - { start: "23:00", end: "07:00" }

  # 时段电价(元/kWh) - 可选, 用于收益计算
  electricity_price:
    peak: 1.20
    flat: 0.80
    valley: 0.40
    demand_charge_kva_per_month: 35    # 需量电费(元/kVA/月)

  # 充放电功率设定
  charge:
    power_kw: null            # null=用PCS最大充电功率; 填数值=限功率
    power_ratio: 1.0          # 充电功率系数(0~1.0), 乘以PCS额定功率
    soc_target: 95            # 谷电充电目标SOC(%)
    method: "constant_power"  # constant_power / dynamic / schedule

  discharge:
    power_kw: null
    power_ratio: 1.0          # 放电功率系数
    soc_target: 15            # 放电截止SOC(%)
    method: "constant_power"  # constant_power / peak_shaving / load_following
    discharge_only_peak: true # 仅峰时段放电? false=平段也放(如平段电价也较高)

  # 负荷跟随模式(Discharge Method = load_following 时生效)
  load_following:
    target_load_kw: 0         # 目标净负荷(储能放电后, 从电网看), 0=完全自供
    max_discharge_kw: null    # 最大放电功率限制

  # 防反送(削峰填谷模式下的子约束)
  anti_reverse:
    enabled: true
    limit_kw: 0               # 0=完全禁止反送; >0=允许反送此功率
    margin_kw: 10             # 安全裕量(预留, 防止超调)

  # 变压器容量约束
  transformer_limit:
    enabled: true
    capacity_kva: 1250
    max_loading_pct: 80       # 最大负载率(%)

  # 节假日特殊调度
  holiday_schedule:
    enabled: false
    holiday_list: []           # YYYY-MM-DD 列表
    holiday_mode: "off"        # 节假日策略: off(停机) / valley_all_day(全天谷) / keep(照常)
```

### 3.3 削峰填谷算法流程(伪代码)

```python
def peak_shaving_algorithm(soc, p_load, p_pv, timeslot, config):
    # 1. 计算净负荷
    p_net = p_load - p_pv  # 正=需从电网取电, 负=光伏富余
    
    # 2. SOC保护边界的越权处理
    soc_safe = soc_check(soc, config.soc_min, config.soc_max)
    if not soc_safe:
        return 0  # SOC越限→PCS不动作
    
    # 3. 按时段决策
    p_pcs = 0
    if timeslot == "valley":
        # 谷电: 如果SOC未满, 充电
        if soc < config.charge.soc_target:
            p_pcs = + config.charge.power_ratio * PCS_CHARGE_MAX
            # 如果有光伏, 光伏优先充储能, 不足的从电网取
            if p_pv > 0:
                p_pcs = min(p_pcs, PCS_CHARGE_MAX - p_pv_minus_load)
    elif timeslot == "peak":
        # 峰电: 如果SOC足够, 放电
        if soc > config.discharge.soc_target:
            # 负荷跟随模式: 尽量用储能满足负荷
            if config.discharge.method == "load_following":
                p_pcs = -min(max(p_net, 0), config.discharge.max_discharge_kw)
            # 恒功率模式: 固定功率放电
            else:
                p_pcs = - config.discharge.power_ratio * PCS_DISCHARGE_MAX
    elif timeslot == "flat" and config.discharge.discharge_only_peak == False:
        # 平电也可放电(用户配置)
        if soc > config.discharge.soc_target:
            p_pcs = - config.discharge.power_ratio * PCS_DISCHARGE_MAX * 0.5  # 减半
    
    # 4. 约束检查
    p_pcs = apply_constraints(p_pcs, soc, p_net, config)
    
    return p_pcs

def apply_constraints(p_pcs, soc, p_net, config):
    # 防逆流约束
    if config.anti_reverse.enabled:
        p_grid = p_net + (-p_pcs)  # pcs放电时p_pcs为负, p_grid是电网侧功率
        if p_grid < -config.anti_reverse.limit_kw - config.anti_reverse.margin_kw:
            p_pcs = -(p_net + config.anti_reverse.limit_kw + config.anti_reverse.margin_kw)
            p_pcs = max(p_pcs, 0)  # 如果调节后pcs应为充电方向, 则设0
    
    # 变压器负载率约束
    if config.transformer_limit.enabled:
        p_transformer = abs(p_net + p_pcs)
        max_transformer_power = config.transformer_limit.capacity_kva * config.transformer_limit.max_loading_pct / 100
        if p_transformer > max_transformer_power:
            # 需要降低储能放电(如果正在放电)或增加储能充电(如果光伏富余)
            # 简化: 按比例缩减PCS功率
            scale = max_transformer_power / p_transformer
            p_pcs = p_pcs * scale
    
    return p_pcs
```

### 3.4 各省典型峰谷时段参考

```
省份     | 峰时段                    | 平时段                    | 谷时段
────────┼─────────────────────────┼─────────────────────────┼─────────────
广东     | 10:00-12:00, 14:00-19:00| 08:00-10:00, 12:00-14:00| 00:00-08:00
         |                         | 19:00-00:00             |
浙江     | 08:00-11:00, 13:00-19:00| 11:00-13:00, 19:00-21:00| 21:00-08:00
江苏     | 08:00-12:00, 17:00-21:00| 12:00-17:00, 21:00-24:00| 00:00-08:00
山东     | 08:30-11:30, 16:00-21:00| 06:30-08:30, 11:30-16:00| 23:00-06:30
         |                         | 21:00-23:00             |
北京     | 10:00-15:00, 18:00-21:00| 07:00-10:00, 15:00-18:00| 23:00-07:00
         |                         | 21:00-23:00             |
```

---

## 四、防逆流策略

### 4.1 策略逻辑

```
策略目标: 确保PCC处不向电网反送功率(或限制在约定值内)。
          典型场景: 用户与电网约定不自发自用余量上网, 或未取得反送许可。

控制原理:
  检测PCC功率: P_pcc = P_load - P_pv - P_pcs(放电方向)
  目标: P_pcc ≥ 0 (从电网看是流入, 即不反送)
  
  当检测到 P_pcc < 0 时(即将反送):
    方案1: 降低PCS放电功率
    方案2: 增加PCS充电功率(用储能消纳光伏余电)
    方案3: 如储能已满, 降低光伏发电(逆变器限功率)
```

### 4.2 参数配置

```yaml
strategy_anti_reverse:
  id: "anti_reverse_v1"
  enabled: true
  priority: "critical"            # critical(高于削峰填谷) / normal

  # 防逆流目标
  reverse_power_limit_kw: 0       # 允许的反送功率上限, 0=完全不允许
  safety_margin_kw: 5             # 安全裕量(实际控制到_limit - margin)
  # 例: limit=5kW, margin=5kW → 实际控制到PCC流入≥0kW

  # 检测参数
  meter_device: "meter_pcc"       # PCC关口表设备ID
  meter_point_id: "active_power"  # 关口表有功功率点
  meter_sample_interval_ms: 200   # 采样间隔
  filter_window_ms: 1000          # 滑动平均滤波窗(防瞬时波动误触发)

  # 控制响应
  response:
    mode: "pcs_priority"          # pcs_priority(先调PCS) / pv_priority(先限光伏)
    pcs_response_time_ms: 500     # PCS功率调节响应时间要求
    pv_response_time_ms: 2000     # 光伏限功率响应时间
    deadband_kw: 1                # 控制死区(在target±deadband内不调节)

  # 多级控制
  control_stages:
    - level: 1
      threshold_kw: -5            # PCC流入<-5kW (即反送>5kW)
      action: "reduce_pcs_discharge"  # 减小PCS放电
      ramp_rate_kw_per_s: 10
      timeout_s: 3

    - level: 2
      threshold_kw: -10           # 反送>10kW
      action: "charge_bess"       # PCS转为充电模式消纳
      ramp_rate_kw_per_s: 20
      timeout_s: 1

    - level: 3
      threshold_kw: -20           # 反送>20kW
      action: "curtail_pv"        # 限光伏发电
      ramp_rate_kw_per_s: 50
      timeout_s: 0.5

    - level: 4
      threshold_kw: -50           # 反送>50kW (严重越限)
      action: "trip_pcc"          # 跳闸PCC断路器（最后防线）
      timeout_s: 0

  # 故障安全(Fail-Safe)
  failsafe:
    comm_loss_action: "stop_pcs"    # 通信中断→PCS停机(防反送控制失效)
    meter_fault_action: "stop_pcs"  # 电表故障→PCS停机
```

### 4.3 防逆流与削峰填谷的协调

```
场景: 用户同时需要"削峰填谷"和"防逆流"

冲突点:
  - 峰时段放电时, 如果光伏很大 + 负荷很小, 储能放电可能导致反送
  - 谷时段充电时, 如果光伏大于充电功率 + 负荷, 余电也会反送

协调方案:
  1. 优先级: 防逆流 > 削峰填谷 (安全/合同优先于经济)
  2. 决策流程:
     a. 先用削峰填谷算法计算 P_pcs_ideal (理想功率)
     b. 计算该功率下的PCC净功率 P_pcc_expected
     c. 如果 P_pcc_expected < -reverse_limit:
        → 修正P_pcs, 使得 P_pcc ≥ -reverse_limit
     d. 下发修正后的 P_pcs

  3. 如果修正导致削峰填谷收益大幅减少:
     → 记录日志, 供运营分析 (是否需要调整光伏/储能配置)

公式:
  P_pcs_final = max(P_pcs_ideal, -(P_pv - P_load + reverse_limit + margin))
  # 即: PCS放电功率不能超过"光伏-负荷+反送限值+裕量"
```

---

## 五、需量控制策略

### 5.1 策略逻辑

```
策略目标: 控制用户侧从电网的最大需量不超过合同约定值, 避免需量电费上涨。

需量定义(中国):
  最大需量 = 在结算周期内(通常15分钟), 用户从电网取电的平均功率最大值
  需量电费 = 最大需量(kVA) × 需量电价(元/kVA/月)

控制原理:
  实时监测PCC流入功率的滑动窗口平均值
  当预测值接近需量限值时, 启动储能放电降低电网取电功率
```

### 5.2 参数配置

```yaml
strategy_demand_management:
  id: "demand_management_v1"
  enabled: true

  # 需量限额
  demand_limit_kva: 800            # 合同需量(kVA)
  control_limit_kva: 750           # 控制目标(留50kVA裕量)
  demand_window_min: 15            # 需量计算窗口(分钟), 中国15分钟

  # 预测参数
  prediction:
    method: "sliding_average"       # sliding_average / ml_model
    window_seconds: 900             # 15分钟=900秒滑动窗口
    lookahead_seconds: 120          # 预测未来2分钟的需量走势

  # 控制参数
  control:
    trigger_threshold_pct: 90       # 当前需量达到limit的90%时触发
    target_demand_kva: 700          # 控制目标(低于limit)
    pcs_max_discharge_kw: null      # 需量控制最大放电功率(null=不限)
    pv_curtail_if_needed: true      # 储能不够时是否限光伏
    hysteresis_kva: 20              # 回滞(防止频繁启停)

  # 尖峰负荷管理
  peak_load:
    detection_threshold_kw: 100     # 负荷跳变超过此值判定为尖峰负荷
    reaction_time_ms: 100           # 响应时间
    buffer_soc_pct: 30              # 保留此SOC应对尖峰

  # 变压器保护
  transformer:
    max_load_ratio: 0.80            # 变压器最大负载率(与需量并行约束)
    alarm_ratio: 0.75               # 告警负载率
```

### 5.3 需量控制算法

```python
def demand_control(soc, p_load_history, p_pv, p_pcs_current, config):
    # p_load_history: 过去15分钟的有功功率序列(kW)
    
    # 1. 计算当前需量(15分钟平均功率)
    current_demand = np.mean(p_load_history[-900:])  # 900秒=15分钟
    
    # 2. 计算预测需量(考虑未来趋势)
    trend = np.polyfit(range(120), p_load_history[-120:], 1)[0]  # kW/s
    predicted_demand = current_demand + trend * config.prediction.lookahead_seconds
    
    # 3. 判断是否需要干预
    limit = config.control_limit_kva
    trigger = limit * config.control.trigger_threshold_pct / 100
    
    if predicted_demand < trigger - config.control.hysteresis_kva:
        # 安全范围, 不需要干预
        return None  # 返回None表示维持原策略
    
    # 4. 需要干预: 计算储能需放多少功率
    excess = predicted_demand - config.control.target_demand_kva
    p_discharge_needed = min(excess, config.control.pcs_max_discharge_kw)
    
    # 5. SOC约束
    if soc < config.soc_min_discharge:
        p_discharge_needed = 0
    
    # 6. 光伏约束
    if p_discharge_needed > 0:
        p_pcs = -p_discharge_needed  # 放电方向为负
    else:
        p_pcs = 0
    
    return p_pcs
```

---

## 六、SOC管理策略

### 6.1 策略逻辑

```
策略目标: 确保电池SOC始终在安全运行范围内, 防止过充/过放, 延长电池寿命。

SOC边界分类:
  保护层(硬边界): 超过此边界BMS自动停机 (最大SOC=100%, 最小SOC=0%)
  运行层(软边界): EMS控制在此范围内运行 (如10%~95%)
  优化层: 根据电价和日历优化SOC目标中间值
```

### 6.2 参数配置

```yaml
strategy_soc_management:
  id: "soc_management_v1"
  enabled: true                    # 此策略永远启用, 是安全基础

  # 电池类型 → SOC阈值 (不同化学体系有不同的安全区间)
  chemistry: "LFP"                 # LFP / NMC / LTO / Na-S

  soc_boundaries:
    # 硬安全边界(BMS执行, EMS不能超越)
    hard_max: 100.0                # BMS过充保护触发点(%)
    hard_min: 0.0                  # BMS过放保护触发点(%)
    
    # EMS运行边界(EMS策略最大利用范围)
    soc_max_charge: 95.0           # EMS允许充电最大值(%)
    soc_min_discharge: 10.0        # EMS允许放电最小值(%)
    
    # 推荐运行边界(用于日常调度)
    soc_operating_max: 90.0        # 日常最大SOC (削弱浅充浅放)
    soc_operating_min: 20.0        # 日常最小SOC

  # 功率降额策略(接近SOC边界时逐步降功率)
  derating:
    charge_derate:
      start_soc: 90.0              # 90%开始降充电功率
      # SOC 90%→95% 线性降功率 100%→0%
    discharge_derate:
      start_soc: 20.0              # 20%开始降放电功率
      # SOC 20%→10% 线性降功率 100%→0%

  # SOC日历管理(考虑时段电价)
  calendar_soc:
    enabled: true
    # 各省默认SOC日历(可根据实际电价调整)
    targets:
      - { time: "07:00", soc_target: 90 }   # 峰电开始前充满
      - { time: "09:00", soc_target: 80 }   # 峰电放电中
      - { time: "12:00", soc_target: 40 }   # 午间峰谷间隙
      - { time: "17:00", soc_target: 90 }   # 晚峰开始前充满(如有平电窗口)
      - { time: "22:00", soc_target: 30 }   # 峰电结束
      - { time: "23:00", soc_target: 30 }   # 谷电充电开始 → 到次日7点充到90%

  # SOC保护冗余(应对紧急情况)
  reserve:
    emergency_soc_pct: 20          # 应急备电最低SOC(≥此值时进入应急模式)
    black_start_soc_pct: 25        # 黑启动所需最低SOC
```

### 6.3 不同电池化学的SOC阈值

```
参数                | LFP(磷酸铁锂) | NMC(三元锂) | LTO(钛酸锂) | Na-S(钠硫)
───────────────────┼──────────────┼────────────┼────────────┼────────────
正常工作SOC范围     | 10%~95%      | 15%~90%    | 5%~95%     | 10%~90%
推荐SOC范围         | 20%~90%      | 20%~85%    | 10%~90%    | 15%~85%
过充保护阈值       | 3.65V/电芯   | 4.25V/电芯 | 2.85V/电芯  | ~2.1V/电芯
过放保护阈值       | 2.50V/电芯   | 3.00V/电芯 | 1.50V/电芯  | ~1.7V/电芯
充电温度范围        | 0°C~55°C     | 0°C~45°C   | -30°C~55°C | 290°C~350°C
放电温度范围        | -20°C~60°C   | -20°C~60°C | -40°C~65°C | 290°C~350°C
充电降额起始温度    | 45°C         | 40°C       | 50°C       | 340°C
放电降额起始温度    | 55°C         | 50°C       | 60°C       | 345°C
0°C以下充电处理     | 降功率/禁止   | 禁止充电    | 可正常充电  | 需加热保温
```

### 6.4 SOC估计与校准策略

```yaml
soc_estimation:
  methods:
    - name: "coulomb_counting"
      description: "安时积分法(主方法)"
      formula: "SOC(t) = SOC(0) + ∫(I×η)/C_rated dt"
    - name: "ocv_lookup"
      description: "OCV-SOC查表校正(静置后)"
      trigger_condition: "current < 0.05C 持续 30min"
    - name: "ekf"
      description: "扩展卡尔曼滤波(融合上述两种方法)"
      
  calibration:
    trigger_method: "ocv_lookup"
    calibration_points:
      - soc: 20
        ocv_lookup_enable: true
      - soc: 50
        ocv_lookup_enable: true
      - soc: 80
        ocv_lookup_enable: true
    max_soc_drift_pct: 5           # 最大SOC漂移(%)
```

---

## 七、充电桩限功率策略

### 7.1 策略逻辑

```
策略目标: 在电网供电能力受限时(变压器过载、需量接近上限、储能SOC不足等),
          智能限制充电桩的输出功率, 保证整体系统的安全和经济效益。

触发条件(任一满足即触发):
  1. 变压器负载率 > 限值(如80%)
  2. 当前需量 > 需量限值的90%
  3. 电网限电指令(调度/需量预案)
  4. 储能SOC低于预设值(无法补充功率缺口)
  5. 光伏发电不足(阴雨天)
```

### 7.2 参数配置

```yaml
strategy_ev_power_limit:
  id: "ev_power_limit_v1"
  enabled: true

  # 限功率触发条件
  triggers:
    transformer_overload:
      enabled: true
      max_load_ratio: 0.80        # 变压器80%时触发限功率
      alarm_ratio: 0.75           # 75%时预警

    demand_approaching:
      enabled: true
      threshold_pct: 90           # 需量达到90%限值时触发

    grid_curtailment:
      enabled: false              # 是否接受电网限电指令
      source: "iec104"            # 限电指令来源

    bess_soc_low:
      enabled: true
      soc_threshold_pct: 30       # SOC低于30%触发限功率(储能无法补充)

    pv_insufficient:
      enabled: true
      pv_to_ev_ratio_min: 0.5     # 光伏/充电需求<50%时触发

  # 限功率策略
  limiting:
    strategy: "proportional"      # proportional(按比例) / priority(按优先级) / queue(排队)
    
    # 比例分配模式
    proportional:
      min_power_per_charger_kw: 20   # 单桩最小功率(kW), 低于此停充
      reduction_ratio: [ 0.8, 0.5, 0.3 ]  # 逐级降功率比例
      
    # 优先级模式
    priority:
      vip_charger_ids: []          # VIP充电桩(不限)
      priority_levels:             # 优先级设置: 1=最高, 5=最低
        - charger_id: "charger01"
          priority: 1
        - charger_id: "charger02"
          priority: 3

  # 恢复条件
  recovery:
    hysteresis_minutes: 5          # 解除限功率后至少稳定5分钟
    ramp_up_rate_kw_per_s: 5       # 恢复速率(避免冲击)
```

### 7.3 充电桩功率分配算法

```python
def ev_power_allocation(p_transformer_available, p_pv, p_bess_discharge, ev_chargers, config):
    # p_transformer_available: 变压器剩余可用容量(kW)
    # ev_chargers: [{id, requested_power, priority, in_use}]
    
    # 1. 计算可分配给充电桩的总功率
    p_total_available = p_transformer_available + p_pv + min(p_bess_discharge, 0)  # bess放电为负
    
    # 2. 计算充电桩总需求
    p_ev_total_requested = sum(c["requested_power"] for c in ev_chargers if c["in_use"])
    
    # 3. 如果需求 < 可用, 无需限功率
    if p_ev_total_requested <= p_total_available:
        return {c["id"]: c["requested_power"] for c in ev_chargers}
    
    # 4. 需要限功率
    if config.limiting.strategy == "proportional":
        ratio = p_total_available / p_ev_total_requested
        allocation = {}
        for c in ev_chargers:
            allocated = c["requested_power"] * ratio
            if allocated < config.limiting.proportional.min_power_per_charger_kw:
                allocated = 0  # 太低则停充
            allocation[c["id"]] = allocated
    
    elif config.limiting.strategy == "priority":
        # 按优先级排序, 高优先级优先分配
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

## 八、光伏消纳最大化策略

### 8.1 策略逻辑

```
策略目标: 最大化光伏就地消纳率, 减少向电网反送电, 降低弃光率。

典型场景:
  - 光伏 > 负荷 → 余电充储能 → 储能满 → 限光伏(弃光) or 反送(如允许)
  - 光伏 < 负荷 → 储能补充 → 储能不足 → 从电网取电补充

能量流动优先级:
  1. 光伏 → 负荷 (直接供给, 无转换损耗)
  2. 光伏 → 储能 (消纳余电, DC耦合效率高)
  3. 储能 → 负荷 (光伏不足时释放)
  4. 光伏 → 电网 (仅当储能满且允许反送)
  5. 电网 → 负荷 (光伏+储能不足)
```

### 8.2 参数配置

```yaml
strategy_pv_self_consumption:
  id: "pv_self_consumption_v1"
  enabled: true

  self_consumption:
    target_rate_pct: 95            # 目标自消纳率(%)
    priority_sequence:
      - "direct_load"              # 1.光伏直供负荷
      - "charge_bess"              # 2.余电充储能
      - "heat_water"               # 3.余电供热(如有热泵/电锅炉)
      - "export_grid"              # 4.最后才反送

  curtailment:                     # 弃光策略
    method: "soc_based"            # soc_based(储能满时弃光) / voltage_based / none
    trigger_soc: 95                # SOC≥95%时启动弃光
    curtail_mode: "soft"           # soft(降功率) / hard(断开组串)
    ramp_rate_pct_per_s: 1         # 弃光速率(%/s)
    min_pv_operation_pct: 10       # 最小运行功率% (防频繁启停)

  bess_priority_charge:
    enabled: true                  # 光伏优先充储能
    charge_power_limit_kw: null    # 储能充电功率上限(null=额定)
    charge_soc_target: 95          # 充电目标SOC
    
  # 光伏预测
  pv_forecast:
    enabled: true
    method: "weather_based"        # weather_based / historical / hybrid
    update_interval_min: 15
    cloud_cover_adjust: true       # 云量修正

  # 负荷预测
  load_forecast:
    enabled: true
    method: "historical_average"   # historical_average / weekly_pattern
    update_interval_min: 15
```

---

## 九、应急备电策略

### 9.1 策略逻辑

```
策略目标: 在电网故障/计划停电时, 以储能作为应急电源, 保障关键负荷供电。

适用范围:
  - 电网突然停电(非计划)
  - 计划停电检修
  - 限电拉闸(调度指令)
  - 自然灾害预警
```

### 9.2 参数配置

```yaml
strategy_emergency_backup:
  id: "emergency_backup_v1"
  enabled: true

  trigger:
    grid_outage:
      auto_detect: true            # 自动检测电网失电
      voltage_threshold_pct: 60    # 电压低于60%Un持续500ms判定失电
      frequency_threshold_hz: 2.0  # 频率偏差>2Hz持续200ms
      detection_time_ms: 1000      # 检测时间
      confirmation_time_ms: 500    # 确认时间(排除误判)

    scheduled_outage:
      enabled: true
      source: "manual"             # manual(人工录入) / api(调度接口)

  backup:
    # SOC预留管理(平时)
    soc_reserve_min_pct: 50        # 平时SOC不低于此值(保留应急容量)
    soc_reserve_mode: "absolute"   # absolute(绝对SOC) / relative(相对kWh)
    reserve_kwh: 1000              # 保底应急容量(kWh), relative模式时生效

    # 应急放电策略
    critical_loads_kw: 100         # 关键负荷功率(kW)
    max_backup_duration_h: 4       # 最大保障时间(小时)
    # 可用容量 = BESS剩余容量(扣除SOC_reserve后的部分)
    
    load_shedding:                  # 负荷分级投切
      enabled: true
      stages:
        - level: 1
          loads: ["security", "fire_alarm", "comm_rack"]  # 安防/消防/通信
          power_kw: 5
          priority: "critical"
        - level: 2
          loads: ["emergency_lighting", "control_power"]  # 应急照明/控制电源
          power_kw: 10
          priority: "high"
        - level: 3
          loads: ["production_critical"]  # 关键生产
          power_kw: 50
          priority: "medium"
        - level: 4
          loads: ["hvac", "general_lighting"]  # 暖通/一般照明
          power_kw: 35
          priority: "low"

    # 柴油发电机联动(如有)
    diesel_integration:
      enabled: false
      auto_start_after_s: 60       # 电网失电后60s启动柴发
      diesel_ramp_up_s: 30         # 柴发加载时间

  recovery:
    grid_restored:
      auto_resync: false           # 禁止自动并网(安全第一)
      manual_confirm: true         # 必须人工确认电网正常后再操作
      resync_voltage_tolerance_pct: 5
      resync_frequency_tolerance_hz: 0.2
      resync_phase_tolerance_deg: 10
```

### 9.3 应急放电持续时间估算

```
可用放电时间 T(h) = (SOC_current - SOC_min) × BESS_Capacity(kWh) / P_critical_load(kW)

例:
  BESS容量 = 2000kWh
  SOC_current = 80% (应急预留50% + 正常30%)
  SOC_min = 10%
  P_critical_load = 100kW
  → T = (80% - 10%) × 2000 / 100 = 14小时

如果SOC_current = 50% (仅保留应急容量):
  → T = (50% - 10%) × 2000 / 100 = 8小时
```

---

## 十、电力现货/辅助服务策略

### 10.1 电力现货市场策略

```yaml
strategy_spot_market:
  id: "spot_market_v1"
  enabled: false                   # 默认关闭, 仅电力市场参与者开启

  market:
    type: "day_ahead"              # day_ahead / intraday / real_time
    region: "guangdong"            # 广东/浙江/山东/山西...

  trading:
    min_bid_kwh: 1000              # 最小报量(kWh)
    max_bid_power_kw: 500          # 最大报量功率(kW)
    soc_reserve_for_trading: 20    # 交易需预留SOC(%)
    price_threshold:               # 仅当价差大于此值才参与
      charge_max: 0.30             # 充电电价不高于0.3元/kWh
      discharge_min: 0.80          # 放电电价不低于0.8元/kWh
    cycle_cost_per_kwh: 0.05       # 每次充放电循环成本(电池衰减)(元/kWh)

  # AGC/调频辅助服务
  frequency_regulation:
    enabled: false
    regulation_range_kw: 200       # 调频功率范围(±200kW)
    droop_coefficient: 0.04        # 频率-功率下垂系数
    regulation_deadband_hz: 0.033  # 调频死区(±0.033Hz)
    soc_operating_range: [30, 80]  # 调频时的SOC运行范围
```

### 10.2 日前调度优化模型

```
目标函数(最大化日收益):
  Max Σ[ P_discharge(t)×Price(t) - P_charge(t)×Price(t) - Degradation(t) ]

约束条件:
  s.t.
    SOC_min ≤ SOC(t) ≤ SOC_max
    -P_discharge_max ≤ P_pcs(t) ≤ P_charge_max
    SOC(t+1) = SOC(t) + (η_charge×P_charge(t) - P_discharge(t)/η_discharge)×Δt/E_cap
    P_grid(t) + P_pv(t) - P_load(t) - P_charge(t) + P_discharge(t) = 0
    Transformer_Loading(t) ≤ Loading_max

求解方法:
  - 混合整数线性规划(MILP)
  - 动态规划(DP)
  - 强化学习(RL, 在线自适应)
```

---

## 十一、多策略融合与冲突消解

### 11.1 策略融合框架

```
多策略并行运行 → 功率指令融合:

  输入: 各策略提议的PCS功率 P1, P2, P3, ...
  约束: SOC边界、功率限幅、变压器容量、防逆流、需量
  
  融合流程:
    1. Layer 0 安全检查(最高优先级, 否决权)
       if 消防联动 or ESD or 防孤岛 or 电网异常:
         → P_final = 0 (停机)
    
    2. Layer 1 系统约束(硬约束)
       P_proposed = min(P_proposed, P_max_soc_constraint)
       P_proposed = max(P_proposed, -P_max_discharge_constraint)
    
    3. Layer 2 策略融合(多策略→单一功率)
       方法A: 优先级叠加
         P_final = 优先级最高的非零策略的功率
       方法B: 加权平均
         P_final = Σ(wi × Pi) / Σwi
       方法C: 最小值/最大值
         P_final = min(|Pi|) × sign(主导策略)

    4. Layer 3 辅助优化(功率微调)
       P_final = P_final + ΔP_aux (充电桩限功率等)
    
    5. 最终约束检查
       防逆流、变压器容量等最新值再次检查
       P_final = clamp(P_final, [P_min, P_max])
    
    6. 下发指令
       P_final → PCS

策略优先级表(数字越小优先级越高):
  优先级 | 策略
  ──────┼─────────────────────
  0      | 安全保护(消防/ESD/防孤岛/电网异常)
  1      | 应急备电(Mode-E)
  2      | 防逆流(Mode-B) - 合同/政策约束
  3      | 需量控制(Mode-C) - 经济性约束
  4      | 削峰填谷(Mode-A) - 经济运行
  5      | 光伏消纳最大化(Mode-D)
  6      | 充电桩限功率(Layer 3)
  7      | 电力现货/辅助服务(Mode-F)
```

### 11.2 冲突消解示例

```
冲突场景1: 削峰填谷(放电) vs 防逆流
  当前: 峰时段(应放电), 光伏很大, 负荷很小
  Mode-A提议: PCS放电500kW
  Mode-B检测: 放电500kW会导致反送200kW
  消解: Mode-B优先级>Mode-A, PCS降功率至300kW(不再反送)
  → P_final = -300kW

冲突场景2: 需量控制(放电) vs SOC保护
  当前: 需量接近上限(应放电), SOC=15%(接近下限)
  Mode-C提议: PCS放电200kW
  Layer1-SOC: SOC<20%, 降低放电功率50%
  消解: Layer1约束层优先, PCS放电100kW
  → P_final = -100kW

冲突场景3: 应急备电 vs 削峰填谷
  当前: 电网停电, 转入应急模式
  Mode-E提议: PCS放电给关键负荷100kW
  Mode-A提议: 峰时段放500kW(此建议已无关)
  消解: Mode-E优先级>Mode-A, 切换到应急供电模式
  → P_final = -100kW (仅关键负荷)
```

---

## 十二、策略参数边界与安全约束总表

### 12.1 全局安全约束(不可覆盖)

```yaml
safety_constraints:
  # 电气安全
  pcs:
    power_max_charge_kw: null      # PCS最大充电功率(null=设备额定)
    power_max_discharge_kw: null   # PCS最大放电功率
    voltage_ac_max_v: null         # AC侧最大电压
    voltage_ac_min_v: null
    frequency_max_hz: 50.5
    frequency_min_hz: 49.5
    current_max_a: null
    dc_voltage_max_v: null
    dc_voltage_min_v: null
  
  # 电池安全
  battery:
    soc_max_charge: 95.0           # 绝对充电上限
    soc_min_discharge: 5.0         # 绝对放电下限(紧急)
    cell_voltage_max_mv: 3650      # LFP单芯上限
    cell_voltage_min_mv: 2500      # LFP单芯下限
    cell_temp_max_c: 55.0          # 电芯最高温度
    cell_temp_min_c: -20.0         # 电芯最低温度(放电)
    charge_temp_min_c: 0.0         # 充电最低温度(LFP)
    temp_derate_start_c: 45.0      # 开始降额温度
    insulation_min_kohm_per_v: 0.5 # 绝缘电阻最低值(Ω/V)

  # 变压器安全
  transformer:
    max_load_ratio: 1.0            # 绝对最大值
    overload_10min_ratio: 1.2      # 10分钟过载能力
    overload_1min_ratio: 1.5       # 1分钟过载能力

  # 电网安全
  grid:
    anti_islanding_enabled: true   # 防孤岛必须启用
    anti_islanding_timeout_s: 2.0  # 防孤岛动作时限
    lvrt_enabled: true             # 低电压穿越
    hvrt_enabled: true             # 高电压穿越
```

### 12.2 策略参数边界

```
参数                     | 最小值 | 默认值 | 最大值 | 单位  | 步长
────────────────────────┼───────┼───────┼───────┼──────┼─────
soc_max_charge          | 80    | 95    | 100   | %    | 1
soc_min_discharge        | 0     | 10    | 50    | %    | 1
soc_operating_max        | 70    | 90    | 100   | %    | 1
soc_operating_min        | 0     | 20    | 50    | %    | 1
charge_power_ratio       | 0.1   | 1.0   | 1.0   | -    | 0.05
discharge_power_ratio    | 0.1   | 1.0   | 1.0   | -    | 0.05
reverse_power_limit_kw   | 0     | 0     | 500   | kW   | 5
demand_limit_kva         | 0     | -     | 5000  | kVA  | 50
transformer_max_load_pct | 50    | 80    | 100   | %    | 5
temp_derate_start_c      | 30    | 45    | 55    | °C   | 1
temp_shutdown_c          | 40    | 55    | 65    | °C   | 1
emergency_soc_reserve     | 5     | 20    | 80    | %    | 5
pv_curtail_enable_soc    | 80    | 95    | 100   | %    | 1
ev_min_power_kw          | 0     | 20    | 60    | kW   | 5
black_start_soc_min      | 10    | 25    | 50    | %    | 5
```

---

## 十三、策略配置YAML/JSON模板

### 13.1 完整策略配置文件模板

```yaml
# ============================================================
# EMS策略配置文件: ems_strategy_config.yaml
# 项目: 上海某工业园区储能电站
# 版本: 1.0
# 日期: 2026-05-30
# ============================================================

config_version: "1.0"
site_id: "station-shanghai-001"

# ==========================================
# Section 1: 全局安全约束 (不可通过GUI修改)
# ==========================================
safety:
  soc:
    hard_max: 100.0
    hard_min: 0.0
    charge_max: 95.0
    discharge_min: 5.0
    derating:
      charge_start_soc: 90.0
      discharge_start_soc: 20.0

  cell_voltage:
    max_mv: 3650
    min_mv: 2500

  temperature:
    max_c: 55.0
    min_discharge_c: -20.0
    min_charge_c: 0.0
    derate_start_c: 45.0
    shutdown_c: 55.0

  transformer:
    max_load_ratio: 1.0
    capacity_kva: 1250

  anti_islanding:
    enabled: true
    timeout_s: 2.0

  fire_safety:
    hardwire_shutdown: true

# ==========================================
# Section 2: 基础参数
# ==========================================
system:
  rated_pcs_power_kw: 630
  rated_pcs_charge_power_kw: 630
  rated_pcs_discharge_power_kw: 630
  bess_capacity_kwh: 2500
  bess_nominal_voltage_v: 1331.2
  pv_capacity_kwp: 500
  transformer_capacity_kva: 1250

# ==========================================
# Section 3: SOC管理策略
# ==========================================
soc_management:
  enabled: true
  chemistry: "LFP"

  operating_range:
    max_pct: 90.0
    min_pct: 20.0

  calendar_targets:
    - { time: "07:00", soc: 90 }
    - { time: "09:00", soc: 80 }
    - { time: "12:00", soc: 50 }
    - { time: "17:00", soc: 90 }
    - { time: "22:00", soc: 30 }

  emergency_reserve:
    soc_pct: 20
    black_start_soc_pct: 25

# ==========================================
# Section 4: 削峰填谷策略
# ==========================================
peak_shaving:
  enabled: true
  priority: 4

  time_periods:
    peak:
      - { start: "09:00", end: "12:00" }
      - { start: "17:00", end: "22:00" }
    flat:
      - { start: "08:00", end: "09:00" }
      - { start: "12:00", end: "17:00" }
      - { start: "22:00", end: "23:00" }
    valley:
      - { start: "23:00", end: "07:00" }

  price:
    peak: 1.20
    flat: 0.80
    valley: 0.40

  charge:
    power_ratio: 1.0
    soc_target: 95.0

  discharge:
    power_ratio: 1.0
    soc_target: 15.0
    method: "constant_power"
    discharge_only_peak: true

# ==========================================
# Section 5: 防逆流策略
# ==========================================
anti_reverse:
  enabled: true
  priority: 2
  reverse_power_limit_kw: 0
  safety_margin_kw: 5
  control_mode: "pcs_priority"

  control_stages:
    - { level: 1, threshold_kw: -5, action: "reduce_pcs_discharge", ramp: 10, timeout: 3 }
    - { level: 2, threshold_kw: -10, action: "charge_bess", ramp: 20, timeout: 1 }
    - { level: 3, threshold_kw: -20, action: "curtail_pv", ramp: 50, timeout: 0.5 }

  failsafe:
    comm_loss_action: "stop_pcs"

# ==========================================
# Section 6: 需量控制策略
# ==========================================
demand_management:
  enabled: true
  priority: 3
  demand_limit_kva: 800
  control_limit_kva: 750
  trigger_threshold_pct: 90
  hysteresis_kva: 20

# ==========================================
# Section 7: 充电桩限功率策略
# ==========================================
ev_power_limit:
  enabled: true
  priority: 6

  triggers:
    transformer_overload: { enabled: true, max_load_ratio: 0.80 }
    demand_approaching: { enabled: true, threshold_pct: 90 }
    bess_soc_low: { enabled: true, soc_threshold_pct: 30 }

  limiting:
    strategy: "proportional"
    proportional:
      min_power_per_charger_kw: 20
      reduction_ratio: [0.8, 0.5, 0.3]

  recovery:
    hysteresis_minutes: 5

# ==========================================
# Section 8: 光伏消纳策略
# ==========================================
pv_self_consumption:
  enabled: true
  priority: 5
  target_rate_pct: 95
  curtail_soc: 95

# ==========================================
# Section 9: 应急备电策略
# ==========================================
emergency_backup:
  enabled: true
  priority: 1
  soc_reserve_min_pct: 20
  critical_loads_kw: 100
  max_backup_duration_h: 4
  auto_resync: false
  manual_confirm: true

# ==========================================
# Section 10: 通信与故障处理
# ==========================================
communication:
  bms_heartbeat_timeout_s: 5
  pcs_heartbeat_timeout_s: 3
  meter_heartbeat_timeout_s: 3

  on_communication_loss:
    bms: "emergency_stop"          # BMS通信中断→紧急停机
    pcs: "set_power_zero"          # PCS通信中断→功率清零
    meter: "stop_charging"         # 电表通信中断→停止充电(防逆流失效)
```

### 13.2 JSON格式(供API对接)

```json
{
  "config_version": "1.0",
  "site_id": "station-shanghai-001",
  "safety": {
    "soc": {
      "hard_max": 100.0,
      "hard_min": 0.0,
      "charge_max": 95.0,
      "discharge_min": 5.0,
      "derating": {
        "charge_start_soc": 90.0,
        "discharge_start_soc": 20.0
      }
    },
    "temperature": {
      "max_c": 55.0,
      "min_discharge_c": -20.0,
      "derate_start_c": 45.0,
      "shutdown_c": 55.0
    }
  },
  "strategies": {
    "peak_shaving": { "enabled": true, "priority": 4, "charge": { "power_ratio": 1.0, "soc_target": 95.0 }, "discharge": { "power_ratio": 1.0, "soc_target": 15.0 } },
    "anti_reverse": { "enabled": true, "priority": 2, "reverse_power_limit_kw": 0 },
    "demand_management": { "enabled": true, "priority": 3, "demand_limit_kva": 800 },
    "ev_power_limit": { "enabled": true, "priority": 6 },
    "pv_self_consumption": { "enabled": true, "priority": 5 },
    "emergency_backup": { "enabled": true, "priority": 1 }
  }
}
```

---

## 十四、策略验证与仿真检查清单

### 14.1 策略静态检查(设计审查)

```
□ 1.  所有策略的enable/disable状态是否与需求一致?
□ 2.  SOC保护边界是否在电池化学允许范围内?
□ 3.  温度保护阈值是否合理?
□ 4.  PCS功率限幅是否在设备额定范围内?
□ 5.  变压器容量约束是否已配置?
□ 6.  防逆流限制值是否与合同一致?
□ 7.  需量限制值是否与供电合同一致?
□ 8.  策略优先级设置是否合理?
□ 9.  充电桩最小功率设定是否合理(避免反复启停)?
□ 10. 应急备电SOC预留是否满足关键负荷需求?
□ 11. 通信故障后的故障安全策略是否已定义?
□ 12. 各策略的功率指令方向是否有冲突?
□ 13. 峰谷时段设置是否与当地电价一致?
□ 14. 弃光策略的SOC阈值是否合理?
□ 15. 策略参数是否都在有效范围内?
```

### 14.2 策略动态检查(仿真/测试)

```
□ 16. 正常工作日24h仿真: SOC是否在设定范围内?
□ 17. 光伏0出力场景(阴雨天): 储能是否能从谷电充电?
□ 18. 光伏满发场景: 防逆流是否能控制? 弃光是否合理?
□ 19. 负荷尖峰场景: 需量控制是否触发? 储能放电是否足够?
□ 20. 电网失电场景: 是否转入应急模式? 切换时间是否满足?
□ 21. 通信中断场景: PCS是否安全停机?
□ 22. SOC接近下限场景: 是否停止放电?
□ 23. SOC接近上限场景: 是否停止充电?
□ 24. 多策略同时触发: 融合后的功率是否合理?
□ 25. 模式切换(并网→离网→并网): 过程是否平滑?
□ 26. 充电桩全部使用 + 变压器满载: 限功率是否生效?
□ 27. 节假日/周末: 策略是否按设定调度?
□ 28. 电价时段变更: 策略是否自动跟随?
```

### 14.3 策略绩效检查

```
□ 29. 日峰谷套利收益是否达到预期?
□ 30. 月需量是否控制在合同范围内?
□ 31. 光伏自消纳率是否>90%?
□ 32. 反送电功率是否从未超过限定值?
□ 33. SOC从未超出安全边界?
□ 34. 电池温度从未超过允许范围?
□ 35. 策略计算时间是否在允许窗口内(≤300ms)?
□ 36. PCS功率指令变化速率是否在允许范围内?
```

---

## 十五、常见策略设计错误

### 15.1 参数类错误

| 错误 | 后果 | 纠正 |
|------|------|------|
| SOC充电上限=100%, 无降额 | 电池过充, 缩短寿命 | 设置充电上限90-95%, ≥90%开始降功率 |
| SOC放电下限=0% | 电池过放, 永久损坏 | 设置10-15%为硬下限, 20%开始降功率 |
| 防逆流限值=0但margin=0 | 瞬时波动超调→频繁触发 | 设margin≥5kW |
| 需量控制没有回滞 | 频繁启停PCS | 设回滞≥20kVA |
| 温度保护仅设停机、无降额 | 频繁停机影响生产 | 先45°C降额50%, 55°C停机 |
| 峰谷时段照搬标准、未核对当地 | 峰谷套利计算错误 | 必须按当地最新电价文件设置 |
| 应急SOC预留过大(>80%) | 储能大部分时间不可用 | 预留20-30%即可, 配合预测策略 |

### 15.2 逻辑类错误

| 错误 | 后果 | 纠正 |
|------|------|------|
| 通信中断无故障安全策略 | PCS保持上次指令→可能持续反送 | 通信中断→PCS归零 |
| 多策略同时放/充电指令冲突 | 功率指令震荡 | 明确优先级, 单值输出 |
| 光伏消纳优先但SOC已满→仍限光伏 | 弃光而不充电(矛盾) | SOC满→允许反送/弃光前检查 |
| 防逆流+削峰填谷同时放→防逆流被忽略 | 反送电违规 | 防逆流优先级必须>削峰填谷 |
| SOC边界与BMS不一致 | EMS和BMS边界冲突 | EMS边界必须在BMS边界之内 |
| 策略不检查SOC变化率 | 功率突变导致SOC误判 | 增加SOC合理性检查 |

### 15.3 缺失项

| 错误 | 后果 | 纠正 |
|------|------|------|
| 无变压器负载率约束 | 变压器过载跳闸 | 必须配置变压器容量和负载率限值 |
| 无充电桩最小功率 | 小功率充电效率极低 | 低于最小功率→停止该桩 |
| 无节假日特殊策略 | 节假日按工作日峰谷执行→亏损 | 节假日特殊策略或停机 |
| 无SOC日历管理 | SOC无序波动 | 配置SOC日目标曲线 |
| 无功率变化速率限幅 | PCS功率跳变 | ramp_rate限幅 |

---

*版本：v1.0*
*适用范围：工商业储能/光储充一体/微电网的EMS能量管理策略设计与部署*
*下次迭代方向：
  1. 基于强化学习的策略在线优化
  2. 负荷/光伏预测模型集成
  3. 考虑电池老化(SOH衰退)的自适应策略
  4. 虚拟电厂(VPP)聚合策略
  5. 碳交易/绿证策略集成*
