---
skill_name: EMS运营大屏设计规范
skill_id: DeepSeek_operation_dashboard
version: 2.0
author: DeepSeek
created_date: 2026-05-31
target_audience: 储能EMS前端开发 / 运营监控中心设计 / 系统集成商
tech_stack:
  frontend: Vue 3 + Pinia
  charts: AntV G2/G6 + ECharts
  map: 高德地图/百度地图
  realtime: WebSocket (WSS)
  build: Vite 5
---

# EMS运营大屏设计规范 Skill

> **定位**：储能电站EMS运营监控大屏的完整设计规范，从L1总览到L4配置的四层金字塔架构
> **版本**：v2.0 (DeepSeek增强版)
> **输出**：大屏设计规范 / KPI公式 / 报表模板 / 技术实现方案

---

## 目录

- [一、L1~L4四层数据展示架构](#一l1l4四层数据展示架构)
  - [1.1 L1场站总览仪表盘](#11-l1场站总览仪表盘)
  - [1.2 L2设备详情画面](#12-l2设备详情画面)
  - [1.3 L3曲线分析与历史查询](#13-l3曲线分析与历史查询)
  - [1.4 L4参数设置与策略配置](#14-l4参数设置与策略配置)
- [二、能量流向可视化 (桑基图)](#二能量流向可视化-桑基图)
- [三、告警管理与四级SLA](#三告警管理与四级sla)
- [四、收益计算模型](#四收益计算模型)
- [五、能效KPI指标体系](#五能效kpi指标体系)
- [六、日报/月报/年报模板](#六日月报年报模板)
- [七、WebSocket四优先级推送架构](#七websocket四优先级推送架构)
- [八、Vue3+AntV实现指南](#八vue3-antv实现指南)
- [九、GIS地图集成方案](#九gis地图集成方案)

---

## 一、L1~L4四层数据展示架构

### 1.1 L1场站总览仪表盘

**定位**：首屏页面，全景展示核心状态，一屏概览全场。

```
┌─────────────────────────────────────────────────────────────────────┐
│ [标题栏] 储能电站运营监控中心  [站点名称]  2026-05-31 14:30:00     │
├──────────────────────┬──────────────────────────────────────────────┤
│ ┌──────────────┐     │ ┌──────────────┐ ┌──────────────────────────┐ │
│ │ 实时功率仪表盘│     │ │ SOC电池状态  │ │ 今日收益看板               │ │
│ │ 850kW /1000kW │     │ │ 72%          │ │ 放电收益: ¥12,450         │ │
│ │ [指针动画]    │     │ │ 可用:1440kWh │ │ 充电成本: ¥-4,320         │ │
│ │ 放电中 ↑     │     │ │ [绿]正常     │ │ 净收益:   ¥8,130          │ │
│ └──────────────┘     │ └──────────────┘ └──────────────────────────┘ │
├──────────────────────┼──────────────────────────────────────────────┤
│ ┌────────────────────┴──────────────────────────────────────────┐   │
│ │              24h功率曲线 (实时折线图)                           │   │
│ │  充电(蓝色负值) / 放电(绿色正值) / SOC(橙色右轴)              │   │
│ └────────────────────────────────────────────────────────────────┘   │
├──────────────────────┴──────────────────────────────────────────────┤
│ [PCS]4/4在线 [BMS]8/8在线 [电表]2/2正常 [收益趋势]mini图          │
├─────────────────────────────────────────────────────────────────────┤
│ [最新告警条] [红]PCS1通信中断 14:28 │ [黄]BMS3温度偏高45°C 13:45   │
└─────────────────────────────────────────────────────────────────────┘
```

**L1交互逻辑：**

| 交互 | 触发 | 响应 |
|------|------|------|
| 点击功率表 | click | 弹出功率详情（历史曲线+PF+无功） |
| 点击SOC球 | click | 跳转L2 BMS详情 |
| 点击设备区 | click | 跳转L2对应设备 |
| 点击告警条 | click | 展开告警详情+确认/处理 |
| 点击功率曲线点 | click | 跳转L3该时刻历史查询 |

**刷新机制：**
- 实时数据：WebSocket P0级推送, 1s刷新
- 告警：WebSocket即时推送, 新增闪烁
- 统计：5s刷新(收益/电量子)

### 1.2 L2设备详情画面

**三个子画面：PCS详情 / BMS详情 / 电表详情**

**PCS详情核心指标卡：**

| 指标 | 显示 | 状态判定 |
|------|------|----------|
| 直流电压 | 768V | [正常/偏低/偏高] |
| 直流电流 | 1104A | [正常/限流] |
| 交流功率 | 850kW | [充电/放电/待机] |
| 交流电压 | 380V(AB),50.02Hz | ±5%正常 |
| 功率因数 | 0.99 | [滞后/超前] |
| 累计电量 | 充125680kWh/放138420kWh | — |
| 运行状态 | 运行中/2,450h/0告警 | — |
| IGBT温度 | 35~42°C | [正常<50°C] |

**BMS详情核心指标卡：**

| 指标 | 显示 | 告警阈值 |
|------|------|----------|
| 总电压/总电流 | 768V/1104A | ±10% |
| 最大/最小单体 | 3.42V/3.38V | Δ>0.2V告警 |
| 最高/最低温度 | 38°C/32°C | >45°C告警 |
| 温差 | 6°C | >8°C告警 |
| SOH | 92% | <80%退役 |
| 可用容量 | 1440kWh (SOH×SOC×Cnom) | — |
| 簇间SOC偏差 | 2% | >5%需均衡 |

### 1.3 L3曲线分析与历史查询

**功能特性：**

| 功能 | 描述 | 交互 |
|------|------|------|
| 时间范围 | 快捷(今日/昨日/本周/本月/本年) + 自定义 | 日历控件 |
| 多指标叠加 | 最多6条曲线 (功率/SOC/电压/温度/效率/收益) | 复选框 |
| 数据导出 | CSV/Excel/PDF | 按钮 |
| 曲线对比 | 本月vs上月/本年vs去年 | 对比开关 |
| 异常标注 | 自动标注告警/故障时段(红色高亮) | 自动 |
| 统计卡片 | MAX/MIN/AVG/STD浮动卡片 | 悬浮 |

**核心曲线模板：**
- 功率-SOC双轴曲线 (功率kW+ SOC% 右轴)
- 电压-电流曲线 (直流侧+交流侧)
- 温度分布曲线 (最高/最低/平均/温差)
- 效率趋势曲线 (RTE日趋势, 含移动平均)
- 收益累计曲线 (日/月/年)

### 1.4 L4参数设置与策略配置

**权限分级：**

| 角色 | 权限范围 | 可修改参数 | 审计要求 |
|------|----------|-----------|----------|
| 操作员 | 只读 | 无 | 登录记录 |
| 运维工程师 | 非安全参数 | PCS限功率/均衡策略/告警阈值 | 修改前/后值+时间+人 |
| 管理员 | 全权限 | 所有参数+固件升级+用户管理 | 二次确认+30min可撤销 |

**配置分类：**

| 类别 | 内容 | 风险等级 |
|------|------|----------|
| BMS参数 | SOC告警阈值/温度限值/均衡启停 | 高 |
| PCS参数 | 功率限值/PF参数/并离网切换 | 中 |
| 策略参数 | 充放电时段/SOC目标/电价模板 | 中 |
| 系统参数 | 通信超时/告警延迟/界面定制 | 低 |

---

## 二、能量流向可视化 (桑基图)

### 2.1 桑基图节点规格

```
             电网                     负荷
          ═══════════╗          ╔════════════
                     ║ ╔──────╗║
         购电→       ╚═╣ PCS  ╠╩═→ 逆变输出
                       ║(整流)║
                       ╚══╤═══╝
                          │
                     ╔════╧════╗
         充电→       ║   BMS   ║→ 储能
                     ║  (电池) ║
                     ╚════╤════╝
                          │
                     ╔════╧════╗
         放电→       ║   PCS   ║→ 放电
                     ║  (逆变) ║   输出
                     ╚═════════╝

  桑基图节点规格:
┌──────────────┬────────┬──────────┬──────────────────┐
│ 节点名称     │ 宽度   │ 颜色     │ 显示内容         │
├──────────────┼────────┼──────────┼──────────────────┤
│ 电网(购电)   │ 80px   │ #1890FF  │ 功率值 kW        │
│ 电网(售电)   │ 80px   │ #52C41A  │ 功率值 kW        │
│ PCS(充电)    │ 60px   │ #1890FF  │ 转换效率 %        │
│ PCS(放电)    │ 60px   │ #52C41A  │ 转换效率 %        │
│ BMS(储能)    │ 100px  │ SOC渐变  │ SOC值 % + kWh    │
│ 负荷(消耗)   │ 80px   │ #FA8C16  │ 功率值 kW        │
│ 损耗(热)     │ 40px   │ #F5222D  │ 损耗 kW + %      │
└──────────────┴────────┴──────────┴──────────────────┘

  流宽度计算: width = (power_kw / rated_power_kw) × 200px
  节点位置: 电网(x=0) → PCS(x=200) → BMS(x=400) → 负荷(x=600)
```

### 2.2 功率方向动效规范

```yaml
power_animation:
  charge:    # 充电
    direction: right_to_left   # 电网→电池
    color: "#1890FF"           # 蓝色
    speed_s: 1.5               # 粒子移速
  discharge: # 放电
    direction: left_to_right   # 电池→电网
    color: "#52C41A"           # 绿色
    speed_s: 1.5
  idle:      # 待机
    color: "#8C8C8C"           # 灰色
    opacity: 0.2
    animation: none

  power_size_mapping:          # 功率→线条粗细
    >80%Pn: thick(6px)
    40~80%Pn: normal(4px)
    <40%Pn: thin(2px)
    0kW: hidden
```

---

## 三、告警管理与四级SLA

### 3.1 红/黄/蓝/灰四级定义

```yaml
alarm_levels:
  RED (严重):
    color: "#F5222D"
    icon: "exclamation-circle"
    sound: "urgent_alarm.wav"
    triggers:
      - PCS/BMS核心故障/消防告警/通信中断>30s
      - 安全阈值严重超限 (SOC<5%, 温度>50°C)
      - 电网紧急调度/停电
    notification:
      - 短信通知值班人员
      - 电话呼叫负责人(>5min未响应)
      - 大屏全屏弹窗(不可关闭)
    SLA:
      response: 5min
      resolution: 30min

  YELLOW (警告):
    color: "#FAAD14"
    icon: "warning"
    sound: "warning_tone.wav"
    triggers:
      - 参数越限 (温度>42°C, SOC<20%)
      - 效率下降>10%
      - 通信延迟/丢包(未中断)
    notification:
      - 大屏醒目显示 (非弹窗)
      - 应用内推送
    SLA:
      response: 30min
      resolution: 4h

  BLUE (提示):
    color: "#1890FF"
    icon: "info-circle"
    sound: none
    triggers:
      - 维护提醒 (周/月/年检)
      - 策略切换/电价变更
      - 参数接近阈值(90%)
    notification:
      - 应用内通知
      - 仅日志记录
    SLA:
      response: 8h
      resolution: 24h

  GRAY (已恢复):
    color: "#8C8C8C"
    icon: "check-circle"
    triggers:
      - 之前告警条件已解除
      - 人工确认后降级
    notification:
      - 自动生成恢复记录
```

### 3.2 告警收敛规则

```yaml
convergence:
  communication_storm:
    rule: "同设备1min内>3条同类"
    action: "合并显示, 展开查看详情"
  causality_chain:
    rule: "PCS告警→BMS关联告警"
    action: "聚合为根因告警, 标记因果"
  maintenance_mode:
    rule: "维护期间抑制该设备所有告警"
    notification: "XX设备维护中, 告警已抑制"
  hysteresis:
    rule: "温度>42°C告警, <40°C恢复 (2°C回差)"
    purpose: "避免阈值抖动频繁告警"
```

---

## 四、收益计算模型

### 4.1 实时收益公式

```
分钟收益 = 放电功率 × (1/60) × 放电电价 - 充电功率 × (1/60) × 充电电价 / RTE

累计收益:
  今日 = Σ(当天00:00至今每分钟收益)
  本月 = Σ(本月1日至今每日收益)
  本年 = Σ(本年1月至今每月收益)

收益构成:
  放电售电收益 = Σ(放电kWh × 峰/平/谷电价)
  充电成本     = Σ(充电kWh × 充电电价) / RTE
  需量节省     = (合同需量 - 实际需量) × 需量电价
  辅助成本     = 辅助功耗(kWh) × 电价 + 运维人工
  净收益       = 放电收益 - 充电成本 + 需量节省 - 辅助成本

RTE修正:
  实际RTE = 已放电量 / 已充电量
  如RTE<90%, 在成本中增加损耗项
```

### 4.2 收益看板布局

```
┌────────────────────────────────────────────────────────────┐
│ 实时收益仪表盘                                              │
├────────────────────────────────────────────────────────────┤
│ ┌───────────────┐ ┌───────────────┐ ┌────────────────────┐ │
│ │ 当前分钟收益   │ │ 今日累计收益  │ │ 本月收益进度       │ │
│ │ ¥142.50/min   │ │ ¥8,130.25    │ │ ■■■■■■■■□□ 71%   │ │
│ │ 放电@¥0.6692  │ │ 放+12,450    │ │ ¥85,230/¥120,000  │ │
│ │ ↑较昨日+28.50 │ │ 充-4,320     │ │ 剩余9天 趋势↑      │ │
│ └───────────────┘ └───────────────┘ └────────────────────┘ │
├────────────────────────────────────────────────────────────┤
│ [收益构成饼图] 放电收益72% 充电成本25% 需量节省3%           │
│ [收益趋势曲线] 今日实时vs昨日vs上周同期  (三线对比)        │
└────────────────────────────────────────────────────────────┘
```

---

## 五、能效KPI指标体系

### 5.1 核心能效指标 (RTE/SCR/EFC)

| 指标 | 缩写 | 公式 | 目标值 | 计算周期 |
|------|------|------|--------|----------|
| **充放电效率** | RTE | $RTE = Q_{discharge} / Q_{charge}$ | ≥90% (优秀≥93%) | 日/月/年 |
| **自耗电率** | SCR | $SCR = P_{aux} / (P_{charge} + P_{discharge})$ | <3% (大型), <5% (小型) | 日/月 |
| **等效循环** | EFC | $EFC = \sum(Q_{ch} + Q_{dis}) / (2 \times C_{nom})$ | 设计4000~6000次 | 月/年 |
| **系统可用率** | — | $A = t_{available} / t_{total}$ | ≥98% | 月/年 |
| **响应时间** | — | $t_{response}$ (指令→90%功率) | ≤1s | 实时 |
| **功率跟踪精度** | — | $|P_{actual} - P_{set}| / P_{rated}$ | ≤2% | 实时 |

### 5.2 能效仪表盘

```
┌────────────────────────────────────────────────────────────┐
│ 能效指标仪表盘                                              │
├────────────────────────────────────────────────────────────┤
│ ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│ │ RTE      │ │ 可用率   │ │ EFC/月   │ │ SCR      │       │
│ │ 92.9%    │ │ 99.2%    │ │ 12.5次   │ │ 2.3%     │       │
│ │ [绿]良好 │ │ [绿]优秀 │ │ 余3987次 │ │ [绿]正常 │       │
│ │ 目标:90% │ │ 目标:98% │ │ 设计4000 │ │ 行业:3%  │       │
│ └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
├────────────────────────────────────────────────────────────┤
│ [RTE 30天趋势折线] 90.5%~93.2%波动, 整体平稳               │
│ [功率跟踪精度散点图] 散点集中在±1.5%区间, 2个异常点       │
│ [问题诊断] SCR偏高(2.3%>2.0%), 建议检查空调设置温度        │
└────────────────────────────────────────────────────────────┘
```

---

## 六、日/月/年报模板

### 6.1 日报 (每15min汇总)

```yaml
daily_report:
  info:
    title: "储能电站运营日报"
    period: "YYYY-MM-DD 00:00~23:59"
    generated: "次日08:00"
  data_interval: "15min"
  fields:
    - timestamp
    - charge_kwh
    - discharge_kwh
    - soc_min / soc_max
    - power_avg_kw
    - alert_count
  summary:
    total_charge: "4,500 kWh"
    total_discharge: "4,180 kWh"
    rte: "92.9%"
    net_revenue: "¥8,130.25"
    alerts: "红色0 / 黄色2 / 蓝色5"
    pcs_hours: "23.5h"
    availability: "99.2%"
  export: ["Excel日报_YYYYMMDD.xlsx", "PDF日报_YYYYMMDD.pdf"]
```

### 6.2 月报

```yaml
monthly_report:
  info:
    title: "储能电站运营月报"
    period: "YYYY年MM月"
  summary:
    charge_mwh: 126.8
    discharge_mwh: 118.6
    rte: 93.1
    net_revenue: 231000
    availability: 99.5
    efc: 29.7
  alarm_statistics:
    total: 89
    critical: 2
    warning: 18
    top_device: "BMS-3 (12次, 温度偏高)"
  grid_dispatch:
    commands: 156
    success: 154
    avg_response_s: 0.8
  charts:
    - daily_charge_bar
    - revenue_trend_line
    - alarm_distribution_pie
    - power_profile_heatmap
```

### 6.3 年报

```yaml
annual_report:
  info:
    title: "储能电站年度运营报告"
    period: "YYYY年度"
  overview:
    total_charge_mwh: 1520
    total_discharge_mwh: 1420
    total_revenue: 4235000
    availability: 98.7
  revenue_breakdown:
    peak_valley_arbitrage: 3800000
    demand_savings: 320000
    ancillary_services: 115000
    subsidy: 450000
  soh_report:
    soh_start: 95.0 → soh_end: 92.0
    annual_decay: 3.0%
    remaining_years: 6.8
  forecast:
    next_year_revenue: "预计450万 (±12%)"
    planned_maintenance: "2027-03-15"
```

---

## 七、WebSocket四优先级推送架构

### 7.1 优先级定义

```yaml
websocket_priorities:
  P0_CRITICAL (1s):
    description: "关键实时数据, 大屏核心依赖"
    topics:
      - power_kw                # 实时功率
      - soc_percent             # SOC
      - grid_connection_status  # 并网状态
      - pcs_run_status          # PCS状态
      - alarm_new               # 新增告警
    protocol: "WSS订阅+即时推送"

  P1_IMPORTANT (5s):
    description: "重要监控数据, 5s刷新"
    topics:
      - battery_voltage / current
      - pcs_temperature
      - revenue_instant
      - meter_readings
    protocol: "WSS订阅"

  P2_STATISTICS (60s):
    description: "统计数据, 分钟级刷新"
    topics:
      - daily_charge_kwh / discharge_kwh
      - daily_revenue
      - equipment_hours
      - efc_today

  P3_HISTORY (按需):
    description: "历史归档数据, 按需拉取"
    topics:
      - historical_curves
      - alarm_history
      - report_data
    protocol: "HTTP REST + Redis缓存"
```

### 7.2 连接管理

```javascript
// WebSocket连接管理器
class WSManager {
  constructor() {
    this.ws = null;
    this.reconnectCount = 0;
    this.maxReconnect = 5;
    this.heartbeatInterval = 30000;
    this.subscriptions = new Map();
  }

  connect(url) {
    this.ws = new WebSocket(url);
    this.ws.onopen = () => {
      this.reconnectCount = 0;
      this.startHeartbeat();
      this.resubscribeAll();
    };
    this.ws.onmessage = (event) => {
      const msg = JSON.parse(event.data);
      this.dispatch(msg.topic, msg.data);
    };
    this.ws.onclose = () => this.reconnect();
  }

  subscribe(topic, callback, priority = 'P1') {
    if (!this.subscriptions.has(topic)) {
      this.subscriptions.set(topic, []);
      this.ws.send(JSON.stringify({ type: 'subscribe', topic, priority }));
    }
    this.subscriptions.get(topic).push(callback);
  }

  reconnect() {
    if (this.reconnectCount >= this.maxReconnect) {
      this.fallbackToPolling();
      return;
    }
    const delay = Math.min(1000 * 2 ** this.reconnectCount, 30000);
    this.reconnectCount++;
    setTimeout(() => this.connect(this.url), delay);
  }

  fallbackToPolling() {
    // HTTP轮询作为兜底方案
    this.pollTimer = setInterval(() => this.pollAll(), 5000);
  }
}
```

### 7.3 带宽优化

| 策略 | 说明 | 效果 |
|------|------|------|
| Gzip压缩 | 所有推送启用gzip | 压缩比5:1~10:1 |
| 批量推送 | 多个topic合并一帧 | 减少TCP帧头开销 |
| Delta推送 | 仅推送变化字段 | 带宽节省60~80% |
| Binary格式 | 二进制消息替代JSON | 大小减少30~50% |

---

## 八、Vue3+AntV实现指南

### 8.1 技术栈

```yaml
framework:
  core: Vue 3.4 + Composition API
  state: Pinia (stores)
  router: Vue Router 4
  ui: Element Plus
  build: Vite 5
charts:
  realtime: ECharts 5         # 实时折线/柱状/饼图/雷达图
  graph: AntV G6 5            # 桑基图/拓扑图/关系图
  gis: AntV L7 2              # GIS地图可视化
  numbers: "@antv/g2-extension-ava"  # 自动图表推荐
maps:
  provider: 高德地图 JS API 2.0  # 或百度地图/Tianditu
  integration: AMapLoader + Vue3组件封装
realtime:
  protocol: WebSocket WSS
  library: 原生WebSocket + 心跳重连封装
```

### 8.2 核心组件架构

```
src/
├── views/
│   ├── Dashboard.vue          # L1 场站总览
│   ├── DeviceDetail.vue       # L2 设备详情 (PCS/BMS/电表)
│   ├── HistoricalAnalysis.vue # L3 历史数据查询
│   └── Configuration.vue      # L4 参数配置
├── components/
│   ├── charts/
│   │   ├── PowerGauge.vue     # 功率仪表盘 (ECharts gauge)
│   │   ├── SocBattery.vue     # SOC电池球 (CSS 3D + canvas)
│   │   ├── PowerCurve.vue     # 实时功率曲线 (ECharts line)
│   │   ├── SankeyFlow.vue     # 桑基图 (AntV G6)
│   │   ├── AlertList.vue      # 告警列表流
│   │   └── GisMap.vue         # GIS地图组件
│   ├── cards/
│   │   ├── MetricCard.vue     # 数据卡片 (翻牌器+mini图)
│   │   ├── DeviceStatus.vue   # 设备状态图标组
│   │   └── RevenueBoard.vue   # 收益看板
│   └── layout/
│       ├── DashboardLayout.vue # 大屏布局 (16:9自适应)
│       └── ResponsiveGrid.vue  # 响应式网格
├── stores/
│   ├── realtime.ts            # Pinia实时数据store
│   ├── alarm.ts               # 告警store
│   ├── device.ts              # 设备台账store
│   └── config.ts              # 系统配置store
├── services/
│   ├── websocket.ts           # WebSocket封装
│   ├── api.ts                 # REST API
│   └── cache.ts               # IndexedDB本地缓存
└── utils/
    ├── kpi.ts                 # KPI计算工具
    ├── color.ts               # 颜色映射 (SOC/温度/功率)
    └── format.ts              # 数据格式化
```

### 8.3 桑基图实现示例

```javascript
// AntV G6 桑基图配置
import G6 from '@antv/g6';
const sankeyData = {
  nodes: [
    { id: 'grid', name: '电网', x: 0 },
    { id: 'pcs_charge', name: 'PCS充电', x: 200 },
    { id: 'bms', name: 'BMS储能', x: 400 },
    { id: 'pcs_discharge', name: 'PCS放电', x: 400 },
    { id: 'load', name: '负荷', x: 600 },
    { id: 'loss', name: '损耗', x: 600 },
  ],
  edges: [
    { source: 'grid', target: 'pcs_charge', value: 850 },
    { source: 'pcs_charge', target: 'bms', value: 833 },
    { source: 'pcs_charge', target: 'loss', value: 17 },
    { source: 'bms', target: 'pcs_discharge', value: 780 },
    { source: 'pcs_discharge', target: 'load', value: 765 },
    { source: 'pcs_discharge', target: 'loss', value: 15 },
  ]
};
const graph = new G6.Sankey({
  container: 'sankey-container',
  width: 800, height: 500,
  nodeAlign: 'center',
  nodeWidth: 0.03,
  nodePadding: 0.02,
  label: { autoRotate: true, fontSize: 14 },
});
graph.data(sankeyData); graph.render();
```

### 8.4 大屏响应式适配

```scss
// 大屏自适应方案
.dashboard {
  width: 100vw; height: 100vh;
  // 方案1: 等比缩放
  transform: scale(calc(100vw / 1920));
  transform-origin: 0 0;
  // 方案2: rem单位 (设计稿1920px)
  font-size: calc(100vw / 1920 * 16);
}
// 断点适配
@media (max-width: 1919px) { /* 笔记本 1280~1919 */ }
@media (max-width: 1279px) { /* 平板 768~1279 */ }
@media (max-width: 767px)  { /* 手机 <768 */ }
```

---

## 九、GIS地图集成方案

### 9.1 站点标注规范

```yaml
gis_marker:
  status_colors:
    normal: "#52C41A"     # 绿色, 正常运行
    warning: "#FAAD14"    # 黄色, 存在告警
    fault: "#F5222D"      # 红色, 设备故障
    offline: "#8C8C8C"    # 灰色, 通信离线
  popup:
    fields:
      - site_name
      - total_power_kw
      - current_soc_pct
      - current_power_kw (+direction)
      - alert_count
      - last_update_time
    actions: ["详情", "导航", "视频"]
  cluster:
    enabled: true
    max_zoom: 12
    style: "蜂窝聚合"
```

### 9.2 地图+数据联动

```
点击地图站点 → 右侧侧边栏展开站点详情
  ├─ 实时功率/SOC/收益卡片
  ├─ 设备状态一览 (在线/告警数量)
  ├─ 最新告警列表 (最近5条)
  └─ [进入站点大屏] 按钮 → 跳转独立L1页面

全局告警时 → 地图自动聚焦到告警站点
  ├─ 标注点变为红色并脉动
  ├─ 弹出简要告警信息
  └─ 10s后自动恢复
```

### 9.3 高德地图集成

```javascript
// Vue3组件封装
import { ref, onMounted } from 'vue';
import AMapLoader from '@amap/amap-jsapi-loader';

export default {
  setup() {
    const map = ref(null);
    const markers = ref([]);

    onMounted(async () => {
      const AMap = await AMapLoader.load({
        key: 'YOUR_KEY',
        version: '2.0',
      });
      map.value = new AMap.Map('map-container', {
        zoom: 12, center: [121.4737, 31.2304],
        mapStyle: 'amap://styles/dark',  // 深色主题
      });

      // 添加聚合点
      const cluster = new AMap.MarkerClusterer(map.value, markers.value, {
        gridSize: 80, maxZoom: 14,
        styles: [/* 聚合样式 */],
      });
    });

    return { map };
  }
};
```

---

## 附录

### 附录A: 颜色/状态编码速查

| 状态 | 颜色代码 | 用途 |
|------|----------|------|
| 运行/正常 | #52C41A | 设备运行, 数据正常 |
| 待机/提示 | #FAAD14 | 待机, 等待指令 |
| 告警/异常 | #F5222D | 故障, 阈值越限 |
| 离线/未知 | #8C8C8C | 通信中断 |
| 维护中 | #722ED1 | 检修/维护模式 |

### 附录B: SOC颜色梯度

| SOC | 颜色 | 状态 |
|-----|------|------|
| 0~20% | #F5222D | 告警: 电量严重不足 |
| 20~30% | #FA8C16 | 警告: 电量偏低 |
| 30~80% | #52C41A | 正常: 健康运行 |
| 80~90% | #73D13D | 提示: 接近满电 |
| 90~100% | #1890FF | 满电: 停止充电 |

---

## 十、电网调度与AGC/AVC联动大屏

### 10.1 AGC调度响应监控

```
┌─────────────────────────────────────────────────────────────────────┐
│ AGC调度执行监控                                    今日调度: 45次   │
├─────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────┐ ┌───────────────────┐ ┌─────────────────────┐ │
│ │ 调度指令接收      │ │ 功率跟踪精度      │ │ 响应时间分布        │ │
│ │ 成功: 44/45       │ │ MAPE: 1.8%        │ │ ≤1s: 85%          │ │
│ │ 失败: 1(通信超时) │ │ MAE: 15kW         │ │ ≤2s: 12%          │ │
│ │ 成功率: 97.8%     │ │ 目标: ≤2%         │ │ ≤4s: 3%           │ │
│ └───────────────────┘ └───────────────────┘ └─────────────────────┘ │
├─────────────────────────────────────────────────────────────────────┤
│ ┌─────────────────────────────────────────────────────────────────┐ │
│ │ 调度指令vs实际功率 对比曲线 (今日)                              │ │
│ │ kW                                                                │ │
│ │ 1000│  目标功率──  实际功率██                                     │ │
│ │ 500 │  ┌──┐     ┌────┐                                           │ │
│ │   0 │──┘  └──┬──┘    └──┬──                                       │ │
│ │-500 │        │         │     ┌──                                  │ │
│ │-1000│────────┴─────────┴─────┘──                                  │ │
│ │     │00:00  04:00  08:00  12:00  16:00  20:00  24:00             │ │
│ └─────────────────────────────────────────────────────────────────┘ │
└─────────────────────────────────────────────────────────────────────┘
```

### 10.2 一次调频实时监控

```yaml
frequency_regulation_monitor:
  metrics:
    frequency_deviation_hz: "实时Δf显示"
    active_power_response_kw: "有功调节量"
    droop_characteristic: "ΔP vs Δf散点图"
    response_time_ms: "调频响应延时"

  kpi:
    qualified_rate: "≥95% (电网考核标准)"
    response_deadband: "±0.05Hz"
    droop_pct: "4% (可调1~10%)"
    contribution_kwh: "调频贡献电量累计"
    revenue_yuan: "调频辅助服务收益"
```

### 10.3 AVC电压无功监控

```yaml
avc_monitor:
  display:
    voltage_profile: "并网点电压趋势+目标值"
    reactive_power: "实时无功功率+设定值"
    power_factor: "实时PF+目标PF"
    tap_position: "有载调压分接头位置"

  kpi:
    voltage_deviation_pct: "≤±5% (稳态)"
    pf_target_accuracy: "±0.01"
    response_time_s: "≤1s"
```

---

## 十一、多站点集中监控大屏

### 11.1 站点状态矩阵

```
┌─────────────────────────────────────────────────────────────────────────┐
│ 集中监控中心                  站点总数:8  在线:7  告警:2  离线:1         │
├─────────────────────────────────────────────────────────────────────────┤
│ ┌─────────────┬─────────────┬─────────────┬─────────────┬──────────────┐│
│ │ 站点        │ 装机/功率   │ SOC%/可用   │ 今日收益    │ 状态/告警    ││
│ ├─────────────┼─────────────┼─────────────┼─────────────┼──────────────┤│
│ │ ● 广州001   │ 2MW/4MWh   │ 72%/1440kWh│ ¥8,130      │ [绿]正常     ││
│ │ ● 深圳002   │ 1MW/2MWh   │ 65%/650kWh │ ¥3,240      │ [绿]正常     ││
│ │ ● 东莞003   │ 5MW/10MWh  │ 45%/2250kWh│ ¥15,600     │ [黄]BMS告警  ││
│ │ ● 佛山004   │ 1.5MW/3MWh │ 88%/1320kWh│ ¥4,850      │ [绿]正常     ││
│ │ ● 珠海005   │ 3MW/6MWh   │ 30%/900kWh │ ¥2,100      │ [绿]正常     ││
│ │ ● 惠州006   │ 0.5MW/1MWh │ 55%/275kWh │ ¥980        │ [红]通信中断 ││
│ │ ● 中山007   │ 4MW/8MWh   │ 82%/3280kWh│ ¥18,200     │ [绿]正常     ││
│ │ ● 江门008   │ 2MW/4MWh   │ —          │ —           │ [灰]离线    ││
│ └─────────────┴─────────────┴─────────────┴─────────────┴──────────────┘│
├─────────────────────────────────────────────────────────────────────────┤
│ ┌───────────────────────┐ ┌───────────────────────┐ ┌──────────────────┐│
│ │ 各站点收益排行 (柱状) │ │ 各站点可用率排行      │ │ 省份/城市分布    ││
│ │ 广州 ████████████ 8130│ │ 东莞 ██████████ 99.8%│ │ [GIS热力图]     ││
│ │ 深圳 ██████ 3240     │ │ 广州 ██████████ 99.5%│ │                  ││
│ │ 东莞 ██████████████   │ │ 深圳 █████████ 98.2% │ │                  ││
│ └───────────────────────┘ └───────────────────────┘ └──────────────────┘│
└─────────────────────────────────────────────────────────────────────────┘
```

### 11.2 站点对比分析

| 分析维度 | 展示方式 | 用途 |
|----------|---------|------|
| 收益对比 | 柱状图排行 | 识别高效/低效站点 |
| 效率对比 | RTE雷达图 | 横向对标, 发现差距 |
| 可用率对比 | 热力矩阵(站点×月份) | 年度可靠性分析 |
| SOC分布 | 箱线图 | 识别异常充放电行为 |
| 告警分析 | 帕累托图 | TOP问题集中处理 |
| 衰减对比 | SOH趋势线(多站点) | 电池供应商质量对比 |

---

## 十二、大屏系统技术实现细节

### 12.1 大屏硬件推荐配置

| 项目 | 推荐配置 | 备注 |
|------|---------|------|
| 显示屏 | 3×55"拼接屏(1×3拼) 或 LED小间距P1.5 | 总分辨率5760×1080 |
| 显卡 | NVIDIA RTX 4060+ | 支持多屏输出 |
| 主机 | i7-13700/32GB RAM/1TB SSD | Windows 11 |
| 网络 | 千兆以太网(内网专线) | 延时<10ms |
| 备用 | UPS≥30min | 意外断电保护 |

### 12.2 前端性能优化清单

| 优化项 | 方法 | 预期提升 |
|--------|------|---------|
| 虚拟滚动 | 告警列表/large table用虚拟滚动 | 渲染行数>1000无卡顿 |
| 防抖节流 | 缩放/拖拽操作debounce 200ms | 减少60%重渲染 |
| Web Worker | KPI计算/数据聚合移入Worker | 主线程不阻塞 |
| Canvas分层 | 静态背景层+动态数据层 | 减少重绘区域 |
| ECharts优化 | large:true, progressive渲染 | 10万数据点秒级 |
| 懒加载 | 非首屏模块延迟加载 | 首屏快30% |
| 缓存策略 | Redis+LocalStorage+IndexedDB三级 | 二次加载<500ms |
| CDN | 静态资源CDN分发 | 首屏快50% |

### 12.3 大屏安全设计

```yaml
security:
  authentication:
    type: "JWT + Refresh Token"
    token_expiry: "2h (access) / 7d (refresh)"
    sso: "对接企业LDAP/AD"

  authorization:
    roles: ["viewer", "operator", "engineer", "admin"]
    rbac: "页面级别 + 数据级别 + 操作级别"

  network:
    protocol: "WSS (WebSocket Secure)"
    cors: "白名单域名"
    rate_limit: "同一IP 100req/min"

  audit:
    log_operations: true         # 所有参数修改记录
    log_views: true              # 页面访问记录
    retention_days: 180          # 日志保留6个月
    export_audit: true           # 导出操作需审批
```

---

## 十三、验收与交付标准

### 13.1 功能验收检查表 (≥25项)

| 序号 | 检查项 | 验收标准 | 状态 |
|------|--------|---------|------|
| 1 | L1总览数据准确性 | 功率/SOC/收益与BMS偏差<1% | |
| 2 | L2设备详情完整 | PCS/BMS/电表全部字段显示 | |
| 3 | L3历史曲线查询 | 支持任意时间段, 查询<3s | |
| 4 | L4参数配置权限 | 权限分级生效, 日志完整 | |
| 5 | 功率仪表盘动画 | 指针平滑, 颜色随功率变化 | |
| 6 | SOC电池球动画 | 充放电动画方向/颜色正确 | |
| 7 | 桑基图流向 | 节点位置/流宽度/方向正确 | |
| 8 | 告警四级颜色 | 红/黄/蓝/灰对应正确 | |
| 9 | 告警实时刷新 | 新告警≤2s上屏 | |
| 10 | 告警收敛 | 同类告警合并, 风暴抑制 | |
| 11 | 收益计算 | 充放电收益+成本+净收益正确 | |
| 12 | RTE/SCR/EFC | 公式计算结果正确 | |
| 13 | 日报导出 | 格式/数据/图表完整 | |
| 14 | 月报导出 | 含趋势/同比/环比分析 | |
| 15 | WebSocket连接 | 断线自恢复, 数据同步 | |
| 16 | GIS地图标记 | 站点位置/状态颜色正确 | |
| 17 | 地图交互 | 点击标记弹出详情 | |
| 18 | 响应式布局 | 1920/1366/768分辨率适配 | |
| 19 | 浏览器兼容 | Chrome/Edge/Safari正常 | |
| 20 | 首屏加载 | <3s(含数据加载) | |
| 21 | 实时数据延迟 | <2s(数据源→大屏) | |
| 22 | 操作日志 | 所有修改有记录可查 | |
| 23 | 用户权限 | 各角色权限隔离生效 | |
| 24 | 深色/浅色主题 | 一键切换, 无闪烁 | |
| 25 | 系统运维手册 | 完整的中文运维文档 | |

---

> **文件版本**: v2.0 (DeepSeek增强版)
> **创建日期**: 2026-05-31
> **核心增强**:
> 1. L1~L4四级金字塔架构+完整交互逻辑
> 2. 桑基图能量流向节点规格+功率动效规范
> 3. 红/黄/蓝/灰四级告警含SLA+收敛规则
> 4. 完整收益模型+能效KPI(RTE/SCR/EFC)
> 5. 日/月/年报YAML模板可直接生成
> 6. WebSocket四优先级推送+带宽优化+容错
> 7. Vue3+AntV技术实现+核心组件架构
> 8. GIS地图高德集成+站点标注+数据联动
> 9. AGC/AVC调度联动大屏+一次调频监控
> 10. 多站点集中监控矩阵+对比分析维度
> 11. 大屏硬件推荐+性能优化+安全设计
> 12. 25项功能验收检查表
