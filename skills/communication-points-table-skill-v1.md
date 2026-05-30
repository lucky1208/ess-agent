# 通信点表生成 Skill v1.0

> 设计人：卢继雄 | 基于5年微网项目实战训练

## 概述
根据设备清单自动生成Modbus/IEC104/MQTT/OCPP通信点表Excel + EMS配置文件。

## 输入
- 设备清单 (PCS/BMS/电表/光伏/柴发/充电桩/消防/环境)
- 协议选择 (Modbus RTU/TCP, IEC 104, IEC 61850, OCPP, MQTT)

## 输出
- 每设备点表Excel: 信号名/协议/地址/数据类型/读写/单位/备注
- EMS配置JSON: 设备ID→点号映射
- 调试检查项列表

## 规则

### R1: PCS点表(Modbus TCP)
- 地址范围: 40001-40100 (Holding Register)
- 必含: 有功功率/无功功率/SOC/运行状态/故障代码/充放模式
- 控制字: 功率设定值/充放模式切换

### R2: BMS点表(CAN 2.0B → 网关转Modbus)
- 必含: 总电压/总电流/SOC/SOH/最高单体温度/最低单体温度/绝缘电阻
- 告警: 过温/过压/欠压/绝缘降低/簇间压差大

### R3: 关口表(Modbus RTU)
- 必含: 总有功/总无功/功率因数/频率/A/B/C相电压电流
- 精度: 0.2S级, 双向计量

### R4: 光伏逆变器(Modbus TCP)
- 必含: 直流侧电压/电流/功率, 交流侧有功/无功/频率

### R5: IEC104点表
- 遥测(TI=13): 有功/无功/SOC/光伏功率
- 遥信(TI=1): 并网状态/PCS故障/消防告警
- 遥控(TI=45): 充放模式切换
- 遥调(TI=50): 功率设定

### R6: MQTT主题
- site/{project}/telemetry: 遥测数据(5s)
- site/{project}/events: 遥信事件(SOE)
- site/{project}/cmd/dispatch: 策略下发
- site/{project}/alarm: 告警推送(分级)

### R7: OCPP(充电桩)
- 充电桩状态/充电功率/SOC/充电时长/交易ID

## 验证Checklist
- [ ] 每设备点表非空
- [ ] 地址无冲突
- [ ] IEC104 CA/IOA唯一
- [ ] MQTT主题层次正确
- [ ] 控制字标注读写方向
