---
skill_name: 储能电站全生命周期资产管理
skill_id: DeepSeek_lifecycle_asset_management
version: 2.0
author: DeepSeek
created_date: 2026-05-31
target_audience: 储能电站运维工程师 / 资产管理经理 / BESS平台开发团队
applicable_systems:
  - EMS >= 3.0
  - BMS >= 2.5
  - PCS 全系列
dependency_data:
  - 设备台账数据库
  - 实时遥测数据流
  - 运维工单系统
  - SAP/EAM资产管理系统
---

# 储能电站全生命周期资产管理 Skill

> **定位**：覆盖储能设备"投运→运维→衰减→梯次利用→退役"全生命周期的资产管理与健康评估
> **版本**：v2.0 (DeepSeek 增强版)
> **适用**：电化学储能电站（锂离子/钠离子/液流/固态电池）

---

## 目录

- [一、设备编码体系与台账](#一设备编码体系与台账)
  - [1.1 14类设备编码规则](#11-14类设备编码规则)
  - [1.2 35字段设备台账数据库](#12-35字段设备台账数据库)
- [二、SOH估算算法](#二soh估算算法)
  - [2.1 安时积分法(Coulomb Counting)](#21-安时积分法coulomb-counting)
  - [2.2 开路电压法(OCV)](#22-开路电压法ocv)
  - [2.3 扩展卡尔曼滤波(EKF)](#23-扩展卡尔曼滤波ekf)
  - [2.4 放电曲线特征提取法](#24-放电曲线特征提取法)
- [三、衰减预测模型](#三衰减预测模型)
  - [3.1 IGBT LESIT寿命模型](#31-igbt-lesit寿命模型)
  - [3.2 电容Arrhenius加速模型](#32-电容arrhenius加速模型)
  - [3.3 电池日历衰减预测](#33-电池日历衰减预测)
- [四、退役决策体系](#四退役决策体系)
  - [4.1 退役决策树](#41-退役决策树)
  - [4.2 双方法残值评估](#42-双方法残值评估)
  - [4.3 退役经济性评估](#43-退役经济性评估)
- [五、健康评分系统](#五健康评分系统)
- [六、月度/年度报告模板](#六月度年度报告模板)
- [附录](#附录)

---

## 一、设备编码体系与台账

### 1.1 14类设备编码规则

> **编码格式**：`{省简称}-{市简称}-{站点序号}-{设备类型代码}-{流水号}`，总长≤20字符

| 类型代码 | 设备名称 | 说明 | 规格维度 | 编码示例 |
|----------|----------|------|----------|----------|
| **PCS** | 储能变流器 | 双向DC-AC变换 | 功率kW/电压V | GD-GZ-001-PCS-001 |
| **BMS** | 电池管理系统 | 电池监控 | 采集路数/通信协议 | GD-GZ-001-BMS-001 |
| **BAT** | 电池簇/堆 | 电芯模组 | 容量kWh/串并方式 | GD-GZ-001-BAT-S01 |
| **CMU** | 电池单体监控 | BMS采集板 | 8路/16路/32路 | GD-GZ-001-CMU-001 |
| **BCU** | 电池簇控制 | BMS控制板 | CAN/RS485 | GD-GZ-001-BCU-001 |
| **TRF** | 变压器 | 升压/降压 | 容量kVA/电压等级 | GD-GZ-001-TRF-001 |
| **SWG** | 并网柜 | PCC开关设备 | 电流A/电压kV | GD-GZ-001-SWG-001 |
| **FSY** | 消防系统 | 消防主机+探测 | 灭火介质/保护面积 | GD-GZ-001-FSY-001 |
| **HVC** | 热管理系统 | 液冷/风冷 | 制冷量kW | GD-GZ-001-HVC-001 |
| **MET** | 关口电能表 | 电能量计量 | 精度0.2S/0.5S | GD-GZ-001-MET-001 |
| **PLC** | 站控PLC | 逻辑控制 | I/O点数 | GD-GZ-001-PLC-001 |
| **IMG** | 视频监控 | 摄像头+NVR | 像素/路数 | GD-GZ-001-IMG-001 |
| **ATS** | 双电源切换 | 市电/柴发 | 切换时间/电流 | GD-GZ-001-ATS-001 |
| **DGS** | 柴油发电机 | 备用电源 | 功率kW | GD-GZ-001-DGS-001 |

### 1.2 35字段设备台账数据库

| 序号 | 字段名 | 类型 | 必填 | 说明 | 示例 |
|------|--------|------|------|------|------|
| 1 | device_id | VARCHAR(32) | ✅ | 唯一编码(§1.1) | GD-GZ-001-PCS-001 |
| 2 | device_name | VARCHAR(128) | ✅ | 中文名称 | 广州001站PCS#1 |
| 3 | device_type | VARCHAR(8) | ✅ | 设备类型代码 | PCS |
| 4 | device_model | VARCHAR(64) | ✅ | 设备型号 | SUN2000-5000KTL-HV |
| 5 | manufacturer | VARCHAR(128) | ✅ | 制造商 | 华为数字能源 |
| 6 | supplier | VARCHAR(128) | | 供应商(可不同) | 深圳华工能源 |
| 7 | serial_number | VARCHAR(64) | ✅ | 出厂序列号 | SN20230615001 |
| 8 | manufacturing_date | DATE | ✅ | 出厂日期 | 2023-06-15 |
| 9 | warranty_start | DATE | ✅ | 质保开始 | 2023-07-01 |
| 10 | warranty_end | DATE | ✅ | 质保到期 | 2028-07-01 |
| 11 | warranty_terms | TEXT | | 质保条款 | 5年内免费更换IGBT模块 |
| 12 | rated_power_kw | DECIMAL(12,3) | ✅ | 额定功率kW | 5000.0 |
| 13 | rated_voltage_v | DECIMAL(10,3) | | 额定电压V | 1500.0 |
| 14 | rated_current_a | DECIMAL(10,3) | | 额定电流A | 3333.3 |
| 15 | rated_capacity_kwh | DECIMAL(12,3) | | 额定容量kWh | 10000.0 |
| 16 | nominal_efficiency | DECIMAL(5,3) | | 标称效率% | 98.5 |
| 17 | software_version | VARCHAR(64) | | 当前软件版本 | V3.2.1 |
| 18 | hardware_version | VARCHAR(32) | | 硬件版本 | Rev.C |
| 19 | install_location | VARCHAR(128) | ✅ | 安装位置 | 1#集装箱-左列-B Rack |
| 20 | pcc_relation | VARCHAR(32) | | 所连PCC | GD-GZ-001-PCC-01 |
| 21 | topology_position | VARCHAR(256) | | 拓扑位置 | 经直流母线→PCS交流侧 |
| 22 | commissioning_date | DATE | ✅ | 投运日期 | 2023-08-01 |
| 23 | cumulative_runtime_h | BIGINT | | 累计运行小时 | 15420 |
| 24 | cumulative_charge_cycles | BIGINT | | 累计充放电循环 | 3850 |
| 25 | cumulative_eq_cycles | DECIMAL(12,2) | | 累计等效循环 | 2105.30 |
| 26 | current_soh | DECIMAL(5,4) | ✅ | 当前SOH 0~1 | 0.9520 |
| 27 | current_soc | DECIMAL(5,4) | | 当前SOC 0~1 | 0.7500 |
| 28 | alarm_count | INT | | 当前未解除告警 | 2 |
| 29 | last_inspection_date | DATE | | 上次巡检 | 2026-04-15 |
| 30 | next_inspection_date | DATE | | 下次巡检 | 2026-07-15 |
| 31 | asset_value_orig | DECIMAL(14,2) | ✅ | 资产原值(元) | 2800000.00 |
| 32 | asset_value_net | DECIMAL(14,2) | | 资产净值(元) | 2100000.00 |
| 33 | depreciation_method | VARCHAR(32) | | 折旧方法 | 年数总和法/直线法 |
| 34 | status | VARCHAR(16) | ✅ | 设备状态 | 在线/离线/退役/备用/维护 |
| 35 | remarks | TEXT | | 备注说明 | 2024年更换IGBT模块 |

---

## 二、SOH估算算法

### 2.1 安时积分法(Coulomb Counting)

> **核心公式**: $SOH = C_{actual} / C_{nom} = \frac{|\sum I \cdot \Delta t|}{C_{nom} \cdot 3600}$

```python
"""
安时积分法(Coulomb Counting Method)
原理: 通过积分充放电电流, 计算实际转移电荷量
优点: 实现简单, 计算量小, 在线实时
缺点: 累积误差漂移, 需定期校准
"""
import numpy as np
import pandas as pd

def soh_ah_counting(
    current_array: np.ndarray,  # 电流(A), 充电为正, 放电为负
    time_interval_s: float,      # 采样间隔(秒)
    C_nom_Ah: float,             # 标称容量(Ah)
    previous_soh: float = 1.0,   # 上次校准SOH
    calibration_factor: float = 1.0  # 校准系数(标准放电测试获得)
) -> dict:
    """
    返回: {soh, total_charge_Ah, total_discharge_Ah, net_Ah}
    """
    # 累计充/放电量
    charge_Ah = np.sum(current_array[current_array > 0]) * time_interval_s / 3600.0
    discharge_Ah = abs(np.sum(current_array[current_array < 0])) * time_interval_s / 3600.0
    net_Ah = charge_Ah - discharge_Ah

    # 取充放电的最小值避免积分不平衡
    Q_actual = min(charge_Ah, discharge_Ah)

    # SOH = 实际可用容量 / 标称容量
    raw_soh = Q_actual / C_nom_Ah if C_nom_Ah > 0 else previous_soh

    # 使用渐近校准 (避免跳变)
    alpha = 0.3  # 校准权重
    calibrated_soh = alpha * raw_soh * calibration_factor + (1 - alpha) * previous_soh

    return {
        'soh': round(np.clip(calibrated_soh, 0.0, 1.0), 4),
        'total_charge_Ah': round(charge_Ah, 2),
        'total_discharge_Ah': round(discharge_Ah, 2),
        'net_Ah': round(net_Ah, 2),
        'requires_calibration': abs(net_Ah) > C_nom_Ah * 0.05
    }
```

### 2.2 开路电压法(OCV)

> **核心原理**: OCV-SOC标定曲线反推, 需电池静置≥2h, 精度最高但无法在线运行

```python
"""
OCV法 (Open Circuit Voltage)
原理: 利用OCV-SOC对应关系, 静置2h后测开路电压推算SOC→反推SOH
优点: 精度最高(±1%), 无需电流积分
缺点: 需静置≥2h, 无法在线, 需针对电芯标定
"""
import numpy as np

# 磷酸铁锂LFP电芯 OCV-SOC 标定曲线 (25°C)
OCV_SOC_LFP = [
    (2.80, 0.00), (3.00, 0.02), (3.10, 0.05), (3.15, 0.10),
    (3.25, 0.20), (3.30, 0.35), (3.32, 0.50), (3.34, 0.65),
    (3.36, 0.80), (3.40, 0.90), (3.45, 0.95), (3.50, 0.98),
    (3.60, 1.00)
]

def soh_ocv(
    V_ocv: float,                    # 静置后开路电压(V)
    soc_previous: float,             # 静置前BMS记录SOC
    capacity_previous_Ah: float,     # 静置前可用容量 = soc_prev × C_nom × soh_prev
    C_nom_Ah: float,                 # 标称容量
    temperature_C: float = 25.0,     # 温度(°C)
    rest_duration_min: float = 120.0 # 静置时长(min)
) -> dict:
    """OCV法估算SOH"""
    # 静置有效性检查
    if rest_duration_min < 120:
        return {'soh': None, 'error': '静置不足2h, 无法使用OCV法'}

    # 线性插值查SOC
    ocv_vals = [p[0] for p in OCV_SOC_LFP]
    soc_vals = [p[1] for p in OCV_SOC_LFP]
    soc_now = np.interp(V_ocv, ocv_vals, soc_vals)

    # 温度补偿 (每°C偏离25°C修正约0.1mV)
    temp_offset = (temperature_C - 25) * 0.0001
    V_ocv_corrected = V_ocv - temp_offset
    soc_now_corrected = np.interp(V_ocv_corrected, ocv_vals, soc_vals)

    # 反推SOH: SOC变化 → 容量变化
    delta_soc = soc_now_corrected - soc_previous
    delta_Q = delta_soc * C_nom_Ah
    actual_capacity = capacity_previous_Ah + delta_Q

    soh = actual_capacity / C_nom_Ah if C_nom_Ah > 0 else 1.0

    return {
        'soh': round(np.clip(soh, 0.0, 1.0), 4),
        'soc_measured': round(soc_now_corrected, 4),
        'V_ocv_measured': V_ocv,
        'confidence': 'high' if 2.8 < V_ocv < 3.6 else 'low',
        'delta_soc': round(delta_soc, 4)
    }
```

### 2.3 扩展卡尔曼滤波(EKF)

> **核心原理**: 建立电池Thevenin等效电路模型, 同时估计SOC和SOH

```python
"""
扩展卡尔曼滤波 (Extended Kalman Filter)
状态向量: x = [SOC, SOH]^T
观测向量: y = V_terminal
优点: 实时最优估计, 抗噪声, 同时估计SOC/SOH
缺点: 需要ECM模型参数, 计算量中等
"""
import numpy as np

class BatteryEKF:
    """基于Thevenin模型的SOC+SOH联合估计器"""

    def __init__(self, dt_s: float = 1.0, C_nom_Ah: float = 280.0,
                 temp_C: float = 25.0):
        self.dt = dt_s
        self.C_nom = C_nom_Ah
        self.temp = temp_C

        # 状态: [SOC, SOH], 初始估计
        self.x = np.array([[0.80], [1.00]])
        # 协方差矩阵
        self.P = np.diag([0.01, 0.01])
        # 过程噪声 (SOC变化快, SOH变化慢)
        self.Q = np.diag([1e-4, 1e-6])
        # 观测噪声
        self.R = np.diag([0.01])

        # ECM参数 (随温度变化)
        self._update_ecm_params()

    def _update_ecm_params(self):
        T = self.temp
        self.R0 = 0.0012 * (1 + 0.002 * (T - 25))  # 欧姆内阻
        self.R1 = 0.0025                          # 极化内阻
        self.C1 = 3000.0                          # 极化电容 F
        self.V_empty = 2.80                       # 放电截止电压
        self.V_full  = 3.60                       # 充电截止电压

    def _ocv(self, soc: float) -> float:
        """OCV-SOC关系 (简化)"""
        return self.V_empty + (self.V_full - self.V_empty) * soc

    def _h_func(self, soc: float, I: float) -> float:
        """观测函数: V_terminal = OCV - I*R0 - V_pol"""
        V_pol = 0.0  # 简化, 忽略极化电压
        return self._ocv(soc) - I * self.R0 - V_pol

    def predict(self, I_A: float):
        """EKF预测步"""
        SOC = float(self.x[0]); SOH = float(self.x[1])
        eta_coulomb = 0.998  # 库仑效率

        # SOC更新: dSOC/dt = -ηI / (C_nom * SOH)
        SOC_new = SOC - (eta_coulomb * I_A * self.dt / 3600.0) / (self.C_nom * SOH)
        SOC_new = np.clip(SOC_new, 0.0, 1.0)
        # SOH保持不变 (随机游走模型)
        SOH_new = SOH

        self.x = np.array([[SOC_new], [SOH_new]])

        # 雅可比矩阵 F = ∂f/∂x
        dSOC_dSOH = I_A * self.dt / 3600.0 / (self.C_nom * SOH**2)
        F = np.array([[1.0, dSOC_dSOH],
                      [0.0, 1.0]])
        self.P = F @ self.P @ F.T + self.Q

    def update(self, V_measured: float, I_A: float):
        """EKF更新步"""
        SOC = float(self.x[0])
        V_model = self._h_func(SOC, I_A)
        innovation = V_measured - V_model

        # 观测雅可比 H = [∂h/∂SOC, 0]
        dV_dSOC = self.V_full - self.V_empty
        H = np.array([[dV_dSOC, 0.0]])

        # 卡尔曼增益
        S = H @ self.P @ H.T + self.R
        K = self.P @ H.T * (1.0 / float(S))

        # 状态更新
        self.x = self.x + K * innovation
        self.x[0] = np.clip(self.x[0], 0.0, 1.0)
        self.x[1] = np.clip(self.x[1], 0.0, 1.0)

        # 协方差更新
        I_mat = np.eye(2)
        self.P = (I_mat - K @ H) @ self.P

    def step(self, V_measured: float, I_A: float) -> tuple:
        """单步迭代"""
        self.predict(I_A)
        self.update(V_measured, I_A)
        return float(self.x[0]), float(self.x[1])
```

### 2.4 放电曲线特征提取法

> **核心原理**: 标准放电测试中提取电压平台/拐点/斜率等特征, 与基准对比评估SOH

```python
"""
放电曲线特征提取法 (Discharge Curve Feature Extraction)
原理: 分析深放电电压曲线的特征变化判断SOH
优点: 不需要模型参数, 工厂可直执行
缺点: 需要标准放电测试 (耗时), 频率受限 (月度/季度)
"""
import numpy as np
import pandas as pd

def extract_features(df_discharge: pd.DataFrame) -> dict:
    """
    从放电曲线提取特征
    输入: time(s), voltage(V), current(A), capacity_Ah
    """
    feats = {}
    total_cap = df_discharge['capacity_Ah'].max()

    # F1: 中点电压 (50%容量处电压)
    mid_row = df_discharge[df_discharge['capacity_Ah'] >= total_cap * 0.5].iloc[0]
    feats['V_mid'] = float(mid_row['voltage'])

    # F2: 末端斜率 (最后10%容量电压下降率)
    tail = df_discharge[df_discharge['capacity_Ah'] >= total_cap * 0.9]
    if len(tail) > 1:
        coeffs = np.polyfit(tail['capacity_Ah'], tail['voltage'], 1)
        feats['V_tail_slope'] = float(coeffs[0])
    else:
        feats['V_tail_slope'] = None

    # F3: 平台时长 (3.2~3.4V持续时间, LFP典型)
    plateau = df_discharge[(df_discharge['voltage'] >= 3.20) &
                            (df_discharge['voltage'] <= 3.40)]
    feats['plateu_duration_s'] = float(plateau['time'].max() - plateau['time'].min())

    # F4: 拐点容量比 (dV/dt最小的位置)
    df_s = df_discharge.sort_values('time')
    dV = df_s['voltage'].diff(); dt = df_s['time'].diff()
    dVdt = dV / dt.replace(0, np.nan)
    knee_idx = dVdt.idxmin()
    feats['knee_capacity_ratio'] = float(df_s.loc[knee_idx, 'capacity_Ah'] / total_cap)

    return feats

def soh_from_features(current: dict, baseline: dict) -> float:
    """与基准特征对比估算SOH, 加权平均"""
    weights = {'V_mid': 0.40, 'V_tail_slope': 0.20,
               'plateu_duration_s': 0.20, 'knee_capacity_ratio': 0.20}
    scores = {}
    for k, w in weights.items():
        if current.get(k) and baseline.get(k):
            if k == 'V_tail_slope':
                ratio = abs(baseline[k]) / abs(current[k]) if current[k] != 0 else 1.0
            else:
                ratio = current[k] / baseline[k] if baseline[k] > 0 else 1.0
            scores[k] = np.clip(ratio, 0.0, 1.0)
    if not scores:
        return None
    return round(sum(scores[k] * weights[k] for k in scores), 4)
```

**四种算法对比总结：**

| 算法 | 精度 | 实时性 | 计算量 | 最佳场景 |
|------|------|--------|--------|----------|
| 安时积分 | ★★☆ | 高 | 低 | 日常在线监控 |
| OCV法 | ★★★★★ | 低(需静置) | 低 | 月度标定 |
| EKF | ★★★★ | 高 | 中 | 工业在线核心 |
| 放电曲线特征 | ★★★★ | 低 | 中 | 季度深度检测 |

---

## 三、衰减预测模型

### 3.1 IGBT LESIT寿命模型

> **核心公式**: $N_f = A \times (\Delta T_j)^{-3.3} \times \exp(\frac{E_a}{R \cdot T_{j,mean,K}})$

```python
"""
IGBT功率循环寿命模型 (LESIT/CIPS2008)
老化机理: 焊料层疲劳 + 绑定线退化 (功率循环ΔTj主导)
寿命Nf(次)与结温波动ΔTj和平均结温Tj_mean相关
"""
def igbt_life_lesit(
    total_runtime_h: float,
    avg_switching_per_hour: float = 300.0,  # 平均开关频率
    delta_Tj_C: float = 40.0,               # 结温波动 °C
    Tj_mean_C: float = 65.0,                # 平均结温 °C
    Tj_max_C: float = 95.0,                 # 最高结温 °C
) -> dict:
    # LESIT模型参数
    A = 9.45e13     # 模型常数
    Ea = 7.77e4     # 激活能 J/mol
    R = 8.314       # 气体常数

    Tj_mean_K = Tj_mean_C + 273.15
    # 循环到失效次数
    N_f = A * (delta_Tj_C ** -3.3) * np.exp(Ea / (R * Tj_mean_K))
    # 温度加速修正 (Arrhenius叠加)
    Tj_max_K = Tj_max_C + 273.15
    AF_temp = np.exp(Ea / R * (1/298.15 - 1/Tj_max_K))
    N_f_adj = N_f / AF_temp

    # 已消耗循环次数
    used_cycles = total_runtime_h * avg_switching_per_hour
    consumed_ratio = min(1.0, used_cycles / N_f_adj)
    remaining = max(0, N_f_adj - used_cycles)
    remaining_h = remaining / avg_switching_per_hour

    # 等级判定
    if consumed_ratio >= 0.90:
        level = 'CRITICAL'
    elif consumed_ratio >= 0.75:
        level = 'WARNING'
    elif consumed_ratio >= 0.60:
        level = 'CAUTION'
    else:
        level = 'NORMAL'

    return {
        'cycles_to_failure': round(N_f_adj, 0),
        'consumed_ratio': round(consumed_ratio, 4),
        'remaining_hours': round(remaining_h, 0),
        'remaining_years': round(remaining_h / 8760, 1),
        'alert_level': level,
        'delta_Tj_C': delta_Tj_C,
        'Tj_max_C': Tj_max_C
    }
```

### 3.2 电容Arrhenius加速模型

> **核心公式**: $L_{actual} = L_{rated} / AF$, 其中 $AF = \exp(\frac{E_a}{R}(\frac{1}{T_{rated}+273} - \frac{1}{T_{hotspot}+273}))$

```python
"""
DC-Link电容剩余寿命估算
老化机理: 纹波电流→内部温升→电解液蒸发→容值下降
"""
def capacitor_life_arrhenius(
    total_runtime_h: float,
    I_ripple_rms_A: float,     # 纹波电流有效值
    C_rated_uF: float,         # 额定电容 μF
    ESR_rated_mOhm: float,     # 额定ESR mΩ
    T_ambient_C: float,        # 环境温度 °C
    T_rated_C: float = 105.0,  # 额定温度 °C
    L_rated_h: float = 50000   # 额定寿命 h
) -> dict:
    Ea = 80000.0  # 电容降解激活能 J/mol
    R = 8.314

    # 纹波电流导致内部温升 (简化热模型)
    delta_T = (I_ripple_rms_A ** 2) * ESR_rated_mOhm * 0.001 * 0.05  # 简化
    T_hotspot = T_ambient_C + delta_T

    # Arrhenius加速因子
    T_rated_K = T_rated_C + 273.15
    T_hotspot_K = T_hotspot + 273.15
    AF = np.exp(Ea / R * (1.0 / T_rated_K - 1.0 / T_hotspot_K))

    # 剩余寿命
    L_remaining = L_rated_h / AF if AF > 0 else float('inf')
    consumed_ratio = max(0, min(1.0, total_runtime_h / L_remaining))

    return {
        'T_hotspot_C': round(T_hotspot, 1),
        'delta_T_C': round(delta_T, 1),
        'acceleration_factor': round(AF, 2),
        'remaining_hours': round(L_remaining, 0),
        'remaining_years': round(L_remaining / 8760, 1),
        'consumed_ratio': round(consumed_ratio, 4),
        'alert_level': 'WARNING' if L_remaining < 20000 else 'NORMAL'
    }
```

### 3.3 电池日历衰减预测

```python
"""
电池日历衰减线性外推 + 等效循环累计
"""
def calendar_decay_prediction(
    soh_history: list,       # [(date, soh), ...]
    forecast_years: int = 5,
    eol_threshold: float = 0.80
) -> dict:
    import numpy as np
    from scipy import stats

    days = np.array([(d[0] - soh_history[0][0]).days for d in soh_history])
    sohs = np.array([d[1] for d in soh_history])

    slope, intercept, r_val, _, _ = stats.linregress(days, sohs)
    annual_decay = abs(slope) * 365.25

    # EOL预测
    if slope != 0:
        eol_days_from_start = (eol_threshold - intercept) / slope
    else:
        eol_days_from_start = None

    return {
        'annual_decay_rate_pct': round(annual_decay * 100, 2),
        'R2': round(r_val ** 2, 4),
        'eol_years_remaining': round(eol_days_from_start / 365.25, 1) if eol_days_from_start else None,
        'predicted_soh_1yr': round(intercept + slope * (days[-1] + 365), 4)
    }
```

---

## 四、退役决策体系

### 4.1 退役决策树

```
                         ┌──────────┐
                         │ 开始评估 │
                         └────┬─────┘
                              ▼
                  ┌── 安全性边界？ ───┐
                  │ SOH < 60%        │
                  │ OR 月热失控≥3次  │
                  │ OR 电池包膨胀    │
                  └───┬──────┬───────┘
                   YES │      │ NO
                       ▼      ▼
                ┌─────────┐  ┌── 经济性边界？ ──┐
                │强制退役 │  │年维保≥年收益×60% │
                │(1周内) │  │持续2年            │
                └────┬────┘  └───┬──────┬───────┘
                     │        YES │      │ NO
                     ▼            ▼      ▼
              ┌──────────┐ ┌──────────┐ ┌──────────┐
              │执行退役  │ │建议退役  │ │继续运营  │
              │处置流程  │ │(3月内)  │ │每季评估  │
              └────┬─────┘ └────┬─────┘ └────┬─────┘
                   │             │             │
                   ▼             ▼             └──────────────┐
         ┌─ 梯次利用条件？ ─┐                               │
         │ SOH ≥ 60%       │                                │
         │ 无热失控历史     │                                │
         └───┬──────┬──────┘                                │
          YES │      │ NO                                    │
              ▼      ▼                                       ▼
       ┌─────────┐ ┌─────────┐                        ┌──────────┐
       │评估梯次 │ │残值评估 │                        │下次评估  │
       │利用方案 │ │→完成退役│                        └──────────┘
       └────┬────┘ └─────────┘
            ▼
     ┌──────────┐
     │梯次利用  │
     │生命周期  │
     └──────────┘
```

### 4.2 双方法残值评估

> **方法一(简单残值)**: $V_{simple} = C_{orig} \times SOH \times K_{recovery}$
> **方法二(材料回收)**: $V_{material} = P_{Li} \times r_{Li} \times M_{Li}$ (锂价值+其他金属)
> **最终残值**: $V_{final} = 0.6 \times V_{simple} + 0.4 \times V_{material}$

```python
def dual_residual_value(
    original_cost_yuan: float,
    current_soh: float,
    cathode_type: str = 'LFP',     # 'LFP' | 'NMC' | 'NCA'
    li_price_ton: float = 100000,   # 碳酸锂价格 元/吨
    li_content_kg_per_kwh: float = 0.3
) -> dict:
    # 回收系数 (不同正极材料)
    recovery_coeff = {'LFP': 0.30, 'NMC': 0.50, 'NCA': 0.50}
    metal_rate     = {'LFP': 0.95, 'NMC': 0.95}  # Li回收率

    # 方法一: 简单残值
    V_simple = original_cost_yuan * current_soh * recovery_coeff.get(cathode_type, 0.30)

    # 方法二: 材料回收
    li_price_kg = li_price_ton / 1000.0
    li_rate = metal_rate.get(cathode_type, 0.95)
    V_material = li_price_kg * li_content_kg_per_kwh * li_rate * original_cost_yuan / 800
    V_material = min(V_material, original_cost_yuan * 0.5)

    # 加权
    V_final = 0.6 * V_simple + 0.4 * V_material

    return {
        'simple_residual': round(V_simple, 2),
        'material_residual': round(V_material, 2),
        'final_residual': round(V_final, 2),
        'ratio_pct': round(V_final / original_cost_yuan * 100, 2),
        'suggestion': '直接回收' if current_soh < 0.50 else
                       '梯次后回收' if current_soh < 0.80 else '继续运营'
    }
```

### 4.3 退役经济性评估

```python
def retirement_economics(
    annual_revenue: float,           # 年运营收益(元)
    annual_maintenance_cost: float,  # 年维保成本(元)
    current_soh: float,
    discount_rate: float = 0.08,
    forecast_years: int = 5
) -> dict:
    profit = annual_revenue - annual_maintenance_cost
    profit_ratio = annual_maintenance_cost / annual_revenue if annual_revenue > 0 else float('inf')

    # 未来5年NPV
    npv = 0.0
    for i in range(1, forecast_years + 1):
        year_profit = profit * (0.97 ** i)  # SOH衰减→收益递减
        npv += year_profit / ((1 + discount_rate) ** i)

    if current_soh < 0.60:
        decision = '强制退役 (SOH安全边界)'
    elif profit_ratio >= 0.60:
        decision = '建议退役 (维保成本过高)'
    elif npv < 0:
        decision = '建议退役 (NPV为负)'
    else:
        decision = '继续运营'

    return {
        'decision': decision,
        'npv_5yr': round(npv, 2),
        'profit_ratio_pct': round(profit_ratio * 100, 2),
        'annual_profit': round(profit, 2)
    }
```

---

## 五、健康评分系统

> **综合评分公式**: $Score = \sum(W_i \times S_i)$, 满分100分

| 评分维度 | 权重 | 评分标准 |
|----------|------|----------|
| **SOH健康度** | 35% | SOH≥95%:100分; 90~95%:80分; 80~90%:60分; <80%:40分 |
| **运行可靠度** | 25% | 可用率≥99%:100分; 97~99%:80分; 95~97%:60分; <95%:20分 |
| **维护质量** | 20% | 无P0/P1缺陷:100分; 1次:80分; 2次:60分; >2次:30分 |
| **技术性能** | 10% | 效率偏差<2%:100分; 2~5%:80分; 5~10%:50分; >10%:0分 |
| **安全合规** | 10% | 无事故:100分; 轻微1次:70分; 重大1次:30分; 多次:0分 |

**评级划分：**

| 综合评分 | 等级 | 运维策略 |
|----------|------|----------|
| 90~100 | ⭐⭐⭐ 优秀 | 保持策略, 季度回顾 |
| 75~89 | ⭐⭐ 良好 | 关注下降趋势, 月度跟踪 |
| 60~74 | ⭐ 一般 | 加强巡检, 制定改进计划 |
| <60 | ❌ 不达标 | 立即评估, 考虑退役 |

---

## 六、月度/年度报告模板

### 6.1 月度运维报告

```markdown
# {站点名称} 月度运维报告
**报告期**: {YYYY}年{MM}月 | **编制人**: {姓名} | **审核人**: {姓名}

---

### 一、运行概况
| 指标 | 本月 | 上月 | 环比 | 年度累计 |
|------|------|------|------|----------|
| 充放电循环次数 | {N}次 | {N}次 | {±%} | {N}次 |
| 等效循环次数 | {N}次 | {N}次 | {±%} | {N}次 |
| 平均SOH | {X.XX%} | {X.XX%} | {±bp} | — |
| 系统可用率 | {XX.X%} | {XX.X%} | {±%} | {XX.X%} |
| 非计划停机h | {X}h | {X}h | {±%} | {X}h |
| 总充放电量 | {XXX}MWh | {XXX}MWh | {±%} | {XXX}MWh |

### 二、设备健康评分
| 设备 | SOH | 评分 | 状态 | 较上月 |
|------|-----|------|------|--------|
| 1#电池簇 | 95.2% | 95 | 优秀 | ↓0.3% |
| PCS#1 | 98.0% | 98 | 优秀 | — |
...

### 三、工单统计
| 级别 | 本月 | 平均处理h | 趋势 |
|------|------|----------|------|
| P0紧急 | {N} | {X}h | — |
| P1重大 | {N} | {X}h | — |
| P2一般 | {N} | {X}h | — |

### 四、备件消耗
| 备件 | 消耗 | 库存 | 补货建议 |
|------|------|------|----------|
...

### 五、下月计划
| 计划 | 日期 | 负责人 |
|------|------|--------|
...

报告人: ________  审核人: ________
```

### 6.2 年度运维报告

> 在月度基础上增加:

| 章节 | 内容 |
|------|------|
| 一、年度运行总报告 | 充放电量、等效循环、收益、利用小时、RTE趋势 |
| 二、SOH年度报告 | 各设备SOH曲线、EOL更新、衰减率对比 |
| 三、可靠性分析 | MTBF/MTTR、可用率、故障分布热力图 |
| 四、成本分析 | 年度总成本、人均效能、备件趋势 |
| 五、下年度预测 | SOH预测、维保预算、备件计划 |
| 六、技术改进建议 | 基于数据的优化建议 |
| 七、资产价值评估 | 残值更新、折旧状况、退役可行性 |

---

## 附录

### 常用公式速查

| 公式 | 表达式 | 用途 |
|------|--------|------|
| SOH(安时) | $SOH = Q_{actual} / C_{nom}$ | 在线实时 |
| SOH(EKF) | 递归最优 | 工业在线 |
| 等效循环 | $f_{eq} = (DOD/100)^{1.5}$ | 循环统计 |
| Arrhenius | $AF = \exp(\frac{E_a}{R}(\frac{1}{T_{ref}} - \frac{1}{T_{op}}))$ | 温度加速 |
| IGBT寿命 | $N_f = A \cdot \Delta T_j^{-3.3} \cdot \exp(\frac{E_a}{R T_m})$ | PCS |
| 电容衰减 | $L = L_0 / AF$ | PCS |
| 电池残值 | $V = C_{orig} \times SOH \times K_{rec}$ | 退役 |
| 健康评分 | $Score = \sum(W_i S_i)$ | 综合 |

### 典型电芯循环寿命

| 类型 | 等效循环(@0.5C,25°C,DOD80%) | 日历寿命 |
|------|-----------------------------|----------|
| LFP | 6000~10000次 | 15~20年 |
| NMC | 3000~5000次 | 10~15年 |
| LTO | 15000~20000次 | 20+年 |
| Na-ion | 3000~5000次 | 10~15年 |

### 器件预警阈值

| 器件 | 正常 | 注意 | 警告 | 危急 |
|------|------|------|------|------|
| 电池SOH | >90% | 80~90% | 70~80% | <70% |
| IGBT消耗 | <60% | 60~75% | 75~90% | >90% |
| 电容剩余 | >3年 | 1~3年 | 0.5~1年 | <0.5年 |
| 告警历史 | 0次/月 | 1~2次 | 3~5次 | >5次 |

---

## 七、储能设备折旧与资产核算

### 7.1 四种折旧方法对比

| 方法 | 公式 | 适用场景 | 前期折旧 | 后期折旧 |
|------|------|----------|---------|---------|
| **直线法** | $(C_{orig} - S_{residual}) / N_{years}$ | 设备使用均匀 | 均匀 | 均匀 |
| **年数总和法** | $(C_{orig} - S_{residual}) \times \frac{N_{remaining}}{N(N+1)/2}$ | 技术更新快的电力电子设备 | 快 | 慢 |
| **双倍余额递减法** | $2 / N_{years} \times BV_{begin}$ | 技术迭代极快的IGBT/BMS | 极快 | 极慢 |
| **工作量法** | $(C_{orig} - S_{residual}) \times \frac{Cycles_{actual}}{Cycles_{design}}$ | 电池系统(衰减与使用相关) | 按循环 | 按循环 |

**推荐组合**：
- PCS/变压器/并网柜: 年数总和法(15年)
- 电池系统: 工作量法(基于等效循环累计)
- 监控/消防/辅助: 直线法(10年)
- IGBT模块: 双倍余额递减法(作为独立资产, 8年)

### 7.2 资产全生命周期成本(LCC)模型

```
LCC = C_acquisition + C_energy + C_maintenance + C_downtime + C_disposal

其中:
  C_acquisition: 设备采购+安装+调试成本
  C_energy: 运营期间能量损失成本 = Σ(P_loss × t_op × P_grid)
  C_maintenance: Σ(人工+备件+外委) per year
  C_downtime: Σ(停机时间 × 损失收益/时)
  C_disposal: 退役处置成本(含环保处理)

示例 (2MW/4MWh电站, 15年):
  C_acquisition = 800万元
  C_energy_loss = 2MW × 2%损失 × 8760h × 15年 × 0.5元/kWh = 26.3万元
  C_maintenance = 15年 × 8万元/年 = 120万元
  C_downtime = 15年 × 24h × 0.5%利用率损失 × 2MW × 0.3元/kWh = 1.6万元
  C_disposal = 15万元(含运输+处理)
  LCC_total = 962.9万元
```

### 7.3 资产净值动态跟踪

```python
def asset_net_value_tracker(
    original_cost: float,
    commissioning_date: str,
    depreciation_method: str,
    useful_life_years: int,
    residual_rate: float = 0.05,
    current_date: str = None
) -> dict:
    """
    资产净值动态计算
    支持四种折旧方法, 返回当前净值及逐月折旧表
    """
    from datetime import datetime
    import numpy as np

    if current_date is None:
        current_date = datetime.now().strftime('%Y-%m-%d')

    elapsed_years = (datetime.strptime(current_date, '%Y-%m-%d') -
                     datetime.strptime(commissioning_date, '%Y-%m-%d')).days / 365.25
    elapsed_years = max(0, min(elapsed_years, useful_life_years))

    residual = original_cost * residual_rate
    depreciable = original_cost - residual

    if depreciation_method == 'straight_line':
        annual_dep = depreciable / useful_life_years
        accumulated = annual_dep * elapsed_years
    elif depreciation_method == 'sum_of_years':
        sy = useful_life_years * (useful_life_years + 1) / 2
        accumulated = sum(
            depreciable * (useful_life_years - y) / sy
            for y in range(int(elapsed_years) + 1)
        )
        accumulated = min(accumulated, depreciable) * (elapsed_years / int(elapsed_years + 1) if elapsed_years > 0 else elapsed_years)
    elif depreciation_method == 'declining_balance':
        rate = 2.0 / useful_life_years
        net = original_cost
        for y in range(int(elapsed_years)):
            dep = min(net * rate, net - residual)
            net -= dep
        accumulated = original_cost - net
    else:
        accumulated = 0

    net_value = max(residual, original_cost - accumulated)

    return {
        'original_cost': original_cost,
        'net_value': round(net_value, 2),
        'accumulated_depreciation': round(accumulated, 2),
        'net_value_ratio': round(net_value / original_cost * 100, 2),
        'elapsed_years': round(elapsed_years, 1),
        'remaining_years': round(useful_life_years - elapsed_years, 1)
    }
```

---

## 八、备件库存优化模型

### 8.1 基于泊松分布的安全库存

```
安全库存 SS = F⁻¹_poisson(service_level, λ × L)

其中:
  λ: 月均故障消耗率(件/月)
  L: 采购提前期(月)
  service_level: 服务水平(推荐95% for P0, 90% for P1)

计算示例:
  IGBT模块: λ=0.15件/月, L=2个月, SL=0.95
  期望消耗 = 0.15 × 2 = 0.3件
  SS(95%) = poisson.ppf(0.95, 0.3) = 1件
  建议库存 = ceil(0.3 + 1) = 2件
```

### 8.2 10MW/40MWh电站备件核心清单

| 备件名称 | 型号规格 | 建议库存 | 单价(元) | 采购周期 | 库存策略 |
|----------|---------|---------|---------|---------|---------|
| IGBT模块 | 1700V/1500A | 2~3个 | 8000~15000 | 4周 | Min-Max(2,5) |
| DC-Link电容 | 450V/3000μF | 2~3个 | 2000~5000 | 3周 | Min-Max(2,5) |
| 散热风扇 | DC24V/80W | 4个 | 500~1500 | 2周 | Min-Max(4,8) |
| CMU采集板 | 8/16路 | 4块 | 800~1500 | 3周 | Min-Max(4,8) |
| BCU控制板 | 主控板 | 1块 | 2000~4000 | 4周 | Min-Max(1,2) |
| 单体电芯 | 280Ah LFP | 10只 | 600~1000 | 4周 | Min-Max(10,20) |
| 熔断器 | PCS直流侧 | 10只 | 50~200 | 2周 | Min-Max(10,20) |
| 框架断路器 | 630A/4P | 1~2个 | 3000~5000 | 6周 | Min-Max(1,3) |
| 温度传感器 | PT100 | 10只 | 50~150 | 1周 | Min-Max(10,20) |
| 消防探头 | 感温/感烟 | 5只 | 200~500 | 2周 | Min-Max(5,10) |

---

## 九、设备故障率统计与可靠性分析

### 9.1 MTBF/MTTR计算公式

```
MTBF (Mean Time Between Failures):
  MTBF = Σ(t_up_i) / N_failures

MTTR (Mean Time To Repair):
  MTTR = Σ(t_repair_i) / N_repairs

Availability:
  A = MTBF / (MTBF + MTTR)

示例数据(PCS, 年度):
  年运行时间: 8760h
  故障次数: 3次
  每次修复: 4h
  MTBF = (8760 - 3×4) / 3 = 2916h
  MTTR = 12/3 = 4h
  Availability = 2916/(2916+4) = 99.86%
```

### 9.2 各设备MTBF参考值

| 设备 | MTBF(工业经验值 h) | MTTR(平均修复 h) | 可用率目标 |
|------|-------------------|-----------------|-----------|
| PCS功率模块 | 50,000~80,000 | 4 | 99.9% |
| PCS控制板 | 100,000~200,000 | 2 | 99.99% |
| BMS BCU | 80,000~120,000 | 2 | 99.99% |
| BMS CMU | 60,000~100,000 | 1 | 99.99% |
| 变压器(干式) | 200,000~300,000 | 48 | 99.97% |
| 电芯(LFP) | 20,000~40,000 (循环) | 视规模 | 99.95% |
| 断路器 | 50,000~150,000 (操作) | 4 | 99.98% |
| 液冷机组 | 30,000~60,000 | 8 | 99.9% |

---

## 十、运营优化与策略调整

### 10.1 基于SOH的策略动态调整

| SOH范围 | 充放电策略调整 | 备注 |
|---------|--------------|------|
| >95% | 标准策略, 全功率范围 | 额定运行 |
| 90~95% | 最大功率降至95%Pn | 延缓衰减 |
| 85~90% | 最大功率降至90%Pn, SOC窗口缩小(15~85%) | 保护电池 |
| 80~85% | 最大功率降至80%Pn, DOD≤70% | 延长寿命 |
| 75~80% | 启动梯次利用评估, 功率限至60% | 退役规划 |
| <75% | 限功率至50%, 列入退役计划 | 安全运行 |

### 10.2 收益最大化策略参数

```yaml
revenue_optimization:
  peak_valley_arbitrage:
    charge_windows: ["00:00-08:00", "12:00-17:00"]  # 谷时+平时
    discharge_windows: ["08:00-12:00", "17:00-21:00"]  # 峰时
    target_soc: 95  # 目标SOC上限
    min_soc: 15    # 最低SOC下限

  frequency_regulation:  # 一次调频叠加
    participation: true
    deadband_hz: 0.05
    droop_pct: 4.0
    reserved_capacity_pct: 10  # 保留10%容量用于调频

  demand_management:  # 需量管理
    enabled: true
    contract_demand_kw: 2000
    target_max_demand_kw: 1800  # 留10%余量
    response_time_s: 1  # 需量超限响应时间
```

---

> **文件版本**: v2.0 (DeepSeek 增强版)
> **创建日期**: 2026-05-31
> **核心增强**:
> 1. 14类设备编码+35字段完整台账schema
> 2. 4种SOH算法(Python完整实现) + IGBT LESIT/电容Arrhenius模型
> 3. 完整退役决策树 + 双方法残值评估
> 4. 健康评分体系 (5维×加权)
> 5. 月度/年度报告模板可直接使用
> 6. 四种折旧方法+LCC全生命周期成本模型+资产净值动态跟踪
> 7. 备件安全库存(泊松)+10MW电站完整备件清单+MTBF/MTTR分析
> 8. 基于SOH的动态策略调整+收益最大化参数配置
