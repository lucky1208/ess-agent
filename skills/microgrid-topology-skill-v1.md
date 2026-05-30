# 微网拓扑选择 Skill v1.0

> 设计人：卢继雄 | 基于5年微网项目实战训练

## 概述
根据项目参数自动选择最优微网拓扑：交流微网、直流微网、交直流混合、光储充一体化、柴储、孤岛黑启动。

## 输入
- 峰值负荷 (kW)
- 光伏容量 (kWp)
- 储能容量 (kWh)
- 柴发容量 (kW)
- 充电桩 (kW)
- 接入电压 (kV)
- 运行模式 (并网/并离网/纯离网)

## 输出
- 拓扑类型: AC/DC/Hybrid/SolarStorageCharge/DieselStorage/IslandBlackStart
- 选择理由
- 拓扑关键参数 (母线电压/频率/接地方式)

## 规则

### R1: 纯离网+柴发 → 柴储拓扑
- 条件: opMode=off_grid AND dieselKw>0
- 输出: DieselStorage, 柴发为主电源, 储能平抑波动

### R2: 纯离网+无柴发 → 孤岛黑启动
- 条件: opMode=off_grid AND dieselKw=0
- 输出: IslandBlackStart, 储能V/f建压, 光伏辅助

### R3: 充电桩>0 AND 光伏>0 → 光储充一体化
- 条件: evKw>0 AND pvKw>0
- 输出: SolarStorageCharge, DC 750V/400V双母线

### R4: 有直流负荷(充电桩/数据中心) → 交直流混合
- 条件: evKw>0 OR scenario=datacenter
- 输出: Hybrid, AC 400V + DC 750V 双母线

### R5: 默认 → 交流微网
- 条件: 上述均不满足
- 输出: AC, 单一AC 400V母线

### R6: 10kV接入 → 需升压变+并网柜
- 条件: voltage=10
- 输出: 增加升压变压器+10kV并网开关柜+双向关口表0.2S级

## 验证Checklist
- [ ] 拓扑类型与运行模式一致
- [ ] 柴发>0时拓扑含柴发
- [ ] 充电桩>0时拓扑含DC母线或AC充电
- [ ] 10kV接入时含升压变
- [ ] 离网时无PCC并网柜
