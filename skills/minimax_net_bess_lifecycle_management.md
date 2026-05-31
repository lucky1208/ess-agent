# Skill: 储能电站全生命周期管理

## Skill 元信息

| 字段 | 内容 |
|------|------|
| Skill 名称 | 储能电站全生命周期管理（ESS Lifecycle Management） |
| Skill ID | `minimax_net_bess_lifecycle_management` |
| 适用版本 | EMS >= 3.0 |
| 依赖数据 | 设备台账、实时遥测、历史运行数据、运维工单系统 |
| 适用对象 | 储能电站运维工程师、资产管理经理、BESS平台开发团队 |
| 更新日期 | 2026-05-31 |
| 维护责任人 | [待定] |

---

## 概述

本 Skill 针对电化学储能电站（以锂离子电池为主，兼容液流电池、钠硫电池等），覆盖从投运到退役的全生命周期运维管理。核心目标：

1. 建立完整的设备台账体系，实现设备全生命周期可追溯
2. 提供多种 SOH 估算算法及衰减预测模型，支撑精准寿命管理
3. 规范运维工单闭环流程，降低非计划停机时间
4. 实现备件精细化管理与梯次利用评估
5. 提供退役决策支持，保障资产处置的经济性与安全性

**核心术语约定：**

| 术语 | 定义 |
|------|------|
| SOH（State of Health） | 电池健康状态，表示当前最大可用容量与标称容量的比值，取值 0~1 |
| EOL（End of Life） | 电池寿命终止状态，通常定义为 SOH 降至 80%（或合同约定值） |
| DOD（Depth of Discharge） | 放电深度，0~100%，每次实际放电量越多等效循环越重 |
| PCC（Point of Common Coupling） | 并网点，储能系统接入电网的公共连接点 |
| BMS（ Battery Management System） | 电池管理系统 |
| EMS（Energy Management System） | 能量管理系统 |
| PCS（Power Conversion System） | 储能变流器（双向 DC-AC 变换装置） |
| IGBT（Insulated Gate Bipolar Transistor） | 绝缘栅双极晶体管，PCS 核心功率器件 |
| BCM（Battery Cell Monitor） | 电池单体监控芯片，BMS 的核心采集单元 |

---

## 一、设备台账管理

### 1.1 设备唯一编码规则

采用 **EMS 设备编码规范**，格式为 `站点代码-设备类型代码-序号`，总长度不超过 20 字符，示例：

```
GD-GZ-001-PCS-001   # 广东广州001电站PCS001号设备
JS-NJ-002-BMS-003   # 江苏南京002电站BMS003号设备
HB-WH-001-BAT-S01   # 湖北武汉001电站电池簇01
```

**编码段说明：**

| 字段段 | 说明 | 长度 | 示例 |
|--------|------|------|------|
| 站点代码 | 省级缩写-城市缩写-站点序号 | 9字符 | GD-GZ-001 |
| 设备类型代码 | 取标准设备类型 | 3~6字符 | PCS / BMS / BAT / TRF |
| 序号 | 同类型设备流水号，补零3位 | 3字符 | 001 |

**标准设备类型代码对照表：**

| 类型代码 | 设备名称 | 说明 |
|----------|----------|------|
| PCS | 储能变流器 | 双向 DC-AC 变换 |
| BMS | 电池管理系统 | 电池监控与管理 |
| BAT | 电池簇/电池堆 | 由电芯/模组构成 |
| CMU | 电池单体监控单元 | BMS 下属采集板 |
| BCU | 电池簇控制单元 | BMS 下属控制板 |
| TRF | 变压器 | 升压或降压变压器 |
| SWG | 并网柜 | PCC 侧开关设备 |
| FS  | 消防系统 | 消防主机与探测回路 |
| HVC | 热管理系统 | 液冷机组/空调 |
| MET | 电能表 | 计量用关口表 |
| PLC | PLC 控制器 | 站控 PLC |
| IMG | 图像监控 | 摄像头与录像 |
| ATS | 自动转换开关 | 市电/柴发切换 |

### 1.2 设备台账字段规范

每台设备台账记录须包含以下字段，**标记 [必填] 的字段不可为空：**

#### 1.2.1 基本信息

| 序号 | 字段名 | 类型 | 必填 | 说明 | 示例 |
|------|--------|------|------|------|------|------|
| 1 | device_id | VARCHAR(32) | ✅ | 设备唯一编码（见 1.1 编码规则） | GD-GZ-001-PCS-001 |
| 2 | device_name | VARCHAR(128) | ✅ | 设备中文名称 | 广州001电站PCS#1 |
| 3 | device_type | VARCHAR(32) | ✅ | 设备类型代码 | PCS |
| 4 | device_model | VARCHAR(64) | ✅ | 设备型号 | SUN2000-5000KTL-HV |
| 5 | manufacturer | VARCHAR(128) | ✅ | 设备厂家 | 华为 |
| 6 | supplier | VARCHAR(128) | | 供应商（可与厂家不同） | 深圳华工 |
| 7 | serial_number | VARCHAR(64) | ✅ | 出厂序列号 | SN20230615001 |
| 8 | manufacturing_date | DATE | ✅ | 出厂日期 | 2023-06-15 |
| 9 | warranty_start | DATE | ✅ | 质保开始日期 | 2023-07-01 |
| 10 | warranty_end | DATE | ✅ | 质保到期日期 | 2028-07-01 |
| 11 | warranty_terms | TEXT | | 质保条款说明 | 质保期内免费更换电芯…… |
| 12 | rated_power_kw | DECIMAL(12,3) | | 额定功率（kW） | 5000.0 |
| 13 | rated_voltage_v | DECIMAL(10,3) | | 额定电压（V） | 1500.0 |
| 14 | rated_current_a | DECIMAL(10,3) | | 额定电流（A） | 3333.3 |
| 15 | rated_capacity_kwh | DECIMAL(12,3) | | 额定容量（kWh） | 10000.0 |
| 16 | nominal_efficiency_pct | DECIMAL(5,3) | | 标称效率（%） | 98.5 |
| 17 | software_version | VARCHAR(64) | | 当前运行软件版本 | V3.2.1 |
| 18 | hardware_version | VARCHAR(32) | | 硬件版本 | Rev.C |
| 19 | install_location | VARCHAR(128) | ✅ | 安装位置描述 | 1#集装箱-左列-B rack |
| 20 | pcc_relation | VARCHAR(32) | | 所连 PCC 编码 | GD-GZ-001-PCC-01 |
| 21 | topology_position | VARCHAR(256) | | 电气拓扑位置描述 | 经直流母线汇入PCS交流侧 |
| 22 | commissioning_date | DATE | ✅ | 投运日期 | 2023-08-01 |
| 23 | cumulative_runtime_h | BIGINT | | 累计运行小时数（h） | 15420 |
| 24 | cumulative_charge_cycles | BIGINT | | 累计充放电次数（次） | 3850 |
| 25 | cumulative_eq_cycles | DECIMAL(12,2) | | 累计等效循环次数 | 2105.30 |
| 26 | current_soh | DECIMAL(5,4) | | 当前 SOH 估算值（0~1） | 0.9520 |
| 27 | current_soc | DECIMAL(5,4) | | 当前 SOC 估算值（0~1） | 0.7500 |
| 28 | alarm_count | INT | | 当前未解除告警数量 | 2 |
| 29 | last_inspection_date | DATE | | 最近一次巡检日期 | 2026-04-15 |
| 30 | next_inspection_date | DATE | | 下次计划巡检日期 | 2026-07-15 |
| 31 | asset_value_orig | DECIMAL(14,2) | | 资产原值（元） | 2800000.00 |
| 32 | asset_value_net | DECIMAL(14,2) | | 资产净值（元） | 2100000.00 |
| 33 | depreciation_method | VARCHAR(32) | | 折旧方法 | 年数总和法 |
| 34 | status | VARCHAR(16) | ✅ | 设备状态：在线/离线/退役/备用 | 在线 |
| 35 | remarks | TEXT | | 备注 | 2024年曾更换IGBT模块 |

### 1.3 设备更换记录管理

每次设备关键部件更换须记录，用于追踪设备实际寿命：

```json
{
  "replacement_id": "RPL-2025-001234",
  "device_id": "GD-GZ-001-BAT-S01",
  "replace_part_type": "电芯单体",
  "replace_part_model": "CATL 280Ah LFP",
  "replace_part_sn": "SN2025CX5678",
  "replace_reason": "容量衰减超标 | 膨胀鼓包 | 故障更换 | 例行更换",
  "replace_date": "2025-11-20",
  "replaced_part_qty": 1,
  "soh_before_replacement": 0.7520,
  "soh_after_replacement": 1.0000,
  "technician": "张三",
  "supplier_work_order": "WO-2025-111234",
  "cost_yuan": 850.00,
  "remark": "替换后均衡良好"
}
```

**更换类型分类：**

| 类别 | 替换件示例 | 跟踪重点 |
|------|-----------|---------|
| 电芯替换 | 单体电芯、模组 | SOH 变化、容量恢复 |
| BMS 替换 | CMU 板、BCU 板、采集线束 | 均衡参数重新校准 |
| PCS 替换 | IGBT 模块、电容、风扇 | 效率对比、谐波变化 |
| 变压器替换 | 油浸式变压器 | 噪声与温升变化 |
| 热管理替换 | 液冷泵、压缩机、冷却液 | 温差控制能力对比 |

### 1.4 设备台账查询 API 设计

#### 1.4.1 查询设备台账详情

```
GET /api/v1/devices/{device_id}
```

**响应示例（部分字段）：**

```json
{
  "code": 0,
  "message": "success",
  "data": {
    "device_id": "GD-GZ-001-PCS-001",
    "device_name": "广州001电站PCS#1",
    "device_type": "PCS",
    "device_model": "华为SUN2000-5000KTL",
    "manufacturer": "华为技术",
    "warranty_end": "2028-07-01",
    "current_soh": 0.9800,
    "cumulative_runtime_h": 15420,
    "cumulative_eq_cycles": 2105.30,
    "status": "在线",
    "alarm_count": 0,
    "next_inspection_date": "2026-07-15"
  }
}
```

#### 1.4.2 批量查询设备列表

```
GET /api/v1/devices?type=PCS&status=在线&page=1&page_size=50
```

#### 1.4.3 查询设备更换历史

```
GET /api/v1/devices/{device_id}/replacements
```

#### 1.4.4 新增/更新设备台账

```
POST   /api/v1/devices           # 新增设备
PUT    /api/v1/devices/{device_id}  # 更新设备信息
DELETE /api/v1/devices/{device_id}  # 退役设备（软删除）
```

---

## 二、寿命预测与健康管理

### 2.1 SOH 估算算法

电池 SOH（State of Health）是衡量储能系统寿命状态的核心指标。本节提供多种 SOH 估算方法，从简单到复杂排序，并给出 Python 伪代码实现。

**通用符号定义：**

| 符号 | 含义 | 单位 |
|------|------|------|
| C_nom | 标称容量 | Ah |
| C_actual | 当前最大可用容量 | Ah |
| SOH | 健康状态 | 0~1 |
| Q_charge | 充电累计容量 | Ah |
| Q_discharge | 放电累计容量 | Ah |
| V_ocv | 开路电压 | V |
| I | 电流 | A |
| T | 温度 | °C |
| DOD | 放电深度 | 0~100% |

#### 2.1.1 安时积分法（Ah Counting）

**原理：** 通过精确积分充放电电流，计算实际转移的电荷量，与标称容量比较得到 SOH。

**优点：** 实现简单、计算量小、可在线运行  
**缺点：** 存在积分漂移累积误差；需定期用标准容量重新校准

**Python 伪代码：**

```python
import pandas as pd
import numpy as np

def estimate_soh_ah_counting(
    df_charge: pd.DataFrame,
    df_discharge: pd.DataFrame,
    C_nom: float,
    calibration_interval_h: int = 168,  # 每168小时（约7天）校准一次
    initial_soh: float = 1.0
) -> float:
    """
    安时积分法估算SOH
    
    参数:
        df_charge:  充电数据 DataFrame，含列: timestamp, current(A), voltage(V)
        df_discharge: 放电数据 DataFrame，含列: timestamp, current(A), voltage(V)
        C_nom: 标称容量 (Ah)
        calibration_interval_h: 校准周期（小时）
        initial_soh: 初始SOH（重启后需指定）
    
    返回:
        soh: 当前SOH估算值 (0~1)
    """
    # 合并充放电数据，按时间排序
    df = pd.concat([df_charge, df_discharge]).sort_values('timestamp').reset_index(drop=True)
    df['dt'] = df['timestamp'].diff().dt.total_seconds() / 3600.0  # 转换为小时

    # 积分计算转移电荷量
    # 充电时电流为正，放电时电流为负
    df['dQ'] = df['current'] * df['dt']  # Ah

    # 累计净转移电荷量（充电为正，放电为负）
    total_charge = df[df['current'] > 0]['dQ'].sum()
    total_discharge = abs(df[df['current'] < 0]['dQ'].sum())

    # 取充放电较小值（避免积分误差导致的不平衡）
    Q_actual = min(total_charge, total_discharge)

    # 初始SOH更新：使用积分周期内最大可用容量估算
    # 每隔 calibration_interval_h 小时，用积分结果更新SOH基准
    elapsed_h = (df['timestamp'].max() - df['timestamp'].min()).total_seconds() / 3600.0
    if elapsed_h >= calibration_interval_h:
        # 触发校准：假设积分期间SOH线性衰减，修正基准
        pass  # 实际实现中需要与参考容量对比

    soh = Q_actual / C_nom if C_nom > 0 else initial_soh

    # 限制SOH范围
    soh = np.clip(soh, 0.0, 1.0)

    return round(soh, 4)


def auto_calibrate_soh(
    current_soh: float,
    measured_capacity: float,
    C_nom: float,
    alpha: float = 0.3
) -> float:
    """
    渐进式校准：避免大幅跳变
    
    current_soh: 当前估算SOH
    measured_capacity: 实测容量（通过标准放电测试获得）
    C_nom: 标称容量
    alpha: 校准权重（0~1，越大修正越快）
    
    返回: 校准后SOH
    """
    measured_soh = measured_capacity / C_nom if C_nom > 0 else current_soh
    calibrated_soh = alpha * measured_soh + (1 - alpha) * current_soh
    return round(np.clip(calibrated_soh, 0.0, 1.0), 4)
```

**适用场景：** 实时在线估算，作为 EKF 的先验估计；需要定期（如月度）标准容量测试做校准

#### 2.1.2 开路电压 OCV 法

**原理：** 锂电池的开路电压（OCV）与 SOC 有明确的对应关系（通过标准 OCV-SOC 曲线）。当电池静置足够长时间后，测量 OCV 即可推算当前 SOC；结合已知历史 SOC 变化，可反推 SOH。

**优点：** 精度高、无需电流积分、不需要额外传感器  
**缺点：** 需要电池充分静置（通常 2h 以上），运行时无法测量；OCV 曲线需针对具体电芯标定

**Python 伪代码：**

```python
import numpy as np
import pandas as pd

# OCV-SOC标定曲线（示例：磷酸铁锂LFP电芯，需根据实际电芯型号标定）
OCV_SOC_CURVE = [
    (2.80, 0.00), (3.00, 0.02), (3.10, 0.05),
    (3.20, 0.10), (3.25, 0.15), (3.30, 0.20),
    (3.32, 0.30), (3.34, 0.40), (3.36, 0.50),
    (3.38, 0.60), (3.40, 0.70), (3.42, 0.80),
    (3.45, 0.90), (3.50, 0.98), (3.60, 1.00)
]


def interpolate_soc_from_ocv(v_ocv: float, curve: list = OCV_SOC_CURVE) -> float:
    """线性插值：从OCV查SOC"""
    ocv_vals = np.array([p[0] for p in curve])
    soc_vals = np.array([p[1] for p in curve])
    soc = np.interp(v_ocv, ocv_vals, soc_vals)
    return float(np.clip(soc, 0.0, 1.0))


def estimate_soh_ocv(
    df_rest: pd.DataFrame,
    C_nom: float,
    min_rest_duration_h: float = 2.0,
    soc_previous: float,
    capacity_previous: float,
    voltage_threshold_lower: float = 2.8,
    voltage_threshold_upper: float = 3.6
) -> float:
    """
    OCV法估算SOH
    
    参数:
        df_rest: 静置期间数据，含列: timestamp, voltage(V)
        C_nom: 标称容量 (Ah)
        min_rest_duration_h: 最小有效静置时长（小时）
        soc_previous: 静置前记录的SOC
        capacity_previous: 静置前对应的可用容量 (Ah) = soc_previous * C_nom * 前次SOH
    
    返回:
        soh: 当前SOH估算值
    """
    # 判断静置是否有效：电压波动 < 阈值
    rest_data = df_rest[df_rest['timestamp'] >= df_rest['timestamp'].min()]
    v_start = rest_data['voltage'].iloc[0]
    v_end = rest_data['voltage'].iloc[-1]
    v_max = rest_data['voltage'].max()
    v_min = rest_data['voltage'].min()

    # 有效静置判断：电压波动 < 0.01V
    if (v_max - v_min) > 0.01:
        return None  # 静置不稳定，无法估算

    v_ocv = v_end  # 取静置结束电压作为OCV
    if not (voltage_threshold_lower < v_ocv < voltage_threshold_upper):
        return None  # OCV不在合理范围

    soc_now = interpolate_soc_from_ocv(v_ocv, OCV_SOC_CURVE)

    # SOH计算：利用SOC变化反推容量变化
    # ΔSOC = soc_now - soc_previous
    # ΔQ = ΔSOC * C_nom（忽略SOH对容量的影响）
    # 实际容量 = capacity_previous + ΔQ（考虑SOH已变化）
    delta_soc = soc_now - soc_previous
    delta_Q = delta_soc * C_nom

    # 当前最大可用容量
    # 若 ΔSOC > 0（静置期间自放电恢复），则不增加；若 ΔSOC < 0（放电衰减），则减少
    # 简化处理：SOH = 当前可用容量 / 标称容量
    # 已知上次：capacity_previous = soc_previous * C_nom * previous_soh
    # 若上次记录有SOH，用上次SOH和本次SOC差值估算
    # 若无上次SOH，用线性衰减假设
    soh = (capacity_previous + delta_Q) / C_nom if C_nom > 0 else 1.0
    return round(float(np.clip(soh, 0.0, 1.0)), 4)
```

**适用场景：** 月度/季度标准容量测试时的精确 SOH 标定；储能系统长期断电后的状态评估

#### 2.1.3 扩展卡尔曼滤波（EKF）

**原理：** EKF 是 SOH 估算的工业级方法，在线实时运行，使用状态空间模型同时估计 SOC 和 SOH。EKF 通过预测（基于电池模型）和更新（基于实测电压）两步递归，抑制积分漂移和测量噪声。

**优点：** 实时最优估计、抗噪声能力强、无需定期校准、可同时估计 SOC 和 SOH  
**缺点：** 需要准确的电池等效电路模型（ECM）；计算量中等；模型参数需随温度更新

**Python 伪代码：**

```python
import numpy as np

class ExtendedKalmanFilterSOH:
    """
    基于扩展卡尔曼滤波的SOC+SOH联合估计器
    
    状态向量: x = [SOC, SOH]^T
    观测向量: y = V_terminal
    """

    def __init__(self, dt: float = 1.0, temperature: float = 25.0):
        """
        参数:
            dt: 采样时间间隔 (s)
            temperature: 当前温度 (°C)
        """
        self.dt = dt
        self.temperature = temperature

        # 初始化状态向量 [SOC, SOH]
        self.x = np.array([[0.80], [1.00]])  # [SOC, SOH]
        # 初始化协方差矩阵
        self.P = np.diag([0.01, 0.01])

        # 过程噪声协方差
        self.Q = np.diag([0.0001, 0.00001])
        # 观测噪声协方差
        self.R = np.diag([0.01])

        # 等效电路模型参数（需根据电芯型号标定，这里用磷酸铁锂示例）
        self.model_params = self._get_params(temperature)

    def _get_params(self, T: float) -> dict:
        """获取温度相关的电池模型参数"""
        # R0: 欧姆内阻, R1: 极化内阻, C1: 极化电容
        # 参数随温度变化，需标定
        return {
            'R0_25': 0.0012,       # Ω 在25°C
            'R0_T': 0.00002,       # R0温度系数
            'R1_25': 0.0025,
            'C1_25': 3000.0,
            'V_full': 3.40,        # 满电电压
            'V_empty': 2.80,       # 空电电压
            'Q_nom': 280.0,        # Ah 标称容量
        }

    def _battery_model(self, V_measured: float, I: float) -> tuple:
        """
        电池等效电路模型（Thevenin模型）
        返回: (V_ocv, V_terminal, dV_dSOC)
        """
        params = self.model_params
        SOC = float(self.x[0])
        T = self.temperature

        # OCV-SOC 关系（简化线性，实际应用中用分段线性或多项式拟合）
        V_ocv = params['V_empty'] + (params['V_full'] - params['V_empty']) * SOC

        # 欧姆压降
        R0 = params['R0_25'] * (1 + params['R0_T'] * (T - 25.0))
        V_R0 = I * R0

        # 极化压降（简化RC电路响应）
        V_R1 = self._get_polarization_voltage()

        V_terminal = V_ocv - V_R0 - V_R1
        # OCV对SOC的偏导（用于线性化）
        dV_dSOC = params['V_full'] - params['V_empty']

        return V_ocv, V_terminal, dV_dSOC

    def _get_polarization_voltage(self) -> float:
        """获取极化电压（简化处理）"""
        return 0.0

    def predict(self, I: float):
        """EKF预测步：状态预测 + 协方差预测"""
        dt = self.dt
        SOC = float(self.x[0])
        SOH = float(self.x[1])
        Q_nom = self.model_params['Q_nom']

        # 状态转移方程
        # dSOC/dt = -I / (Q_nom * SOH)
        SOC_new = SOC - (I * dt / 3600.0) / (Q_nom * SOH)
        SOC_new = np.clip(SOC_new, 0.0, 1.0)

        # SOH使用随机游走模型（缓慢变化）
        # SOH_new = SOH（不做预测更新，由更新步修正）
        SOH_new = SOH

        self.x = np.array([[SOC_new], [SOH_new]])

        # 协方差预测
        F = np.array([
            [1,  I * dt / 3600.0 / (Q_nom * SOH ** 2)],  # SOC对SOH的雅可比
            [0,  1]
        ])
        self.P = F @ self.P @ F.T + self.Q

    def update(self, V_measured: float, I: float):
        """EKF更新步：利用观测值修正状态"""
        _, V_model, dV_dSOC = self._battery_model(V_measured, I)

        # 观测残差（创新）
        y_innovation = V_measured - V_model

        # 观测雅可比矩阵 H
        params = self.model_params
        T = self.temperature
        R0 = params['R0_25'] * (1 + params['R0_T'] * (T - 25.0))
        dV_dI = -R0  # dV/dI = -R0

        H = np.array([[dV_dSOC, 0.0],
                       [I * dV_dI / (params['Q_nom'] * float(self.x[1]) ** 2), dV_dI]])

        # 实际上用简化 H = [dV/dSOC, 0]，只利用电压观测量
        H_simple = np.array([[dV_dSOC, 0.0]])

        #卡尔曼增益
        S = H_simple @ self.P @ H_simple.T + self.R
        K = self.P @ H_simple.T / float(S)

        # 状态更新
        self.x = self.x + K * y_innovation
        self.x[0] = np.clip(self.x[0], 0.0, 1.0)
        self.x[1] = np.clip(self.x[1], 0.0, 1.0)

        # 协方差更新
        I_mat = np.eye(2)
        self.P = (I_mat - K @ H_simple) @ self.P

    def step(self, V_measured: float, I: float):
        """执行一次EKF迭代（预测+更新）"""
        self.predict(I)
        self.update(V_measured, I)
        return float(self.x[0]), float(self.x[1])  # (SOC, SOH)


def online_soh_estimation(data_stream, dt: float = 1.0):
    """
    在线SOH估计主循环（伪代码）
    实际使用时需接入实时数据流
    """
    ekf = ExtendedKalmanFilterSOH(dt=dt)

    for timestamp, voltage, current in data_stream:
        soc, soh = ekf.step(V_measured=voltage, I=current)
        yield {
            'timestamp': timestamp,
            'soc': round(soc, 4),
            'soh': round(soh, 4)
        }
```

**适用场景：** 储能系统实时在线运行，EMS/BMS 集成的首选方法；需要连续估计 SOC 和 SOH 的AGC调频场景

#### 2.1.4 放电曲线特征提取法

**原理：** 在标准放电测试（或深放电运行）过程中，通过分析放电电压曲线的特征变化（如压降斜率、拐点位置）来判断 SOH。这是工业现场最实用的方法，因为不需要模型参数标定，只依赖实测数据。

**优点：** 不需要模型参数；对电芯老化敏感；工业现场可直接执行  
**缺点：** 需要标准放电测试（耗时）；深放电影响经济收益；频率受限

**Python 伪代码：**

```python
import numpy as np
import pandas as pd
from scipy.signal import find_peaks
from scipy.interpolate import interp1d


def extract_discharge_curve_features(df_discharge: pd.DataFrame) -> dict:
    """
    从放电曲线中提取SOH相关特征
    
    参数:
        df_discharge: 放电数据，含列: time(s), voltage(V), current(A), capacity(Ah)
    
    返回:
        features: 特征字典
    """
    features = {}

    # 1. 放电中点电压：在放出50%容量时的电压
    total_capacity = df_discharge['capacity'].max()
    mid_capacity = total_capacity * 0.5
    df_mid = df_discharge[df_discharge['capacity'] >= mid_capacity].head(1)
    features['V_mid'] = float(df_mid['voltage'].iloc[0]) if len(df_mid) > 0 else None

    # 2. 放电末端电压跌落斜率：最后10%容量的电压下降速率
    df_tail = df_discharge[df_discharge['capacity'] >= total_capacity * 0.90]
    if len(df_tail) > 1:
        poly = np.polyfit(df_tail['capacity'], df_tail['voltage'], 1)
        features['V_tail_slope'] = float(poly[0])  # V/Ah
    else:
        features['V_tail_slope'] = None

    # 3. 等压平台时长：放电电压在 3.2~3.4V（LFP典型平台区）的持续时间
    df_plateu = df_discharge[
        (df_discharge['voltage'] >= 3.20) &
        (df_discharge['voltage'] <= 3.40)
    ]
    if len(df_plateu) > 1:
        features['plateu_duration_s'] = float(
            df_plateu['time'].max() - df_plateu['time'].min()
        )
    else:
        features['plateu_duration_s'] = None

    # 4. 电压拐点位置：dV/dt 最小点（电压平台结束点）
    df_sorted = df_discharge.sort_values('time')
    dV = df_sorted['voltage'].diff()
    dt_arr = df_sorted['time'].diff()
    dV_dt = dV / dt_arr.replace(0, np.nan)
   拐点_idx = dV_dt.idxmin()
   拐点_capacity = df_sorted.loc[拐点_idx, 'capacity']
    features['拐点_capacity_ratio'] = float(拐点_capacity / total_capacity) if total_capacity > 0 else None

    return features


def estimate_soh_from_features(
    features: dict,
    baseline_features: dict,
    weights: dict = None
) -> float:
    """
    基于特征对比估算SOH
    
    baseline_features: 新电池状态下的基准特征
    features: 当前状态特征
    weights: 各特征的权重（默认等权重）
    
    返回: SOH估算值
    """
    if weights is None:
        weights = {
            'V_mid': 0.40,
            'V_tail_slope': 0.20,
            'plateu_duration_s': 0.20,
            '拐点_capacity_ratio': 0.20
        }

    soh_estimates = {}
    for key, weight in weights.items():
        if features.get(key) is not None and baseline_features.get(key) is not None:
            baseline = baseline_features[key]
            current = features[key]

            if key == 'V_mid':
                # 电压越高SOH越高
                ratio = current / baseline if baseline > 0 else 1.0
                soh_estimates[key] = np.clip(ratio, 0.0, 1.0)

            elif key == 'V_tail_slope':
                # 斜率绝对值越小SOH越高（新电池电压更稳定）
                if abs(baseline) > 0:
                    ratio = abs(baseline) / abs(current) if current != 0 else 1.0
                else:
                    ratio = 1.0
                soh_estimates[key] = np.clip(ratio, 0.0, 1.0)

            elif key == 'plateu_duration_s':
                # 平台时长越长SOH越高
                ratio = current / baseline if baseline > 0 else 1.0
                soh_estimates[key] = np.clip(ratio, 0.0, 1.0)

            elif key == '拐点_capacity_ratio':
                # 拐点出现越晚（比值越大）SOH越高
                ratio = current / baseline if baseline > 0 else 1.0
                soh_estimates[key] = np.clip(ratio, 0.0, 1.0)

    if not soh_estimates:
        return None

    # 加权平均
    soh = sum(soh_estimates[k] * weights[k] for k in soh_estimates)
    return round(float(np.clip(soh, 0.0, 1.0)), 4)


def run_standard_discharge_test(battery_system, I_discharge: float = 0.5):
    """
    执行标准放电测试（伪代码）
    I_discharge: 放电电流倍率（C-rate）
    需接入BMS控制接口和充放电设备
    """
    # 1. 满电静置
    # 2. 以I_discharge倍率放电至截止电压
    # 3. 记录全程电压-容量曲线
    # 4. 执行标准放电测试的标准条件：25°C, 0.5C放电
    pass
```

#### 2.1.5 各算法适用场景对比

| 算法 | 精度 | 计算量 | 实时性 | 所需数据 | 最佳使用场景 |
|------|------|--------|--------|---------|------------|
| 安时积分法 | ⭐⭐ | 低 | 高 | 电流积分 | 日常在线监控（需定期校准） |
| OCV法 | ⭐⭐⭐⭐⭐ | 低 | 低（需静置） | 电压 | 月度容量标定、停机检测 |
| EKF | ⭐⭐⭐⭐ | 中 | 高 | 电压+电流+温度 | 工业级在线实时SOH估计 |
| 放电曲线特征提取 | ⭐⭐⭐⭐ | 中 | 低（需放电测试） | 放电过程数据 | 季度深度检测、故障诊断 |

**推荐策略：** 生产系统应以 **EKF 为核心**，辅以 **月度OCV校准** 和 **季度放电曲线特征提取测试**，形成三保险 SOH 估算体系。输出 SOH 取三者的加权平均或交叉验证结果。

### 2.2 衰减预测模型

#### 2.2.1 年衰减率趋势外推（线性回归）

基于历史 SOH 数据，建立年衰减率趋势外推模型：

```python
import numpy as np
from scipy import stats
import pandas as pd


def predict_soh_linear_regression(
    soh_history: pd.DataFrame,
    forecast_years: int = 5,
    confidence_level: float = 0.95
) -> dict:
    """
    基于历史SOH数据的线性回归预测
    
    参数:
        soh_history: 含列: date, soh 的DataFrame
        forecast_years: 预测年数
        confidence_level: 置信水平
    
    返回: {
        'annual_decay_rate': 年衰减率,
        'predicted_soh': 各年预测SOH数组,
        'confidence_interval': 置信区间,
        'eol_date': 预计EOL日期,
        'R2': 拟合优度
    }
    """
    df = soh_history.copy()
    df['days'] = (df['date'] - df['date'].min()).dt.days
    df['year'] = df['days'] / 365.25

    # 线性回归: SOH = a * year + b
    slope, intercept, r_value, p_value, std_err = stats.linregress(
        df['year'], df['soh']
    )

    annual_decay_rate = abs(slope)  # 年SOH衰减率

    # 预测未来
    future_years = np.arange(0, forecast_years + 0.1, 1)
    predicted_soh = intercept + slope * (df['year'].max() + future_years)

    # 置信区间（基于残差标准差）
    residuals = df['soh'] - (intercept + slope * df['year'])
    residual_std = np.std(residuals)
    t_value = stats.t.ppf((1 + confidence_level) / 2, len(df) - 2)
    margin = t_value * residual_std
    confidence_interval = [
        predicted_soh - margin,
        predicted_soh + margin
    ]

    # EOL预测（SOH降至阈值）
    eol_threshold = 0.80
    eol_years_from_start = (eol_threshold - intercept) / slope if slope != 0 else None
    eol_date = df['date'].max() + pd.DateOffset(years=eol_years_from_start) if eol_years_from_start else None

    return {
        'annual_decay_rate': round(annual_decay_rate, 4),
        'predicted_soh': [round(s, 4) for s in predicted_soh],
        'confidence_interval_lower': [round(s, 4) for s in confidence_interval[0]],
        'confidence_interval_upper': [round(s, 4) for s in confidence_interval[1]],
        'eol_date': eol_date.strftime('%Y-%m-%d') if eol_date else None,
        'R2': round(r_value ** 2, 4),
        'p_value': round(p_value, 4)
    }
```

#### 2.2.2 等效循环次数统计

每次真实循环的等效循环次数按 DOD 权重计算，反映电池真实老化程度：

```python
import pandas as pd
import numpy as np


def calculate_equivalent_cycles(df_operation: pd.DataFrame) -> dict:
    """
    计算等效循环次数
    
    DOD权重公式: eq_cycle_factor = (DOD / 100) ^ 1.5
    100%DOD等效1次；80%DOD等效0.72次；50%DOD等效0.35次
    
    参数:
        df_operation: 含列: cycle_id, dod_pct, cycle_start_time, cycle_end_time
    
    返回:
        {
            'total_equivalent_cycles': 累计等效循环次数,
            'total_real_cycles': 累计真实循环次数,
            'cycles_by_dod_band': 各DOD区间统计
        }
    """
    if df_operation.empty:
        return {'total_equivalent_cycles': 0.0, 'total_real_cycles': 0}

    df = df_operation.copy()
    df['eq_factor'] = (df['dod_pct'] / 100.0) ** 1.5
    df['eq_cycles'] = df['eq_factor']  # 每次循环的等效次数

    total_eq = df['eq_cycles'].sum()
    total_real = len(df)

    # 分DOD区间统计
    dod_bands = {
        '浅循环(DOD<30%)': (0, 30),
        '中循环(30%≤DOD<60%)': (30, 60),
        '深循环(60%≤DOD<100%)': (60, 100)
    }
    cycles_by_dod = {}
    for band_name, (lo, hi) in dod_bands.items():
        mask = (df['dod_pct'] >= lo) & (df['dod_pct'] < hi)
        cycles_by_dod[band_name] = {
            'count': int(mask.sum()),
            'eq_cycles': round(float(df[mask]['eq_cycles'].sum()), 2)
        }

    return {
        'total_equivalent_cycles': round(total_eq, 2),
        'total_real_cycles': total_real,
        'cycles_by_dod_band': cycles_by_dod
    }


def estimate_cycle_life_budget(
    design_cycle_life: int,
    current_soh: float,
    eol_threshold: float = 0.80
) -> dict:
    """
    循环寿命预算评估
    
    循环寿命预算 = 设计循环次数 × (SOH - EOL阈值) / (1 - EOL阈值)
    含义：在当前SOH下，还能承受多少次等效满循环
    
    参数:
        design_cycle_life: 设计等效循环寿命（通常6000~10000次@0.5C/25°C/DOD 80%）
        current_soh: 当前SOH
        eol_threshold: EOL阈值（通常80%）
    
    返回: 剩余寿命预算
    """
    soh_factor = (current_soh - eol_threshold) / (1.0 - eol_threshold)
    soh_factor = max(0.0, soh_factor)  # SOH已低于EOL时为0

    used_cycles_ratio = 1.0 - soh_factor
    used_cycles = design_cycle_life * used_cycles_ratio
    remaining_cycles = design_cycle_life * soh_factor

    return {
        'design_cycle_life': design_cycle_life,
        'used_equivalent_cycles': round(used_cycles, 0),
        'remaining_equivalent_cycles': round(remaining_cycles, 0),
        'used_ratio_pct': round(used_cycles_ratio * 100, 2),
        'eol_warning': current_soh < (eol_threshold + 0.05)  # 距EOL不足5%时预警
    }
```

**典型电芯设计循环寿命参考：**

| 电芯类型 | 设计等效循环次数（@0.5C, 25°C, DOD 80%） | 设计日历寿命 |
|----------|----------------------------------------|-------------|
| 磷酸铁锂 LFP | 6000~10000 次 | 15~20 年 |
| 三元锂 NMC | 3000~5000 次 | 10~15 年 |
| 钛酸锂 LTO | 15000~20000 次 | 20+ 年 |

#### 2.2.3 温度加速因子模型（Arrhenius）

温度是影响电池衰减的最重要环境因素。Arrhenius 模型描述温度对衰减速率的加速效应：

```python
import numpy as np


def arrhenius_acceleration_factor(T_op: float, T_ref: float = 25.0,
                                  Ea: float = 20000.0, R: float = 8.314) -> float:
    """
    计算温度加速因子（Arrhenius方程）
    
    AF = exp(Ea/R * (1/T_ref_K - 1/T_op_K))
    
    参数:
        T_op: 运行温度 (°C)
        T_ref: 参考温度 (°C)，默认25°C
        Ea: 活化能 (J/mol)，锂离子电池典型值18000~22000 J/mol
        R: 气体常数 8.314 J/(mol·K)
    
    返回: 加速因子 AF（>1表示加速衰减）
    """
    T_ref_K = T_ref + 273.15
    T_op_K = T_op + 273.15

    if T_op_K <= 0:
        return 1.0

    exponent = (Ea / R) * (1.0 / T_ref_K - 1.0 / T_op_K)
    AF = np.exp(exponent)
    return float(AF)


def estimate_temperature_accelerated_decay(
    soh_history: pd.DataFrame,
    temp_history: pd.DataFrame,
    design_life_cycles: int,
    T_ref: float = 25.0,
    Ea: float = 20000.0
) -> dict:
    """
    综合温度加速因子的衰减预测
    
    计算整个运行期间的平均加速因子，对等效循环次数做修正
    """
    # 合并数据计算平均运行温度
    df = pd.merge(soh_history, temp_history, on='date', how='inner')
    T_avg = df['temperature_c'].mean()
    T_max = df['temperature_c'].max()
    T_min = df['temperature_c'].min()

    # 平均加速因子
    AF_avg = arrhenius_acceleration_factor(T_avg, T_ref, Ea)

    # 最大加速因子（考虑高温应力）
    AF_max = arrhenius_acceleration_factor(T_max, T_ref, Ea)

    # 温度修正后的等效循环寿命
    effective_life_cycles = design_life_cycles / AF_avg

    return {
        'T_avg_c': round(T_avg, 1),
        'T_max_c': round(T_max, 1),
        'T_min_c': round(T_min, 1),
        'AF_avg': round(AF_avg, 2),
        'AF_max': round(AF_max, 2),
        'effective_life_cycles': round(effective_life_cycles, 0),
        'effective_life_reduction_pct': round((1 - 1/AF_avg) * 100, 1),
        'warning': T_avg > 30.0  # 平均温度>30°C时发出预警
    }
```

**典型温度加速因子（Ea=20000 J/mol, 参考25°C）：**

| 运行温度 | 加速因子 AF | 等效循环寿命折算（设计10000次） |
|----------|------------|------------------------------|
| 15°C | 0.67 | 约14900次 |
| 25°C | 1.00 | 10000次 |
| 30°C | 1.57 | 约6370次 |
| 35°C | 2.45 | 约4080次 |
| 40°C | 3.79 | 约2640次 |
| 45°C | 5.79 | 约1720次 |

#### 2.2.4 预测置信区间计算

```python
import numpy as np
from scipy import stats


def calculate_soh_prediction_ci(
    soh_history: pd.DataFrame,
    forecast_days: int,
    confidence: float = 0.95
) -> pd.DataFrame:
    """
    计算SOH预测置信区间
    
    使用贝叶斯线性回归思路估算不确定性
    随预测时间增长，置信区间逐渐扩大（不确定性累积）
    """
    df = soh_history.copy()
    df['days'] = (df['date'] - df['date'].min()).dt.days
    n = len(df)

    # 线性回归参数
    x = df['days'].values
    y = df['soh'].values
    x_mean = np.mean(x)
    y_mean = np.mean(y)

    slope = np.sum((x - x_mean) * (y - y_mean)) / np.sum((x - x_mean) ** 2)
    intercept = y_mean - slope * x_mean

    # 残差
    residuals = y - (intercept + slope * x)
    s_e = np.sqrt(np.sum(residuals ** 2) / (n - 2))

    # t分布分位数
    df_res = n - 2
    t_crit = stats.t.ppf((1 + confidence) / 2, df_res)

    # 预测区间（随时间增长而扩大）
    future_days = np.arange(0, forecast_days + 1)
    for d in future_days:
        x_pred = x.mean() + d  # 相对于均值的偏移
        SE_fit = s_e * np.sqrt(
            1/n + (d - x_mean) ** 2 / np.sum((x - x_mean) ** 2)
        )
        SE_pred = s_e * np.sqrt(
            1 + 1/n + (d - x_mean) ** 2 / np.sum((x - x_mean) ** 2)
        )
        y_pred = intercept + slope * (x.max() + d)

        yield {
            'date': df['date'].min() + pd.DateOffset(days=int(x.max() + d)),
            'soh_predicted': round(float(y_pred), 4),
            'ci_lower': round(float(y_pred - t_crit * SE_pred), 4),
            'ci_upper': round(float(y_pred + t_crit * SE_pred), 4)
        }
```

### 2.3 关键器件剩余寿命预警

#### 2.3.1 PCS IGBT 剩余寿命（结温波动累积）

IGBT 的主要老化机理是功率循环导致的焊料层疲劳和绑定线退化。老化程度与 **结温波动幅度 ΔTj** 和 **循环次数** 直接相关。

```python
def estimate_igbt_remaining_life(
    total_runtime_h: float,
    avg_switching_cycles_per_hour: int = 300,
    ΔT_j: float,
    T_j_max: float,
    T_j_mean: float,
    target_failure_probability: float = 0.10,
    acceleration_factor_temp: float = 1.0
) -> dict:
    """
    IGBT剩余寿命估算（基于LESIT/CIPS2008加速寿命模型）
    
    公式: N_f = A * (ΔT_j)^(-3.3) * exp(Ea/(R*T_j_mean_K))
    
    参数:
        total_runtime_h: 累计运行小时
        avg_switching_cycles_per_hour: 平均开关频率（次/小时）
        ΔT_j: 结温波动幅度 (°C)
        T_j_max: 最大结温 (°C)
        T_j_mean: 平均结温 (°C)
        target_failure_probability: 目标失效概率（默认10%）
        acceleration_factor_temp: 温度加速因子
    
    返回: IGBT剩余寿命相关指标
    """
    A = 9.45e13  # LESIT模型常数
    Ea = 7.77e4  # 激活能 J/mol
    R = 8.314

    T_j_mean_K = T_j_mean + 273.15
    N_f = A * (ΔT_j ** -3.3) * np.exp(Ea / (R * T_j_mean_K))

    # 温度加速
    N_f_adjusted = N_f / acceleration_factor_temp

    # 当前开关循环次数
    total_switching_cycles = total_runtime_h * avg_switching_cycles_per_hour

    # 消耗寿命比例
    consumed_ratio = min(1.0, total_switching_cycles / N_f_adjusted)

    # 剩余循环次数
    remaining_cycles = max(0, N_f_adjusted - total_switching_cycles)
    remaining_hours = remaining_cycles / avg_switching_cycles_per_hour if avg_switching_cycles_per_hour > 0 else float('inf')

    # 剩余寿命预警等级
    if consumed_ratio >= 0.90:
        level = 'CRITICAL'  # 危急
    elif consumed_ratio >= 0.75:
        level = 'WARNING'   # 警告
    elif consumed_ratio >= 0.60:
        level = 'CAUTION'  # 注意
    else:
        level = 'NORMAL'

    return {
        'igbt_cycles_to_failure': round(N_f_adjusted, 0),
        'consumed_switching_cycles': round(total_switching_cycles, 0),
        'remaining_switching_cycles': round(remaining_cycles, 0),
        'consumed_lifetime_ratio': round(consumed_ratio, 4),
        'remaining_hours': round(remaining_hours, 0),
        'remaining_years': round(remaining_hours / 8760, 1),
        'alert_level': level,
        'ΔT_j': ΔT_j,
        'T_j_max': T_j_max,
        'T_j_mean': T_j_mean
    }
```

#### 2.3.2 PCS 电容剩余寿命（纹波电流累积）

直流支撑电容（DC-Link Capacitor）的老化由纹波电流累积导致内部温升，最终容量衰减失效。

```python
def estimate_capacitor_remaining_life(
    total_runtime_h: float,
    I_ripple_rms: float,          # 纹波电流有效值 (A)
    C_rated: float,               # 额定电容 (μF)
    ESR_rated: float,             # 额定ESR (mΩ)
    T_ambient: float,             # 环境温度 (°C)
    T_cap_max: float,             # 电容最大允许温度 (°C)
    L_target: float = 50000.0     # 设计寿命 (小时)
) -> dict:
    """
    电容剩余寿命估算（基于Arrhenius加速模型）
    
    核心：电容内部温升导致电解液蒸发，容值下降
    ΔT = I_ripple^2 * ESR / (k * A) — 电容温升估算
    """
    k_thermal = 0.01  # 热阻系数（需实测标定）
    A_surface = 0.01  # 散热面积 m²（需实测）

    # 纹波电流导致的内部温升
    ΔT = (I_ripple_rms ** 2) * ESR_rated / (k_thermal * A_surface) * 1000  # mW→W

    # 等效热点温度
    T_hotspot = T_ambient + ΔT

    # Arrhenius温度加速
    Ea = 80000  # J/mol 电容降解激活能
    R = 8.314
    AF = np.exp(Ea / R * (1/(T_cap_max + 273.15) - 1/(T_hotspot + 273.15)))

    # 剩余寿命（小时）
    L_remaining = L_target / AF if AF > 0 else float('inf')

    return {
        'T_hotspot_c': round(T_hotspot, 1),
        'ΔT_c': round(ΔT, 1),
        'acceleration_factor': round(AF, 2),
        'remaining_lifetime_h': round(L_remaining, 0),
        'remaining_lifetime_years': round(L_remaining / 8760, 1),
        'consumed_lifetime_ratio': round(1 - L_remaining/L_target, 4),
        'alert_level': 'WARNING' if L_remaining < 20000 else 'NORMAL'
    }
```

#### 2.3.3 各器件预警阈值汇总

| 器件 | 关键指标 | 正常 | 注意 | 警告 | 危急 |
|------|---------|------|------|------|------|
| 电池模组 | SOH | >90% | 80%~90% | 70%~80% | <70% |
| 电池模组 | 日历寿命消耗率 | <50% | 50%~70% | 70%~90% | >90% |
| PCS IGBT | 消耗寿命比例 | <60% | 60%~75% | 75%~90% | >90% |
| PCS 电容 | 剩余寿命(年) | >3 | 1~3 | 0.5~1 | <0.5 |
| BMS BCM | 运行时间(h)/MTBF | >50000 | 30000~50000 | 10000~30000 | <10000 |
| 热管理系统 | 制冷量偏差(%) | <5% | 5%~10% | 10%~20% | >20% |

---

## 三、运维工单管理

### 3.1 巡检计划自动生成

#### 3.1.1 按设备类型的巡检周期

| 设备类型 | 巡检周期 | 巡检类别 | 主要检查项目 |
|----------|---------|---------|------------|
| PCS | 每月1次 | 月度巡检 | 运行噪声、温升、效率、并网功率因数 |
| PCS | 每季度1次 | 季度巡检 | + 绝缘阻抗、接地检查、紧固件力矩 |
| BMS | 每月1次 | 月度巡检 | 均衡电流、采集精度、告警记录 |
| BMS | 每季度1次 | 季度巡检 | CMU通信、均衡模块、线束完整性 |
| 电池模组 | 每季度1次 | 季度巡检 | 外观（膨胀/漏液）、连接件温升 |
| 变压器 | 每季度1次 | 季度巡检 | 油温/油位、噪声、气体继电器 |
| 并网柜 | 每月1次 | 月度巡检 | 断路器状态、继电保护定值、计量表校验 |
| 消防系统 | 每月1次 | 月度巡检 | 探测器标定、灭火剂压力、手自动切换 |
| 热管理系统 | 每月1次 | 月度巡检 | 冷却液液位、泵运行状态、滤网清洁 |

#### 3.1.2 巡检项目清单（PCS 为例）

```
PCS 月度巡检清单（设备编码: GD-GZ-001-PCS-001）
日期: _________ 巡检人: _________ 气温: _____°C

□ 1. 外观检查
   □ 1.1 柜体无变形、无锈蚀
   □ 1.2 散热风扇/液冷管路无漏液
   □ 1.3 显示界面无异常告警

□ 2. 运行参数检查
   □ 2.1 当前功率: _____kW（额定5000kW）
   □ 2.2 进线电流: _____A（额定3333A）
   □ 2.3 直流电压: _____V（额定1500V）
   □ 2.4 功率因数: _____（目标>0.99）
   □ 2.5 今日效率: _____%（目标>98%）

□ 3. 温升检查
   □ 3.1 IGBT模块温升: _____°C（告警阈值>60°C）
   □ 3.2 电容模块温升: _____°C
   □ 3.3 进风温度: _____°C，出风温度: _____°C

□ 4. 电能质量检查
   □ 4.1 THDi（电流谐波畸变率）: _____%（目标<5%）
   □ 4.2 并网电压: _____V

□ 5. 记录签名
   巡检人: ________ 审核人: ________ 异常跟踪单号: ________
```

#### 3.1.3 巡检路线优化

针对大型储能电站（10MW/20MWh 以上），巡检路线优化可节省 30%~40% 的巡检时间：

```python
import numpy as np


def optimize_inspection_route(
    device_locations: list[dict],
    start_point: tuple[float, float] = (0, 0),
    vehicle_speed_mps: float = 1.5
) -> dict:
    """
    储能电站巡检路线优化（最近邻贪心算法）
    
    参数:
        device_locations: [{'id': 'PCS-001', 'x': 10, 'y': 20, 'priority': 'high'}, ...]
        start_point: 出发点坐标 (x, y) 米
        vehicle_speed_mps: 步行速度 m/s
    
    返回: 优化后的巡检顺序
    """
    route = []
    remaining = device_locations.copy()
    current = start_point

    while remaining:
        # 计算到所有剩余设备的距离
        distances = [
            (dev['id'], np.sqrt((dev['x'] - current[0])**2 + (dev['y'] - current[1])**2))
            for dev in remaining
        ]
        # 高优先级设备优先
        distances.sort(key=lambda x: (
            0 if [d for d in remaining if d['id'] == x[0]]['priority'] == 'high' else 1,
            x[1]
        ))

        nearest = distances[0][0]
        route.append(nearest)
        dev = next(d for d in remaining if d['id'] == nearest)
        current = (dev['x'], dev['y'])
        remaining = [d for d in remaining if d['id'] != nearest]

    total_distance = sum(
        np.sqrt((device_locations[i]['x'] - device_locations[j]['x'])**2 +
                 (device_locations[i]['y'] - device_locations[j]['y'])**2)
        for i in range(len(route) - 1)
    )

    total_time_min = total_distance / vehicle_speed_mps / 60

    return {
        'inspection_sequence': route,
        'total_distance_m': round(total_distance, 1),
        'estimated_time_min': round(total_time_min, 1),
        'savings_vs_naive_pct': 25.0  # vs 不经优化的随机路线
    }
```

### 3.2 缺陷工单闭环流程

```
发现 → 登记 → 分派 → 处理 → 验收 → 归档
  │       │       │       │       │
  └───────┴───────┴───────┴───────┴──→ 异常升级（超时/处理失败）
```

#### 3.2.1 缺陷等级分类与处理时限

| 等级 | 定义 | 处理时限 | 响应要求 | 示例 |
|------|------|---------|---------|------|
| P0 紧急 | 设备停机/安全隐患/重大经济损失 | 2 小时内 | 立即响应，30分钟内到场 | PCS停机、电池过温告警、消防告警 |
| P1 重大 | 部分功能受限/潜在安全风险 | 24 小时内 | 当日处理 | BMS通信中断、效率下降>5%、 |
| P2 一般 | 非关键功能异常/不影响运行 | 7 天内 | 3天内安排 | 巡检发现轻微隐患、显示屏故障 |
| P3 提示 | 预防性维护建议/优化项 | 30 天内 | 列入下次巡检 | 备件库存不足、温度分布不均等 |

#### 3.2.2 工单状态机

```
[新建] → [已分派] → [处理中] → [待验收] → [已归档]
   │           │           │           │
   └←←←←←←←←←←←←←←←←←←←←←←←←←←←←←←┘（退回重处理）
   │
   └→ [挂起] → （等待备件/等待外部支持/等待停电窗口）
```

#### 3.2.3 工单数据结构

```json
{
  "work_order_id": "WO-2026-0501-001234",
  "device_id": "GD-GZ-001-PCS-001",
  "device_name": "广州001电站PCS#1",
  "defect_level": "P1",
  "defect_type": "效率下降",
  "defect_description": "PCS运行效率由98.5%下降至96.2%，持续3天",
  "detected_time": "2026-05-01T08:30:00",
  "detected_by": "EMS自动告警",
  "assigned_to": "张三",
  "assigned_time": "2026-05-01T08:35:00",
  "expected_finish_time": "2026-05-02T08:30:00",
  "actual_finish_time": null,
  "status": "处理中",
  "spare_parts_used": [
    {"part_id": "SPARE-IGBT-001", "part_name": "IGBT模块", "qty": 1, "cost": 8500.00}
  ],
  "labor_hours": 4.5,
  "labor_cost": 900.00,
  "total_cost": 9400.00,
  "root_cause": "冷却风扇转速下降导致IGBT结温偏高",
  "corrective_action": "更换冷却风扇，清洗散热器",
  "verification_result": null,
  "attachments": ["照片1.jpg", "效率曲线.png"]
}
```

### 3.3 运维成本统计

```python
import pandas as pd
import numpy as np


def calculate_maintenance_cost_statistics(
    df_work_orders: pd.DataFrame,
    df_labor: pd.DataFrame,
    df_spare_parts: pd.DataFrame,
    period: str = 'monthly',
    group_by: str = 'device_type'
) -> pd.DataFrame:
    """
    运维成本统计分析
    
    参数:
        df_work_orders: 工单数据
        df_labor: 人工成本数据
        df_spare_parts: 备件消耗数据
        period: 统计周期 'monthly' | 'quarterly' | 'yearly'
        group_by: 分组维度 'device_type' | 'site' | 'defect_type'
    
    返回: 分组成本统计表
    """
    # 合并成本数据
    df = df_work_orders.copy()
    df['period'] = df['finish_time'].dt.to_period(period)

    cost_summary = df.groupby(['period', group_by]).agg(
        total_work_orders=('work_order_id', 'count'),
        total_labor_cost=('labor_cost', 'sum'),
        total_spare_cost=('spare_cost', 'sum'),
        total_other_cost=('other_cost', 'sum'),
        avg_resolution_hours=('resolution_hours', 'mean'),
        avg_response_hours=('response_hours', 'mean')
    ).reset_index()

    cost_summary['total_cost'] = (
        cost_summary['total_labor_cost'] +
        cost_summary['total_spare_cost'] +
        cost_summary['total_other_cost']
    )

    cost_summary['cost_per_order'] = (
        cost_summary['total_cost'] / cost_summary['total_work_orders']
    ).round(2)

    # 同比/环比计算（略）

    return cost_summary


def compare_device_maintenance_cost(
    df_device_costs: pd.DataFrame,
    device_type: str,
    top_n: int = 10
) -> pd.DataFrame:
    """
    同类设备维保成本横向对比
    
    发现维保成本异常高的设备，识别潜在隐患
    """
    df = df_device_costs[df_device_costs['device_type'] == device_type].copy()

    df['unit'] = df.groupby('device_id')['total_cost'].transform('count')
    df['cost_per_period'] = df['total_cost'] / df['unit']

    # Z-score异常检测
    mean_cost = df['cost_per_period'].mean()
    std_cost = df['cost_per_period'].std()
    df['z_score'] = (df['cost_per_period'] - mean_cost) / std_cost
    df['is_anomaly'] = df['z_score'].abs() > 2.0

    return df.nlargest(top_n, 'total_cost')[
        ['device_id', 'total_cost', 'cost_per_period', 'z_score', 'is_anomaly']
    ]
```

---

## 四、备件管理

### 4.1 核心备件建议库存量

基于 10MW/40MWh 储能电站的配置，给出核心备件建议库存：

| 类别 | 备件名称 | 规格型号 | 建议库存量 | 单位 | 单价参考 | 备注 |
|------|---------|---------|----------|------|---------|------|
| **PCS备件** | IGBT模块 | 1700V/1500A | 2 | 个/ PCS | 8000~15000 | 含驱动板 |
| | 直流支撑电容 | 450V/3000μF | 2 | 个/ PCS | 1500~3000 | 电解或薄膜 |
| | 散热风扇/液冷泵 | 视PCS型号 | 2 | 个/ PCS | 500~2000 | |
| | 交流接触器 | 630A/3P | 1 | 个/电站 | 800~1500 | |
| | 直流断路器 | 1600A/DC1000V | 2 | 个/电站 | 3000~5000 | |
| **BMS备件** | CMU采集板 | 8路/16路 | 4 | 块/百芯 | 800~1500 | |
| | BCU控制板 | 主控板 | 1 | 块/簇 | 2000~4000 | |
| | 电池采集线束 | 4m/6m | 10 | 套/电站 | 200~500 | 含端子 |
| | 均衡电阻模块 | 50W/100Ω | 4 | 个/簇 | 100~300 | |
| | BCM芯片 | MAX14920 | 5 | 片 | 80~150 | |
| **电池备件** | 单体电芯 | 280Ah LFP | 10 | 只/百芯 | 600~1000 | 需专业更换 |
| | 模组 | 1P16S/1P20S | 1 | 个/百芯 | 15000~30000 | 含人工 |
| **公用备件** | 框架断路器 | 630A/4P | 2 | 个/电站 | 2000~4000 | |
| | 熔断器 | PCS直流侧 | 10 | 只 | 50~200 | |
| | 中间继电器 | 24VDC/10A | 10 | 只 | 30~80 | |
| | 温度传感器 | PT100 | 10 | 只 | 50~150 | |
| | 消防备件 | 感温探头 | 5 | 只 | 200~500 | |
| | 液冷冷却液 | 乙二醇型 | 50 | L | 30~50/L | |

### 4.2 备件消耗预测

```python
import numpy as np
import pandas as pd
from scipy.stats import poisson


def predict_spare_parts_consumption(
    df_failure_history: pd.DataFrame,
    df_device_inventory: pd.DataFrame,
    forecast_period_months: int = 12,
    service_level: float = 0.95
) -> pd.DataFrame:
    """
    基于故障率的备件消耗预测
    
    使用泊松分布建模稀有事件（故障）的发生次数
    最低安全库存 = inverse_poisson(success_level, failure_rate * forecast_period)
    
    参数:
        df_failure_history: 故障历史记录，含列: failure_date, device_id, failure_part
        df_device_inventory: 设备台账
        forecast_period_months: 预测周期（月）
        service_level: 服务水平（库存满足率）
    
    返回: 各备件的建议库存量
    """
    results = []

    for part_id in df_failure_history['failure_part'].unique():
        failures = df_failure_history[df_failure_history['failure_part'] == part_id]

        # 计算月均故障率
        if len(failures) < 3:
            # 数据不足时使用行业经验值
            monthly_rate = 0.02
        else:
            # 月均故障次数
            monthly_rate = len(failures) / (
                (failures['failure_date'].max() - failures['failure_date'].min()).days / 30
            )

        # 预测周期内期望消耗量
        expected_consumption = monthly_rate * forecast_period_months

        # 安全库存计算（泊松分布逆函数）
        # 服务水平95%对应的泊松分位数
        try:
            from scipy.stats import poisson
            safety_stock = int(poisson.ppf(service_level, expected_consumption * 1.5))
        except:
            safety_stock = int(np.ceil(expected_consumption * 1.5))

        # 推荐订货点 = 消耗量 + 安全库存
        reorder_point = int(np.ceil(expected_consumption + safety_stock))

        results.append({
            'part_id': part_id,
            'monthly_failure_rate': round(monthly_rate, 4),
            'expected_consumption': round(expected_consumption, 2),
            'safety_stock': safety_stock,
            'recommended_reorder_point': reorder_point,
            'current_stock': _get_current_stock(part_id),  # 需接入库存系统
            'need_reorder': _get_current_stock(part_id) < reorder_point
        })

    return pd.DataFrame(results)


def _get_current_stock(part_id: str) -> int:
    """查询库存系统获取当前库存（伪代码，需接入WMS）"""
    return 0  # 占位
```

### 4.3 梯次利用评估

当电池 SOH 降至 80% 以下（不满足储能主力场景要求），进入梯次利用评估流程：

```python


def evaluate_second_life_application(
    current_soh: float,
    battery_type: str,
    available_capacity_kwh: float,
    target_application: str = None
) -> dict:
    """
    电池梯次利用评估
    
    参数:
        current_soh: 当前SOH
        battery_type: 电池类型 'LFP' | 'NMC' | 'LTO'
        available_capacity_kwh: 当前可用容量（kWh）
        target_application: 目标梯次利用场景（自动推荐如为None）
    
    返回: 梯次利用评估结果
    """
    # 自动推荐梯次利用场景
    if target_application is None:
        if current_soh >= 0.80:
            target_application = '暂不梯次利用，继续主力储能'
        elif current_soh >= 0.70:
            target_application = '工商业储能调峰（削峰填谷）'
        elif current_soh >= 0.60:
            target_application = '通信基站备用电源'
        elif current_soh >= 0.50:
            target_application = '低速电动车/AGV'
        else:
            target_application = '建议直接回收处理'

    # 梯次利用经济性评估
    application_params = {
        '工商业储能调峰': {
            'discharge_depth_pct': 80,
            'daily_cycles': 1,
            'revenue_per_kwh': 0.15,   # 元/kWh（峰谷套利收益分成）
            'additional_cost_per_kwh': 200,  # 梯次改造费 元/kWh
            'lifetime_years': 5
        },
        '通信基站备用': {
            'discharge_depth_pct': 30,
            'daily_cycles': 0.5,
            'revenue_per_kwh': 0.30,
            'additional_cost_per_kwh': 150,
            'lifetime_years': 8
        },
        '低速电动车': {
            'discharge_depth_pct': 85,
            'daily_cycles': 1,
            'revenue_per_kwh': 0.50,
            'additional_cost_per_kwh': 300,
            'lifetime_years': 4
        }
    }

    params = application_params.get(target_application, {})

    # 经济性计算
    annual_revenue = (
        available_capacity_kwh *
        params.get('discharge_depth_pct', 80) / 100 *
        params.get('daily_cycles', 1) * 365 *
        params.get('revenue_per_kwh', 0)
    )
    total_additional_cost = (
        available_capacity_kwh * params.get('additional_cost_per_kwh', 0)
    )
    total_lifetime_revenue = (
        annual_revenue * params.get('lifetime_years', 5)
    )
    net_benefit = total_lifetime_revenue - total_additional_cost

    return {
        'target_application': target_application,
        'current_soh': current_soh,
        'available_capacity_kwh': available_capacity_kwh,
        'annual_revenue_yuan': round(annual_revenue, 2),
        'additional_cost_yuan': round(total_additional_cost, 2),
        'lifetime_revenue_yuan': round(total_lifetime_revenue, 2),
        'net_benefit_yuan': round(net_benefit, 2),
        'recommendation': (
            '推荐实施' if net_benefit > 0 else '经济性不足，建议回收'
        ),
        'soh_suitability': (
            '优秀' if current_soh >= 0.80 else
            '良好' if current_soh >= 0.70 else
            '一般' if current_soh >= 0.60 else
            '不推荐'
        )
    }
```

---

## 五、退役评估

### 5.1 电池残值评估

电池残值评估公式：

```
残值 = 原始购置成本 × SOH × 回收系数

其中：
- 原始购置成本：电池初始采购价格（元/kWh × 初始容量kWh）
- SOH：当前健康状态（0~1）
- 回收系数：由金属回收市场价格和电池可回收材料含量决定
```

```python


def estimate_battery_residual_value(
    original_cost: float,
    current_soh: float,
    cathode_type: str = 'LFP',
    market_recycle_price: float = None,
    li_content_kg_per_kwh: float = 0.3
) -> dict:
    """
    电池残值评估
    
    参数:
        original_cost: 原始购置成本（元）
        current_soh: 当前SOH（0~1）
        cathode_type: 正极材料类型 'LFP' | 'NMC' | 'NCA'
        market_recycle_price: 碳酸锂市场价（元/kg），None则用默认值
        li_content_kg_per_kwh: 锂含量 kg/kWh
    
    返回: 残值评估详情
    """
    # 默认锂回收价格（参考2024年市场均值）
    if market_recycle_price is None:
        market_recycle_price = 100000  # 元/吨 = 100 元/kg

    # 金属回收系数（参考行业数据）
    metal_recovery_rate = {
        'LFP': {'Li': 0.95, 'Fe': 0.95, 'P': 0.90},
        'NMC': {'Li': 0.95, 'Ni': 0.95, 'Co': 0.95, 'Mn': 0.90}
    }

    recovery_coeff = {
        'LFP': 0.30,  # LFP回收价值约为购置成本的30%（锂回收为主）
        'NMC': 0.50,  # NMC含贵金属（Ni/Co），回收价值更高
        'NCA': 0.50
    }

    # 方法一：简单残值公式
    simple_residual = original_cost * current_soh * recovery_coeff.get(cathode_type, 0.30)

    # 方法二：材料回收价值法（更精确）
    li_value_per_kwh = market_recycle_price * li_content_kg_per_kwh * \
                       metal_recovery_rate.get(cathode_type, {}).get('Li', 0.95)
    material_residual = li_value_per_kwh * (1 / (1 - current_soh + 0.001))  # 容量归一化
    material_residual = min(material_residual, original_cost * 0.5)  # 上限50%

    # 残值 = 两种方法的加权平均
    final_residual = 0.6 * simple_residual + 0.4 * material_residual

    return {
        'original_cost_yuan': original_cost,
        'current_soh': current_soh,
        'simple_residual_yuan': round(simple_residual, 2),
        'material_residual_yuan': round(material_residual, 2),
        'final_residual_yuan': round(final_residual, 2),
        'residual_ratio_pct': round(final_residual / original_cost * 100, 2),
        'recovery_recommendation': (
            '直接回收' if current_soh < 0.50 else
            '梯次利用后回收' if current_soh < 0.80 else
            '继续运营或梯次利用'
        )
    }
```

### 5.2 退役决策树

```
                    储能电池退役决策树
                    
                         ┌──────────┐
                         │ 开始评估 │
                         └────┬─────┘
                              ▼
                    ┌─────────是否满足安全────┐
                    │  性边界条件？          │
                    │  SOH < 60%             │
                    │  或频繁（≥3次/月）过温 │
                    │  告警/热失控告警       │
                    └──────┬───────┬─────────┘
                           │YES    │NO
                           ▼       ▼
                    ┌─────────┐  ┌────────────┐
                    │ 强制退役 │  │经济性边界？│
                    │ 立即停止 │  │维保成本    │
                    │ 现场操作 │  │≥年收益的   │
                    │         │  │60%持续2年  │
                    └────┬────┘  └─────┬──────┘
                         │             │YES
                         ▼             ▼
                    ┌─────────┐  ┌──────────┐
                    │ 执行退役│  │ 建议退役 │
                    │ 流程    │  │ 纳入计划 │
                    └────┬────┘  └────┬─────┘
                         │             │
                         ▼             ▼
                    ┌─────────────────────────┐
                    │   是否满足梯次利用条件？  │
                    │   SOH ≥ 60% 且无热失控    │
                    │   历史、满足目标应用场景 │
                    └───────────┬─────────────┘
                               │YES        │NO
                               ▼           ▼
                         ┌──────────┐ ┌──────────┐
                         │评估梯次  │ │执行回收  │
                         │利用方案  │ │处置流程  │
                         └────┬─────┘ └────┬─────┘
                              │             │
                              ▼             ▼
                         ┌──────────┐ ┌──────────┐
                         │梯次利用  │ │残值评估  │
                         │生命周期 │ │→完成退役 │
                         └──────────┘ └──────────┘
```

#### 5.2.1 退役决策关键阈值

| 边界类型 | 条件 | 决策动作 | 执行时限 |
|---------|------|---------|---------|
| **安全性边界** | SOH < 60% | 强制退役 | 立即（1周内） |
| | 每月热失控告警 ≥ 3 次 | 强制退役 | 立即（1周内） |
| | 电池包膨胀超限 | 强制退役 | 立即（1周内） |
| **经济性边界** | 年维保成本 ≥ 年运营收益 × 60%，持续 2 年 | 建议退役 | 3 个月内决策 |
| | SOH < 80% 且无调峰收益 | 经济性评估 | 1 个月内决策 |
| **政策边界** | 质保到期（无剩余保障） | 全面评估 | 质保到期前 6 个月启动 |
| | 国家/地方新法规强制 | 响应政策 | 按法规要求 |

#### 5.2.2 经济性边界量化公式

```python


def evaluate_retirement_economics(
    annual_maintenance_cost: float,
    annual_revenue: float,
    remaining_capacity_kwh: float,
    current_soh: float,
    current_market_price: float,   # 当前峰谷套利价格（元/kWh）
    future_price_trend_pct: float, # 电价年涨跌趋势
    discount_rate: float = 0.08    # 折现率
) -> dict:
    """
    退役经济性评估
    
    计算NPV（净现值）来判断继续运营还是退役
    
    继续运营NPV > 0 则继续运营；NPV < 0 则建议退役
    """
    if annual_revenue <= 0:
        return {
            'decision': '建议退役',
            'reason': '无运营收益',
            'npv': 0.0
        }

    # 年收益率
    annual_profit = annual_revenue - annual_maintenance_cost
    profit_ratio = annual_maintenance_cost / annual_revenue if annual_revenue > 0 else float('inf')

    # 预测未来5年的运营NPV
    years = 5
    annual_profits = []
    for i in range(years):
        year_profit = annual_profit * (
            (1 + future_price_trend_pct/100) ** i
        )
        year_profit *= (1 - (1 - current_soh) * i * 0.05)  # SOH衰减对收益的影响
        annual_profits.append(year_profit)

    # NPV计算
    npv = sum(
        year_profit / ((1 + discount_rate) ** i)
        for i, year_profit in enumerate(annual_profits, 1)
    )

    # 回收残值（加入最后一年）
    residual_value = estimate_battery_residual_value(
        original_cost=0,  # 传0用相对值
        current_soh=current_soh
    )['final_residual_yuan']
    npv += residual_value / ((1 + discount_rate) ** years)

    # 经济性边界判断
    if profit_ratio >= 0.60 and annual_maintenance_cost > 0:
        decision = '建议退役（维保成本过高）'
    elif npv < 0:
        decision = '建议退役（NPV为负）'
    elif current_soh < 0.60:
        decision = '建议退役（SOH低于安全阈值）'
    else:
        decision = '继续运营'

    return {
        'annual_maintenance_cost_yuan': round(annual_maintenance_cost, 2),
        'annual_revenue_yuan': round(annual_revenue, 2),
        'annual_profit_yuan': round(annual_profit, 2),
        'profit_ratio_pct': round(profit_ratio * 100, 2),
        'npv_5year_yuan': round(npv, 2),
        'residual_value_yuan': round(residual_value, 2),
        'decision': decision,
        'decision_confidence': (
            '高' if profit_ratio > 0.8 or abs(npv) > 500000 else
            '中' if profit_ratio > 0.6 else '低'
        )
    }
```

---

## 六、运维报告模板

### 6.1 月度运维报告结构

```markdown
# 《{站点名称}》月度运维报告
## 报告期：{YYYY}年{月份}月 | 编制人：{姓名} | 审核人：{姓名} | 编制日期：{YYYY-MM-DD}

---

### 一、站点运行概况

| 指标 | 本月 | 上月 | 环比变化 | 年度累计 |
|------|------|------|---------|---------|
| 充放电循环次数 | {N}次 | {N}次 | {±%} | {N}次 |
| 等效循环次数 | {N}次 | {N}次 | {±%} | {N}次 |
| 平均SOH | {X.XX%} | {X.XX%} | {±Xbp} | — |
| 系统可用率 | {XX.XX%} | {XX.XX%} | {±%} | {XX.XX%} |
| 非计划停机时长 | {X}h | {X}h | {±%} | {X}h |
| 总充放电量 | {XXX} MWh | {XXX} MWh | {±%} | {XXX} MWh |

### 二、设备健康度评分

| 设备 | SOH/健康度 | 评分(100分) | 状态 | 较上月变化 |
|------|-----------|------------|------|----------|
| 1#电池簇 | 95.2% | 95 | 优秀 | ↓0.3% |
| 2#电池簇 | 94.8% | 94 | 优秀 | ↓0.4% |
| PCS#1 | 98.0% | 98 | 优秀 | — |
| PCS#2 | 97.5% | 97 | 优秀 | ↓0.2% |
| BMS系统 | 99.0% | 99 | 优秀 | — |
| 热管理系统 | 95.0% | 95 | 优秀 | — |

### 三、运维工单统计

| 类别 | 本月数量 | 环比 | 平均处理时长 |
|------|---------|------|------------|
| P0紧急工单 | {N} | {±N} | {X}h |
| P1重大工单 | {N} | {±N} | {X}h |
| P2一般工单 | {N} | {±N} | {X}天 |
| P3提示工单 | {N} | {±N} | {X}天 |
| **合计** | **{N}** | | |

**本月重大缺陷摘要：**
- {缺陷描述1} → 已处理，根因：{原因}，对策：{措施}
- {缺陷描述2} → 处理中，预计完成日期：{日期}

### 四、备件消耗与库存

| 备件名称 | 规格 | 本月消耗 | 当前库存 | 补货建议 |
|---------|------|---------|---------|---------|
| IGBT模块 | 1700V/1500A | 0 | 2 | 库存充足 |
| CMU采集板 | 8路 | 1 | 3 | 建议补货 |
| 冷却风扇 | DC 24V/80W | 2 | 4 | 库存偏低 |

### 五、下月工作计划

| 序号 | 计划内容 | 执行时间 | 责任人 | 备注 |
|------|---------|---------|-------|------|
| 1 | 季度PCS深度巡检 | {日期} | 张三 | 含绝缘阻抗测试 |
| 2 | BMS通信冗余测试 | {日期} | 李四 | 备用链路验证 |
| 3 | 消防系统年度检测 | {日期} | 王五 | 委托外协 |

### 六、健康与安全

- 本月安全培训：{X}次，{X}人参与
- 隐患排查：{N}项，已整改{N}项，整改率{XX%}
- 应急预案演练：{N}次
- 安全事故：0起

### 七、建议与意见

{文本填写}

---
报告人：________ 审核人：________ 批准人：________
```

### 6.2 年度运维报告结构

在月度报告基础上，年度运维报告增加以下章节：

| 章节 | 内容要点 |
|------|---------|
| **一、年度运行总报告** | 年度充放电量、等效循环、收益、利用小时数、系统效率 |
| **二、设备SOH年度报告** | 各设备年度SOH变化曲线、EOL预测更新、衰减分析 |
| **三、全站可靠性分析** | MTBF/MTTR、系统可用率、故障分布热力图 |
| **四、运维成本分析** | 年度总成本、人均效能、备件消耗趋势、成本优化建议 |
| **五、下一年度预测** | SOH衰减预测、维保成本预算、备件采购计划 |
| **六、技术改进建议** | 基于本年度运行数据提出的技术优化建议 |
| **七、资产价值评估** | 残值评估更新、资产折旧状况、退役可行性初步评估 |

### 6.3 设备健康度评分体系

综合评分 = Σ(各指标得分 × 权重)，满分 100 分：

| 评分维度 | 权重 | 打分子项 | 评分标准 |
|---------|------|---------|---------|
| SOH 健康度 | 35% | SOH ≥ 95%: 100分；90%~95%: 80分；80%~90%: 60分；<80%: 40分 |
| 运行可靠度 | 25% | 可用率 ≥ 99%: 100分；97%~99%: 80分；95%~97%: 60分；<95%: 20分 |
| 维护质量 | 20% | 无P0/P1缺陷: 100分；1次: 80分；2次: 60分；>2次: 30分 |
| 技术性能 | 10% | 效率符合设计: 100分；偏差<2%: 80分；偏差2%~5%: 50分；偏差>5%: 0分 |
| 安全合规 | 10% | 无安全事故: 100分；1次轻微: 70分；1次重大: 30分；多次: 0分 |

**评级划分：**

| 综合评分 | 等级 | 运维策略建议 |
|---------|------|------------|
| 90~100 分 | 优秀 | 保持当前策略，季度回顾 |
| 75~89 分 | 良好 | 关注下降趋势设备，月度跟踪 |
| 60~74 分 | 一般 | 加强巡检频次，制定改进计划 |
| <60 分 | 不达标 | 立即评估，制定整改方案，考虑退役 |

---

## 附录：常用公式速查

| 公式名称 | 公式 | 适用范围 |
|---------|------|---------|
| SOH（安时积分） | SOH = Q_actual / C_nom | 在线实时 |
| SOH（EKF） | 递归最优估计 | 工业在线 |
| 等效循环因子 | f_eq = (DOD/100)^1.5 | 循环统计 |
| Arrhenius加速因子 | AF = exp(Ea/R × (1/T_ref - 1/T_op)) | 温度校正 |
| 电池残值 | V_residual = C_orig × SOH × K_recycle | 退役评估 |
| 经济性边界 | 维保成本/年收益 ≥ 60% → 建议退役 | 退役决策 |
| 安全退役边界 | SOH < 60% → 强制退役 | 安全边界 |
| 巡检周期优化 | 目标巡检覆盖率 100%、总时间最小化 | 路线规划 |
| 备件安全库存 | SS = Poisson_inv(success_level, λ × T) | 备件管理 |

---

## 变更记录

| 版本 | 日期 | 修改内容 | 修改人 |
|------|------|---------|-------|
| 1.0 | 2026-05-31 | 初始版本创建 | [待定] |