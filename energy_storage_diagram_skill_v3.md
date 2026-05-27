---
name: energy-storage-diagram
description: >
  专业储能/电力系统电气图绘制技能。覆盖以下全部图类型：
  系统框图（System Block Diagram）、电气一次接线图（Single-Line Diagram/SLD）、
  控制二次接线图（Control & Protection Secondary Diagram）、通信拓扑图（Communication Topology）、
  端子排图/电缆清册（Terminal Diagram & Cable Schedule）、接地系统图（Grounding Diagram）、
  光储充一体化图（PV-BESS-EV Integrated Diagram）、保护配置图（Protection Coordination Diagram）。
  适用场景：储能电站、光伏电站、充电站、微电网、工商业配电、BMS/BESS/PCS/EMS系统。
  使用本skill可确保输出符合GB/IEC/IEEE专业标准，具备工程可用性和施工图深度。
---

# 储能系统电气图绘制专业Skill v3.0

## 目录

- [一、标准体系速查表](#一标准体系速查表)
- [二、八类图的核心规则](#二八类图的核心规则)
- [三、储能系统核心设备技术参数速查](#三储能系统核心设备技术参数速查)
- [四、BMS架构与电池簇拓扑表达](#四bms架构与电池簇拓扑表达)
- [五、保护与安全设计强制性标注规则](#五保护与安全设计强制性标注规则)
- [六、SVG工程制图规范](#六svg工程制图规范)
- [七、布局坐标工程计算](#七布局坐标工程计算)
- [八、标准化SVG符号库](#八标准化svg符号库)
- [九、绘图执行标准流程](#九绘图执行标准流程)
- [十、项目参数模板](#十项目参数模板)
- [十一、质量控制检查表](#十一质量控制检查表)
- [十二、常见致命错误](#十二常见致命错误)

---

## 一、标准体系速查表

### 1.1 中国国家标准（GB/T、DL）

| 标准编号 | 全称 | 绘图时强制引用场景 |
|---------|------|--------------------|
| **GB/T 4728.1~13** | 电气简图用图形符号 | **所有电气图的符号必须以此为准** |
| GB/T 6988.1~5 | 电气技术用文件的编制规则 | 图框、标题栏、图号命名 |
| GB/T 5465.1~2 | 电气设备用图形符号 | 屏柜面板图形符号 |
| GB/T 18135 | 电气工程CAD制图规则 | CAD/SVG图层命名规范 |
| **GB 51048** | 电化学储能电站设计规范 | 储能电站总平面、一次系统 |
| **GB/T 36558** | 电力系统电化学储能系统通用技术条件 | 系统参数标注依据 |
| GB/T 36276 | 电力储能用锂离子电池 | 电池参数标注依据 |
| GB/T 34131 | 电化学储能电站用锂离子电池管理系统 | BMS架构图绘制依据 |
| **GB/T 36547** | 电化学储能系统接入电网技术规定 | 并网点(PCC)参数标注 |
| GB/T 36548 | 电化学储能系统接入电网测试规程 | 测试回路标注 |
| GB/T 40032 | 储能系统接入电网测试规程 | 并网测试点标注 |
| **GB 50052** | 供配电系统设计规范 | 配电回路设计依据 |
| GB 50054 | 低压配电设计规范 | 0.4kV侧设计依据 |
| GB/T 50062 | 继电保护和自动装置设计规范 | 保护配置图依据 |
| GB/T 50063 | 电力装置的电测量仪表装置设计规范 | 计量回路依据 |
| GB 50065 | 交流电气装置的接地设计规范 | 接地系统图依据 |
| **DL/T 2246** | 电化学储能电站并网运行与控制技术规范 | 控制策略标注依据 |
| DL/T 2528 | 电化学储能电站调度控制技术规范 | EMS/SCADA接口标注 |

### 1.2 国际标准（IEC/UL/NFPA）

| 标准编号 | 全称 | 适用项目 |
|---------|------|---------|
| **IEC 60617** | 图形符号数据库（与GB/T 4728等效） | 国际项目符号查询 |
| IEC 61850 | 变电站通信网络和系统 | 大储项目通信拓扑 |
| **IEC 62933-1** | 电储能系统 - 术语 | 术语统一 |
| **IEC 62933-5-2** | 电储能系统安全要求 | 安全标注 |
| IEC 62271 | 高压开关设备和控制设备 | 10kV及以上开关柜标注 |
| IEEE 1547 | 分布式能源接入电网 | 北美项目PCC标注 |
| IEEE 485 | 储能电池系统推荐规程 | 直流系统标注 |
| IEEE 2030 | 储能系统与电网互操作指南 | 互操作标注 |
| NEC 690 | 光伏系统 | 光储项目PV侧标注 |
| NEC 705 | 储能并网 | 北美项目并网标注 |
| **NFPA 855** | 固定储能系统安装标准 | 安全距离/消防标注 |
| **UL 9540/9540A** | 储能系统安全标准 | 安全参数标注 |

### 1.3 标准选用决策树

```
项目所在地？
  ├── 中国 → 优先GB体系，SI单位
  │   ├── 出口项目？ → 补充IEC符号对照
  │   └── 纯国内？ → 仅用GB符号
  ├── 欧洲 → IEC体系，ISO单位
  ├── 美国 → IEEE/NEC/UL，英制单位
  └── 其他 → IEC体系（最通用）
```

---

## 二、八类图的核心规则

### 2.1 系统框图（System Block Diagram）

**定位**：概念性架构表达，面向决策层和非电气专业人员

**必须包含**：
- 能量主回路（粗实线+双向箭头表示充放电）
- 信息/控制回路（虚线，区分于能量回路）
- 各子系统边界框（矩形，使用层级嵌套表达包含关系）
- 关键参数（电压等级、容量/功率、PCC位置）
- 保护层级分区（方案级表达）

**布局模板（纵向4层结构）**：

```
Layer 4: 电网/外部电源       ← 最上层
  │ PCC计量点（标注电压10kV/0.69kV）
Layer 3: 配电母线             ← 中间层
  ├── 本地负荷
  ├── SVG/无功补偿（如有）
  └── 储能支路
       │
Layer 2: PCS/变流器           ← 核心层
  ├── 直流断路器+熔断器
  ├── 直流接触器
  └── 高压箱
       │
Layer 1: BESS电池舱           ← 最下层
  └── 电池簇×N（标注单簇电压/容量）
```

**符号规则**：
- 电源：两条平行线+文字标注电压
- 变压器：双圆圈，一次侧△，二次侧Y0/Yn
- 母线：至少比普通线粗3倍（6px vs 2px）
- PCS：矩形框标注"PCS/变流器"+"额定功率"
- BESS：矩形框标注"电池舱"+"总容量(MWh)+单簇串数"
- EMS：虚线矩形框包围所有被控设备
- 双向箭头：充放电方向必须标记"充电⇄放电"

**不允许**：
- ❌ 框图中出现具体开关符号（那是SLD的职责）
- ❌ 能量流和信息流使用同种线型
- ❌ 不标注电压等级导致无法判断绝缘配合
- ❌ 缺失EMS控制域虚线框

---

### 2.2 电气一次接线图（Single-Line Diagram, SLD）

**定位**：工程设计核心文件，施工图和审图用。必须符合GB/T 4728。

**电气间隔层级结构（从电源到负荷的顺序）**：

```
【10kV进线间隔】
  隔离开关QS → 避雷器F → 电压互感器PT（计量）→ 电流互感器CT（保护/测量）
  → 断路器QF（进线总）→ 10kV母线

【10kV母线】
  ├── 出线间隔1：QF2 → CT → 电缆 → 变压器T1
  ├── 出线间隔2：QF3 → CT → 电缆 → 变压器T2  [或直挂PCS（高压级联储能）]
  └── PT柜（母线PT）

【变压器出线】
  T1(△/Y0) → 0.4kV/0.69kV侧总断路器QF → 低压母线

【低压/直流储能区】
  低压母线 → 各支路断路器
  ├── PCS支路：QF-AC → CT → PCS → QF-DC → FU-DC → KM-DC → 高压箱 → 电池簇
  ├── 站用电：QF-Aux → 站用变压器(如有) → 220V/380V辅助电源
  └── 无功补偿：QF-SVG → SVG

【电池簇内部】
  高压箱(BCP)：
    ├── 主正接触器 KM+
    ├── 主负接触器 KM-
    ├── 预充回路：KM-pre + R-pre
    ├── 熔断器 FU+ / FU-
    ├── 电流传感器
    └── BMS从控(BCMU)
  电池簇：1P384S / 2P240S（标注串并数）→ 总电压 Vdc
```

**强制标注的GB/T 4728标准符号**：

```
断路器（QF）    ：矩形□内画斜线"/"         ─[ / ]─
隔离开关（QS）  ：矩形□内无斜线，常配接地刀 ─[   ]─
负荷开关（QL）  ：矩形□内画直线"|"         ─[ | ]─
熔断器（FU）    ：矩形□内S形线             ─[~~~]─
熔断器式隔离开关：矩形□内S形线+刀片符号     ─[S+刀]─
接触器（KM）    ：半圆触点符号             ─(    )─
变压器（TM）    ：双圆圈⊙                  一次侧△ 二次侧Y0
CT（TA）        ：圆圈穿过主回路            ───O───
PT（TV）        ：双圆圈                   ⊙⊙
避雷器（F）     ：△+接地符号               △≡
接地（PE）      ：三条渐短平行线            ╤═╪═╧═
电缆终端        ：半圆+引出线               ◠
电流表（PA）    ：圈内A                    Ⓐ
电压表（PV）    ：圈内V                    Ⓥ
电能表（PJ）    ：圈内Wh                   Ⓦ
变流器(PCS)        ：矩形标注AC/DC            [PCS]
```

**直流侧专用符号（GB/T 4728不覆盖，需自定义但风格统一）**：

```
直流断路器   ：与交流相同符号，旁注"DC"
直流接触器   ：与交流相同符号，旁注"DC"
预充接触器   ：接触器符号+旁注"预充"
预充电阻     ：方框内R+旁注"Pre-Charge R,Ω"
高压箱       ：大矩形框虚线，内含上述元件
电池模组     ：矩形框内标串并信息
BMS从控      ：小矩形标注"BCMU/BMU"
```

**元件编号规范（GB/T 6988 - 功能组+序号）**：

| 功能组 | 前缀 | 示例 | 说明 |
|--------|------|------|------|
| 断路器 | QF | QF1, QF2, QF-DC1 | DC后缀表示直流侧 |
| 隔离开关 | QS | QS1, QS2 | |
| 接触器 | KM | KM1, KM-DC1 | |
| 继电器 | KA | KA1, KA2 | |
| 熔断器 | FU | FU1, FU-DC1 | |
| 变压器 | T | T1, T2 | |
| 电流互感器 | TA | TA1, TA2 | |
| 电压互感器 | TV | TV1, TV2 | |
| 避雷器 | F | F1, F2 | |
| 按钮 | SB | SB1, SB2 | |
| 信号灯 | HL | HL1, HL2 | |
| 端子排 | X | X1, X2 | |
| 电缆 | W | W1, W2 | |

**每条线路必须标注的参数**：

| 线路类型 | 必须标注内容 | 示例 |
|---------|-------------|------|
| 中压电缆(≥1kV) | 型号+芯数×截面积 | ZR-YJV22-8.7/15kV 3×95mm² |
| 低压交流电缆 | 型号+芯数×截面积 | ZR-YJV-0.6/1kV 3×185+2×95mm² |
| 直流电缆 | 型号+芯数×截面积 | ZR-YJVR-1.5kV 1×240mm² |
| 通信电缆 | 型号+对数/芯数+屏蔽 | RVVSP 2×2×1.0mm² |
| 光纤 | 型号+芯数+模式 | GYTA-8B1.3 (单模8芯) |
| 母排 | 材质+规格 | TMY-100×10 (铜排100宽×10厚) |
| 断路器 | 额定电流+短路分断能力 | QF1 1600A/50kA |
| 变压器 | 容量+变比+接线组别+阻抗% | SCB13-1250/10, Dyn11, Uk%=6 |
| PCS | 额定功率+AC电压/DC电压范围 | 630kW, 400V AC / 600-900V DC |
| 电池舱 | 额定能量+额定功率+DC电压范围 | 5.016MWh, 1.25MW, 1164.8-1497.6V |
| CT | 变比+准确级 | 500/5A, 0.5S/5P20 |
| PT | 变比+准确级 | 10/0.1kV, 0.5 |

---

### 2.3 控制二次接线图（Control & Protection Secondary Diagram）

**定位**：展示保护、控制、信号、测量回路的具体接线，面向调试和继保人员。

**二次回路分类和线型**：

```
保护回路（Protection）  ：实粗线，红色标注   ────────  （跳闸/联跳/闭锁）
控制回路（Control）     ：实细线，蓝色标注   ────────  （分合闸/启停）
信号回路（Signal）      ：虚线，绿色标注     ─ ─ ─ ─  （遥信/报警）
测量回路（Measurement） ：点线，黄色标注     ········  （CT/PT二次线）
通信回路（Communication）：长虚线           ─ ─ ─ ─  （GOOSE/SV/MMS）
电源回路（Power Supply） ：双实线            ════════  （DC110V/DC220V/AC220V）
```

**二次设备代号（GB/T 6988扩展）**：

| 代号 | 设备 | 功能 |
|------|------|------|
| PR | 保护装置 | 综合保护/差动保护/距离保护 |
| FR | 频率保护 | 低频减载/高频切机 |
| VR | 电压保护 | 过压/欠压/零序电压 |
| OC | 过流保护 | 过电流/速断 |
| EF | 接地故障保护 | 零序/接地 |
| ARC | 弧光保护 | 开关柜弧闪检测 |
| 49 | 热过载 | 温度保护 |
| 27/59 | 压差保护 | 欠压/过压 |
| 81 | 频率保护 | 过频/欠频 |

**储能专项二次回路必须表达的内容**：

1. **PCS紧急停机回路（ESD）**：独立于控制系统的硬接线
   ```
   急停按钮(SB-ESD) → 安全继电器 → → → → PCS紧急停机端子
                              └ → → → → 直流侧断路器分闸线圈
                              └ → → → → 交流侧断路器分闸线圈
   ```
2. **消防联动停机回路（FSS Linkage）**：必须为硬接线，不得仅依赖通信
   ```
   消防主机(干接点) → 硬接线 → 安全继电器 → → → 同时分断：
                                             ├── 直流侧全部断路器
                                             ├── 交流侧全部断路器
                                             └── BMS急停端子
   ```
3. **BMS故障分级停机回路**：
   ```
   BMS一级故障信号 → → → EMS → PCS降功率
   BMS二级故障信号 → → → → → → PCS停机+直流侧分闸
   BMS三级故障信号 → → → → → → 全系统紧急停机+消防联动
   ```
4. **防孤岛保护逻辑回路**：
   ```
   并网点检测（电压/频率/相角）→ 保护装置判断孤岛 → → →
   → 分断PCC断路器(反孤岛) + PCS停机
   ```

**端子排标注规则**：

每条导线必须标注：
- 端子号（如：XT1:1, XT1:2）
- 线号（如：101, A401, N401）
- 线径/颜色（如：BVR 1.5mm² 黑）
- 远端去向（如：→QF1-31, →PCS-X1:5）

**二次图线号命名规范**：

| 回路类型 | 线号范围 | 示例 |
|---------|---------|------|
| 直流控制正 | 101-199 | 101, 103, 105 |
| 直流控制负 | 201-299 | 201, 203 |
| 交流电流 | A401-A499, B401-B499, C401-C499, N401-N499 | A411 |
| 交流电压 | A601-A699, B601-B699, C601-C699, N600 | A630 |
| 信号回路 | 701-799 | 701, 703 |
| 保护跳闸 | 33, 133, 233 | 133A |

---

### 2.4 通信拓扑图（Communication Topology Diagram）

**定位**：展示系统全部通信链路、协议、速率和物理介质，面向系统集成和调试。

**通信分层架构（储能标准4层）**：

```
Layer 4：云端平台
  │ MQTT/HTTP(S) over 4G/5G/光纤
  ├── 聚合商平台
  ├── 电力调度SCADA (IEC 104)
  └── 运维云平台

Layer 3：站控层
  │ Modbus TCP / IEC 61850 MMS
  ├── EMS/BAMU（边缘控制器/工控机）
  ├── HMI/就地监控
  └── 时间同步（GPS/北斗+NTP）

Layer 2：间隔层
  │ Modbus TCP / RS485 / CAN / GOOSE
  ├── PCS×N 控制器
  ├── BMS/BCMU×N
  ├── 多功能电表×N
  ├── 保护装置（综保）
  ├── 消防主机
  ├── 液冷机组控制器
  ├── 环境监测（温湿度/烟感）
  └── 充电桩控制器×N（如有）

Layer 1：设备层
  │ 内部总线（CAN / 菊花链SPI / RS485）
  ├── BMS → → → BMU×M（每个电池模组一个）
  ├── PCS功率模块内部通信
  ├── 高压箱内部信号采集
  └── 传感器/执行器硬接线
```

**通信协议标注强制性内容**：

| 协议 | 必须标注项 | 示例 |
|------|-----------|------|
| Modbus RTU | 波特率+数据位+校验+从站地址+末端电阻 | 9600,8,E,1, Addr=1, 120Ω终端 |
| Modbus TCP | IP地址+端口号 | 192.168.1.10:502 |
| CAN 2.0B | 波特率+ID格式+终端电阻 | 250kbps, 29bit ID, 120Ω终端 |
| IEC 61850 | MMS/GOOSE/SV+IED名称 | IED=EMS01, GOOSE控制块 |
| IEC 104 | IP+端口+公共地址+传送原因长度 | 192.168.1.1:2404, CA=1, COT=2 |
| OCPP 1.6J/2.0.1 | WebSocket URL+充电桩ID | ws://csms.example.com/ocpp, CP001 |
| MQTT | Broker地址+Topic前缀 | mqtt://192.168.1.100:1883, topic=station1/ |
| Profinet/EtherCAT | 主站IP+从站名称 | 192.168.0.1, Slave=PCS1 |

**RS485总线强制规则**：
- 必须标注A/B线极性（A+, B-）
- 末端必须画120Ω终端电阻符号
- 必须标注"手拉手"连接方式（禁止星型分支）
- 总线总长度必须标注（RS485 ≤1200m@9600bps）

**CAN总线强制规则**：
- 两端必须各一个120Ω终端电阻
- 标注CAN_H/CAN_L/GND三线
- 总线支线长度（stub）必须标注（≤0.3m@1Mbps）

**以太网网络标注**：
- 交换机（SW）端口连接关系必须标注端口号
- VLAN划分必须标注（如：VLAN10=控制网, VLAN20=视频网）
- 环网协议标注（如：RSTP/Ring/MRP）
- 光口/电口区分标注

---

### 2.5 端子排图/电缆清册（Terminal Diagram & Cable Schedule）

**定位**：接线施工的直接依据。

**端子排图表达要素**：

```
端子排编号：XT1 (PCS柜内端子排)
┌──────────────────────────────────────────┐
│ 编号 │ 左侧(柜内)    │ 右侧(外部)     │ 备注       │
├──────┼───────────────┼───────────────┼────────────┤
│  1   │ QF1-31(分闸)  │ W1:1→急停按钮  │ 红 BVR1.5 │
│  2   │ QF1-32(合闸)  │ W1:2→急停按钮  │ 绿 BVR1.5 │
│  3   │ KA1-A1(线圈+) │ W2:1→消防干接点 │ 蓝 BVR1.5 │
│ ...  │               │               │            │
└──────────────────────────────────────────┘
```

**电缆清册标注**：

| 电缆编号 | 起点设备:端子 | 终点设备:端子 | 电缆型号 | 长度(m) | 敷设路径 |
|---------|-------------|-------------|---------|--------|---------|
| W-PCS1-DC | PCS-DC+:XT1:1 | 高压箱1:XT1:1 | ZR-YJVR-1.5kV 1×240 | 5 | 电缆沟A段 |
| W-485-01 | EMS-X1:3-4 | PCS1-X2:1-2 | RVVSP 2×2×1.0 | 15 | 控制电缆桥架 |

---

### 2.6 接地系统图（Grounding/Earthing Diagram）

**定位**：展示接地网拓扑、接地电阻要求和等电位连接。

**接地系统分类标注**：

```
├── 工作接地（系统接地）
│   ├── 变压器中性点接地（10kV侧经小电阻/消弧线圈接地）
│   ├── 低压系统接地（TN-S/TN-C-S）
│   └── BESS直流系统参考地
├── 保护接地（PE）
│   ├── 设备外壳接地
│   ├── 电缆铠装/屏蔽层接地
│   ├── 桥架/支架接地
│   └── 电池架/集装箱外壳接地
├── 防雷接地
│   ├── 接闪器/避雷针
│   ├── 防雷引下线
│   └── 电涌保护器(SPD)接地
├── 防静电接地
│   ├── BESS集装箱/电池架静电释放
│   └── 操作平台防静电
└── 等电位连接
    ├── 各柜体间等电位连接线（≥16mm²铜线）
    └── 不同接地网之间的等电位连接
```

**接地电阻要求标注**：

| 接地类型 | 要求 | 标准依据 |
|---------|------|---------|
| 综合接地网 | ≤4Ω | GB 50065 |
| 独立防雷接地 | ≤10Ω | GB 50057 |
| BESS独立接地 | ≤1Ω (推荐) | NFPA 855 |
| 弱电系统接地 | ≤1Ω | GB 50174 |

---

### 2.7 光储充一体化系统图（PV-BESS-EV Integrated Diagram）

**定位**：展示"光伏→储能→充电桩"的全链条能量流和信息流。

**标准拓扑**：

```
【光伏侧】
  光伏阵列(PV Array×N, 标注总装机kWp)
    │ 直流汇流
  汇流箱(Combiner Box, 标注路数和每路电流)
    │
  DC/DC优化器(如有) 或 直接进PCS
    │
  └──→ 直流母线 ←──

【储能侧】
  BESS电池舱(MWh)
    │
  高压箱(BCP)
    │
  PCS/储能变流器(kW)
    │
  └──→ 交流母线 ←──

【充电侧】
  交流母线
    │
    充电堆/群充主机(标注总功率)
    │
  ┌───┼───┐
  充电终端×N (标注单枪最大功率)
  (标注CCS2/GB/T/CHAdeMO接口类型)

【电网侧】
  交流母线
    │
  升压变压器(标注容量/变比)
    │
  并网开关柜
    │
  PCC → 电网
```

**能量管理策略标注（必须在图中空间允许时表达）**：
- 光伏优先自发自用策略：PV → 负荷 → 充电 → 储能 → 反送(允许/禁止)
- 峰谷套利策略：谷电充电 → 峰电放电
- 防反送策略：逆功率保护设定值（如 ≤5%额定）

---

### 2.8 保护配置图（Protection Coordination Diagram）

**定位**：展示系统各级保护的动作逻辑、时限配合和选择性跳闸。

**保护层级（自上而下）**：

```
第4层 — PCC保护
  ├── 低/过电压保护 (27/59)  ← 动作时间最长
  ├── 低/过频率保护 (81)
  ├── 防孤岛保护 (78)
  └── 逆功率保护 (32R)

第3层 — 进线/母联保护
  ├── 过电流保护 (50/51)
  ├── 零序/接地故障保护 (50N/51N)  ← 时限逐级递减
  ├── 差动保护 (87T) ← 变压器内部故障
  └── 弧闪保护 (50AFD)

第2层 — 出线/支路保护
  ├── 过电流保护 (50/51)
  ├── 接地故障保护 (50N/51N)
  └── 低电压保护 (27)

第1层 — PCS/电池内部保护（最快动作）
  ├── PCS：过流/过压/过热/IGBT故障
  ├── BMS：过充/过放/温度异常/压差过大
  ├── 电池保护：电芯级过压/欠压/温度
  └── 消防联动：FSS独立硬接线跳闸
```

**保护定值配合原则**：
- 下级保护动作时间 = 上级保护动作时间 - ΔT(≥200ms)
- 同一层级保护之间按最小短路电流校验选择性
- BMS保护是最快也是最后一道防线（毫秒级响应，不依赖通信）

---

## 三、储能系统核心设备技术参数速查

### 3.1 电池簇典型拓扑参数

| 参数 | 典型值（风冷） | 典型值（液冷） | 标注方式 |
|------|-------------|-------------|---------|
| 单体电芯 | LFP 3.2V 280Ah | LFP 3.2V 314Ah | 串联数×并联数 S×P |
| 电池模组 | 1P52S (166.4V) | 1P48S (153.6V) | 1P52S, 166.4V, 46.6kWh |
| RACK（簇） | 8模组串, 1P416S | 8模组串, 1P384S | 1P416S, 1331.2V, 372.7kWh |
| 电池舱 | 2×8簇并, 5.016MWh | 2×10簇并, 约6MWh | 标注总能量+额定电压 |

### 3.2 PCS拓扑分类和标注差异

| 拓扑类型 | 适用场景 | SLD画法要点 | 标注内容 |
|---------|---------|------------|---------|
| **单级DC/AC** | 中低压系统(≤1MW) | 直接一个PCS块 | PCS, xxxkW, AC xxxV / DC xxx-xxxV |
| **双级DC/DC+DC/AC** | 宽电压范围 | DC/DC块+DC/AC块串联画 | DC/DC: xxxkW, xxx-xxxV→DC-Link xxxV; DC/AC: xxxkW, DC-Link→AC xxxV |
| **高压级联** | 10kV直挂 | 每相一串H桥模块 | H桥模块×N/相, 每模块xxxV, 无需变压器 |

### 3.3 BMS三层架构标注强制内容

```
BAMU (Battery Array Management Unit)  — 电池阵列管理单元
  层级：站控级
  通信：对上→EMS, 对下→BCMU×N
  功能：SOC/SOH汇总, 充放电策略, 故障分级管理

BCMU (Battery Cluster Management Unit) — 电池簇管理单元
  层级：簇级（每个RACK一个）
  通信：对上→BAMU(CAN/RS485), 对下→BMU×M(菊花链/CAN)
  功能：簇电压/电流, 绝缘监测, 接触器控制, 预充控制

BMU (Battery Module Unit) — 电池模组管理单元
  层级：模组级（每个模组一个）
  通信：对上→BCMU(菊花链/CAN)
  功能：电芯电压(每颗), 电芯温度(多处), 均衡管理

传感器：
  所有电芯电压(V1,V2...Vn) → BMU采集
  模组多点温度(T1,T2,T3,T4) → BMU采集
  簇总电压/电流 → BCMU采集（含Hall传感器）
  绝缘电阻 → BCMU采集（不平衡电桥法）
```

**BMS在SLD/二次图中的标准画法**：

```
高压箱(BCP)：
  ┌──────────────────────────────┐
  │ KM+, KM-, KM-pre, R-pre, FU │ ← 一次元件
  │ Hall传感器 (I/U/T)          │ ← 采集
  │ 绝缘监测模块                 │ ← 安全
  │ BCMU 主控板                 │ ← 控制
  └───┬──────────────────────────┘
      │ CAN/菊花链
  ┌───┴──────────────────────────┐
  │ 电池模组1~8（每个含BMU子板）   │
  │ 标注：1P52S, 166.4V, 46.6kWh │
  └──────────────────────────────┘
```

### 3.4 高压箱（BCP - Battery Connection Panel）内部结构

这是SLD中DC侧最关键的部分，必须完整表达：

```
电池簇正极
  │
  ├── FU1 (正极熔断器, xxxA, 标注型号)
  │
  ├── KM1 (主正接触器, xxxV DC, xxxA) ← BCMU控制
  │
  ├── Hall电流传感器 (标注量程和精度)
  │
  └── + 直流母线 → PCS
                                
电池簇负极
  │
  ├── KM2 (主负接触器) ← BCMU控制
  │
  ├── Shunt分流器 或 Hall传感器
  │
  ├── FU2 (负极熔断器, 可选)
  │
  └── - 直流母线 → PCS

【预充回路】（并接在KM1两端）：
  + ──→ KM-pre (预充接触器) → R-pre (预充电阻, xxΩ/xxW) ──→ +

【绝缘监测】：平衡电桥在+→地和-→地之间检测绝缘电阻
```

---

## 四、BMS架构与电池簇拓扑表达

### 4.1 电池簇串并联标注标准格式

```
标准标注格式：[并联数]P[串联数]S

示例：
  单体电芯：3.2V 280Ah              (不标P/S)
  模组：    1P52S                   (串联52颗)
  RACK：    1P416S  (8模组×52S)  
  SYSTEM：  12P416S (12簇并)       (标注总并簇数)

能量计算（必须标注）：
  RACK能量 = 3.2V × 280Ah × 416S = 372.7kWh
  SYSTEM能量 = 372.7kWh × 12 = 4472.4kWh (取4.472MWh)
```

### 4.2 BMS与PCS的关键交互信号（二次图/通信图必须表达）

| 信号 | 方向 | 类型 | 重要性 | 介质 |
|------|------|------|-------|------|
| BMS允许充电/放电 | BMS→PCS | 通信+CAN | **强制** | CAN/RS485 |
| PCS请求充电/放电功率 | PCS→BMS | 通信 | **强制** | CAN/RS485 |
| BMS限制功率（降额） | BMS→PCS | 通信 | **强制** | CAN/RS485 |
| BMS紧急停机 | BMS→PCS | **硬接线** | **强制** | 干接点/24V |
| BMS SOC/SOH | BMS→EMS/PCS | 通信 | 强制 | CAN/Modbus |
| 绝缘故障 | BMS→EMS | 硬接线 | 强制 | 干接点 |
| 消防联动停机 | FSS→BMS/PCS | **硬接线** | **安全强制** | 干接点 |
| 交直流断路器状态 | 断路器→EMS/BMS | 通信 | 推荐 | DI/RS485 |

---

## 五、保护与安全设计强制性标注规则

### 5.1 储能系统安全停机层级（必须在保护配置图中表达）

```
Level 1 — 预警（不停机，仅报警）
  ├── 电芯温差过大 (>5°C)
  ├── SOC越限预警 (SOC<10% 或 >90%)
  ├── 绝缘电阻下降（一级报警：<500Ω/V）
  └── 通信质量下降（丢包率>1%）

Level 2 — 降功率运行（限制充放电功率至50%或以下）
  ├── 电芯温度偏高 (>45°C 但 <55°C)
  ├── SOC严重越限 (SOC<5% 或 >95%)
  ├── 绝缘电阻严重下降（二级报警：<200Ω/V）
  └── PCS单模块故障（N-1冗余时）

Level 3 — 紧急停机（立即停机，断开交直流断路器）
  ├── 电芯温度过高 (>55°C 或 >60°C)
  ├── 电芯电压严重异常 (V<2.0V 或 V>3.65V for LFP)
  ├── SOC越限保护触发 (SOC<2% 或 >98%)
  ├── 绝缘电阻极低（三级报警：<100Ω/V）
  ├── PCS多模块故障（N-1失效）
  └── 外部消防联动触发 ← **必须硬接线，不可依赖通信**

Level 4 — 紧急切除（消防联动+所有断路器跳闸）
  ├── 火灾探测确认（烟感+温感双重确认）
  ├── 可燃气体探测报警（H2/CO浓度超标）
  └── 手动紧急停机按钮触发
```

### 5.2 消防联动（FSS）强制标注规则

**在SLD中必须标注**：
```
消防主机(FSS) → ┐
                ├──→ 硬接线 ──→ 安全继电器 ──→
                │       ├→ QF-DC分闸线圈 (全部直流断路器)
                │       ├→ QF-AC分闸线圈 (全部交流断路器)  
                │       └→ PCS紧急停机端子
                │
                ├──→ 硬接线 ──→ BMS急停输入 (全部BCMU)
                │
                └──→ RS485/干接点 ──→ EMS告警 (仅用于记录，不用于控制)
```

**关键原则**：FSS停机回路不允许经过PLC/软件判断，必须是"硬接线+安全继电器"的物理回路。

### 5.3 防孤岛保护（Anti-Islanding）

在SLD和二次图中必须标注：
```
PCC检测点：
  ├── 电压检测 (VN, 正常范围85%-110% Un)
  ├── 频率检测 (f, 正常范围±0.5Hz)
  ├── 相角突变检测 (Δθ)
  ├── 谐波畸变检测 (THDu)
  └── 动作条件：以上任一超出设定值且持续时间>设定延时
      └→ 动作结果：跳闸PCC断路器 + PCS停机 + 禁止重合闸(需人工确认)

反孤岛装置标注格式：
  型号：XXXX
  检测点：PCC-10kV侧
  动作电压：<85%Un 或 >110%Un
  动作频率：<49.5Hz 或 >50.5Hz
  动作时间：≤2s (根据当地电网要求)
```

### 5.4 电弧闪光防护（Arc Flash）

开关柜内必须标注：
```
弧闪保护边界(Arc Flash Boundary)
├── 入射能量: xxx cal/cm²
├── 工作距离: xxx mm
├── 边界距离: xxx mm
└── PPE等级: Level x (根据NFPA 70E)
```

---

## 六、SVG工程制图规范

### 6.1 全局样式表（CSS变量模式）

```css
:root {
  /* === 电力线颜色 === */
  --line-hv-ac:       #EF4444;  /* 高压交流 ≥1kV (红色警示) */
  --line-lv-ac:       #F59E0B;  /* 低压交流 <1kV */
  --line-dc:          #00D4FF;  /* 直流主回路 */
  --line-aux:         #64748B;  /* 辅助电源 24V/220V */
  
  /* === 通信线颜色 === */
  --comm-ethernet:    #1E90FF;  /* Ethernet */
  --comm-rs485:       #22C55E;  /* RS485 */
  --comm-can:         #A78BFA;  /* CAN */
  --comm-fiber:       #F97316;  /* 光纤 */
  --comm-wireless:    #EC4899;  /* 无线/4G */
  
  /* === 保护回路颜色 === */
  --prot-hardwire:    #EF4444;  /* 硬接线保护(红,强制可见) */
  --prot-trip:        #DC2626;  /* 跳闸回路 */
  --prot-signal:      #10B981;  /* 信号回路 */
  
  /* === 分区背景色 === */
  --zone-hv:          rgba(239,68,68,0.06);    /* 高压区 */
  --zone-lv:          rgba(245,158,11,0.05);   /* 低压区 */
  --zone-dc:          rgba(0,212,255,0.06);    /* 直流区 */
  --zone-ctrl:        rgba(167,139,250,0.06);  /* 控制通信区 */
  --zone-ground:      rgba(148,163,184,0.08);  /* 接地/辅助区 */
  
  /* === 线条粗细 === */
  --line-busbar:      6px;    /* 母线 */
  --line-main:        2.5px;  /* 主回路 */
  --line-branch:      2px;    /* 支路 */
  --line-control:     1.5px;  /* 控制回路 */
  --line-signal:      1px;    /* 信号/通信 */
  --line-ground:      2px;    /* 接地线 */
  
  /* === 字体 === */
  --font-title:       'Noto Sans SC', sans-serif;
  --font-text:        'Noto Sans SC', sans-serif;
  --font-mono:        'Space Mono', 'Cascadia Code', monospace;
  --font-icon:        'Font Awesome 6 Free';
  
  /* === 字号 === */
  --fs-title:         16px;   /* 图名 */
  --fs-section:       14px;   /* 分区名 */
  --fs-device:        13px;   /* 设备名 */
  --fs-param:         11px;   /* 参数标注 */
  --fs-note:          10px;   /* 备注 */
  --fs-code:          11px;   /* 元件编号(等宽) */
}
```

### 6.2 线型完整定义（含箭头）

```xml
<defs>
  <!-- === 电力线箭头 === -->
  <!-- 双向充放电箭头 -->
  <marker id="arrow-power-bidir" viewBox="0 0 12 12" refX="6" refY="6"
    markerWidth="6" markerHeight="6" orient="auto-start-reverse">
    <path d="M5 2 L11 6 L5 10" fill="none" stroke="#00d4ff" stroke-width="1.8"
      stroke-linecap="round" stroke-linejoin="round"/>
  </marker>
  <!-- 能量流向单箭头 -->
  <marker id="arrow-flow" viewBox="0 0 10 10" refX="8" refY="5"
    markerWidth="5" markerHeight="5" orient="auto">
    <path d="M2 2 L8 5 L2 8" fill="currentColor"/>
  </marker>
  <!-- 控制信号箭头 -->
  <marker id="arrow-ctrl" viewBox="0 0 10 10" refX="10" refY="5"
    markerWidth="4" markerHeight="4" orient="auto">
    <path d="M2 2 L8 5 L2 8" fill="currentColor"/>
  </marker>
  
  <!-- === 连接点/节点 === -->
  <!-- 连接实心点 -->
  <g id="dot-connect">
    <circle r="3" fill="#00d4ff"/>
  </g>
  <!-- 非连接交叉弧 -->
  <g id="arc-cross">
    <path d="M-4,0 A4,4 0 0,1 4,0" fill="none" stroke="currentColor" stroke-width="1"/>
  </g>
  
  <!-- === 接地图标 === -->
  <g id="icon-ground" transform="translate(0,0)">
    <line x1="0" y1="-12" x2="0" y2="0" stroke="currentColor" stroke-width="1.5"/>
    <line x1="-12" y1="0" x2="12" y2="0" stroke="currentColor" stroke-width="2"/>
    <line x1="-8" y1="5" x2="8" y2="5" stroke="currentColor" stroke-width="1.5"/>
    <line x1="-4" y1="10" x2="4" y2="10" stroke="currentColor" stroke-width="1"/>
  </g>
  
  <!-- === 触头/触点 === -->
  <!-- 常开触点（NO） -->
  <g id="contact-no">
    <line x1="0" y1="-8" x2="0" y2="-10" stroke="currentColor" stroke-width="1.5"/>
    <line x1="0" y1="10" x2="0" y2="8" stroke="currentColor" stroke-width="1.5"/>
    <circle cx="0" cy="-8" r="1.5" fill="currentColor"/>
    <circle cx="0" cy="8" r="1.5" fill="currentColor"/>
  </g>
  
  <!-- === 终端电阻 === -->
  <g id="icon-terminator">
    <rect x="-5" y="-8" width="10" height="16" rx="1"
      fill="none" stroke="#22c55e" stroke-width="1"/>
    <text x="8" y="3" fill="#22c55e" font-size="8" font-family="'Space Mono',monospace">120</text>
  </g>
</defs>
```

### 6.3 交叉点处理规则（极其重要）

```
导线交叉且连接：必须画实心圆点 ●（直径≥3px）
导线交叉不连接：必须画跨弧（半圆弧跳过）
                或错开画（业界不推荐，可能导致误读）

绝对禁止：两条线直接画十字 ∔ （读者无法判断是否连接）
```

```xml
<!-- 连接点示例 -->
<line x1="200" y1="100" x2="200" y2="300" stroke="#00d4ff" stroke-width="2"/>
<line x1="100" y1="100" x2="300" y2="100" stroke="#00d4ff" stroke-width="2"/>
<use href="#dot-connect" x="200" y="100"/>  <!-- 在交叉点画实心圆 -->

<!-- 不连接跨弧示例 -->
<line x1="200" y1="100" x2="200" y2="300" stroke="#00d4ff" stroke-width="2"/>
<line x1="100" y1="100" x2="200" y2="100" stroke="#00d4ff" stroke-width="2"/>
<use href="#arc-cross" x="200" y="102" stroke="#00d4ff"/>
<!-- 另一条线从不连接的对向继续画 -->
<line x1="200" y1="100" x2="300" y2="100" stroke="#00d4ff" stroke-width="2"/>
```

### 6.4 viewBox与布局规范

| 图类型 | viewBox | 布局方向 | 备注 |
|-------|---------|---------|------|
| 系统框图 | 900×600 | 纵向 | 上电源下负荷 |
| 一次接线图(小型) | 900×750 | 纵向 | 单回路 |
| 一次接线图(大储) | 1200×900 | 纵向 | 多回路/多变压器 |
| 二次接线图 | 1000×700 | 横向为主 | 回路展开 |
| 通信拓扑图 | 900×650 | 星型居中 | 逻辑拓扑 |
| 端子排图 | 800×按需 | 纵向 | 表格状 |
| 接地系统图 | 800×500 | 平面 | 接地网 |
| 光储充一体化 | 1000×800 | 纵向 | 三区并列 |

### 6.5 图框和标题栏规范

每张SVG图必须包含：

```xml
<g id="title-block" transform="translate(0, height-45)">
  <!-- 标题栏底部横线 -->
  <line x1="0" y1="0" x2="width" y2="0" stroke="#2a4570" stroke-width="1"/>
  <line x1="0" y1="30" x2="width" y2="30" stroke="#2a4570" stroke-width="1"/>
  
  <!-- 图名 -->
  <text x="10" y="22" fill="#e2e8f0" font-size="14" font-weight="700">[图名]</text>
  
  <!-- 项目信息 -->
  <text x="width/2" y="15" fill="#64748b" font-size="10" text-anchor="middle">[项目名称]</text>
  <text x="width/2" y="27" fill="#64748b" font-size="10" text-anchor="middle">[图号] | 版本:[ver] | 日期:[date]</text>
  
  <!-- 设计单位 -->
  <text x="width-10" y="22" fill="#64748b" font-size="11" text-anchor="end">[设计单位]</text>
</g>
```

### 6.6 图例框规范

```xml
<g id="legend" transform="translate(width-230, height-180)">
  <rect width="220" height="130" rx="6" fill="rgba(13,21,37,0.95)" stroke="#2a4570" stroke-width="1"/>
  <text x="12" y="22" fill="#94a3b8" font-size="11" font-weight="600">图例</text>
  
  <!-- 图例条目模板 -->
  <line x1="12" y1="38" x2="40" y2="38" stroke="#00d4ff" stroke-width="2.5"/>
  <text x="48" y="42" fill="#94a3b8" font-size="10">主电力线</text>
  
  <line x1="12" y1="54" x2="40" y2="54" stroke="#22c55e" stroke-width="1.5" stroke-dasharray="4 2"/>
  <text x="48" y="58" fill="#94a3b8" font-size="10">RS485通信</text>
  
  <line x1="12" y1="70" x2="40" y2="70" stroke="#ef4444" stroke-width="1.5"/>
  <text x="48" y="74" fill="#94a3b8" font-size="10">消防硬接线</text>
  <!-- 依图类型扩展 -->
</g>
```

---

## 七、布局坐标工程计算

### 7.1 坐标推导总公式

```
设 viewBox = (0, 0, W, H)
设 列数 = N_cols, 每列元素宽 = ew, 列间距 = gap_x
设 行数 = N_rows, 每行元素高 = eh, 行间距 = gap_y（含箭头长度）

列中心X[i] = gap_x + (i-1)×(ew + gap_x) + ew/2    (i=1..N_cols)
行中心Y[j] = top_margin + (j-1)×(eh + gap_y) + eh/2  (j=1..N_rows)

gap_x = (W - N_cols×ew - 2×margin_x) / (N_cols + 1)
gap_y = (H - N_rows×eh - top_margin - bottom_margin - legend_height) / (N_rows)

验证条件：
  N_cols×ew + (N_cols-1)×gap_x + 2×margin ≤ W  ← 必须满足
  N_rows×eh + (N_rows-1)×gap_y + top + bottom + legend ≤ H  ← 必须满足
```

### 7.2 箭头连接的精确坐标推导

```
两点间垂直连接（上方A连接到下方B）：
  起点 P1 = (A.cx, A.cy + A.h/2)           ← 框A下边缘中点
  终点 P2 = (B.cx, B.cy - B.h/2 - arrow_offset)  ← 框B上边缘中点上方
  
  arrow_offset = markerHeight + 2px  ← 留出箭头头部空间
  双向箭头时：起点向上偏移 arrow_offset，终点向下偏移 arrow_offset

两点间水平连接（左侧A连接到右侧B）：
  起点 P1 = (A.cx + A.w/2, A.cy)           ← 框A右边缘中点
  终点 P2 = (B.cx - B.w/2 - arrow_offset, B.cy)  ← 框B左边缘中点左侧
```

### 7.3 文字内边距与框尺寸推导

```
矩形框最小宽度 = text_width + padding_left + padding_right
               = (最长汉字数×font_size×1.0 + 其他字数×font_size×0.65) + 32
矩形框最小高度 = text_rows × (font_size + line_gap) + padding_top + padding_bottom
               = text_rows × (font_size + 4) + 20

标准单行框：w≥max(text_width+32, 140), h=40 或 48
标准双行框：w≥max(text_width+32, 160), h=56 或 64
```

### 7.4 EMS/BMS虚线控制域的精确包围

```
围框.x = MIN(所有被围元素.x) - padding_left
围框.y = MIN(所有被围元素.y) - padding_top
围框.w = MAX(所有被围元素.x + 元素.w) - 围框.x + padding_right
围框.h = MAX(所有被围元素.y + 元素.h) - 围框.y + padding_bottom

padding推荐值：left=20, right=20, top=16, bottom=16
```

### 7.5 整体SVG绘制Z轴顺序（必须严格遵守）

```
Layer 1 (最底层):  背景色 (整个画布)
Layer 2:           分区背景色块 (半透明，HV/LV/DC/CTRL区)
Layer 3:           母线 (最粗的线，最先画主线)
Layer 4:           主回路连接线 + 箭头
Layer 5:           设备符号框 (rect/circle)
Layer 6:           设备文字 (text/label)
Layer 7:           控制通信线 (虚线)
Layer 8:           标注引线 + 旁注文字 + 参数标签
Layer 9 (最顶层):  图例框 + 标题栏 + 分区标签
```

---

## 八、标准化SVG符号库

### 8.1 完整断路器符号（GB/T 4728.4）

```xml
<g id="sym-QF" transform="translate(cx,cy)">
  <!-- 主回路进出线 -->
  <line x1="0" y1="-24" x2="0" y2="-7" stroke="currentColor" stroke-width="2"/>
  <line x1="0" y1="7" x2="0" y2="24" stroke="currentColor" stroke-width="2"/>
  <!-- 断路器方框 -->
  <rect x="-14" y="-7" width="28" height="14" rx="2"
    fill="none" stroke="currentColor" stroke-width="1.5"/>
  <!-- 断路器斜线 -->
  <line x1="-9" y1="-1" x2="9" y2="1" stroke="currentColor" stroke-width="1.5"/>
  <!-- 编号标注位置 -->
  <text x="18" y="14" fill="#64748b" font-size="10" font-family="'Space Mono',monospace">QF{N}</text>
</g>
```

### 8.2 隔离开关符号（GB/T 4728.4）

```xml
<g id="sym-QS" transform="translate(cx,cy)">
  <line x1="0" y1="-24" x2="0" y2="-10" stroke="currentColor" stroke-width="2"/>
  <!-- 隔离开关刀片 -->
  <line x1="-12" y1="-10" x2="12" y2="-10" stroke="currentColor" stroke-width="1.5"/>
  <line x1="-3" y1="-10" x2="8" y2="3" stroke="currentColor" stroke-width="1.8"/> <!-- 无斜线 -->
  <line x1="0" y1="10" x2="0" y2="24" stroke="currentColor" stroke-width="2"/>
  <text x="18" y="14" fill="#64748b" font-size="10" font-family="'Space Mono',monospace">QS{N}</text>
</g>
```

### 8.3 变压器符号（GB/T 4728.5，完整版含接线组别）

```xml
<g id="sym-TR" transform="translate(cx,cy)">
  <!-- 一次侧引出 -->
  <line x1="0" y1="-36" x2="0" y2="-20" stroke="currentColor" stroke-width="2"/>
  <!-- 一次绕组（△标注） -->
  <circle cx="0" cy="-12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/>
  <text x="0" y="-10" fill="currentColor" font-size="8" text-anchor="middle"
    font-family="'Space Mono',monospace" font-weight="700">△</text>
  <!-- 二次绕组（Y0标注） -->
  <circle cx="0" cy="12" r="8" fill="none" stroke="currentColor" stroke-width="1.8"/>
  <text x="0" y="14" fill="currentColor" font-size="8" text-anchor="middle"
    font-family="'Space Mono',monospace" font-weight="700">Y0</text>
  <!-- 二次侧引出 -->
  <line x1="0" y1="20" x2="0" y2="36" stroke="currentColor" stroke-width="2"/>
  <!-- 接线组别标注 -->
  <text x="14" y="0" fill="#64748b" font-size="10"
    font-family="'Space Mono',monospace">Dyn11</text>
</g>
```

### 8.4 CT/PT符号（GB/T 4728.5）

```xml
<!-- 电流互感器 CT -->
<g id="sym-CT" transform="translate(cx,cy)">
  <!-- 主回路穿过线（粗） -->
  <line x1="-20" y1="0" x2="20" y2="0" stroke="currentColor" stroke-width="2.5"/>
  <!-- CT圆圈 -->
  <circle cx="0" cy="0" r="9" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <!-- 二次引出线 -->
  <line x1="0" y1="-9" x2="0" y2="-22" stroke="currentColor" stroke-width="1"
    stroke-dasharray="2 2"/>
  <line x1="-8" y1="-22" x2="8" y2="-22" stroke="currentColor" stroke-width="1"
    stroke-dasharray="2 2"/>
  <!-- 变比标注 -->
  <text x="24" y="4" fill="#64748b" font-size="9"
    font-family="'Space Mono',monospace">500/5A</text>
  <text x="24" y="16" fill="#64748b" font-size="8">5P20</text>
</g>

<!-- 电压互感器 PT -->
<g id="sym-PT" transform="translate(cx,cy)">
  <line x1="0" y1="-24" x2="0" y2="-14" stroke="currentColor" stroke-width="2"/>
  <circle cx="0" cy="-6" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <circle cx="0" cy="6" r="8" fill="none" stroke="currentColor" stroke-width="1.5"/>
  <line x1="0" y1="14" x2="0" y2="24" stroke="currentColor" stroke-width="2"/>
  <text x="24" y="4" fill="#64748b" font-size="9"
    font-family="'Space Mono',monospace">10/0.1kV</text>
</g>
```

### 8.5 熔断器符号（GB/T 4728.4）

```xml
<g id="sym-FU" transform="translate(cx,cy)">
  <line x1="0" y1="-24" x2="0" y2="-12" stroke="currentColor" stroke-width="2"/>
  <rect x="-8" y="-12" width="16" height="24" rx="2"
    fill="none" stroke="currentColor" stroke-width="1.5"/>
  <!-- 熔丝（S形曲线） -->
  <path d="M0,-9 Q5,-5 0,0 Q-5,5 0,9" fill="none"
    stroke="currentColor" stroke-width="1.2"/>
  <line x1="0" y1="12" x2="0" y2="24" stroke="currentColor" stroke-width="2"/>
  <text x="18" y="14" fill="#64748b" font-size="10"
    font-family="'Space Mono',monospace">FU{N}</text>
</g>
```

### 8.6 避雷器符号（GB/T 4728.6）

```xml
<g id="sym-F" transform="translate(cx,cy)">
  <line x1="0" y1="-24" x2="0" y2="-10" stroke="currentColor" stroke-width="2"/>
  <!-- 避雷器三角形 -->
  <polygon points="0,-10 -10,10 10,10" fill="none"
    stroke="currentColor" stroke-width="1.5"/>
  <line x1="-10" y1="10" x2="10" y2="10" stroke="currentColor" stroke-width="1.5"/>
  <line x1="0" y1="10" x2="0" y2="18" stroke="currentColor" stroke-width="1.5"/>
  <!-- 接地符号（三条线渐短） -->
  <line x1="-10" y1="18" x2="10" y2="18" stroke="currentColor" stroke-width="2"/>
  <line x1="-7" y1="22" x2="7" y2="22" stroke="currentColor" stroke-width="1.5"/>
  <line x1="-4" y1="26" x2="4" y2="26" stroke="currentColor" stroke-width="1"/>
</g>
```

### 8.7 PCS/BESS框（自定义标准组件）

```xml
<!-- PCS组件框 -->
<g id="comp-PCS" transform="translate(cx,cy)">
  <rect x="-90" y="-28" width="180" height="56" rx="8"
    fill="rgba(0,212,255,0.08)" stroke="#00d4ff" stroke-width="1.5"/>
  <!-- PCS图标（简化AC/DC符号） -->
  <text x="0" y="-6" fill="#00d4ff" font-size="14" font-weight="700"
    text-anchor="middle">PCS 储能变流器</text>
  <text x="0" y="14" fill="#94a3b8" font-size="11"
    text-anchor="middle" font-family="'Space Mono',monospace">AC ⇄ DC</text>
</g>

<!-- BESS电池舱框 -->
<g id="comp-BESS" transform="translate(cx,cy)">
  <rect x="-110" y="-36" width="220" height="72" rx="8"
    fill="rgba(34,197,94,0.06)" stroke="#22c55e" stroke-width="1.5"/>
  <text x="0" y="-12" fill="#22c55e" font-size="13" font-weight="700"
    text-anchor="middle">电池储能系统 BESS</text>
  <text x="0" y="6" fill="#94a3b8" font-size="11"
    text-anchor="middle" font-family="'Space Mono',monospace">容量: {MWh} | 额定电压: {V}</text>
  <text x="0" y="22" fill="#64748b" font-size="10"
    text-anchor="middle" font-family="'Space Mono',monospace">簇数: {N} | 单簇: 1P{M}S</text>
</g>

<!-- 高压箱(BCP)组件框 -->
<g id="comp-BCP" transform="translate(cx,cy)">
  <rect x="-80" y="-30" width="160" height="60" rx="6"
    fill="rgba(167,139,250,0.08)" stroke="#a78bfa" stroke-width="1.5"
    stroke-dasharray="5 3"/>
  <text x="0" y="-4" fill="#a78bfa" font-size="12" font-weight="600"
    text-anchor="middle">高压箱 BCP</text>
  <text x="0" y="14" fill="#94a3b8" font-size="10"
    text-anchor="middle" font-family="'Space Mono',monospace">KM+/KM-/KM-pre</text>
</g>

<!-- EMS控制域虚线框 -->
<g id="comp-EMS-zone" transform="translate(cx,cy)">
  <rect x="{x}" y="{y}" width="{w}" height="{h}" rx="8"
    fill="rgba(245,158,11,0.04)" stroke="#f59e0b" stroke-width="1.2"
    stroke-dasharray="8 4"/>
  <rect x="{x}" y="{y}-18" width="140" height="18" rx="4"
    fill="#f59e0b" opacity="0.15"/>
  <text x="{x}+10" y="{y}-5" fill="#f59e0b" font-size="11" font-weight="600">EMS 控制域</text>
</g>
```

### 8.8 常用连接器/端子符号

```xml
<!-- 插拔端子 -->
<g id="sym-terminal" transform="translate(cx,cy)">
  <rect x="-6" y="-4" width="12" height="8" rx="1"
    fill="currentColor"/>
  <line x1="0" y1="-4" x2="0" y2="-16" stroke="currentColor" stroke-width="1.2"/>
  <line x1="0" y1="4" x2="0" y2="16" stroke="currentColor" stroke-width="1.2"/>
</g>

<!-- RJ45以太网接口 -->
<g id="sym-rj45" transform="translate(cx,cy)">
  <rect x="-10" y="-8" width="20" height="16" rx="2"
    fill="none" stroke="#1e90ff" stroke-width="1.2"/>
  <line x1="-6" y1="-4" x2="6" y2="-4" stroke="#1e90ff" stroke-width="0.8"/>
  <line x1="-6" y1="0" x2="6" y2="0" stroke="#1e90ff" stroke-width="0.8"/>
  <line x1="-6" y1="4" x2="6" y2="4" stroke="#1e90ff" stroke-width="0.8"/>
</g>

<!-- RS485 DB9接口 -->
<g id="sym-db9" transform="translate(cx,cy)">
  <path d="M-10,-8 L10,-8 L12,0 L10,8 L-10,8 Z"
    fill="none" stroke="#22c55e" stroke-width="1.2"/>
  <line x1="-8" y1="-4" x2="-2" y2="-4" stroke="#22c55e" stroke-width="0.8"/>
  <line x1="2" y1="-4" x2="8" y2="-4" stroke="#22c55e" stroke-width="0.8"/>
  <line x1="-6" y1="1" x2="6" y2="1" stroke="#22c55e" stroke-width="0.8"/>
  <line x1="-4" y1="5" x2="4" y2="5" stroke="#22c55e" stroke-width="0.8"/>
</g>

<!-- 光纤接口 -->
<g id="sym-fiber" transform="translate(cx,cy)">
  <circle cx="0" cy="0" r="6" fill="#f97316" opacity="0.3"/>
  <circle cx="0" cy="0" r="3" fill="#f97316" opacity="0.7"/>
  <path d="M-3,-3 L3,3" stroke="#f97316" stroke-width="1"/>
</g>
```

---

## 九、绘图执行标准流程

### Step 1：需求确认与标准选取

```
1.1 明确图类型（从8类中选择）
1.2 确认项目所在地 → 选取适用标准体系（GB/IEC/UL)
1.3 收集项目参数（填写第十章参数模板）
1.4 确认电压等级、关键设备清单
1.5 确认审图/交付要求（施工图深度 vs 方案图）
```

### Step 2：坐标规划（在SVG注释中先写规划表）

```xml
<!--
=== 坐标规划表 ===
画布：viewBox="0 0 {W} {H}"

【垂直分配】
Y=40    标题区
Y=80    第1行元素中心
Y=200   第2行元素中心
Y=320   母线行中心
Y=440   第3行元素中心
Y=560   第4行元素中心
Y=650   图例区
行间距 = 120px

【水平分配】
X=200   左列中心
X=450   中列中心
X=700   右列中心
列间距 = 250px

【元素尺寸】
标准框 w=180 h=48
宽框   w=260 h=56
母线   w=600 h=8
-->
```

### Step 3：骨架绘制（由粗到细）

```
3.1 画背景色块和分区色块（Layer 1-2）
3.2 画母线（Layer 3，最粗的线，标注电压等级）
3.3 画各支路垂直主干线（从母线向下引出）
3.4 插入设备符号（Layer 5，使用标准符号库）
3.5 添加元件编号（Layer 6）
3.6 添加参数标注（电压/容量/型号等 Layer 8）
3.7 画控制/通信线（Layer 7，虚线类别）
3.8 处理导线交叉点（连接打点/不连接画弧）
3.9 添加图例和标题栏（Layer 9）
```

### Step 4：交叉点处理逐行检查

```
遍历图中所有线段交叉位置：
  IF 两条导线在图纸上交叉：
    IF 它们在电气上是连接的：
      → 在交叉点画实心圆 ●
    ELSE：
      → 画跨弧 或 错开处理
```

### Step 5：参数标注完整性检查

```
每条支路检查：
  □ 电缆型号是否标注
  □ 断路器额定参数是否标注
  □ CT/PT变比是否标注
  □ 变压器参数是否标注
  □ PCS/BESS参数是否标注
  □ 母线参数是否标注
```

### Step 6：保护/Safety检查（对照第十一章检查表）

---

## 十、项目参数模板

### 10.1 工商业储能项目（C&I BESS）

```yaml
project:
  name: ""
  location: ""
  country: "CN"       # CN/US/EU - 决定适用标准
  application: "C&I"  # C&I / Utility / Residential

grid:
  voltage_pcc: "10kV"        # PCC电压等级
  frequency: "50Hz"
  short_circuit_capacity: "" # 系统短路容量 MVA
  neutral_grounding: ""      # 中性点接地方式
  
transformer:
  capacity_kva: 1250
  ratio: "10/0.4kV"
  group: "Dyn11"
  impedance_percent: 6.0
  cooling: "AN"      # AN=干式自冷, KNAN=干式风冷, ONAN=油浸自冷

bess:
  model: ""
  capacity_mwh: 0    # 额定能量
  power_mw: 0        # 额定功率
  dc_voltage_nom: 0  # 直流额定电压
  dc_voltage_range:  # [min, max]
  cell_chemistry: "LFP"
  cluster_config:    # 单簇配置
    module_type: ""
    modules_per_rack: 0
    cells_per_module: 0
    total_cells: 0
    topology: ""     # 1P416S etc
  cluster_count: 0

pcs:
  model: ""
  power_kw: 0
  ac_voltage: ""
  dc_voltage_range: ""
  topology: "single-stage"  # single-stage / two-stage / cascaded-H
  max_efficiency: 0.985

bms:
  architecture: "3-level"   # 3-level(BMU+BCMU+BAMU) / 2-level
  master_comm: "CAN"
  slave_comm: "daisy-chain"
  insulation_monitoring: "balanced-bridge"  # 不平衡电桥

protection:
  overload: true
  short_circuit: true
  ground_fault: true
  anti_islanding: true
  arc_flash: true
  fire_alarm: true
  
fss:
  detector_type: "smoke+heat"  # 烟感+温感
  suppression_type: "aerosol"  # 气溶胶 / Novec1230 / 七氟丙烷
  hardwire_to: ["QF-DC", "QF-AC", "PCS-ESD", "BMS-ESD"]
  
communication:
  network_topology: ""
  protocols: []
  # - {name: "Modbus TCP", device: "PCS", ip: "192.168.1.10:502"}
  # - {name: "CAN", device: "BMS", rate: "250kbps"}
```

### 10.2 光储充一体化项目额外参数

```yaml
pv:
  total_capacity_kwp: 0
  module_type: ""
  inverter_count: 0
  inverter_power_kw: 0
  dc_combiner_count: 0
  
ev_charging:
  charger_count: 0
  charger_power_kw: 0  # 单枪功率
  connector_type: ""   # CCS2 / GB/T / CHAdeMO
  protocol: "OCPP 1.6J"
  
energy_strategy:
  pv_priority: true    # 光伏优先自发自用
  anti_reverse: true   # 防反送
  reverse_power_limit: 5  # 反送功率限制 (%)
  valley_charge_periods: []
  peak_discharge_periods: []
  soc_operating_range: [15, 95]
```

---

## 十一、质量控制检查表

### 11.1 系统框图检查项 (22项)

```
□ 1. 所有电压等级是否标注（电网侧/交流侧/直流侧/辅助电源）
□ 2. PCC计量点是否明确
□ 3. 能量流与信息流线型是否区分
□ 4. 充放电箭头方向是否正确（双向标注）
□ 5. EMS控制域虚线框是否画出
□ 6. 各子系统边界是否清晰
□ 7. 保护层级是否用不同颜色/线型区分
□ 8. 标题栏是否包含图名/图号/日期
□ 9. 图例是否完整
□ 10. 是否有"此图为方案图"声明（如非施工图）
□ 11. BESS总容量和功率是否标注
□ 12. PCS额定功率是否标注
□ 13. 是否有防反送策略标注
□ 14. 是否有SOC运行范围标注
□ 15. 能量流路径是否从电网→PCC→母线→设备清晰
□ 16. 本地负荷是否画出
□ 17. 变压器是否标注容量/变比
□ 18. 无功补偿设备是否画出（如有）
□ 19. 消防联动关系是否简略表达
□ 20. 充电桩是否标注接口类型（光储充项目）
□ 21. 是否用虚线分界高压/低压/直流区域
□ 22. 字体大小是否一致（标题14px/设备13px/参数11px）
```

### 11.2 一次接线图检查项 (35项)

```
□ 1.  所有断路器有编号 QF1, QF2, ...
□ 2.  所有隔离开关有编号 QS1, QS2, ...
□ 3.  所有接触器有编号 KM1, KM2, ...
□ 4.  所有熔断器有编号 FU1, FU2, ...
□ 5.  所有CT有编号和变比 TA1 500/5A
□ 6.  所有PT有编号和变比 TV1 10/0.1kV
□ 7.  所有变压器有编号和完整参数
□ 8.  导线交叉连接点有实心圆
□ 9.  导线交叉不连接处有跨弧
□ 10. 母线是否比普通导线粗3倍以上
□ 11. 高压区/低压区/直流区分区线是否清晰
□ 12. 每条电缆线路标注型号规格
□ 13. 断路器标注额定电流/分断能力
□ 14. CT准确级是否标注（测量0.5S, 保护5P20）
□ 15. 变压器接线组别是否标注（Dyn11/Yyn0）
□ 16. 避雷器是否在10kV侧配置
□ 17. 接地符号是否完整（三条渐短线）
□ 18. 直流侧熔断器是否完整（正极+负极可选）
□ 19. 直流接触器是否完整（主正+主负+预充）
□ 20. 预充回路是否画出（KM-pre + R-pre）
□ 21. 消防紧急断路回路是否画出（硬接线标注）
□ 22. BMS高压箱是否画出内部结构
□ 23. 电池簇串并联数是否标注（1P416S等）
□ 24. PCS交直流侧是否明确区分
□ 25. 防孤岛保护是否标注
□ 26. 绝缘监测是否在直流侧标注
□ 27. 电量计量点是否标注（关口表/并网表/用电表）
□ 28. 辅助电源回路是否画出（站用电/控制电源）
□ 29. 直流母线电压是否标注
□ 30. 交流母线电压是否标注
□ 31. 元件从属关系是否清晰（如"QF2→T1"）
□ 32. 电缆长度是否标注（施工图要求）
□ 33. 母排规格是否标注（TMY-xxx）
□ 34. 是否有"带电部分"警示标注（施工图要求）
□ 35. 图例和标题栏是否完整
```

### 11.3 通信拓扑图检查项 (18项)

```
□ 1.  通信分层是否清晰（设备层/间隔层/站控层/云端）
□ 2.  每条RS485是否标注波特率+数据位+校验
□ 3.  每条RS485末端是否标注120Ω终端电阻
□ 4.  RS485是否注明"手拉手"连接方式
□ 5.  每条CAN是否标注波特率
□ 6.  CAN总线两端是否各标注120Ω终端电阻
□ 7.  每条Ethernet是否标注IP地址段
□ 8.  交换机端口连接是否标注端口号
□ 9.  光纤是否标注单模/多模和芯数
□ 10. 无线/4G是否标注运营商和APN
□ 11. EMS/BAMU到各子系统的通信协议是否标注
□ 12. 消防联动通信是否独立标注（且注明不可仅依赖通信）
□ 13. BMS和PCS的通信带宽/延迟要求是否标注（如需）
□ 14. 时间同步方案是否标注（GPS/北斗/NTP/IRIG-B）
□ 15. 网络安全分区是否标注（安全I区/II区/III区）
□ 16. 环网拓扑是否标注冗余协议（RSTP/MRP）
□ 17. OCPP充电桩协议版本是否标注
□ 18. 是否有通信异常处理策略标注（如通信中断PCS行为）
```

### 11.4 二次接线图检查项 (16项)

```
□ 1.  保护/控制/信号/测量回路线型是否区分
□ 2.  每条导线是否标注线号
□ 3.  每条导线是否标注远端去向
□ 4.  端子排是否标注端子号
□ 5.  综合保护装置是否标注功能配置
□ 6.  跳闸/合闸回路是否画出
□ 7.  闭锁条件是否标注
□ 8.  防跳回路是否画出（断路器防跳继电器）
□ 9.  CT二次侧是否标注不得开路
□ 10. PT二次侧是否标注不得短路
□ 11. 急停回路是否独立标注（硬接线）
□ 12. 消防联动停机回路是否独立标注
□ 13. 是否有保护出口压板（LP）标注
□ 14. 是否有控制电源空开标注
□ 15. BMS故障分级信号回路是否画出
□ 16. PCS使能/停机信号回路是否画出
```

---

## 十二、常见致命错误

### 12.1 符号错误

| 错误 | 后果 | 纠正 |
|------|------|------|
| 断路器画成隔离开关（没有斜线） | 审图不通过，图纸作废 | 断路器必须有"/"斜线 |
| 隔离开关画了斜线成断路器 | 误导施工，可能安全事故 | 隔离开关一定是矩形+刀片，无斜线 |
| 变压器不画接线组别 | 施工单位无法确定接线方式 | 必须标注Dyn11/Yyn0等 |
| 避雷器符号不画接地 | 功能表达不完整 | 避雷器下端必须有接地符号 |

### 12.2 线路错误

| 错误 | 后果 | 纠正 |
|------|------|------|
| 交叉点既不画点也不画弧 | 无法判断是否连接 | 必须打点或画弧 |
| 母线画成普通线宽 | 无法区分干线和支线 | 母线至少3倍粗 |
| 能量线和通信线都用实线 | 混淆主回路和控制回路 | 通信线必须虚线 |

### 12.3 标注错误

| 错误 | 后果 | 纠正 |
|------|------|------|
| 不标注元件编号 | 无法对应设备清单 | 每个元件必须有唯一编号 |
| CT不标变比 | 施工单位无法选型 | 必须标注变比和准确级 |
| 电缆不标截面积 | 无法施工 | 必须标注型号+芯数×截面积 |
| 变压器参数不全 | 订货/安装依据缺失 | 必须标容量/变比/组别/阻抗% |

### 12.4 安全错误（最严重）

| 错误 | 后果 | 纠正 |
|------|------|------|
| 消防联动仅靠通信，无硬接线回路 | 通信故障时消防无法停机，可能导致火灾扩大 | FSS必须有独立硬接线到断路器和PCS |
| 直流侧没有熔断器 | 短路时无法切断，电池热失控 | DC侧正极必须有熔断器，负极建议有 |
| 漏画ESD紧急停止回路 | 紧急情况无法一键停机 | ESD必须是硬接线独立回路 |
| 防孤岛保护不标注 | 检修人员触电风险 | 必须在PCC标注防孤岛保护 |
| 绝缘监测不标注 | 漏电/接地故障无法检测 | BMS必须监测正对地和负对地绝缘电阻 |

### 12.5 SVG绘制专项致命错误

| 错误 | 后果 | 纠正 |
|------|------|------|
| 元素坐标靠估算不靠计算 | 重叠/错位/文字溢出 | 必须先写坐标规划表 |
| 箭头终点不偏移 | 箭头头部遮挡连接点 | 箭头终点偏移markerHeight+2px |
| Z轴顺序混乱（背景盖住内容） | 元素不可见 | 严格按Layer 1-9顺序 |
| 虚线框位置估算 | 没包住被控元素 | 从子元素坐标推导虚线框位置 |
| 文字宽度不估算 | 文字溢出框或截断 | 汉字=font_size×1.0, 英文=font_size×0.6 |

---

## 附录A：GB/T 4728符号速查（最常用30个）

| 序号 | 名称 | GB/T 4728编号 | 快速记忆 | 适用图类型 |
|------|------|-------------|---------|-----------|
| 1 | 断路器 | 07-13-05 | 方框+斜线 | SLD |
| 2 | 隔离开关 | 07-13-06 | 方框+刀片 | SLD |
| 3 | 负荷开关 | 07-13-07 | 方框+竖线 | SLD |
| 4 | 接触器主触点 | 07-13-02 | 半圆 | SLD/二次 |
| 5 | 熔断器 | 07-21-01 | 方框+S | SLD |
| 6 | 变压器(双绕组) | 06-09-01 | 双圆圈 | SLD |
| 7 | 电流互感器 | 06-14-01 | 圆圈穿线 | SLD |
| 8 | 电压互感器 | 06-13-01 | 双圆圈 | SLD |
| 9 | 避雷器 | 07-22-03 | 三角+接地 | SLD |
| 10 | 接地 | 02-15-01 | 三渐短线 | SLD/所有 |
| 11 | 保护接地 | 02-15-03 | 圈内PE | 所有 |
| 12 | 等电位 | 02-15-04 | 三角箭头 | 接地图 |
| 13 | 连接点 | 03-02-01 | 实心圆 | 所有 |
| 14 | 不连接跨弧 | 03-02-03 | 半圆弧 | 所有 |
| 15 | 常开触点 | 07-02-01 | 开放半圆 | 二次 |
| 16 | 常闭触点 | 07-02-03 | 闭合半圆+斜线 | 二次 |
| 17 | 继电器线圈 | 07-15-01 | 矩形 | 二次 |
| 18 | 时间继电器 | 07-15-03 | 矩形+三角 | 二次 |
| 19 | 按钮(常开) | 07-06-02 | 开放触点+按钮 | 二次 |
| 20 | 按钮(常闭) | 07-06-03 | 闭合触点+按钮 | 二次 |
| 21 | 行程开关 | 07-08-01 | 触点+三角凸轮 | 二次 |
| 22 | 指示灯 | 08-10-01 | 圈内× | 二次 |
| 23 | 电铃/蜂鸣器 | 08-10-05 | 矩形+弧线 | 二次 |
| 24 | 电池 | 06-15-01 | 长短线交替 | 直流区 |
| 25 | 电阻 | 04-01-01 | 矩形 | SLD/二次 |
| 26 | 电容 | 04-02-01 | 二平行线 | SLD |
| 27 | 二极管 | 05-03-01 | 三角+横线 | SLD/二次 |
| 28 | 电机 | 06-04-01 | 圈内M | SLD |
| 29 | 发电机 | 06-04-02 | 圈内G | SLD |
| 30 | 直流电源 | 06-15-02 | 圈内2短1长 | 直流区 |

---

## 附录B：储能项目典型配置参数速查

### B.1 工商业储能典型配置

| 参数项 | 小型(<1MWh) | 中型(1-5MWh) | 大型(5-20MWh) |
|--------|-----------|------------|------------|
| 接入电压 | 0.4kV | 0.4kV/10kV | 10kV或以上 |
| PCS功率 | 100-250kW | 500-1500kW | 2-10MW |
| 电池类型 | LFP 280Ah | LFP 280/314Ah | LFP 314Ah+ |
| 单簇电压 | 716.8-832V | 1164.8-1331.2V | 1331.2-1504V |
| 冷却方式 | 风冷 | 风冷/液冷 | 液冷 |
| BMS架构 | 2级 | 3级 | 3级+冗余 |
| 消防 | 气溶胶 | 气溶胶+七氟丙烷 | 全氟己酮+水喷淋 |
| 集装箱 | 20ft | 20ft/40ft | 40ft×N / 预制舱 |

### B.2 电池模组典型规格参考

| 参数 | 280Ah风冷 | 314Ah液冷 | 标注方式 |
|------|----------|----------|---------|
| 电芯 | 3.2V 280Ah | 3.2V 314Ah | 3.2V,280Ah,LFP |
| 模组串联 | 52S | 48S | 1P52S |
| 模组电压 | 166.4V | 153.6V | Vmodule=166.4V DC |
| 模组能量 | 46.6kWh | 48.2kWh | Emodule=46.6kWh |
| 模组尺寸 | 约800×600×230mm | 约1000×700×250mm | 属于安装图范畴 |

---

*版本：v3.0*
*适用范围：储能/光伏/充电桩/微电网/工商业配电全场景电气图绘制*
*下次迭代方向：
  1. 扩展到厂站级SCADA图绘制规范
  2. 增加IEC 61850 IED模型到SVG的自动映射
  3. 增加各省电价峰谷时段数据库
  4. 增加典型故障录波图绘制规范
  5. 补充户用储能（residential）的差异化绘制规则*
