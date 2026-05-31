---
name: software-net-point-table
description: >
  通信点表(Point Table)自动生成Skill。根据设备清单自动生成Modbus RTU/TCP、
  IEC 60870-5-104、MQTT、OCPP 1.6J/2.0.1四种主流通信协议的标准点表，并生成
  对应的EMS配置模板。覆盖PCS、BMS、多功能电表、光伏逆变器、充电桩、柴油发电机、
  温控/消防/环境监测等全部储能系统设备。提供地址分配规则、数据类型/缩放因子/
  寄存器地址规范、MQTT Topic命名规范、OCPP点映射表、IEC104 ASDU/COT/IOA配置。
  适用场景：储能电站、微电网、充电站的SCADA/EMS系统集成与对点调试。
  使用本skill可确保点表规范统一，对点调试一次通过率>90%。
---

# 通信点表生成专业Skill v1.0

## 目录

- [一、点表基础规范](#一点表基础规范)
- [二、Modbus RTU/TCP点表模板](#二modbus-rtutcp点表模板)
- [三、IEC 60870-5-104点表模板](#三iec-60870-5-104点表模板)
- [四、MQTT点表与Topic规范](#四mqtt点表与topic规范)
- [五、OCPP 1.6J充电桩点表](#五ocpp-16j充电桩点表)
- [六、设备点表映射矩阵](#六设备点表映射矩阵)
- [七、PCS点表示例(全点)](#七pcs点表示例全点)
- [八、BMS点表示例(全点)](#八bms点表示例全点)
- [九、多功能电表/关口表点表](#九多功能电表关口表点表)
- [十、光伏逆变器点表](#十光伏逆变器点表)
- [十一、充电桩点表(Modbus+OCPP双协议)](#十一充电桩点表modbusocpp双协议)
- [十二、柴油发电机点表](#十二柴油发电机点表)
- [十三、辅助系统点表(消防/温控/环境)](#十三辅助系统点表消防温控环境)
- [十四、地址分配规则与冲突管理](#十四地址分配规则与冲突管理)
- [十五、数据转换与缩放因子规范](#十五数据转换与缩放因子规范)
- [十六、EMS配置模板(YAML)](#十六ems配置模板yaml)
- [十七、点表Excel生成规范](#十七点表excel生成规范)
- [十八、对点调试检查清单](#十八对点调试检查清单)

---

## 一、点表基础规范

### 1.1 协议选型决策树

```
设备类型：
  ├── PCS/BMS/电表/逆变器/柴发(间隔层设备)
  │   ├── 距离<15m → RS485 (Modbus RTU)
  │   ├── 距离>15m 且 支持以太网 → Modbus TCP
  │   └── 有光纤接口 → Modbus TCP over Fiber
  │
  ├── 调度/电网SCADA
  │   └── → IEC 60870-5-104 (国内调度标准)
  │
  ├── 云平台/APP
  │   └── → MQTT (物联网标准协议)
  │
  ├── 充电桩
  │   ├── 桩控 → OCPP 1.6J / OCPP 2.0.1
  │   └── EMS监控 → Modbus TCP (补充)
  │
  └── 第三方系统对接(通过EMS中转)
      └── → MQTT 或 HTTP REST API
```

### 1.2 点表通用字段定义

```yaml
point_table_common_fields:
  # 基本标识
  point_id:          # 点编号(唯一标识, 如: PCS1_P_ACTIVE)
  point_name:        # 点中文名称(如: PCS有功功率)
  device_type:       # 设备类型(PCS/BMS/METER/INVERTER/CHARGER/DIESEL/FIRE/HVAC)
  device_id:         # 设备编号(如: PCS01, METER01)
  
  # 协议层
  protocol:          # 通信协议(ModbusRTU/ModbusTCP/IEC104/MQTT/OCPP)
  register_address:  # 寄存器地址(Modbus)/信息体地址IOA(IEC104)
  register_count:    # 寄存器数量(Modbus: 16bit为1个寄存器)
  function_code:     # Modbus功能码(01/02/03/04/05/06/15/16)
  
  # 数据层
  data_type:         # 数据类型(int16/uint16/int32/uint32/float32/string/bit)
  byte_order:        # 字节序(大端Big-Endian / 小端Little-Endian)
  scale_factor:      # 缩放因子(原始值×scale = 工程值)
  unit:              # 单位(kW, V, A, °C, %, kWh...)
  
  # 工程层
  range_min:         # 工程值最小值
  range_max:         # 工程值最大值
  precision:         # 显示精度(小数位数, 如: 1=±0.1kW)
  deadband:          # 死区(变化小于此值不上报)
  
  # 属性层
  rw:                # 读写属性(RO=只读, RW=读写, WO=只写)
  category:          # 分类(遥测YC/遥信YX/遥控YK/遥调YT/遥脉YM)
  storage_interval:  # 存储间隔(s), 0=变化存储
  alarm_threshold:   # 报警阈值 {high_high, high, low, low_low}
```

### 1.3 通信速率与响应时间规范

| 协议 | 速率规范 | 响应时间要求 | 超时设置 |
|------|---------|-------------|---------|
| Modbus RTU | 9600/19200/38400 bps, 8E1/8N1 | ≤ 200ms | 500ms |
| Modbus TCP | 100Mbps Ethernet | ≤ 100ms | 500ms |
| IEC 104 | 100Mbps Ethernet, 端口2404 | ≤ 1s(总召唤) | 30s(t1) |
| MQTT | 任意, QoS 1 | ≤ 2s | 60s(keepalive) |
| OCPP 1.6J | WebSocket | ≤ 5s | 30s |
| CAN 2.0B | 250/500kbps | ≤ 50ms | 100ms |

---

## 二、Modbus RTU/TCP点表模板

### 2.1 Modbus功能码使用规范

```
功能码      | 名称               | 数据区域       | 典型用途
───────────┼───────────────────┼──────────────┼──────────────────
01 (0x01)  | Read Coils         | 00001-09999  | 读开关量输出(遥控状态)
02 (0x02)  | Read Discrete Input| 10001-19999  | 读开关量输入(遥信)
03 (0x03)  | Read Holding Reg   | 40001-49999  | 读保持寄存器(遥测/参数)
04 (0x04)  | Read Input Reg     | 30001-39999  | 读输入寄存器(遥测-只读)
05 (0x05)  | Write Single Coil  | 00001-09999  | 写单个线圈(遥控分合)
06 (0x06)  | Write Single Reg   | 40001-49999  | 写单个寄存器(参数设置)
15 (0x0F)  | Write Multi Coils  | 00001-09999  | 写多个线圈
16 (0x10)  | Write Multi Regs   | 40001-49999  | 写多个寄存器(批量参数)
```

### 2.2 Modbus地址分配规范

```
设备       | 设备ID | 从站地址 | Holding Reg | Input Reg  | Coils     | Discrete Input
──────────┼───────┼─────────┼────────────┼───────────┼──────────┼──────────────
PCS1      | PCS01 | 1        | 40001-40199 | 30001-30099 | 00001-00049 | 10001-10049
PCS2      | PCS02 | 2        | 同上映射   | 同上映射   | 同上映射   | 同上映射
BMS1      | BMS01 | 10       | 41001-41399 | 31001-31399 | 01001-01099 | 11001-11099
METER1    | MET01 | 20       | 42001-42099 | 32001-32099 | 02001-02099 | 12001-12099
INVERTER1 | INV01 | 30       | 43001-43099 | 33001-33099 | 03001-03099 | 13001-13099
CHARGER1  | CHG01 | 40       | 44001-44099 | 34001-34099 | 04001-04099 | 14001-14099
DIESEL1   | DIE01 | 50       | 45001-45099 | 35001-35099 | 05001-05099 | 15001-15099
FIRE1     | FIR01 | 60       | 46001-46049 | 36001-36049 | 06001-06049 | 16001-16049
HVAC1     | HVC01 | 70       | 47001-47049 | 37001-37049 | 07001-07049 | 17001-17049

从站地址分配规则:
  - PCS类:    1-9
  - BMS类:    10-19
  - 电表类:   20-29
  - 逆变器类: 30-39
  - 充电桩类: 40-49
  - 柴发类:   50-59
  - 消防类:   60-69
  - 温控类:   70-79
  - 环境类:   80-89
  - 预留:     90-247
```

### 2.3 Modbus RTU总线规范

```
RS485总线规范(强制):
  ├── 拓扑: 手拉手(Daisy Chain), 禁止星型/树型分支
  ├── 终端电阻: 首末两端各120Ω, 0.25W
  ├── 偏置电阻: 主站端A上拉+B下拉 (各680Ω), 确保空闲时AB>200mV
  ├── 总长度限制: ≤ 1200m @ 9600bps
  ├── 支线长度(stub): ≤ 0.3m
  ├── 电缆: 双绞屏蔽线 RVVSP 2×2×1.0mm²
  ├── 屏蔽层: 单点接地(主站端), 不能环路
  ├── A/B线: A=正(+), B=负(-), 需要标注
  ├── 共模电压: -7V ~ +12V (RS485标准)
  └── 设备数量: ≤ 32台/总线 (无中继), ≤ 247台/总线 (有中继)
```

---

## 三、IEC 60870-5-104点表模板

### 3.1 IEC104协议参数配置

```yaml
iec104_config:
  # 链路层
  ip_address: "192.168.1.100"     # EMS/RTU IP
  port: 2404                      # 标准端口
  max_connections: 2              # 通常1主1备
  link_address: 0                 # 链路地址(通常0)
  
  # 应用层
  common_address: 1               # 公共地址(站地址, CASDU)
  cause_of_transmission_length: 2 # 传送原因长度(2字节)
  common_address_length: 2        # 公共地址长度(2字节)
  info_object_address_length: 3   # 信息体地址长度(3字节)
  
  # 时间参数
  t0: 30                          # 连接建立超时(s)
  t1: 15                          # I帧确认超时(s)
  t2: 10                          # I帧确认最大间隔(s)
  t3: 20                          # 空闲发送测试帧间隔(s)
  
  # 参数
  k: 12                           # 最大未确认I帧数(发送)
  w: 8                            # 最大未确认I帧数(接收)
```

### 3.2 IEC104 ASDU类型与映射

```
ASDU类型  | 名称                     | 信息体 | COT  | 典型映射设备数据
──────────┼─────────────────────────┼───────┼──────┼──────────────────────
1         | 单点信息(遥信)           | SIQ   | 1,3,5,20 | 断路器状态, 开关状态
3         | 双点信息(遥信)           | DIQ   | 1,3,5,20 | 断路器双位置(分/合/故障)
9         | 测量值_归一化值          | NVA   | 1,3,5   | 比例类测量值
11        | 测量值_标度化值          | SVA   | 1,3,5   | 电流/电压/功率
13        | 测量值_短浮点数          | IEEE754 | 1,3,5 | 精确测量值(SOC/SOH/温度)
15        | 累计量                   | IT    | 1,3,5   | 电能累计(kWh)
30        | 带时标单点信息          | CP56Time2a | 1,3,5,20 | SOE事件
31        | 带时标双点信息          | CP56Time2a | 1,3,5,20 | 带时标保护动作
45        | 单点命令(遥控)           | SCO   | 6(激活)  | 断路器遥控分/合
46        | 双点命令(遥控)           | DCO   | 6(激活)  | 双位置遥控
50        | 设点命令_标度化值(遥调)  | QOS   | 6(激活)  | 有功/无功设定
100       | 总召唤命令               | QOI   | 6,7      | 初始化总召唤
103       | 时钟同步命令             | CP56Time2a | 6 | GPS对时
```

### 3.3 IEC104信息对象地址(IOA)分配规范

```
IOA地址分区(2字节, 0-65535):
  ┌─────────────────────────────────────┐
  │ IOA 1-999:     系统信息(装置状态)    │
  │ IOA 1000-1999: 遥信(YX)              │
  │ IOA 2000-2999: 遥测(YC)              │
  │ IOA 3000-3999: 遥控(YK)              │
  │ IOA 4000-4999: 遥调(YT)              │
  │ IOA 5000-5999: 遥脉(YM) 累计量       │
  │ IOA 6000-6999: 保护事件(SOE)         │
  │ IOA 7000-7999: 定值区                │
  │ IOA 8000-8999: 预留                  │
  └─────────────────────────────────────┘

设备子分区(遥测YC_2000-2999):
  IOA 2001-2099: PCS1 遥测
  IOA 2101-2199: PCS2 遥测
  IOA 2201-2299: BMS1 遥测
  IOA 2301-2399: 进线电表 遥测
  IOA 2401-2499: 光伏逆变器1 遥测
  IOA 2501-2599: 充电桩1 遥测
  IOA 2601-2699: 柴油发电机1 遥测
```

### 3.4 IEC104点表模板

```
点表示例:

序号 | 描述          | IOA  | ASDU | COT | 类型   | 单位 | 死区 | 备注
────┼──────────────┼─────┼─────┼────┼───────┼────┼────┼──────
1   | PCS1有功功率  | 2001 | 13   | 1,3 | float | kW  | 1.0 | 总召唤+变化
2   | PCS1无功功率  | 2002 | 13   | 1,3 | float | kvar| 1.0 |
3   | PCS1电流A相   | 2003 | 11   | 1,3 | int16 | A   | 0.5 |
4   | PCS1运行状态   | 1001 | 3    | 1,3,5 | DIQ | -   | -   | 0=停机,1=充电,2=放电
5   | PCS1启停命令   | 3001 | 45   | 6    | SCO | -   | -   | 0=停机,1=启动
6   | PCS1有功设定   | 4001 | 50   | 6    | SVA | kW  | -   | -1000~1000
7   | 电网频率       | 2003 | 13   | 1,3 | float | Hz  | 0.02|
8   | PCC断路器分位   | 1002 | 1    | 1,3,5 | SIQ | -   | -   | 0=合,1=分
...
```

---

## 四、MQTT点表与Topic规范

### 4.1 MQTT Topic命名规范

```
Topic结构:
  {site_id}/{device_type}/{device_id}/{point_category}/{point_name}

分层设计:
  site_id:          站标识, 如 "station-shanghai-001"
  device_type:      设备类型, 如 "pcs" "bms" "meter" "inverter"
  device_id:        设备编号, 如 "pcs01" "bms01"
  point_category:   数据类型:
                     "status"  - 设备状态/遥信
                     "measure" - 遥测数据(定期上报)
                     "alarm"   - 告警事件
                     "command" - 控制指令
                     "param"   - 参数设置
                     "event"   - SOE事件
  point_name:       点名称(小写, 下划线), 如 "active_power"

完整Topic示例:
  station-shanghai-001/pcs/pcs01/measure/active_power
  station-shanghai-001/bms/bms01/status/soc
  station-shanghai-001/meter/meter01/measure/energy_total
  station-shanghai-001/pcs/pcs01/command/start_stop
  station-shanghai-001/fire/fire01/alarm/smoke_detected

订阅主题(EMS侧):
  +/+/+/measure/#     ← 订阅所有遥测数据
  +/+/+/alarm/#       ← 订阅所有告警
  +/+/+/status/#      ← 订阅所有状态

发布主题(EMS侧):
  +/+/+/command/#     ← EMS向设备发控制指令
  +/+/+/param/#       ← EMS向设备设参数
```

### 4.2 MQTT消息体JSON Schema

```json
{
  "$schema": "http://json-schema.org/draft-07/schema#",
  "title": "MQTT Point Data Message",
  "type": "object",
  "required": ["timestamp", "device", "points"],
  "properties": {
    "timestamp": {
      "type": "integer",
      "description": "Unix毫秒时间戳"
    },
    "device": {
      "type": "object",
      "required": ["type", "id"],
      "properties": {
        "type": { "type": "string", "description": "设备类型" },
        "id": { "type": "string", "description": "设备编号" },
        "name": { "type": "string", "description": "设备名称(可选)" }
      }
    },
    "quality": {
      "type": "string",
      "enum": ["good", "invalid", "suspect", "substituted", "overridden"],
      "description": "数据质量戳"
    },
    "points": {
      "type": "array",
      "items": {
        "type": "object",
        "required": ["name", "value"],
        "properties": {
          "name": { "type": "string" },
          "value": { "type": ["number", "string", "boolean"] },
          "unit": { "type": "string" },
          "ts": { "type": "integer", "description": "采集时间戳(可选)" }
        }
      }
    }
  }
}
```

### 4.3 MQTT点表模板(YAML)

```yaml
mqtt_points:
  pcs:
    - name: active_power
      topic: "{site}/pcs/{id}/measure/active_power"
      type: float
      unit: kW
      update_interval_s: 1
      qos: 1
    - name: reactive_power
      topic: "{site}/pcs/{id}/measure/reactive_power"
      type: float
      unit: kvar
      update_interval_s: 5
      qos: 1
    - name: voltage_a
      topic: "{site}/pcs/{id}/measure/voltage_a"
      type: float
      unit: V
      update_interval_s: 1
      qos: 1
    - name: current_a
      topic: "{site}/pcs/{id}/measure/current_a"
      type: float
      unit: A
      update_interval_s: 1
      qos: 1
    - name: run_status
      topic: "{site}/pcs/{id}/status/run_status"
      type: int
      enum: { 0: "stopped", 1: "charging", 2: "discharging", 3: "standby", 4: "fault" }
      qos: 0
    - name: fault_code
      topic: "{site}/pcs/{id}/alarm/fault_code"
      type: uint16
      qos: 1

  bms:
    - name: soc
      topic: "{site}/bms/{id}/status/soc"
      type: float
      unit: "%"
      update_interval_s: 2
      qos: 1
    - name: soh
      topic: "{site}/bms/{id}/status/soh"
      type: float
      unit: "%"
      update_interval_s: 60
      qos: 1
    - name: cluster_voltage
      topic: "{site}/bms/{id}/measure/cluster_voltage"
      type: float
      unit: V
      update_interval_s: 1
      qos: 1
    - name: max_cell_temp
      topic: "{site}/bms/{id}/measure/max_cell_temp"
      type: float
      unit: "°C"
      update_interval_s: 2
      qos: 1
    - name: insulation_resistance
      topic: "{site}/bms/{id}/measure/insulation_resistance"
      type: float
      unit: "kΩ"
      update_interval_s: 10
      qos: 1
```

---

## 五、OCPP 1.6J充电桩点表

### 5.1 OCPP 1.6J核心消息映射

```
OCPP消息               | 方向          | 用途           | EMS映射
──────────────────────┼──────────────┼──────────────┼────────────────
BootNotification      | CP → CSMS    | 充电桩上线注册  | 记录上线状态
Heartbeat             | CP → CSMS    | 心跳 30s       | 在线监测
StatusNotification    | CP → CSMS    | 状态变化上报   | 充电桩状态(可用/充电/故障...)
Authorize             | CP → CSMS    | 刷卡授权请求   | 用户认证
StartTransaction      | CP → CSMS    | 开始充电交易   | 充电启动记录
StopTransaction       | CP → CSMS    | 停止充电交易   | 充电结束+电量
MeterValues           | CP → CSMS    | 计量值上报     | 实时功率/电能/电压
StartTransaction.conf | CSMS → CP    | 授权充电       | 远程允许启动
StopTransaction.conf  | CSMS → CP    | 确认停止       | 远程停止确认
RemoteStopTransaction | CSMS → CP    | 远程停止       | 紧急停止
ChangeConfiguration   | CSMS → CP    | 修改配置       | 远程参数设置
DataTransfer          | CSMS ⇄ CP    | 自定义数据     | 扩展用
```

### 5.2 OCPP数据点与EMS点表映射

```
EMS点                       | OCPP来源                     | 更新方式
───────────────────────────┼─────────────────────────────┼─────────
充电桩在线状态              | Heartbeat (30s)              | 周期性
充电桩连接器状态            | StatusNotification           | 事件触发
当前充电功率(kW)            | MeterValues (Power.Active.Import) | 周期性(10s)
累计充电电能(kWh)           | StopTransaction.meterStop    | 充电结束
当前电压(V)                 | MeterValues (Voltage)        | 周期性
当前电流(A)                 | MeterValues (Current.Import) | 周期性
当前SOC(如BMS联动)          | DataTransfer (custom)        | 周期性
充电授权结果                | Authorize.conf              | 事件触发
充电桩温度(°C)             | DataTransfer (custom)        | 周期性
急停按钮状态                | StatusNotification (Faulted) | 事件触发

MeterValues采样配置(标准):
  - SampleInterval: 10秒
  - 采样量: Voltage, Current.Import, Power.Active.Import, Energy.Active.Import.Register
  - 格式: Raw 或 SignedData
```

### 5.3 OCPP-Modbus双协议协同

```
充电桩一般同时具备:
  1. OCPP: 与充电运营管理平台(CSMS)通信
  2. Modbus TCP: 与本地EMS通信(监控+功率控制)

Modbus补充点(OCPP不覆盖):
  - 充电桩内部温度(多点)
  - 接触器状态
  - 风扇状态
  - 门禁状态
  - 紧急停止回路状态
  - 远程功率限制指令(EMS→充电桩)
```

---

## 六、设备点表映射矩阵

### 6.1 设备-协议-点数映射

```
设备类型     | 协议            | 遥测YC | 遥信YX | 遥控YK | 遥调YT | 遥脉YM | 总计
────────────┼────────────────┼───────┼───────┼───────┼───────┼───────┼──────
PCS         | Modbus+MQTT    | 35    | 20    | 5     | 5     | 3     | 68
BMS(单簇)   | Modbus+CAN     | 45    | 25    | 3     | 3     | 2     | 78
BMS(系统级) | Modbus+MQTT    | 20    | 15    | 2     | 2     | 0     | 39
多功能电表  | Modbus         | 30    | 5     | 0     | 0     | 10    | 45
关口表     | Modbus+IEC104  | 35    | 5     | 0     | 0     | 10    | 50
光伏逆变器  | Modbus         | 25    | 15    | 3     | 2     | 5     | 50
充电桩     | OCPP+Modbus    | 20    | 15    | 3     | 1     | 5     | 44
柴油发电机  | Modbus         | 20    | 15    | 3     | 2     | 3     | 43
消防主机   | Modbus+Dry     | 5     | 20    | 2     | 0     | 0     | 27
液冷机组   | Modbus         | 10    | 10    | 3     | 2     | 0     | 25
环境监测   | Modbus         | 8     | 5     | 0     | 0     | 0     | 13
变压器温控  | Modbus         | 5     | 8     | 1     | 1     | 0     | 15
UPS        | Modbus         | 10    | 8     | 1     | 0     | 0     | 19
```

---

## 七、PCS点表示例(全点)

### 7.1 PCS遥测点(YC) Modbus

```
序号 | 点名             | 地址      | 类型   | 单位 | 缩放 | 说明
────┼─────────────────┼─────────┼───────┼────┼────┼──────────────
1   | 交流有功功率      | 30001    | int32  | kW  | ×0.001 | 正=放电,负=充电
2   | 交流无功功率      | 30003    | int32  | kvar| ×0.001 | 
3   | 交流视在功率      | 30005    | int32  | kVA | ×0.001 |
4   | 功率因数          | 30007    | int16  | -   | ×0.001 | -1.000~1.000
5   | 电网频率          | 30008    | uint16 | Hz  | ×0.01  | 4500=45.00Hz
6   | A相电压          | 30009    | uint16 | V   | ×0.1   | 2300=230.0V
7   | B相电压          | 30010    | uint16 | V   | ×0.1   |
8   | C相电压          | 30011    | uint16 | V   | ×0.1   |
9   | AB线电压          | 30012    | uint16 | V   | ×0.1   |
10  | BC线电压          | 30013    | uint16 | V   | ×0.1   |
11  | CA线电压          | 30014    | uint16 | V   | ×0.1   |
12  | A相电流          | 30015    | uint16 | A   | ×0.1   |
13  | B相电流          | 30016    | uint16 | A   | ×0.1   |
14  | C相电流          | 30017    | uint16 | A   | ×0.1   |
15  | 直流侧电压        | 30018    | uint16 | V   | ×0.1   | 实际直流母线电压
16  | 直流侧电流        | 30019    | int16  | A   | ×0.1   | 正=放电,负=充电
17  | 直流侧功率        | 30020    | int32  | kW  | ×0.001 | 正=放电,负=充电
18  | IGBT温度A相      | 30022    | int16  | °C  | ×0.1   |
19  | IGBT温度B相      | 30023    | int16  | °C  | ×0.1   |
20  | IGBT温度C相      | 30024    | int16  | °C  | ×0.1   |
21  | 变压器温度        | 30025    | int16  | °C  | ×0.1   | 如有隔离变压器
22  | 机内环境温度      | 30026    | int16  | °C  | ×0.1   |
23  | 当日充电电量      | 30027    | uint32 | kWh | ×0.1   |
24  | 当日放电电量      | 30029    | uint32 | kWh | ×0.1   |
25  | 累计充电电量      | 30031    | uint32 | kWh | ×1     | 不可清零
26  | 累计放电电量      | 30033    | uint32 | kWh | ×1     | 不可清零
27  | 运行累计时间      | 30035    | uint32 | h   | ×1     |
28  | 交流侧有功设定值  | 30037    | int16  | kW  | ×0.001 | 当前有功指令
29  | 交流侧无功设定值  | 30038    | int16  | kvar| ×0.001 |
30  | PCS效率         | 30039    | uint16 | %   | ×0.1   |
31  | 直流绝缘电阻+    | 30040    | uint32 | kΩ  | ×1     | 正极对地(如有)
32  | 直流绝缘电阻-    | 30042    | uint32 | kΩ  | ×1     | 负极对地(如有)
33  | 交流侧THDu       | 30044    | uint16 | %   | ×0.1   | 电压总谐波畸变率
34  | 交流侧THDi       | 30045    | uint16 | %   | ×0.1   | 电流总谐波畸变率
35  | 直流侧纹波电压    | 30046    | uint16 | V   | ×0.1   |
```

### 7.2 PCS遥信点(YX) Modbus

```
序号 | 点名             | 地址      | 类型 | 说明
────┼─────────────────┼─────────┼────┼──────────────────────
1   | 运行状态         | 10001    | bit | 复合: [bit0=运行,bit1=充电,bit2=放电,bit3=待机,bit5=故障]
    |                 |         |     | 或枚举: 0=停机,1=充电,2=放电,3=待机,4=故障
2   | 交流断路器状态    | 10002    | bit | 0=分闸,1=合闸
3   | 直流断路器状态    | 10003    | bit | 0=分闸,1=合闸
4   | 直流接触器状态    | 10004    | bit | 0=断开,1=闭合
5   | 并网模式         | 10005    | bit | 0=离网,1=并网
6   | 远程/就地        | 10006    | bit | 0=就地,1=远程
7   | 综合报警         | 10007    | bit | 0=正常,1=报警
8   | 综合故障         | 10008    | bit | 0=正常,1=故障
9   | 电网电压异常     | 10009    | bit |
10  | 电网频率异常     | 10010    | bit |
11  | IGBT过温报警     | 10011    | bit |
12  | IGBT过流报警     | 10012    | bit |
13  | 直流过压报警     | 10013    | bit |
14  | 直流欠压报警     | 10014    | bit |
15  | 绝缘故障报警     | 10015    | bit |
16  | 风扇故障         | 10016    | bit |
17  | 通信故障         | 10017    | bit |
18  | ESD急停状态      | 10018    | bit | 0=正常,1=急停
19  | 防孤岛保护动作   | 10019    | bit |
20  | 交流侧主回路就绪  | 10020    | bit |
```

### 7.3 PCS遥控/遥调点(YK/YT) Modbus

```
序号 | 点名             | 地址      | 类型   | 说明
────┼─────────────────┼─────────┼───────┼────────────────
1   | 启停控制         | 00001    | coil   | 0=停机, 1=启动
2   | 紧急停机         | 00002    | coil   | 0=正常, 1=急停(保持)
3   | 故障复位         | 00003    | coil   | 脉冲: 0→1→0
4   | 并网/离网模式切换 | 00004    | coil   | 0=离网, 1=并网
5   | 交流断路器遥控    | 00005    | coil   | 0=分闸, 1=合闸
───────────────┼─────────┼───────┼────────────────
6   | 有功功率设定     | 40001    | int16  | 范围: -Pmax~+Pmax (kW)
7   | 无功功率设定     | 40002    | int16  | 范围: -Qmax~+Qmax (kvar)
8   | 功率因数设定     | 40003    | uint16 | 范围: -1000~1000 (-1.000~1.000)
9   | 充电最大功率限值  | 40004    | uint16 | kW (充电方向)
10  | 放电最大功率限值  | 40005    | uint16 | kW (放电方向)
```

---

## 八、BMS点表示例(全点)

### 8.1 BMS系统级遥测点(BCMU/BAMU汇总)

```
序号 | 点名                 | 地址      | 类型   | 单位  | 缩放   | 说明
────┼─────────────────────┼─────────┼───────┼─────┼───────┼──────────────
1   | 系统SOC              | 31001    | uint16 | %    | ×0.1  | 500=50.0%
2   | 系统SOH              | 31002    | uint16 | %    | ×0.1  | 990=99.0%
3   | 系统总电压           | 31003    | uint16 | V    | ×0.1  | 13312=1331.2V
4   | 系统总电流           | 31004    | int16  | A    | ×0.1  | 正=充电,负=放电
5   | 系统总功率           | 31005    | int32  | kW   | ×0.001|
6   | 可充电功率(当前)     | 31007    | uint16 | kW   | ×0.1  | BMS允许充电功率
7   | 可放电功率(当前)     | 31008    | uint16 | kW   | ×0.1  | BMS允许放电功率
8   | 最高单体电压         | 31009    | uint16 | mV   | ×1    | 3400=3.400V
9   | 最高单体电压位置     | 31010    | uint16 | -    | ×1    | (簇号<<8)+电芯号
10  | 最低单体电压         | 31011    | uint16 | mV   | ×1    |
11  | 最低单体电压位置     | 31012    | uint16 | -    | ×1    |
12  | 最高电芯温度         | 31013    | int16  | °C   | ×0.1  |
13  | 最高电芯温度位置     | 31014    | uint16 | -    | ×1    |
14  | 最低电芯温度         | 31015    | int16  | °C   | ×0.1  |
15  | 最低电芯温度位置     | 31016    | uint16 | -    | ×1    |
16  | 系统绝缘电阻(+)      | 31017    | uint32 | kΩ   | ×1    |
17  | 系统绝缘电阻(-)      | 31019    | uint32 | kΩ   | ×1    |
18  | SOC最大允许         | 31021    | uint16 | %    | ×0.1  | 通常95%
19  | SOC最小允许         | 31022    | uint16 | %    | ×0.1  | 通常5-10%
20  | 系统运行状态         | 31023    | uint16 | -    | ×1    | 0=待机,1=充电,2=放电,3=均衡,4=故障
```

### 8.2 BMS簇级遥测点(BCMU, 每簇一份)

```
序号 | 点名                | 地址偏移 | 类型   | 单位  | 说明
────┼────────────────────┼────────┼───────┼─────┼───────────────
1   | 簇N总电压           | +0      | uint16 | V   | 单簇电压(×0.1)
2   | 簇N电流             | +1      | int16  | A   | 单簇电流(×0.1)
3   | 簇N SOC             | +2      | uint16 | %   | 单簇SOC(×0.1)
4   | 簇N SOH             | +3      | uint16 | %   | 单簇SOH(×0.1)
5   | 簇N最高单体电压     | +4      | uint16 | mV  |
6   | 簇N最低单体电压     | +5      | uint16 | mV  |
7   | 簇N平均单体电压     | +6      | uint16 | mV  |
8   | 簇N压差             | +7      | uint16 | mV  | 最高-最低
9   | 簇N最高温度         | +8      | int16  | °C  |
10  | 簇N最低温度         | +9      | int16  | °C  |
11  | 簇N平均温度         | +10     | int16  | °C  |
12  | 簇N温差             | +11     | uint16 | °C  | 最高-最低(×0.1)
13  | 簇N主正接触器状态   | +12     | bit   | -   | bit0=KM+,bit1=KM-
14  | 簇N预充接触器状态   | +13     | bit   | -   |
15  | 簇N绝缘电阻(+)      | +14     | uint32 | kΩ  |
16  | 簇N绝缘电阻(-)      | +16     | uint32 | kΩ  |
17  | 簇N充电累计Ah       | +18     | uint32 | Ah  |
18  | 簇N放电累计Ah       | +20     | uint32 | Ah  |
19  | 簇N均衡状态         | +22     | uint16 | -   | 0=未均衡,1=均衡中
20  | 簇N可充电功率       | +23     | uint16 | kW  |
21  | 簇N可放电功率       | +24     | uint16 | kW  |
22  | 簇N故障码           | +25     | uint16 | -   | bit编码

基地址: 簇1=31100, 簇2=31130, 簇3=31160 ... (每簇30个寄存器)
```

### 8.3 BMS遥信/报警点

```
序号 | 点名                 | 地址      | 类型 | 说明
────┼─────────────────────┼─────────┼────┼──────────────────────
1   | BMS运行状态          | 11001    | bit | 0=待机,1=运行,2=故障
2   | 充电允许             | 11002    | bit | 0=禁止充电,1=允许充电
3   | 放电允许             | 11003    | bit | 0=禁止放电,1=允许放电
4   | 主正接触器状态       | 11004    | bit |
5   | 主负接触器状态       | 11005    | bit |
6   | SOC过高报警          | 11006    | bit |
7   | SOC过低报警          | 11007    | bit |
8   | 总电压过高报警       | 11008    | bit |
9   | 总电压过低报警       | 11009    | bit |
10  | 充电过流报警         | 11010    | bit |
11  | 放电过流报警         | 11011    | bit |
12  | 单体过压报警         | 11012    | bit |
13  | 单体欠压报警         | 11013    | bit |
14  | 温度过高报警         | 11014    | bit |
15  | 温度过低报警         | 11015    | bit |
16  | 压差过大报警         | 11016    | bit |
17  | 温差过大报警         | 11017    | bit |
18  | 绝缘故障报警         | 11018    | bit | 正极或负极对地绝缘过低
19  | 通信故障             | 11019    | bit | 与BMU/EMS通信异常
20  | 预充失败             | 11020    | bit |
21  | 一级故障(降额)       | 11021    | bit |
22  | 二级故障(停机)       | 11022    | bit |
23  | 三级故障(急停)       | 11023    | bit |
24  | 消防联动急停         | 11024    | bit | FSS触发(硬接线)
25  | 熔断器状态           | 11025    | bit | 0=正常,1=熔断
```

---

## 九、多功能电表/关口表点表

### 9.1 多功能电表遥测点(Modbus)

```
序号 | 点名               | 地址      | 类型   | 单位  | 缩放   | 说明
────┼───────────────────┼─────────┼───────┼─────┼───────┼──────────────
1   | A相电压           | 32001    | uint16 | V    | ×0.1  |
2   | B相电压           | 32002    | uint16 | V    | ×0.1  |
3   | C相电压           | 32003    | uint16 | V    | ×0.1  |
4   | AB线电压           | 32004    | uint16 | V    | ×0.1  |
5   | BC线电压           | 32005    | uint16 | V    | ×0.1  |
6   | CA线电压           | 32006    | uint16 | V    | ×0.1  |
7   | A相电流           | 32007    | uint16 | A    | ×0.01 | 二次侧×变比=一次
8   | B相电流           | 32008    | uint16 | A    | ×0.01 |
9   | C相电流           | 32009    | uint16 | A    | ×0.01 |
10  | 三相总有功功率     | 32010    | int32  | kW   | ×0.001| 正=正向(购电),负=反向(售电)
11  | A相有功功率       | 32012    | int32  | kW   | ×0.001|
12  | B相有功功率       | 32014    | int32  | kW   | ×0.001|
13  | C相有功功率       | 32016    | int32  | kW   | ×0.001|
14  | 三相总无功功率     | 32018    | int32  | kvar | ×0.001|
15  | 三相总视在功率     | 32020    | int32  | kVA  | ×0.001|
16  | 三相总功率因数     | 32022    | int16  | -    | ×0.001|
17  | 电网频率           | 32023    | uint16 | Hz   | ×0.01 |
18  | 正向有功总电能     | 32024    | uint32 | kWh  | ×0.01 | 购电
19  | 反向有功总电能     | 32026    | uint32 | kWh  | ×0.01 | 售电/反送
20  | 正向无功总电能     | 32028    | uint32 | kvarh| ×0.01 |
21  | 反向无功总电能     | 32030    | uint32 | kvarh| ×0.01 |
22  | 正向有功(峰)       | 32032    | uint32 | kWh  | ×0.01 |
23  | 正向有功(平)       | 32034    | uint32 | kWh  | ×0.01 |
24  | 正向有功(谷)       | 32036    | uint32 | kWh  | ×0.01 |
25  | A相电压THD        | 32038    | uint16 | %    | ×0.1  |
26  | B相电压THD        | 32039    | uint16 | %    | ×0.1  |
27  | C相电压THD        | 32040    | uint16 | %    | ×0.1  |
28  | A相电流THD        | 32041    | uint16 | %    | ×0.1  |
29  | 需量(当前)         | 32042    | uint32 | kW   | ×0.001| 滑动需量
30  | 需量(上月最大值)   | 32044    | uint32 | kW   | ×0.001|
```

### 9.2 电表遥信点

```
序号 | 点名               | 地址      | 类型 | 说明
────┼───────────────────┼─────────┼────┼──────────────
1   | A相失压            | 12001    | bit |
2   | B相失压            | 12002    | bit |
3   | C相失压            | 12003    | bit |
4   | A相断流            | 12004    | bit |
5   | 逆相序             | 12005    | bit | 电压相序错误
```

---

## 十、光伏逆变器点表

### 10.1 光伏逆变器遥测点

```
序号 | 点名               | 地址      | 类型   | 单位 | 缩放   | 说明
────┼───────────────────┼─────────┼───────┼────┼───────┼──────────────
1   | 直流输入电压PV1    | 33001    | uint16 | V   | ×0.1  |
2   | 直流输入电流PV1    | 33002    | uint16 | A   | ×0.01 |
3   | 直流输入功率PV1    | 33003    | uint32 | kW  | ×0.001|
4   | 直流输入电压PV2    | 33005    | uint16 | V   | ×0.1  | 如多路MPPT
5   | 直流输入电流PV2    | 33006    | uint16 | A   | ×0.01 |
... (多路MPPT同理)
16  | 交流输出有功功率   | 33025    | int32  | kW  | ×0.001|
17  | 交流输出无功功率   | 33027    | int32  | kvar| ×0.001|
18  | 交流A相电压        | 33029    | uint16 | V   | ×0.1  |
19  | 交流A相电流        | 33030    | uint16 | A   | ×0.01 |
... (B/C相同理)
25  | 今日发电量         | 33040    | uint32 | kWh | ×0.1  |
26  | 累计发电量         | 33042    | uint32 | kWh | ×1    |
27  | 逆变器效率         | 33044    | uint16 | %   | ×0.1  |
28  | 逆变器内部温度     | 33045    | int16  | °C  | ×0.1  |

逆变器遥信点:
  1. 运行状态(待机/并网/故障)
  2. 电网故障(过/欠压, 过/欠频)
  3. 直流过压
  4. 绝缘阻抗低
  5. 防孤岛保护动作
  6. 通信故障
  7. 风扇故障
```

---

## 十一、充电桩点表(Modbus+OCPP双协议)

### 11.1 充电桩Modbus遥测点

```
序号 | 点名               | 地址      | 类型   | 单位 | 说明
────┼───────────────────┼─────────┼───────┼────┼──────────────
1   | 充电桩状态         | 34001    | uint16 | -   | 0=离线,1=空闲,2=充电中,3=充满,4=故障,5=预约
2   | 充电枪连接状态     | 34002    | bit   | -   | 0=未连接,1=已连接
3   | 当前输出电压       | 34003    | uint16 | V   | ×0.1
4   | 当前输出电流       | 34004    | uint16 | A   | ×0.1
5   | 当前输出功率       | 34005    | uint16 | kW  | ×0.1
6   | 本次充电电能       | 34006    | uint32 | kWh | ×0.01
7   | 累计充电电能       | 34008    | uint32 | kWh | ×1
8   | 模块1温度          | 34010    | int16  | °C  |
9   | 模块2温度          | 34011    | int16  | °C  |
10  | 车辆需求电压       | 34012    | uint16 | V   | BMS报文(BMS→桩)
11  | 车辆需求电流       | 34013    | uint16 | A   | BMS报文
12  | 车辆电池SOC        | 34014    | uint16 | %   | BMS报文(如有)
13  | 充电桩输入电压     | 34015    | uint16 | V   | 交流输入侧
14  | 充电桩输入电流     | 34016    | uint16 | A   |
15  | 门禁状态           | 34017    | bit   | -   | 0=关闭,1=开启
16  | 急停按钮状态       | 34018    | bit   | -   | 0=正常,1=急停

充电桩遥控点:
  1. 远程启停 (00041: 0=停止, 1=启动)
  2. 远程功率限制 (40041: kW, 0=不限制)
  3. 故障复位 (00042: 脉冲)
```

---

## 十二、柴油发电机点表

### 12.1 柴油发电机遥测点

```
序号 | 点名               | 地址      | 类型   | 单位 | 说明
────┼───────────────────┼─────────┼───────┼────┼──────────────
1   | 发电机状态         | 35001    | uint16 | -   | 0=停机,1=怠速,2=额定运行,3=冷却,4=故障
2   | 输出电压A相        | 35002    | uint16 | V   | ×0.1
3   | 输出电压B相        | 35003    | uint16 | V   |
4   | 输出电压C相        | 35004    | uint16 | V   |
5   | 输出电流A相        | 35005    | uint16 | A   | ×0.1
6   | 输出电流B相        | 35006    | uint16 | A   |
7   | 输出电流C相        | 35007    | uint16 | A   |
8   | 输出有功功率       | 35008    | uint16 | kW  | ×0.1
9   | 输出功率因数       | 35009    | int16  | -   | ×0.001
10  | 输出频率           | 35010    | uint16 | Hz  | ×0.01
11  | 发动机转速         | 35011    | uint16 | rpm | ×1
12  | 机油压力           | 35012    | uint16 | kPa | ×1
13  | 冷却液温度         | 35013    | int16  | °C  | ×0.1
14  | 燃油液位           | 35014    | uint16 | %   | ×0.1
15  | 电池电压           | 35015    | uint16 | V   | ×0.1  启动电池
16  | 累计运行时间       | 35016    | uint32 | h   | ×0.1
17  | 累计发电量         | 35018    | uint32 | kWh | ×1
18  | 负载率             | 35020    | uint16 | %   | ×0.1

柴发遥控点:
  1. 远程启停 (00051: 0=停止, 1=启动)
  2. 远程模式切换 (00052: 0=自动, 1=手动)
  3. 故障复位 (00053: 脉冲)

柴发遥信点:
  1. 运行/停机
  2. 自动/手动模式
  3. 综合报警/故障
  4. 机油压力低
  5. 冷却液温度高
  6. 燃油液位低
  7. 超速/欠速
  8. 过载
  9. 启动失败
  10. 电池电压低
```

---

## 十三、辅助系统点表(消防/温控/环境)

### 13.1 消防主机点表

```
序号 | 点名               | 地址      | 类型   | 说明
────┼───────────────────┼─────────┼───────┼──────────────
    | 遥测:              |         |       |
1   | 烟感浓度_区域1     | 36001    | uint16 | % 或 数值(×1)
2   | 温度_区域1         | 36002    | int16  | °C (×0.1)
3   | CO浓度             | 36003    | uint16 | ppm (×1)
4   | H2浓度             | 36004    | uint16 | ppm (×1)
    |                    |         |       |
    | 遥信:              |         |       |
1   | 消防系统状态       | 16001    | bit   | 0=正常,1=报警
2   | 烟感报警           | 16002    | bit   |
3   | 温感报警           | 16003    | bit   |
4   | 可燃气体报警       | 16004    | bit   |
5   | 消防灭火装置启动   | 16005    | bit   | 消防灭火剂已释放
6   | 消防故障           | 16006    | bit   |
7   | 消防联动输出       | 16007    | bit   | FSS跳闸信号已发出
8   | 手动报警按钮       | 16008    | bit   |
```

### 13.2 液冷机组点表

```
序号 | 点名               | 地址      | 类型   | 单位 | 说明
────┼───────────────────┼─────────┼───────┼────┼──────────────
1   | 运行状态           | 37001    | uint16 | -   | 0=停机,1=制冷,2=制热,3=故障
2   | 出水温度           | 37002    | int16  | °C  | ×0.1
3   | 回水温度           | 37003    | int16  | °C  | ×0.1
4   | 环境温度           | 37004    | int16  | °C  | ×0.1
5   | 水泵运行状态       | 17001    | bit   |
6   | 压缩机运行状态     | 17002    | bit   |
7   | 风机运行状态       | 17003    | bit   |
8   | 水流量低报警       | 17004    | bit   |
9   | 高压/低压报警      | 17005    | bit   |
10  | 通信故障           | 17006    | bit   |
    |                    |         |       |
    | 遥控:               |         |       |
1   | 远程启停           | 00061    | coil  |
2   | 温度设定           | 47001    | uint16| °C  | ×0.1, 目标出水温度
```

### 13.3 环境监测点表

```
序号 | 点名               | 地址      | 类型   | 单位 | 说明
────┼───────────────────┼─────────┼───────┼────┼──────────────
1   | 环境温度_集装箱内   | 38001    | int16  | °C  | ×0.1
2   | 环境湿度_集装箱内   | 38002    | uint16 | %RH | ×0.1
3   | 环境温度_室外      | 38003    | int16  | °C  | ×0.1
4   | 环境湿度_室外      | 38004    | uint16 | %RH | ×0.1
5   | 气压               | 38005    | uint16 | hPa | ×0.1
6   | 门磁状态_集装箱门   | 18001    | bit   | 0=关闭,1=打开
7   | 水浸检测           | 18002    | bit   | 0=正常,1=水浸
8   | 空调运行状态       | 18003    | bit   |
```

---

## 十四、地址分配规则与冲突管理

### 14.1 Modbus寄存器地址空间规划

```
Holding Registers (40001-49999): 读写数据区
  40001-40099:  PCS1 参数+遥控
  40100-40199:  PCS2 参数+遥控 (每个PCS用100个寄存器)
  40200-40299:  PCS3...
  41001-41399:  BMS1 参数
  41400-41799:  BMS2 参数 (每个BMS 400个寄存器)
  42001-42099:  METER1 参数
  43001-43099:  INVERTER1 参数
  44001-44099:  CHARGER1 参数
  45001-45099:  DIESEL1 参数
  46001-46049:  FIRE 消防
  47001-47049:  HVAC 温控

Input Registers (30001-39999): 只读数据区
  30001-30099:  PCS1 遥测
  30100-30199:  PCS2 遥测
  31001-31399:  BMS1 遥测
  31400-31799:  BMS2 遥测
  32001-32099:  METER1 遥测
  33001-33099:  INVERTER1 遥测
  34001-34099:  CHARGER1 遥测
  35001-35099:  DIESEL1 遥测
  36001-36049:  FIRE 遥测
  37001-37049:  HVAC 遥测
  38001-38049:  ENV 环境遥测

Coils (00001-09999): 遥控区
  00001-00049:  PCS1 遥控线圈
  00050-00099:  PCS2 遥控线圈
  01001-01049:  BMS1 遥控线圈
  02001-02049:  METER1 遥控(通常无)
  03001-03049:  INVERTER1 遥控
  04001-04049:  CHARGER1 遥控
  05001-05049:  DIESEL1 遥控
  06001-06049:  FIRE 遥控
  07001-07049:  HVAC 遥控

Discrete Inputs (10001-19999): 遥信区
  10001-10049:  PCS1 遥信
  10050-10099:  PCS2 遥信
  11001-11049:  BMS1 遥信
  12001-12049:  METER1 遥信
  13001-13049:  INVERTER1 遥信
  14001-14049:  CHARGER1 遥信
  15001-15049:  DIESEL1 遥信
  16001-16049:  FIRE 遥信
  17001-17049:  HVAC 遥信
  18001-18049:  ENV 遥信
```

### 14.2 地址冲突检查清单

```
□ 同类型设备地址区间不重叠
□ 同一从站不同功能码区间不重叠
□ 批量读取不超过125个寄存器/帧(Modbus规范限制)
□ 同一寄存器的读写属性明确(RO/RW不冲突)
□ 多字节数据(32bit/float)的寄存器连续性
□ 预留足够扩展空间(每类设备预留≥20%余量)
□ 广播地址(0)不用于数据读写
□ 地址0-9999 避免使用(与一些旧设备冲突)
```

---

## 十五、数据转换与缩放因子规范

### 15.1 数据类型编码规范

```
Modbus寄存器数据类型:

uint16:  1个寄存器, 范围 0-65535
int16:   1个寄存器, 范围 -32768 ~ +32767 (补码)
uint32:  2个寄存器, 范围 0-4294967295 (高字在前/低字在前)
int32:   2个寄存器, 范围 -2147483648 ~ +2147483647 (补码)
float32: 2个寄存器, IEEE 754 单精度浮点 (高字在前/低字在前)
string:  N个寄存器, ASCII编码 (每寄存器2字符, 需字节序)

字节序(Byte Order):
  Big-Endian (ABCD):   高字节在低地址 (Modbus标准, 推荐)
  Little-Endian (DCBA): 低字节在低地址
  Mid-Little (BADC):   字交换小端
  Big-Endian Byte Swap (CDAB): 字节交换大端

⚠️ 不同厂家字节序可能不同, 必须在点表中明确标注!
```

### 15.2 缩放因子标准取值

```
测量类型           | 数据类型 | 缩放因子         | 示例
──────────────────┼────────┼────────────────┼──────────────────
电压(AC)          | uint16 | ×0.1 V          | 2300 → 230.0V
电压(DC)          | uint16 | ×0.1 V          | 13312 → 1331.2V
电流(AC/DC)       | uint16 | ×0.1 A 或 ×0.01 A| 1050 → 105.0A
功率              | int32  | ×0.001 kW       | 630000 → 630.000kW
有功功率          | int32  | ×0.001 kW       |
无功功率          | int32  | ×0.001 kvar     |
视在功率          | int32  | ×0.001 kVA      |
功率因数          | int16  | ×0.001          | 950 → 0.950
频率              | uint16 | ×0.01 Hz        | 5000 → 50.00Hz
能量(kWh)         | uint32 | ×0.1 或 ×1      | 123456 → 12345.6kWh
温度              | int16  | ×0.1 °C         | 350 → 35.0°C
SOC/SOH           | uint16 | ×0.1 %          | 895 → 89.5%
单体电压          | uint16 | ×0.001 V (mV)   | 3400 → 3.400V
绝缘电阻          | uint32 | ×1 kΩ           | 5000 → 5000kΩ
电流(Ah累计)      | uint32 | ×0.1 Ah 或 ×1 Ah|
百分比            | uint16 | ×0.1 %          |
时间(h)           | uint32 | ×0.1 h          |
转速(rpm)         | uint16 | ×1 rpm          |
```

### 15.3 精度与死区设置规范

```
数据类型           | 显示精度(小数位) | 死区建议值  | 存储策略
──────────────────┼───────────────┼──────────┼──────────
电压AC            | 0.1 V         | 0.5 V    | 变化存储
电压DC            | 0.1 V         | 0.5 V    | 变化存储
电流              | 0.1 A         | 0.2 A    | 变化存储
功率              | 0.001 kW      | 0.5 kW   | 变化存储
功率因数          | 0.001         | 0.005    | 变化存储
频率              | 0.01 Hz       | 0.02 Hz  | 变化存储
能量              | 0.1 kWh       | 0.5 kWh  | 变化存储
温度              | 0.1 °C        | 0.5 °C   | 变化存储
SOC               | 0.1 %         | 0.5 %    | 变化存储
绝缘电阻          | 1 kΩ          | 10 kΩ    | 变化存储
遥信(状态位)      | -             | 不设死区  | 变化存储(SOE)
累计量            | 1             | 1        | 15分钟定周期
```

---

## 十六、EMS配置模板(YAML)

### 16.1 完整EMS点表配置模板

```yaml
# EMS点表配置文件: ems_points_config.yaml
# 版本: 1.0
# 站点: station-shanghai-001

site:
  id: "station-shanghai-001"
  name: "上海某工业园区储能电站"
  timezone: "Asia/Shanghai"
  protocols:
    modbus_tcp:
      enabled: true
      host: "0.0.0.0"
      port: 502
      slave_id: 1
      timeout_ms: 500
      retries: 3
    modbus_rtu:
      enabled: false
    iec104:
      enabled: false  # 如需要对接调度
      ip: "192.168.1.200"
      port: 2404
    mqtt:
      enabled: true
      broker: "mqtt://emqx:1883"
      client_id: "ems-station-shanghai-001"
      username: "ems"
      password: "${MQTT_PASSWORD}"
      qos: 1
      keepalive_s: 60

devices:
  pcs:
    - device_id: "pcs01"
      name: "PCS储能变流器1号"
      protocol: "modbus_tcp"
      host: "192.168.1.11"
      port: 502
      slave_id: 1
      poll_interval_ms: 500
      points:
        - id: "active_power"
          name: "有功功率"
          register: 30001
          count: 2
          type: "int32"
          byte_order: "big"
          unit: "kW"
          scale: 0.001
          category: "YC"
          deadband: 0.5
          alarm: { high_high: 630, high: 600, low: -630, low_low: -650 }
        - id: "run_status"
          name: "运行状态"
          register: 10001
          count: 1
          type: "uint16"
          enum_map: { 0: "停机", 1: "充电", 2: "放电", 3: "待机", 4: "故障" }
          category: "YX"
        - id: "start_stop"
          name: "启停控制"
          register: 00001
          type: "coil"
          rw: "RW"
          category: "YK"
        - id: "power_setpoint"
          name: "有功功率设定"
          register: 40001
          count: 1
          type: "int16"
          unit: "kW"
          rw: "RW"
          range: [-630, 630]
          category: "YT"
        # ... 更多点

  bms:
    - device_id: "bms01"
      name: "BMS电池管理系统"
      protocol: "modbus_tcp"
      host: "192.168.1.21"
      port: 502
      slave_id: 10
      poll_interval_ms: 1000
      points:
        - id: "soc"
          name: "系统SOC"
          register: 31001
          count: 1
          type: "uint16"
          unit: "%"
          scale: 0.1
          category: "YC"
          deadband: 0.5
          alarm: { high: 95, low: 15, low_low: 5 }
        # ... 更多点

  meter:
    - device_id: "meter_pcc"
      name: "PCC关口表"
      protocol: "modbus_tcp"
      host: "192.168.1.31"
      port: 502
      slave_id: 20
      poll_interval_ms: 500
      points:
        - id: "total_active_power"
          name: "三相总有功功率"
          register: 32010
          count: 2
          type: "int32"
          unit: "kW"
          scale: 0.001
          category: "YC"
        # ... 更多点

  charger:
    - device_id: "charger01"
      name: "充电桩1号"
      protocol: "ocpp16"
      ocpp:
        charge_point_id: "CP-ST-SH-001"
        websocket_url: "ws://192.168.1.41:8080/steve/websocket/CentralSystemService/CP-ST-SH-001"
      modbus:
        enabled: true
        host: "192.168.1.41"
        port: 502
        slave_id: 40
      points:
        - id: "status"
          name: "充电桩状态"
          source: "ocpp:StatusNotification"
          category: "YX"
        - id: "current_power"
          name: "当前输出功率"
          source: "ocpp:MeterValues.Power.Active.Import"
          unit: "kW"
          category: "YC"
        # ... 更多点

  diesel:
    - device_id: "diesel01"
      name: "柴油发电机1号"
      protocol: "modbus_tcp"
      host: "192.168.1.51"
      port: 502
      slave_id: 50
      poll_interval_ms: 1000
      points:
        # ... 按12节模板

  fire:
    - device_id: "fire01"
      name: "消防主机"
      protocol: "modbus_tcp"
      host: "192.168.1.61"
      port: 502
      slave_id: 60
      poll_interval_ms: 2000
      points:
        # ... 按13.1节模板
```

---

## 十七、点表Excel生成规范

### 17.1 Excel Sheet组织规范

```
点表Excel文件结构:
  Sheet 0: "目录" - 所有Sheet索引与说明
  Sheet 1: "Modbus-PCS" - PCS Modbus点表
  Sheet 2: "Modbus-BMS" - BMS Modbus点表
  Sheet 3: "Modbus-METER" - 电表Modbus点表
  Sheet 4: "Modbus-INVERTER" - 逆变器点表
  Sheet 5: "Modbus-CHARGER" - 充电桩Modbus补充点
  Sheet 6: "Modbus-DIESEL" - 柴发点表
  Sheet 7: "Modbus-AUX" - 消防/温控/环境点表
  Sheet 8: "IEC104" - IEC104调度点表
  Sheet 9: "MQTT" - MQTT云平台点表
  Sheet 10: "OCPP" - OCPP充电桩点表映射
  Sheet 11: "地址分配" - 全站地址分配总表
```

### 17.2 单Sheet列定义

```
Excel列定义(以Modbus Sheet为例):

A: 序号
B: 点ID (唯一标识)
C: 点名(中文)
D: 设备ID
E: 设备从站地址
F: 功能码 (03/04/06/16...)
G: 寄存器起始地址 (十进制)
H: 寄存器数量
I: 数据类型 (uint16/int32/float32...)
J: 字节序 (Big / Little / BADC / CDAB)
K: 缩放因子
L: 单位
M: 工程值范围(最小)
N: 工程值范围(最大)
O: 显示精度(小数位数)
P: 读写属性 (RO/RW/WO)
Q: 分类 (YC/YX/YK/YT/YM)
R: 死区
S: 报警阈值(高高)
T: 报警阈值(高)
U: 报警阈值(低)
V: 报警阈值(低低)
W: 存储间隔(s)
X: 备注
```

---

## 十八、对点调试检查清单

### 18.1 对点前准备清单

```
□ 1.  确认所有设备IP/从站地址与点表一致
□ 2.  确认网络连通性(ping通)
□ 3.  确认Modbus TCP端口502已开放(防火墙)
□ 4.  确认RS485终端电阻/偏置电阻已正确安装
□ 5.  确认各设备通信参数(波特率/数据位/校验)一致
□ 6.  确认点表版本为最新(与设备手册比照)
□ 7.  准备Modbus调试工具(Modbus Poll / modbus-cli)
□ 8.  准备网络抓包工具(Wireshark, 检查通信报文)
□ 9.  确认接地/屏蔽良好(RS485共模电压在范围内)
□ 10. 准备对点记录表(Excel)

对点工具命令示例(Modbus TCP):
  # 读Holding Registers 30001-30020
  modbus read tcp://192.168.1.11:502 30001 20 --slave 1

对点工具命令示例(MQTT):
  # 订阅所有遥测数据
  mosquitto_sub -h emqx -t "station-shanghai-001/+/+/measure/#" -v
```

### 18.2 对点验证要点

```
逐设备验证:
□ 遥测点YC: 与实际测量值对比(用万用表/钳表校准)
□ 遥信点YX: 模拟实际状态变化, 验证信号准确
□ 遥控点YK: 在安全条件下操作, 验证执行正确
□ 遥调点YT: 设定测试值, 验证设备响应
□ 累计量YM: 记录起始值, 运行后验证增量

验证特别关注:
□ 字节序是否正确(常出错!)
□ 有符号/无符号类型是否正确
□ 缩放因子是否正确
□ 死区是否合理(太大会丢失数据, 太小会频繁上报)
□ 超时/重试机制是否有效
□ 通信中断恢复后数据是否自动续传
□ 遥控操作的安全性(是否需二次确认)
```

### 18.3 常见对点问题速查

```
问题                         | 可能原因                         | 排查方向
────────────────────────────┼────────────────────────────────┼──────────────────
读回数据全为0               | 设备未启动/从站地址错/网线断    | 检查设备状态+连接
读回数据乱跳/无规律         | 字节序错误/寄存器地址偏移       | 交换字节序试试
功率读数正负相反            | 方向定义不同/电流CT反向         | 检查CT安装方向
SOC显示异常值(>100或<0)     | 缩放因子错/数据类型错           | 对比设备手册
32位数据高低字错误          | 寄存器顺序(高字在前/低字在前)   | 交换两寄存器位置
浮点数NaN或Inf              | 字节序严重错误                  | 尝试四种字节序
读回数据固定不变             | 死区太大 / 通信中断             | 调整死区/检查连接
遥控/遥调不执行             | 操作密码/使能位/远程模式未置    | 检查设备是否在远程模式
通信时断时续                | RS485干扰/终端电阻/偏置         | 检查终端电阻和屏蔽

字节序排查步骤:
  读一个已知值的寄存器(如额定电压)
  尝试变换字节序排列: AB CD / CD AB / BA DC / DC BA
  与实际值对比, 确定正确排列
```

---

*版本：v1.0*
*适用范围：储能电站/微电网/充电站SCADA/EMS系统集成的通信点表编制与对点调试*
*下次迭代方向：
  1. 从设备说明书PDF自动提取寄存器地址(OCR+NLP)
  2. 点表自动生成工具(输入设备型号→输出点表Excel)
  3. 通信报文自动解析器(抓包→点表→EMS配置)
  4. 不同厂家设备点表的标准化映射库
  5. IEC 61850 GOOSE/SV点表支持*
