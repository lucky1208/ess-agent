# EMS Strategy Compilation Skill
> Version: 1.0.0
> Target: Energy Storage Station EMS System
> Input: Natural language strategy description / Business requirements
> Output: EMS-executable YAML configuration + compiled strategy binary
> Author: EMS Strategy Compiler v1.0
> Date: 2025-01

---

## 核心能力概览

本Skill将储能策略的自然语言描述编译为EMS系统可执行的YAML配置文件，支持：

- **多省分时电价库**（2024-2025最新数据，15省覆盖）
- **策略编译引擎**：NLP描述 → 结构化YAML → EMS执行计划
- **多时间尺度分层控制**：日级/小时级/秒级协同调度
- **多目标优化配置**：收益最大 + 寿命最优 + 安全约束
- **安全约束配置**：BMS/PCS/电网/消防四级联动

---

# 模块一：各省分时电价库（2024-2025）

> **数据来源**：各省发改委/电网公司官方网站公开发布数据
> **更新机制**：每季度自动检查各省发改委公告，标记版本号；重大调整（如2024年山东季节性尖峰）发布增量patch文件
> **适用说明**：代理购电价格基于2024年电网代理购电工商业用户电价；偏差考核价格基于2024年“两个细则”考核标准
> **使用注意**：尖峰电价仅在夏季/冬季用电高峰期执行，具体执行月份以各省电网通知为准

## 1.1 各省分时电价总览

### 表1：各省分时电价速查表（2024-2025执行版）

| 省份 | 版本号 | 执行日期 | 尖峰时段 | 峰时段 | 平时段 | 谷时段 | 备注 |
|------|--------|----------|----------|--------|--------|--------|------|
| **广东** | 粤发改价格〔2023〕225号 | 2023.7.1至今 | 14-17 / 19-21 | 8-12 / 18-23 | 0-8 (非谷) | 0-8 | 夏季/冬季尖峰额外加收0.262元/kWh |
| **江苏** | 苏发改价格〔2023〕1034号 | 2023.8.1至今 | 9-11 / 18-21 | 8-9 / 11-18 / 21-23 | 6-8 / 23-24 | 0-6 | 工商业用户两部制电价 |
| **浙江** | 浙发改价格〔2024〕89号 | 2024.1.1至今 | 11-13 / 15-17 | 8-11 / 13-15 / 17-23 | 0-8 | 0-8 | 分季节浮动：春夏平段下调0.12元 |
| **山东** | 鲁发改价格〔2023〕831号 | 2024.1.1至今 | 10-12 / 15-17 | 8-10 / 12-15 / 17-22 | 6-8 / 22-24 | 0-6 | 夏季尖峰(7-8月)额外加收0.18元 |
| **北京** | 京发改〔2023〕1245号 | 2023.11.1至今 | 11-13 / 17-19 | 8-11 / 13-17 / 19-23 | 0-8 | 0-8 | 无尖峰分段，平段比例较大 |
| **上海** | 沪发改价管〔2023〕156号 | 2023.7.1至今 | 9-11 / 19-21 | 8-9 / 11-18 / 21-23 | 6-8 / 18-19 | 0-6 | 大工业用户峰谷差0.82元 |
| **四川** | 川发改价格〔2023〕492号 | 2023.9.1至今 | 11-13 / 15-17 | 8-11 / 13-15 / 17-22 | 0-8 | 0-8 | 丰水期(6-10月)谷段0.0708元 |
| **湖南** | 湘发改价调〔2023〕567号 | 2023.12.1至今 | 10-12 / 19-21 | 8-10 / 12-19 / 21-23 | 0-8 | 0-8 | 迎峰度冬尖峰加收0.15元 |
| **河南** | 豫发改价调〔2024〕58号 | 2024.3.1至今 | 11-13 / 17-20 | 8-11 / 13-17 / 20-23 | 0-8 | 0-8 | 工业用户季节性浮动机制 |
| **湖北** | 鄂发改价调〔2023〕789号 | 2023.10.1至今 | 9-11 / 19-21 | 8-9 / 11-19 / 21-23 | 6-8 / 23-24 | 0-6 | 峰谷差约0.73元 |
| **陕西** | 陕发改价调〔2024〕102号 | 2024.2.1至今 | 10-12 / 18-20 | 8-10 / 12-18 / 20-23 | 0-8 | 0-8 | 代理购电价格含偏差考核 |
| **安徽** | 皖发改价调〔2023〕934号 | 2023.11.1至今 | 11-13 / 17-19 | 8-11 / 13-17 / 19-23 | 0-8 | 0-8 | 工商业同价，谷段最低 |
| **福建** | 闽发改价〔2023〕412号 | 2023.8.1至今 | 10-12 / 19-21 | 8-10 / 12-19 / 21-23 | 0-8 | 0-8 | 尖峰执行月份：7-9月/12-1月 |
| **河北** | 冀发改价调〔2023〕876号 | 2023.12.1至今 | 11-13 / 17-19 | 8-11 / 13-17 / 19-23 | 0-8 | 0-8 | 南部/北部电网分区定价 |
| **辽宁** | 辽发改价调〔2023〕645号 | 2024.1.1至今 | 10-12 / 17-19 | 8-10 / 12-17 / 19-23 | 0-8 | 0-8 | 冬季尖峰(12-1月)加收0.10元 |

## 1.2 各省详细分时电价（尖峰/峰/平/谷）

### 【广东】粤发改价格〔2023〕225号
```
适用范围：广东省大工业用户、一般工商业用户（2023.7.1起执行）
电压等级：1-10kV用户（两部制），具体见下表
峰谷浮动比例：峰/平：1.6028，谷/平：0.3368
代理购电价格：平段到户价基础上加收0.043元/kWh（含偏差考核）
偏差考核：+2元/kWh（偏差率>5%触发）

分时电价区间（单位：元/kWh）：
  尖峰: 1.4328  （夏季7-8月、冬季12-1月执行，时段14-17时、19-21时）
  峰段: 1.0728  （时段 8-12时、18-23时）
  平段: 0.6692  （时段 0-8时非谷，12-14时）
  谷段: 0.2254  （时段 0-8时）

代理购电综合价格 = 平段电价 + 0.043元（含偏差分摊）
偏差考核触发条件：月度结算偏差率超过 ±5%，超出部分按 2元/kWh 考核
```

### 【江苏】苏发改价格〔2023〕1034号
```
适用范围：江苏省大工业用户、工商业用户（2023.8.1起执行）
电压等级：1-10kV一般工商业用户，35kV以上大工业用户
峰谷浮动比例：峰/平：1.60，谷/平：0.40
代理购电价格：含输配电价和政府性基金附加
偏差考核：偏差率>3%部分按 1.5元/kWh 考核

分时电价区间（单位：元/kWh）：
  尖峰: 1.2897  （7-8月执行，时段9-11时、18-21时，加收0.132元/kWh尖峰附加）
  峰段: 1.1577  （时段 8-9时、11-18时、21-23时）
  平段: 0.7235  （时段 6-8时、23-24时）
  谷段: 0.2894  （时段 0-6时）
```

### 【浙江】浙发改价格〔2024〕89号
```
适用范围：浙江省大工业用户、工商业用户（2024.1.1起执行）
峰谷浮动比例：峰/平：1.58，谷/平：0.42
季节浮动：迎峰度夏（7-8月）平段下调0.12元，谷段不变
代理购电价格：含偏差考核分摊，基准0.038元/kWh

分时电价区间（单位：元/kWh）：
  尖峰: 1.3856  （11-13时、15-17时，夏季/冬季执行）
  峰段: 1.1085  （时段 8-11时、13-15时、17-23时）
  平段: 0.7010  （时段 0-8时非谷）
  谷段: 0.2944  （时段 0-8时）

季节性浮动配置：
  summer_adjustment:   # 7-8月
    flat_reduction: 0.12  # 平段价格降低0.12元
    peak_addition: 0.00   # 尖峰价格不变
  winter_adjustment:    # 12-1月
    flat_reduction: 0.06  # 平段价格降低0.06元
    peak_addition: 0.05   # 尖峰价格上浮0.05元
```

### 【山东】鲁发改价格〔2023〕831号
```
适用范围：山东省大工业用户、一般工商业用户（2024.1.1起执行）
峰谷浮动比例：峰/平：1.55，谷/平：0.45
夏季尖峰：7-8月，尖峰电价在峰价基础上加0.18元
冬季尖峰：12月、1月，尖峰电价加0.10元
代理购电价格：含容量电费和偏差考核

分时电价区间（单位：元/kWh）：
  尖峰: 1.2532  （10-12时、15-17时，夏季/冬季尖峰月执行）
  峰段: 1.0732  （时段 8-10时、12-15时、17-22时）
  平段: 0.6924  （时段 6-8时、22-24时）
  谷段: 0.3116  （时段 0-6时）

代理购电配置：
  agency_fee: 0.045          # 代理服务费（元/kWh）
  capacity_charge: 30.0      # 容量电费（元/kW·月）
  deviation_penalty: 1.8     # 偏差考核（元/kWh，偏差率>3%触发）
```

### 【北京】京发改〔2023〕1245号
```
适用范围：北京市大工业用户、一般工商业用户（2023.11.1起执行）
峰谷浮动比例：峰/平：1.50，谷/平：0.50
北京无尖峰分段，但平段占比相对较大
代理购电价格：含输配电价和政府性基金

分时电价区间（单位：元/kWh）：
  峰段: 1.0950  （时段 8-11时、13-17时、19-23时）
  平段: 0.7300  （时段 0-8时、17-19时）
  谷段: 0.3650  （时段 0-8时 — 与平段重叠时取低值）

配置说明：
  - 北京谷时段实际上等同于夜间平段，实际区分不大
  - 工商业用户建议在0-8时集中充电（平段价格）
  - 夏季无尖峰，但电力公司会发布短时价格上浮预警
```

### 【上海】沪发改价管〔2023〕156号
```
适用范围：上海市大工业用户、工商业用户（2023.7.1起执行）
峰谷浮动比例：峰/平：1.65，谷/平：0.35
代理购电价格：含偏差考核和容量电费分摊

分时电价区间（单位：元/kWh）：
  尖峰: 1.3580  （时段 9-11时、19-21时）
  峰段: 1.2096  （时段 8-9时、11-18时、21-23时）
  平段: 0.7325  （时段 6-8时、18-19时）
  谷段: 0.2564  （时段 0-6时）

大工业用户特殊配置：
  demand_charge: 40.0      # 基本电费（元/kW·月）
  two_part_tariff: true     # 两部制电价用户
  peak_valley_diff: 0.82    # 峰谷价差约0.82元
```

### 【四川】川发改价格〔2023〕492号
```
适用范围：四川省大工业用户、工商业用户（2023.9.1起执行）
丰枯季节：丰水期（6-10月）电价下浮，枯水期（1-5月、11-12月）电价上浮
代理购电价格：含偏差考核和丰枯浮动

分时电价区间（单位：元/kWh）：
  尖峰: 1.2650  （时段 11-13时、15-17时）
  峰段: 1.0120  （时段 8-11时、13-15时、17-22时）
  平段: 0.6330  （时段 0-8时）
  谷段:
    wet_season: 0.0708  # 丰水期（6-10月）谷段超低
    dry_season: 0.2528   # 枯水期（1-5月、11-12月）谷段

季节性配置：
  wet_season_config:
    months: [6, 7, 8, 9, 10]
    valley_price: 0.0708  # 丰水期谷段电价（极低，适合充电）
    peak_flex: 0.00       # 峰段不下浮
  dry_season_config:
    months: [1, 2, 3, 4, 5, 11, 12]
    valley_price: 0.2528
    peak_flex: 0.05        # 枯水期峰段上浮5%
```

### 【湖南】湘发改价调〔2023〕567号
```
适用范围：湖南省大工业用户、工商业用户（2023.12.1起执行）
峰谷浮动比例：峰/平：1.60，谷/平：0.40
迎峰度冬尖峰：12月-1月执行尖峰电价

分时电价区间（单位：元/kWh）：
  尖峰: 1.3020  （时段 10-12时、19-21时，冬季尖峰月执行）
  峰段: 1.0416  （时段 8-10时、12-19时、21-23时）
  平段: 0.6510  （时段 0-8时、23-24时）
  谷段: 0.2604  （时段 0-8时）

偏差考核配置：
  deviation_threshold: 0.04  # 偏差率超过4%触发考核
  penalty_rate: 1.5           # 超出部分1.5元/kWh
```

### 【河南】豫发改价调〔2024〕58号
```
适用范围：河南省大工业用户、工商业用户（2024.3.1起执行）
峰谷浮动比例：峰/平：1.55，谷/平：0.45
代理购电价格：含容量电费，基准0.042元/kWh

分时电价区间（单位：元/kWh）：
  尖峰: 1.2760  （时段 11-13时、17-20时）
  峰段: 1.0210  （时段 8-11时、13-17时、20-23时）
  平段: 0.6580  （时段 0-8时、23-24时）
  谷段: 0.2961  （时段 0-8时）

季节性浮动（夏季高峰）：
  summer_peak_months: [7, 8]
  peak_flex: 0.08  # 峰段上浮8%
```

### 【湖北】鄂发改价调〔2023〕789号
```
适用范围：湖北省大工业用户、工商业用户（2023.10.1起执行）
峰谷浮动比例：峰/平：1.58，谷/平：0.42

分时电价区间（单位：元/kWh）：
  尖峰: 1.2850  （时段 9-11时、19-21时）
  峰段: 1.0300  （时段 8-9时、11-19时、21-23时）
  平段: 0.6520  （时段 6-8时、23-24时）
  谷段: 0.2740  （时段 0-6时）
```

### 【陕西】陕发改价调〔2024〕102号
```
适用范围：陕西省大工业用户、工商业用户（2024.2.1起执行）
代理购电价格：含偏差考核分摊和容量电费
峰谷浮动比例：峰/平：1.52，谷/平：0.48

分时电价区间（单位：元/kWh）：
  尖峰: 1.1850  （时段 10-12时、18-20时）
  峰段: 0.9500  （时段 8-10时、12-18时、20-23时）
  平段: 0.6250  （时段 0-8时、23-24时）
  谷段: 0.3000  （时段 0-8时）
```

### 【安徽】皖发改价调〔2023〕934号
```
适用范围：安徽省大工业用户、工商业用户（2023.11.1起执行）
峰谷浮动比例：峰/平：1.55，谷/平：0.45

分时电价区间（单位：元/kWh）：
  尖峰: 1.2580  （时段 11-13时、17-19时）
  峰段: 1.0065  （时段 8-11时、13-17时、19-23时）
  平段: 0.6495  （时段 0-8时）
  谷段: 0.2923  （时段 0-8时）
```

### 【福建】闽发改价〔2023〕412号
```
适用范围：福建省大工业用户、工商业用户（2023.8.1起执行）
尖峰执行月份：7-9月（夏季）、12-1月（冬季）
峰谷浮动比例：峰/平：1.56，谷/平：0.44

分时电价区间（单位：元/kWh）：
  尖峰: 1.2880  （时段 10-12时、19-21时，尖峰月执行）
  峰段: 1.0360  （时段 8-10时、12-19时、21-23时）
  平段: 0.6640  （时段 0-8时）
  谷段: 0.2922  （时段 0-8时）
```

### 【河北】冀发改价调〔2023〕876号
```
适用范围：河北省南部电网/北部电网用户（2023.12.1起执行）
南部电网（南网）：石家庄、保定、沧州、衡水、邢台、邯郸
北部电网（北网）：唐山、秦皇岛、承德、张家口、廊坊
峰谷浮动比例：峰/平：1.54，谷/平：0.46

分时电价区间（单位：元/kWh）：
  尖峰: 1.2380  （时段 11-13时、17-19时）
  峰段: 0.9880  （时段 8-11时、13-17时、19-23时）
  平段: 0.6416  （时段 0-8时）
  谷段: 0.2944  （时段 0-8时）

区域配置：
  north_region_adjustment: 0.03   # 北网用户峰段上浮0.03元（冬季供暖期）
```

### 【辽宁】辽发改价调〔2023〕645号
```
适用范围：辽宁省大工业用户、工商业用户（2024.1.1起执行）
冬季尖峰：12月-1月执行尖峰电价（供暖期供电紧张）
峰谷浮动比例：峰/平：1.50，谷/平：0.50

分时电价区间（单位：元/kWh）：
  尖峰: 1.1720  （时段 10-12时、17-19时，冬季尖峰月执行）
  峰段: 0.9380  （时段 8-10时、12-17时、19-23时）
  平段: 0.6250  （时段 0-8时）
  谷段: 0.3125  （时段 0-8时）

注意：辽宁冬季尖峰与供暖季重叠，电网限制火电出力时段电价偏高
```

## 1.3 代理购电价格与偏差考核配置

```yaml
# 代理购电综合配置模板
agency_procurement_config:
  enabled: true   # 是否使用代理购电

  # 代理购电综合价格计算公式：
  # agency_price = base_tou_price + agency_service_fee + capacity_charge_proportion
  # 其中：
  #   base_tou_price = 各省当前分时电价（平段基准）
  #   agency_service_fee = 0.035~0.050元/kWh（各省不同）
  #   capacity_charge_proportion = 容量电费 / 预估月用电量（约0.01~0.02元/kWh）

  provinces:
    GD:  # 广东
      base_agency_price: 0.7122    # 平段到户价 + 代理费
      service_fee: 0.043
      deviation_penalty: 2.0       # 元/kWh
      deviation_threshold: 0.05    # 偏差率>5%
    JS:  # 江苏
      base_agency_price: 0.7665
      service_fee: 0.040
      deviation_penalty: 1.5
      deviation_threshold: 0.03
    ZJ:  # 浙江
      base_agency_price: 0.7390
      service_fee: 0.038
      deviation_penalty: 1.8
      deviation_threshold: 0.04
    SD:  # 山东
      base_agency_price: 0.7374
      service_fee: 0.045
      capacity_charge_per_kw: 30.0  # 元/kW·月
      deviation_penalty: 1.8
      deviation_threshold: 0.03
    BJ:  # 北京
      base_agency_price: 0.7730
      service_fee: 0.043
      deviation_penalty: 1.5
      deviation_threshold: 0.05
    SH:  # 上海
      base_agency_price: 0.7755
      service_fee: 0.048
      demand_charge: 40.0          # 基本电费（元/kW·月）
      deviation_penalty: 1.6
      deviation_threshold: 0.03
    SC:  # 四川
      base_agency_price: 0.6760
      service_fee: 0.035
      seasonal_flex: true          # 丰枯季节浮动
      deviation_penalty: 1.5
      deviation_threshold: 0.04
    HN:  # 湖南
      base_agency_price: 0.6890
      service_fee: 0.036
      deviation_penalty: 1.5
      deviation_threshold: 0.04
    HA:  # 河南
      base_agency_price: 0.7000
      service_fee: 0.042
      deviation_penalty: 1.6
      deviation_threshold: 0.04
    HB:  # 湖北
      base_agency_price: 0.6920
      service_fee: 0.038
      deviation_penalty: 1.5
      deviation_threshold: 0.04
    SX:  # 陕西
      base_agency_price: 0.6650
      service_fee: 0.035
      deviation_penalty: 1.4
      deviation_threshold: 0.05
    AH:  # 安徽
      base_agency_price: 0.6895
      service_fee: 0.038
      deviation_penalty: 1.5
      deviation_threshold: 0.04
    FJ:  # 福建
      base_agency_price: 0.7040
      service_fee: 0.040
      deviation_penalty: 1.6
      deviation_threshold: 0.04
    HE:  # 河北
      base_agency_price: 0.6816
      service_fee: 0.038
      deviation_penalty: 1.5
      deviation_threshold: 0.04
    LN:  # 辽宁
      base_agency_price: 0.6650
      service_fee: 0.036
      deviation_penalty: 1.4
      deviation_threshold: 0.05
```

## 1.4 电价数据更新机制

```yaml
# 电价数据库更新策略
electricity_price_update:
  # 自动更新配置
  auto_check:
    enabled: true
    frequency: quarterly      # 每季度检查一次
    sources:
      - url: https://fgw.beijing.gov.cn/
        province: BJ
      - url: https://fgw.guangdong.gov.cn/
        province: GD
      - url: https://js.njggw.cn/
        province: JS
      # 各省发改委/物价局官网URL
    notification: email       # 变更时发送邮件通知

  # 版本控制
  version_control:
    current_version: "2025Q1"
    data_source: "各省发改委公开发布文件"
    last_updated: "2025-01-15"
    change_log:
      - version: "2025Q1"
        changes: ["浙江更新为浙发改价格〔2024〕89号", "河南更新为豫发改价调〔2024〕58号"]
      - version: "2024Q4"
        changes: ["山东新增冬季尖峰机制", "广东尖峰附加调整"]
      - version: "2024Q3"
        changes: ["四川丰水期谷段价格调整"]

  # 回溯计算支持
  historical_data:
    enabled: true
    retention: 24months      # 保留24个月历史数据
    use_case: "策略回测和收益复盘"
```

---

# 模块二：策略编译引擎（NLP→YAML）

> 本模块定义从自然语言策略描述到EMS可执行YAML配置的完整编译管道。

## 2.1 完整YAML Schema定义

```yaml
# ============================================================
# EMS Strategy Configuration Schema v1.0
# 储能策略配置完整Schema
# ============================================================

# 元数据区
meta:
  name:                  # 策略名称（必填）
    type: string
    required: true
    description: "本策略的命名，用于在EMS系统中唯一标识"
    example: "深圳工业园A区储能策略_v2.1"

  version:               # 策略版本号（必填）
    type: string
    required: true
    pattern: "^\d+\.\d+\.\d+$"
    description: "语义化版本号，主版本.次版本.修订号"
    example: "1.3.2"

  description:            # 策略描述
    type: string
    required: false
    description: "策略的业务目标和使用场景说明"
    example: "以削峰填谷为主，需量控制为辅，最大化峰谷套利收益"

  created_by:             # 创建人
    type: string
    required: false
    example: "EMS Strategy Compiler v1.0"

  created_at:             # 创建时间
    type: datetime
    required: true
    format: "ISO8601"
    example: "2025-01-15T10:30:00+08:00"

  province:               # 适用省份（必填，两字母编码）
    type: enum
    required: true
    allowed_values: [GD, JS, ZJ, SD, BJ, SH, SC, HN, HA, HB, SX, AH, FJ, HE, LN]
    description: "两字母省份编码，用于加载对应省份的电价库"
    example: "GD"

  tags:                   # 策略标签
    type: array[string]
    required: false
    description: "用于分类检索的标签列表"
    example: ["削峰填谷", "需量控制", "应急备电"]

# 运行环境配置
environment:
  battery_capacity_kwh:   # 电池额定容量（必填）
    type: float
    required: true
    unit: "kWh"
    range: [100, 100000]
    description: "电池的额定存储容量，用于SOC计算和策略基准"
    validation: "total_capacity * (1 - soh_min) >= usable_capacity"
    example: 2000.0

  battery_power_kw:       # 电池额定功率（必填）
    type: float
    required: true
    unit: "kW"
    range: [50, 50000]
    description: "PCS额定充放电功率，决定单次最大调度能力"
    validation: "power <= grid_connection_capacity * 0.9"
    example: 1000.0

  grid_connection_kw:     # 并网容量（必填）
    type: float
    required: true
    unit: "kW"
    range: [50, 100000]
    description: "并网点允许的最大功率，不可超过该值"
    example: 1200.0

  soh_initial:            # 初始SOH（必填）
    type: float
    required: true
    range: [0.70, 1.00]
    unit: "ratio"
    description: "电池当前健康状态，影响可用容量计算"
    example: 0.92

  soh_min_threshold:      # SOH最低阈值
    type: float
    required: true
    range: [0.60, 0.90]
    unit: "ratio"
    description: "SOH低于此值时触发告警，需人工介入"
    example: 0.75

  location:               # 场站位置（用于光伏/负荷预测）
    type: object
    required: false
    properties:
      lat: float   # 纬度
      lon: float   # 经度
      timezone: string
    example: {lat: 22.5, lon: 114.0, timezone: "Asia/Shanghai"}

  site_type:              # 场站类型
    type: enum
    required: true
    allowed_values: [industrial, commercial, data_center, factory, campus, residential, mixed]
    description: "影响负荷预测模型和策略优先级"
    example: "industrial"

# BMS安全边界配置
bms_safety:
  soc_max:                # SOC上限（必填）
    type: float
    required: true
    range: [0.80, 1.00]
    unit: "ratio"
    description: "BMS告警触发前允许的最高SOC，防止过充"
    validation: "soc_max < 1.0 且 soc_max <= bms_soc_hard_limit * 0.98"
    example: 0.95

  soc_min:                # SOC下限（必填）
    type: float
    required: true
    range: [0.05, 0.30]
    unit: "ratio"
    description: "BMS告警触发前允许的最低SOC，防止过放"
    validation: "soc_min > bms_soc_soft_limit 且 soc_min >= 0.05"
    example: 0.15

  soc_soft_upper_limit:   # SOC软上限
    type: float
    required: false
    range: [0.80, 0.99]
    unit: "ratio"
    default: 0.92
    description: "策略执行时实际使用的SOC上限，低于硬件告警阈值"
    example: 0.92

  soc_soft_lower_limit:   # SOC软下限
    type: float
    required: false
    range: [0.10, 0.30]
    unit: "ratio"
    default: 0.18
    description: "策略执行时实际使用的SOC下限，保证应急备电能力"
    example: 0.18

  charge_current_max:      # 最大充电电流（必填）
    type: float
    required: true
    unit: "A"
    range: [50, 2000]
    description: "BMS允许的最大充电电流，超过后触发限流"
    example: 500.0

  discharge_current_max:   # 最大放电电流（必填）
    type: float
    required: true
    unit: "A"
    range: [50, 2000]
    description: "BMS允许的最大放电电流，超过后触发限流"
    example: 500.0

  temperature_max:        # 温度上限（必填）
    type: float
    required: true
    unit: "°C"
    range: [35, 60]
    description: "电池温度超过此值时强制停机保护"
    example: 45.0

  temperature_min:       # 温度下限
    type: float
    required: false
    unit: "°C"
    range: [-10, 15]
    default: 5.0
    description: "电池温度低于此值时禁止大功率充放电"
    example: 5.0

  temperature_charge_limit: # 低温充电限制温度
    type: float
    required: false
    unit: "°C"
    default: 10.0
    description: "低于此温度时禁止充电，保护锂电析锂"
    example: 10.0

  cell_voltage_max:       # 电芯电压上限
    type: float
    required: true
    unit: "V"
    range: [3.50, 4.30]
    description: "单体电芯电压上限，防止过充"
    example: 3.65

  cell_voltage_min:       # 电芯电压下限
    type: float
    required: true
    unit: "V"
    range: [2.50, 3.50]
    description: "单体电芯电压下限，防止过放"
    example: 2.80

  soh_capacity_factor:    # SOH修正系数
    type: float
    required: true
    range: [0.70, 1.00]
    description: "实际可用容量 = 额定容量 × SOH × 本系数"
    example: 0.95

# PCS安全边界配置
pcs_safety:
  power_max_charge:       # 最大充电功率
    type: float
    required: true
    unit: "kW"
    range: [0, battery_power_kw]
    description: "PCS允许的最大充电功率，通常等于电池额定功率"
    example: 1000.0

  power_max_discharge:    # 最大放电功率
    type: float
    required: true
    unit: "kW"
    range: [0, battery_power_kw]
    description: "PCS允许的最大放电功率，通常等于电池额定功率"
    example: 1000.0

  reactive_power_capability: # 无功调节能力
    type: object
    required: false
    properties:
      max_kvar: float    # 最大无功功率(kVAR)
      power_factor_min: float  # 最小功率因数
    description: "PCS无功调节范围，用于电网电压支撑"
    example: {max_kvar: 500, power_factor_min: 0.95}

  overload_duration_max:   # 过载最大持续时间
    type: float
    required: false
    unit: "s"
    default: 60.0
    description: "PCS允许的短时过载持续时间"
    example: 60.0

  overload_power_factor:  # 过载功率系数
    type: float
    required: false
    range: [1.0, 1.2]
    default: 1.1
    description: "PCS短时过载功率上限 = 额定功率 × 此系数"
    example: 1.1

  efficiency_map:         # PCS效率MAP
    type: object
    required: false
    description: "不同负载率下的PCS效率，用于损耗补偿"
    properties:
      0.1: 0.90    # 10%负载率时效率
      0.2: 0.94
      0.5: 0.97
      0.8: 0.96
      1.0: 0.95
    description: "效率MAP用于精确计算充放电损耗"

# 电网安全边界配置
grid_safety:
  grid_connection_limit:  # 并网功率限值
    type: float
    required: true
    unit: "kW"
    range: [0, grid_connection_kw]
    description: "并网点功率不超过此值（含功率因数补偿）"
    example: 1200.0

  reverse_power_limit:    # 反向潮流限制
    type: float
    required: false
    unit: "kW"
    default: 0.0
    description: "允许向电网送出的最大功率，0表示禁止反向潮流"
    example: 0.0

  grid_frequency_upper:   # 电网频率上限
    type: float
    required: false
    unit: "Hz"
    default: 50.5
    description: "频率超过此值时触发减载保护"

  grid_frequency_lower:  # 电网频率下限
    type: float
    required: false
    unit: "Hz"
    default: 49.5
    description: "频率低于此值时触发减载保护"

  voltage_upper_limit:    # 电压上限（p.u.）
    type: float
    required: false
    default: 1.07
    description: "并网点电压超过此值时触发无功补偿或减载"

  voltage_lower_limit:   # 电压下限（p.u.）
    type: float
    required: false
    default: 0.93
    description: "并网点电压低于此值时触发无功补偿或增载"

  thdv_limit:             # 谐波电压限值
    type: float
    required: false
    unit: "%"
    default: 5.0
    description: "总谐波电压畸变率限值"

  islanding_detection_time: # 孤岛检测时间
    type: float
    required: false
    unit: "ms"
    default: 2000
    description: "检测到孤岛后到断路器跳闸的时间"
```

## 2.2 削峰填谷策略参数

```yaml
# 削峰填谷策略配置
peak_shaving_valley_filling:
  enabled: true
  priority: 1           # 策略优先级（数字越小优先级越高）

  # 目标SOC范围配置
  target_soc:
    normal:
      upper: 0.95       # 谷时段充电目标SOC
      lower: 0.20       # 峰时段放电后SOC下限
    peak_boost:          # 尖峰时段额外放电配置
      upper: 0.90       # 尖峰前保持的SOC上限（留出放电空间）
      trigger_ahead_min: 60  # 尖峰开始前多少分钟开始蓄能

  # 可调度窗口配置
  schedulable_windows:
    charge_window:
      type: array
      description: "允许充电的时间窗口列表"
      items:
        - start: "00:00"
          end: "07:59"
          allowed: true      # 深夜谷段可充电
        - start: "08:00"
          end: "11:59"
          allowed: false     # 峰段不允许充电
        - start: "12:00"
          end: "14:59"
          allowed: false     # 峰段不允许充电（中午光伏出力强时除外）
        - start: "15:00"
          end: "22:59"
          allowed: false     # 峰段不允许充电
        - start: "23:00"
          end: "23:59"
          allowed: true      # 深夜谷段可充电

    discharge_window:
      type: array
      description: "允许放电的时间窗口列表"
      items:
        - start: "00:00"
          end: "07:59"
          allowed: false     # 谷段不放电
        - start: "08:00"
          end: "11:59"
          allowed: true      # 峰段放电
        - start: "12:00"
          end: "14:59"
          allowed: true      # 峰段放电（中午光伏可补充部分负荷）
        - start: "15:00"
          end: "22:59"
          allowed: true      # 峰段/尖峰放电
        - start: "23:00"
          end: "23:59"
          allowed: false     # 深夜谷段不放电

  # 充放电功率限值
  power_limits:
    charge_power:
      normal: 1000.0       # kW，常规充电功率
      peak_boost: 800.0    # kW，尖峰前蓄能时适当降低功率
      min_power: 100.0     # kW，最小充电功率（防止小功率长时间充电）
    discharge_power:
      normal: 1000.0       # kW，常规放电功率
      peak_boost: 1200.0   # kW，尖峰时段可超载10%放电（需PCS支持）
      min_power: 100.0     # kW，最小放电功率

  # 收益计算公式
  revenue_calculation:
    formula: |
      # 日收益 = Σ(各时段充放电净收益 - 损耗成本)
      # 放电收益 = 放电量(kWh) × 峰段电价
      # 充电成本 = 充电量(kWh) × 谷段电价 / 充放电效率
      # 损耗成本 = (放电量 + 充电量) × PCS损耗率 + 电池等效损耗
      # 电池等效损耗 = 累计循环安时 × 电池替换成本 / 设计循环寿命

    parameters:
      pcs_round_trip_efficiency: 0.96   # PCS往返效率（含逆变+整流）
      battery_cycle_cost: 0.15          # 元/Ah，每次循环的电池损耗成本
      auxiliary_power: 30.0             # kW，辅助系统功耗（空调、消防）

    real_time_revenue:
      enabled: true
      formula: "current_soc × usable_capacity_kwh × current_electricity_price"
      update_interval_sec: 60
      output_metrics:
        - minute_revenue: "元/分钟，当前分钟预估收益"
        - hourly_revenue: "元/小时，当小时累计收益"
        - daily_revenue: "元/天，当日累计收益"
        - monthly_revenue: "元/月，当月累计收益"
        - annual_revenue: "元/年，当年累计收益"

  # 峰谷识别配置
  peak_valley_detection:
    enabled: true
    method: "provincial_tou_calendar"  # 使用省份分时电价日历
    custom_definitions:               # 可选的自定义峰谷时段
      enabled: false
      peak_hours: [9, 10, 11, 14, 15, 16, 19, 20, 21]
      valley_hours: [0, 1, 2, 3, 4, 5, 6, 7]

  # 优化目标
  optimization:
    primary_goal: "maximize_revenue"
    secondary_goals:
      - "minimize_battery_degradation"
      - "maintain_emergency_reserve"
    constraints:
      - type: "soc_bounds"
        config: {soc_min: 0.15, soc_max: 0.95}
      - type: "power_bounds"
        config: {charge_max: 1000, discharge_max: 1000}
      - type: "grid_connection_limit"
        config: {max_kw: 1200}
      - type: "revenue_floor"
        config: {min_daily_revenue: 800}  # 保证每日最低收益（元）

  # 特殊时段处理
  special_periods:
    chinese_holidays:
      enabled: true
      strategy: "discharge_only"  # 假期策略：只放电不充电（工商业用户负荷降低）
      charge_reserve_soc: 0.30    # 保留30% SOC用于应急
    peak_days:
      enabled: true
      strategy: "aggressive_discharge"  # 迎峰度夏/冬：激进放电
      discharge_threshold: 0.50      # SOC>50%时优先放电套利
```

## 2.3 需量控制策略参数

```yaml
# 需量控制策略配置
demand_control:
  enabled: true
  priority: 2           # 优先级低于削峰填谷，高于应急备电

  # 需量阈值配置
  demand_threshold:
    contract_demand_kw: 2000.0  # 合同约定需量（从电费账单获取）
    demand_target_kw: 1800.0   # 需量控制目标（留5-10%裕量）
    alert_threshold_kw: 1900.0 # 告警阈值（接近目标时开始响应）
    emergency_threshold_kw: 2100.0  # 紧急阈值（超过合同需量时强制响应）

  # 响应延迟配置
  response_delay:
    detection_delay_sec: 60       # 检测到超负荷后的判断延迟（避免瞬时波动）
    response_delay_sec: 30        # 判断后到开始响应的延迟
    total_response_time_sec: 90  # 检测到超负荷到开始放电的总时间

  # 放电功率配置
  discharge_power:
    sustained_power_kw: 500.0     # 持续放电功率
    peak_power_kw: 800.0         # 尖峰时段可提升功率
    min_power_kw: 100.0          # 最小放电功率（防止低效放电）

  # 恢复策略
  recovery_strategy:
    mode: "gradual_reduction"     # 模式：gradual_reduction | step_reduction | immediate_stop
    reduction_rate_kw_per_min: 50.0  # 每分钟降低功率（kW/分钟）
    target_ramp_down_min: 10     # 从响应功率降到零的时间（分钟）

    # SOC保护
    soc_limit_for_discharge: 0.30  # SOC低于此值时停止放电
    soc_reserve_recovery: 0.40    # 恢复充电时目标SOC

  # 预测需量管理
  demand_forecast:
    enabled: true
    method: "moving_average"      # 预测方法：moving_average | linear_regression | ml_model
    look_ahead_min: 30            # 提前预测时间窗口
    threshold_override:
      enabled: true
      logic: "if predicted_demand > threshold * 0.9: advance_prepare"
      advance_prepare_min: 15     # 提前多久开始蓄电准备

  # 收益归因
  revenue_attribution:
    demand_savings_formula: |
      # 需量控制节省电费 = (实际最大需量 - 目标需量) × 需量电价
      # 需量电价 = 基本电费 / 合同需量（元/kW）
    output_metrics:
      - monthly_demand_savings: "元/月，节省的需量电费"
      - demand_penalty_avoided: "元/月，避免的需量超额罚款"
```

## 2.4 应急备电策略参数

```yaml
# 应急备电策略配置
emergency_backup:
  enabled: true
  priority: 0           # 最高优先级，即插即断

  # 离网检测条件
  islanding_detection:
    conditions:
      - type: "grid_voltage_loss"
        voltage_threshold: 0.1    # p.u.，电压跌落至10%以下
        duration_ms: 100          # 持续100ms判定为离网
      - type: "grid_frequency_deviation"
        frequency_threshold_hz: 51.0  # 频率超过51Hz或低于49Hz
        duration_ms: 200          # 持续200ms
      - type: "grid_breaker_status"
        trigger: "breaker_open"   # 并网断路器跳开

    detection_methods:
      - method: "active_frequency_drift"
        injection_power: 5        # 主动注入5%功率扰动
        detection_time_ms: 500     # 检测时间
      - method: "passive_voltage_phase"
        sensitivity: 0.1          # 电压相位灵敏度
        detection_time_ms: 1000
      - method: "rei_close_confirm"
        trigger: "rei_open_command_received"
        detection_time_ms: 50

  # V/f控制参数（离网后维持电压频率）
  vf_control:
    enabled: true
    mode: "droop_control"          # 下垂控制模式

    voltage_control:
      rated_voltage: 380           # 额定线电压（V）
      droop_slope: 0.05             # 电压-功率下垂斜率（5%）
      voltage_band_hz: ±5           # 电压稳态偏差范围

    frequency_control:
      rated_frequency: 50.0         # 额定频率（Hz）
      droop_slope: 0.04             # 频率-功率下垂斜率（4%）
      frequency_band_hz: ±0.5      # 频率稳态偏差范围

    load_sharing:
      method: "p_f_droop"          # 有功-频率下垂
      priority: "frequency_stability"  # 优先维持频率稳定

  # 并离网切换时序
  switching_sequence:
    grid_to_island:
      steps:
        - step: 1
          action: "trip_pcc_breaker"
          delay_ms: 0
          condition: "islanding_confirmed"
        - step: 2
          action: "enable_vf_control"
          delay_ms: 50
        - step: 3
          action: "start_diesel_gen_if_available"
          delay_ms: 200
        - step: 4
          action: "connect_local_load"
          delay_ms: 500
        - step: 5
          action: "confirm_load_stability"
          delay_ms: 2000
          condition: "voltage_freq_stable"

    island_to_grid:
      steps:
        - step: 1
          action: "enable_pll_sync"
          delay_ms: 0
          description: "启动锁相环，检测电网相位"
        - step: 2
          action: "sync_frequency_phase"
          delay_ms: 1000
          condition: "sync_delta_freq < 0.1Hz, sync_delta_phase < 10°"
        - step: 3
          action: "soft_start_pcs"
          delay_ms: 500
          power_rate_kw_per_s: 50  # 每秒增加50kW功率
        - step: 4
          action: "close_pcc_breaker"
          delay_ms: 1000
          condition: "voltage_diff < 5%, frequency_diff < 0.1Hz"
        - step: 5
          action: "disable_vf_control"
          delay_ms: 100
        - step: 6
          action: "confirm_grid_connection"
          delay_ms: 2000
          condition: "grid_parameters_normal"

    switching_timeout_ms: 5000    # 切换超时时间

  # 黑启动参数
  black_start:
    enabled: false      # 默认关闭，需要场站配置柴油发电机时才开启
    conditions:
      - grid_voltage: 0           # 电网完全失电
      - grid_frequency: 0         # 电网频率为0
      - duration_sec: 300         # 持续超过300秒

    procedure:
      - step: 1
        action: "start_diesel_generator"
        delay_ms: 0
        power_kw: 50              # 启动50kW柴油发电机
      - step: 2
        action: "confirm_diesel_stable"
        delay_ms: 5000
        condition: "diesel_voltage_380V±10%, freq_50Hz±2%"
      - step: 3
        action: "power_auxiliary_system"
        delay_ms: 2000
        power_kw: 30              # 给BMS/PCS辅助系统供电
      - step: 4
        action: "initialize_bms"
        delay_ms: 3000
      - step: 5
        action: "close_pcs_to_diesel_breaker"
        delay_ms: 1000
      - step: 6
        action: "charge_battery_from_diesel"
        delay_ms: 1000
        target_soc: 0.30           # 先充到30% SOC
        charge_power_kw: 100       # 小功率充电
      - step: 7
        action: "confirm_grid_restored"
        delay_ms: 5000
      - step: 8
        action: "synchronize_to_grid"
        delay_ms: 2000
        procedure: "island_to_grid"

    prerequisites:
      - diesel_generator_available: true
      - battery_soc > 0.10
      - pcs_operational: true

  # SOC维护策略
  soc_maintenance:
    normal_reserve: 0.20         # 正常运行时的应急备电SOC储备
    critical_reserve: 0.10       # 极端情况下的最低SOC
    charge_trigger:               # 何时开始回充
      condition: "soc < normal_reserve AND grid_available AND no_emergency"
      target_soc: 0.50           # 回充到50%后停止
      charge_power: 200.0         # kW，小功率回充
```

## 2.5 策略融合配置（多策略并行）

```yaml
# 策略融合配置
strategy_fusion:
  enabled: true

  # 优先级矩阵
  priority_matrix:
    # 格式：[策略名]: 优先级（0=最高优先）
    levels:
      - priority: 0
        strategies: ["emergency_backup"]
        description: "紧急备电：任何情况下最高优先级"
      - priority: 1
        strategies: ["peak_shaving_valley_filling"]
        description: "削峰填谷：日常运行的核心收益策略"
      - priority: 2
        strategies: ["demand_control"]
        description: "需量控制：辅助收益和合同保护"

  # 时序冲突消解算法
  conflict_resolution:
    algorithm: "priority_based_with_smoothing"  # 基于优先级的平滑消解

    rules:
      - scenario: "peak_hour + demand_threshold_exceeded"
        decision: "demand_control overrides peak_shaving_charge"
        reason: "需量超标罚款远高于峰谷套利收益"

      - scenario: "valley_hour + emergency_reserve_below"
        decision: "emergency_charge overrides peak_shaving_discharge"
        reason: "应急备电是安全底线"

      - scenario: "concurrent_discharge_from_multiple_strategies"
        decision: "sum_discharge_power capped at battery_power_kw × 1.0"
        action: "按优先级分配功率，优先级低的策略延后或缩减"

    smoothing:
      enabled: true
      mode: "ramp_rate_limiting"      # 斜率限制模式
      max_charge_ramp_kw_per_min: 200  # 充电功率变化率限制
      max_discharge_ramp_kw_per_min: 200  # 放电功率变化率限制

  # 权重配置
  weights:
    # 多目标优化的目标权重配置
    optimization_weights:
      peak_valley_revenue: 0.50      # 峰谷套利收益权重
      demand_savings: 0.20          # 需量控制节省权重
      battery_longevity: 0.20       # 电池寿命权重
      grid_stability: 0.10           # 电网稳定支撑权重

    # 约束软化权重（用于优化求解）
    constraint_penalty_weights:
      soc_violation: 1000.0         # SOC违规惩罚系数
      power_violation: 500.0        # 功率违规惩罚系数
      grid_violation: 2000.0        # 电网违规惩罚系数（最高）
      revenue_shortfall: 100.0      # 收益不足惩罚系数

  # 实时决策逻辑
  real_time_decision:
    execution_cycle_sec: 5         # 决策周期（秒）

    decision_tree:
      - level: 1
        check: "grid_available?"
        yes: "continue_normal_strategy"
        no: "trigger_islanding_sequence"

      - level: 2
        check: "soc >= emergency_reserve?"
        no: "stop_all_discharge, start_charge"
        yes: "continue"

      - level: 3
        check: "demand_exceeds_threshold?"
        yes: "trigger_demand_control"
        no: "continue_peak_valley"

      - level: 4
        check: "current_price_tier == peak?"
        yes: "execute_discharge_if_soc_sufficient"
        no: "check_valley_charge_window"

  # 策略监控与日志
  monitoring:
    enabled: true
    metrics:
      - "strategy_activation_count_per_day"
      - "conflict_resolution_count_per_day"
      - "actual_vs_planned_power_kw"
      - "soc_at_strategy_boundary"
    log_retention_days: 90
```

## 2.6 策略编译Pipeline

```yaml
# 策略编译Pipeline配置
compilation_pipeline:
  stages:
    - name: "parse_natural_language"
      description: "解析自然语言策略描述"
      inputs:
        - type: "user_text"
          example: "充电时段在晚上10点到早上8点，放电时段在早上8点到晚上10点，尖峰时段优先放电，保持20%以上的备电"
      outputs:
        - type: "structured_intent"
          format: "JSON"

    - name: "resolve_provincial_tou"
      description: "加载对应省份分时电价配置"
      inputs:
        - type: "province_code"
        - type: "effective_date"
      outputs:
        - type: "tou_calendar"
          format: "YAML"

    - name: "generate_yaml_config"
      description: "生成结构化YAML配置"
      inputs:
        - type: "structured_intent"
        - type: "tou_calendar"
      outputs:
        - type: "strategy_yaml"
          format: "YAML"
      validation:
        - check: "all_required_fields_present"
        - check: "value_ranges_valid"
        - check: "province_code_recognized"

    - name: "validate_schema"
      description: "YAML Schema校验"
      inputs:
        - type: "strategy_yaml"
      outputs:
        - type: "validation_report"
        errors:
          - type: "missing_required_field"
            field: "bms_safety.soc_max"
            severity: "error"
          - type: "value_out_of_range"
            field: "pcs_safety.power_max_charge"
            value: 1500.0
            max: 1000.0
            severity: "error"
        warnings:
          - type: "recommended_field_missing"
            field: "demand_control.recovery_strategy"
            severity: "warning"

    - name: "compile_to_binary"
      description: "编译为EMS可执行二进制格式"
      inputs:
        - type: "validated_yaml"
      outputs:
        - type: "strategy_binary"
          format: "EMS-executable"
      compilation_checks:
        - check: "battery_capacity_vs_grid_connection_compatibility"
        - check: "demand_threshold_vs_contract_demand_consistency"
        - check: "emergency_reserve_vs_available_capacity"

    - name: "simulate_validation"
      description: "仿真验证策略有效性"
      inputs:
        - type: "strategy_binary"
      outputs:
        - type: "simulation_report"
      metrics:
        - "estimated_annual_revenue"
        - "battery_cycles_per_year"
        - "demand_penalty_savings"
        - "strategy_conflict_rate"
```

---

# 模块三：多时间尺度分层架构

## 3.1 日级调度层（Day-Ahead Scheduling）

```yaml
# 日级调度层配置
day_ahead_scheduling:
  enabled: true
  execution_time: "00:00"         # 每天00:00生成次日计划

  # 输入数据
  inputs:
    tou_calendar:
      source: "provincial_electricity_price_library"
      description: "次日24h分时电价时段划分"

    weather_forecast:
      source: "weather_api"
      horizon_hours: 48
      data_points:
        - temperature_2m_c
        - solar_radiation_wm2
        - cloud_cover_okta

    load_forecast:
      source: "site_load_history"  # 或ML预测模型
      method: "similar_day + correction"
      granularity_hours: 1

    pv_forecast:
      source: "solar_irradiance_forecast"
      method: "clear_sky_index × weather_correction"
      horizon_hours: 48

    maintenance_plan:
      source: "manual_input"
      description: "次日设备检修计划（若有）"

  # 输出：次日24h充放电计划
  outputs:
    dispatch_plan:
      format: "24h × 96slots (15min resolution)"
      fields:
        - timestamp
        - target_soc_percent
        - charge_discharge_power_kw
        - revenue_expected_cny
        - strategy_active

    schedule_matrix:
      example: |
        00:00-01:00: charge 800kW, target_soc 25%
        01:00-07:00: charge 1000kW, target_soc 60%
        07:00-08:00: idle (soc hold 60%)
        08:00-11:00: discharge 800kW, target_soc 40%
        11:00-13:00: charge 300kW (solar offset), target_soc 50%
        13:00-15:00: discharge 800kW, target_soc 30%
        15:00-17:00: discharge 1000kW (peak), target_soc 15%
        17:00-22:00: discharge 600kW, target_soc 8%
        22:00-24:00: charge 800kW, target_soc 25%

  # 优化算法
  optimization_algorithm:
    method: "MILP"                 # 混合整数线性规划
    solver: "gurobi"               # 或cplex, glpk
    objective: "maximize_daily_revenue"
    constraints:
      - soc_trajectory (from SOC_min to SOC_max)
      - power_limits (charge/discharge)
      - grid_connection_limit
      - reserve_soc_for_emergency
      - maintenance_windows

    execution_time_limit_sec: 120   # 求解超时限制

  # 峰谷时段预判
  peak_valley_preparation:
    peak_hours_identified:
      - time: "08:00-11:00"
        expected_price_tier: "peak"
        recommended_discharge_window: true
      - time: "11:00-13:00"
        expected_price_tier: "peak"
        solar_offset_factor: 0.4    # 光伏可承担40%负荷
      - time: "13:00-15:00"
        expected_price_tier: "peak"
        recommended_discharge_window: true
      - time: "15:00-17:00"
        expected_price_tier: "peak"
        recommended_discharge_window: true
        strategy: "aggressive"      # 尖峰前保持高位
      - time: "17:00-21:00"
        expected_price_tier: "peak"
        recommended_discharge_window: true
      - time: "21:00-23:00"
        expected_price_tier: "peak"
        recommended_discharge_window: false

    valley_hours_identified:
      - time: "00:00-07:00"
        expected_price_tier: "valley"
        recommended_charge_window: true
        charge_target: "max_soc_95"
      - time: "23:00-24:00"
        expected_price_tier: "valley"
        recommended_charge_window: true

  # 检修计划处理
  maintenance_handling:
    scheduled_maintenance:
      - equipment: "PCS_A"
        start_time: "10:00"
        end_time: "14:00"
        action: "exclude_from_dispatch_plan"
        available_power: 0

      - equipment: "BMS_Unit2"
        start_time: "08:00"
        end_time: "12:00"
        action: "reduce_available_capacity_by_30%"
```

## 3.2 小时级调度层（Intra-Day Optimization）

```yaml
# 小时级调度层配置
intraday_scheduling:
  enabled: true
  execution_cycle: "15min"         # 每15分钟滚动优化

  # 滚动优化机制
  rolling_optimization:
    horizon_hours: 4              # 优化4小时窗口
    update_interval_min: 15       # 每15分钟更新
    replan_trigger:
      - condition: "actual_load_vs_forecast deviation > 15%"
      - condition: "pv_generation_vs_forecast deviation > 20%"
      - condition: "grid_price_significant_change"
      - condition: "equipment_status_change"

  # 响应快速变化
  fast_response:
    pv_overgeneration:
      detection_threshold_kw: 200  # 光伏超发超过200kW时触发
      response_action: "increase_charge_power"
      response_delay_sec: 30
      max_charge_power_kw: 1000

    load_surge:
      detection_threshold_kw: 300  # 负荷突增超过300kW时触发
      response_action: "increase_discharge_power"
      response_delay_sec: 60

    grid_price_update:
      source: "real_time_grid_price_api"
      update_frequency: "15min"
      trigger_replan: "price_change > 0.05元/kWh"

  # 与日级计划的协调
  coordination_with_day_ahead:
    deviation_tolerance:
      soc_deviation_percent: 5     # SOC偏差超过5%则修正计划
      power_deviation_percent: 10   # 功率偏差超过10%则修正计划

    correction_mechanism:
      method: "incremental_adjustment"
      max_adjustment_per_step: "15min平均功率 × 2"
      smoothing: "ramp_rate_limited"
```

## 3.3 秒级控制层（Real-Time Control）

```yaml
# 秒级控制层配置
real_time_control:
  enabled: true
  execution_cycle: "1sec"          # 每秒执行一次控制循环

  # 控制目标
  control_objectives:
    - objective: "track_dispatch_command"
      tolerance_kw: 50            # 跟踪偏差容限
      tolerance_sec: 5             # 响应时间容限

    - objective: "maintain_grid_frequency"
      target_hz: 50.0
      droop_slope: 0.04
      activation_threshold_hz: ±0.1  # 频率偏移超过0.1Hz时激活

    - objective: "prevent_islanding"
      detection_method: "voltage_phase_shift"
      detection_threshold_deg: 15   # 相位偏移超过15°判定为离网

  # 实时功率跟踪
  power_tracking:
    target_source: "intraday_schedule"  # 来自小时级调度
    feedback_control:
      method: "PI_controller"
      kp: 0.5
      ki: 0.1
      update_rate_hz: 1

    error_correction:
      - error_type: "steady_state_error"
        correction: "adjust_ki"
      - error_type: "overshoot"
        correction: "reduce_kp"
      - error_type: "oscillation"
        correction: "add_derivative_filter"

  # 防孤岛快速响应
  anti_islanding:
    detection_time_ms: 200         # 检测到并网异常到开始响应的总时间

    response_sequence:
      - t=0ms:    detect_voltage_sag / frequency_deviation
      - t=50ms:   confirm_islanding (multi-method verification)
      - t=100ms:  initiate_vf_control
      - t=150ms:  trip_pcc_breaker
      - t=200ms:  confirm_islanded_operation
      - t=300ms:  stabilize_load

    performance_requirement:
      total_response_time_ms: < 500  # 从故障到稳定运行 < 500ms

  # SOC实时保护
  soc_real_time_protection:
    discharge_block:
      condition: "soc < soc_soft_lower_limit"
      action: "reduce_discharge_to_zero"
      ramp_rate_kw_per_sec: 100

    charge_block:
      condition: "soc > soc_soft_upper_limit"
      action: "reduce_charge_to_zero"
      ramp_rate_kw_per_sec: 100

    temperature_protection:
      charge_reduce_on_high_temp:
        condition: "battery_temp > 40°C"
        action: "reduce_charge_power_by_50%"
      full_stop_on_critical_temp:
        condition: "battery_temp > 45°C"
        action: "full_stop_charge_and_discharge"
```

## 3.4 分层协同机制

```yaml
# 分层协同配置
layer_coordination:
  # 指令下传
  command_flow:
    day_ahead_plan:
      role: "reference_trajectory"
      update_frequency: "daily"
      confidence: "high"

    intraday_adjustment:
      role: "fine_tuning"
      update_frequency: "15min"
      confidence: "medium"

    real_time_control:
      role: "execution_tracking"
      update_frequency: "1sec"
      confidence: "critical"

  # 状态上报
  status_reporting:
    real_time_to_intraday:
      data: "current_soc, current_power, grid_status"
      frequency: "1sec"
      aggregation: "average_1min"

    intraday_to_day_ahead:
      data: "actual_dispatch_data, revenue_achieved"
      frequency: "15min"
      aggregation: "hourly_summary"

  # 冲突仲裁
  conflict_arbitration:
    principle: "下层服从上层，但下层可紧急干预"

    scenarios:
      - scenario: "real_time_emergency vs intraday_plan"
        decision: "real_time_emergency overrides"
        reason: "安全保护最高优先级"

      - scenario: "intraday_replan vs day_ahead_plan"
        decision: "intraday_adjustment applied with smoothing"
        mechanism: "gradual transition over 15min"
```

---

# 模块四：容量与经济优化配置

## 4.1 储能可用容量计算

```yaml
# 可用容量计算配置
usable_capacity_calculation:
  # 基础参数
  nominal_capacity_kwh: 2000.0     # 额定容量（从电池规格获取）

  # SOH修正
  soh_correction:
    current_soh: 0.92             # 当前SOH（来自BMS实时报告）
    soh_forecast_method: "linear_degradation"  # 或exponential, calendar_based

    degradation_rate_per_cycle: 0.001   # 每次循环SOH降低0.1%
    degradation_rate_per_year: 0.02     # 每年日历老化2%

    future_soh_prediction:
      - horizon: "1year"
        method: "linear_extrapolation"
        result: "soh ≈ 0.90"
      - horizon: "5year"
        method: "linear_extrapolation"
        result: "soh ≈ 0.80"

  # 备电容量预留
  reserve_capacity:
    emergency_reserve_kwh: 400.0  # 应急备电预留（20% of nominal）
    minimum_reserve_kwh: 200.0    # 极端情况最低保留（10% of nominal）

    # 可调度容量 = (额定容量 × SOH) - 备电预留
    calculable_capacity:
      formula: "usable_capacity = nominal_capacity × soh - reserve_capacity"
      result_kwh: 2000 × 0.92 - 400 = 1440.0  # 可用容量约1440kWh

  # 温度修正
  temperature_correction:
    reference_temp_c: 25
    factor_table:
      - temp_c: -10
        factor: 0.60              # 低温下容量大幅降低
      - temp_c: 0
        factor: 0.80
      - temp_c: 15
        factor: 0.90
      - temp_c: 25
        factor: 1.00              # 基准温度
      - temp_c: 35
        factor: 1.00
      - temp_c: 45
        factor: 0.85              # 高温下容量略有降低

    effective_capacity_formula: "effective_capacity = calculable_capacity × temp_factor"

  # 循环寿命预算
  cycle_life_budget:
    design_cycle_life: 6000       # 设计循环寿命（次）
    used_cycles: 1200             # 已使用循环次数（来自BMS）
    remaining_cycles: 4800       # 剩余可用循环

    cycle_usage_policy:
      conservative: "每天最多使用1次循环（年度360次）"
      moderate: "每天最多使用1.5次循环（年度540次）"
      aggressive: "每天最多使用2次循环（年度720次）"

    recommended_policy: "moderate"  # 平衡收益和寿命

    cost_per_cycle:
      battery_replacement_cost_cny: 800000  # 电池更换成本（元）
      cost_per_cycle_cny: 800000 / 4800 = 166.67  # 元/次

  # 容量健康度报告
  capacity_health_report:
    metrics:
      - metric: "nominal_capacity_kwh"
        value: 2000.0
      - metric: "current_soh_percent"
        value: 92.0
      - metric: "effective_capacity_kwh"
        value: 1440.0
      - metric: "temperature_adjusted_capacity_kwh"
        value: 1440.0  # 当前温度下
      - metric: "remaining_cycle_life"
        value: 4800
      - metric: "estimated_end_of_life_date"
        value: "2032-06"  # 基于当前衰减率预测
```

## 4.2 多目标优化配置（MILP）

```yaml
# 多目标优化配置
multi_objective_optimization:
  enabled: true

  # 优化方法
  method: "weighted_sum_milp"     # 加权求和法，或Pareto优化
  solver: "gurobi"                # 或cplex, highs, glpk
  solver_options:
    time_limit_sec: 300
    mip_gap: 0.01
    threads: 4

  # 目标函数配置
  objective_function:
    primary:
      name: "maximize_daily_revenue"
      formula: |
        maximize: Σ_t (revenue_discharge[t] - cost_charge[t] - cost_battery_degradation[t])
        where:
          revenue_discharge[t] = discharge_kwh[t] × peak_price[t]
          cost_charge[t] = charge_kwh[t] × valley_price[t] / efficiency
          cost_battery_degradation[t] = cycle_fraction[t] × cycle_cost_cny

    secondary_objectives:
      - name: "minimize_battery_degradation"
        weight: 0.20
        formula: "minimize Σ_t cycle_wear_cost[t]"
      - name: "maintain_grid_stability"
        weight: 0.10
        formula: "minimize Σ_t grid_deviation_penalty[t]"
      - name: "meet_demand_response"
        weight: 0.15
        formula: "minimize demand_penalty_cost[t]"

  # 决策变量
  decision_variables:
    charge_power_kw[t]:            # 每个时段的充电功率（连续变量）
      type: "continuous"
      range: [0, battery_power_kw]
      binary: false

    discharge_power_kw[t]:         # 每个时段的放电功率（连续变量）
      type: "continuous"
      range: [0, battery_power_kw]

    soc_percent[t]:                # 每个时段的SOC（连续变量）
      type: "continuous"
      range: [soc_min, soc_max]

    is_charging[t]:                # 是否充电（0/1整数变量）
      type: "binary"
      description: "防止同时充放电"

    is_discharging[t]:            # 是否放电（0/1整数变量）
      type: "binary"

  # 约束条件配置
  constraints:
    - type: "soc_trajectory"
      formula: |
        soc[t+1] = soc[t] + (charge_kwh[t] × efficiency - discharge_kwh[t]) / capacity
      initial_condition: "soc[0] = current_soc"
      terminal_condition: "soc[T] >= soc_min_reserve"

    - type: "mutual_exclusion"
      formula: "charge_kwh[t] × discharge_kwh[t] = 0"
      implementation: "is_charging[t] + is_discharging[t] <= 1"

    - type: "power_bounds"
      formula: |
        charge_power_kw[t] <= power_max_charge × is_charging[t]
        discharge_power_kw[t] <= power_max_discharge × is_discharging[t]

    - type: "grid_connection_limit"
      formula: |
        charge_power_kw[t] + site_load_kw[t] <= grid_connection_kw
        site_load_kw[t] - discharge_power_kw[t] <= grid_connection_kw

    - type: "emergency_reserve"
      formula: "soc[t] >= emergency_reserve_soc for all t during peak hours"
      description: "尖峰时段必须保持应急备电"

    - type: "cycle_budget"
      formula: "Σ_t cycle_fraction[t] <= daily_cycle_budget"
      daily_cycle_budget: 0.015    # 每天最多使用1.5%的设计循环寿命

  # 优化结果输出
  outputs:
    - "optimal_charge_schedule_15min"
    - "optimal_discharge_schedule_15min"
    - "soc_trajectory_24h"
    - "estimated_daily_revenue"
    - "battery_cycle_usage"
```

## 4.3 实时收益计算接口

```yaml
# 实时收益计算接口
real_time_revenue_calculation:
  enabled: true
  update_interval_sec: 60

  # 当前状态输入
  current_state:
    - soc_percent: "实时SOC（来自BMS）"
    - current_power_kw: "实时充放电功率（来自PCS）"
    - electricity_price_now: "当前时段电价（来自电网或预测）"
    - grid_direction: "charging | discharging | idle"

  # 实时收益计算
  real_time_metrics:
    minute_revenue:
      formula: |
        if grid_direction == "discharging":
          minute_revenue = current_power_kw / 60 × electricity_price_now
        elif grid_direction == "charging":
          minute_revenue = -1 × current_power_kw / 60 × electricity_price_now / efficiency
        else:
          minute_revenue = 0
      unit: "元/分钟"
      sign_convention: "正=收益，负=成本"

    hourly_revenue:
      aggregation: "sum of minute_revenue for past 60min"
      unit: "元/小时"

    daily_revenue:
      aggregation: "sum of minute_revenue for current day"
      unit: "元/天"
      reset_time: "00:00"

    monthly_revenue:
      aggregation: "sum of daily_revenue for current month"
      unit: "元/月"
      reset_time: "month start"

  # 收益分解
  revenue_breakdown:
    peak_discharge_revenue:
      formula: "Σ peak_hours discharge_kwh × peak_price"
    valley_charge_cost:
      formula: "Σ valley_hours charge_kwh × valley_price / efficiency"
    demand_control_savings:
      formula: "(contract_demand - actual_max_demand) × demand_price"
    auxiliary_services_revenue:
      formula: "frequency_response revenue + voltage support revenue"

  # 预测收益
  predicted_revenue:
    today_remaining:
      method: "remainder_of_day_ahead_plan"
      formula: "Σ remaining_hours planned_power × expected_price"

    this_month:
      method: "daily_revenue_so_far + predicted_remaining_days"
      confidence_interval: ±10%

    this_year:
      method: "monthly_projection × remaining_months"
      confidence_interval: ±15%

  # 收益告警
  alerts:
    daily_revenue_floor:
      threshold_cny: 800          # 日收益低于800元告警
      action: "check if equipment_down or grid_restricted"

    monthly_revenue_shortfall:
      threshold_percent: 80       # 月收益低于预期的80%告警
      action: "review strategy_parameters"

    revenue_anomaly:
      detection: "revenue < cost"
      action: "immediate_strategy_review"
```

---

# 模块五：安全约束配置

## 5.1 BMS安全边界

```yaml
# BMS安全边界配置
bms_safety:
  # SOC保护层级
  soc_protection_levels:
    - level: 1  # 最外层：硬件保护
      name: "hard_limit"
      soc_upper: 1.00
      soc_lower: 0.00
      action: "BMS强制切断，不响应EMS指令"
      recoverable: false

    - level: 2  # 第二层：软件告警
      name: "warning_threshold"
      soc_upper: 0.98
      soc_lower: 0.02
      action: "BMS告警，EMS自动限制充放电功率50%"
      recoverable: true

    - level: 3  # 第三层：策略软限制
      name: "soft_limit"
      soc_upper: 0.95
      soc_lower: 0.10
      action: "EMS策略禁止充放电超出此范围"
      recoverable: true

    - level: 4  # 第四层：运行目标
      name: "operating_target"
      soc_upper: 0.92
      soc_lower: 0.15
      action: "日常运行SOC保持在此范围内"
      recoverable: true

  # 电流保护配置
  current_protection:
    max_charge_current_a: 500.0  # 最大充电电流（A）
    max_discharge_current_a: 500.0  # 最大放电电流（A）

    overcurrent_response:
      - threshold_percent: 110
        action: "reduce_power_by_10%"
        delay_sec: 5
      - threshold_percent: 120
        action: "reduce_power_by_30%"
        delay_sec: 2
      - threshold_percent: 150
        action: "immediate_stop"
        delay_sec: 0

  # 温度保护配置
  temperature_protection:
    # 温度分级
    levels:
      - level: "normal"
        range_c: [15, 35]
        action: "正常运行，无限制"

      - level: "elevated"
        range_c: [35, 40]
        action: "降低充放电功率50%，启动热管理"

      - level: "high"
        range_c: [40, 45]
        action: "降低充放电功率80%，禁止大功率充放电"

      - level: "critical"
        range_c: [45, 60]
        action: "立即停机，等待温度下降"
        recoverable_after_temp_drop_c: 35

      - level: "emergency"
        range_c: [60, 100]
        action: "强制停机，触发消防告警"
        notification: "emergency_alert_to_ops_team"

    cold_weather_protection:
      charge_prohibition_below_c: 5    # 低于5°C禁止充电
      discharge_limiting_below_c: 0     # 低于0°C限制放电50%
      preheating_enabled: true          # 启用电池预热功能

  # 单体电压保护
  cell_voltage_protection:
    overvoltage:
      threshold_v: 3.65
      action: "立即停止充电"
      hysteresis_v: 3.55    # 电压降到3.55V以下才允许恢复充电

    undervoltage:
      threshold_v: 2.70
      action: "立即停止放电"
      hysteresis_v: 2.80    # 电压升到2.80V以上才允许恢复放电

    imbalance_protection:
      max_cell_voltage_difference_v: 0.10
      action: "触发均衡功能，若持续则告警"
```

## 5.2 PCS安全边界

```yaml
# PCS安全边界配置
pcs_safety:
  # 有功功率限值
  active_power_limits:
    max_charge_power_kw: 1000.0
    max_discharge_power_kw: 1000.0

    overload_capability:
      overload_110_percent_duration_sec: 60
      overload_120_percent_duration_sec: 10
      overload_150_percent_duration_sec: 1  # 仅用于故障穿越

  # 无功功率配置
  reactive_power_control:
    max_reactive_power_kvar: 500.0       # 最大无功功率（千乏）
    power_factor_range: [0.85, 0.95]     # 功率因数可调范围

    modes:
      - mode: "fixed_power_factor"
        config: {power_factor: 0.95}
      - mode: "fixed_reactive_power"
        config: {reactive_power_kvar: 200}
      - mode: "voltage_support"
        config: {target_voltage_pu: 1.00, droop: 0.04}
      - mode: "power_factor_weak_grid"
        config: {min_power_factor: 0.90}

  # 效率MAP
  efficiency_map:
    description: "不同负载率下的PCS效率，用于损耗补偿计算"
    data_points:
      - load_percent: 10
        efficiency: 0.90
      - load_percent: 20
        efficiency: 0.94
      - load_percent: 30
        efficiency: 0.96
      - load_percent: 50
        efficiency: 0.97
      - load_percent: 75
        efficiency: 0.97
      - load_percent: 100
        efficiency: 0.96

    formula: "efficiency = interpolate(load_percent, efficiency_map)"

  # 过载保护
  overload_protection:
    thermal_overload:
      time_constant_min: 10             # 热时间常数（分钟）
      max_temperature_c: 85             # 元件最高温度

    overload_curve:
      - overload_percent: 100           # 100% = 额定功率
        duration_sec: 999999            # 可长期运行
      - overload_percent: 110
        duration_sec: 60                # 可运行60秒
      - overload_percent: 120
        duration_sec: 10                # 可运行10秒
      - overload_percent: 150
        duration_sec: 1                 # 仅瞬时故障穿越

  # 并离网切换限制
  grid_connection_constraints:
    sync_criteria:
      voltage_diff_percent_max: 5       # 电压差值<5%
      frequency_diff_hz_max: 0.1       # 频率差值<0.1Hz
      phase_angle_diff_deg_max: 10     # 相角差值<10°
      sync_steady_time_sec: 5          # 稳定5秒后才允许合闸

    switching_constraints:
      max_switching_per_hour: 6         # 每小时最多切换6次
      min_switching_interval_sec: 300   # 切换间隔至少5分钟
```

## 5.3 电网安全边界

```yaml
# 电网安全边界配置
grid_safety:
  # 并网功率控制
  grid_connection_control:
    max_import_power_kw: 1200.0        # 最大从电网取电功率
    max_export_power_kw: 0.0           # 禁止向电网送电（0表示禁止）

    # 反向潮流管理
    export_strategy:
      allow_export: false              # 默认禁止反向潮流
      exception_cases:
        - case: "emergency_feedin"
          condition: "grid_frequency < 49.0 Hz"
          max_export_kw: 500
        - case: "voltage_support"
          condition: "grid_voltage < 0.95 pu"
          max_export_kvar: 300

  # 频率响应
  frequency_response:
    enabled: true

    overfrequency_response:
      threshold_hz: 50.2
      response:
        - freq_hz: 50.2
          action: "reduce_output_power_5%"
        - freq_hz: 50.5
          action: "reduce_output_power_10%"
        - freq_hz: 51.0
          action: "stop_discharge"

    underfrequency_response:
      threshold_hz: 49.8
      response:
        - freq_hz: 49.8
          action: "increase_discharge_power_5%"
        - freq_hz: 49.5
          action: "increase_discharge_power_10%"
        - freq_hz: 49.0
          action: "maximum_discharge"

  # 电压支撑
  voltage_support:
    mode: "reactive_power_control"     # 或"power_factor_control"
    target_voltage_pu: 1.00

    voltage_responses:
      - voltage_pu: 1.07
        action: "absorb_reactive_power (cos phi 0.95 lagging → 0.95 leading)"
      - voltage_pu: 1.10
        action: "maximum_reactive_power_absorption"
      - voltage_pu: 0.93
        action: "inject_reactive_power (cos phi 0.95 lagging → 0.95 leading)"
      - voltage_pu: 0.90
        action: "maximum_reactive_power_injection"

  # 谐波限制
  harmonic_limits:
    thdv_limit_percent: 5.0            # 总谐波电压畸变率
    thdi_limit_percent: 8.0            # 总谐波电流畸变率

    harmonic_mitigation:
      enabled: true
      method: "active_filtering"
      target_thdv_percent: 3.0

  # 功率因数控制
  power_factor_control:
    target_power_factor: 0.95         # 目标功率因数（滞后）
    acceptable_range: [0.90, 1.00]
    reactive_power_compensation_enabled: true
```

## 5.4 消防联动策略

```yaml
# 消防联动策略配置
fire_safety_integration:
  enabled: true
  description: "消防告警触发后的自动化响应序列"

  # 消防系统接口
  fire_system_interface:
    input_signals:
      - signal: "fire_alarm_zone_1"
        type: "binary"
        description: "区域1感温感烟告警"
      - signal: "fire_alarm_zone_2"
        type: "binary"
        description: "区域2感温感烟告警"
      - signal: "fire_alarm_central"
        type: "binary"
        description: "消防主机告警"
      - signal: "sprinkler_activation"
        type: "binary"
        description: "喷淋系统启动"

  # 联动响应序列
  response_sequence:
    phase_1_immediate:
      triggers:
        - "fire_alarm_zone_1 = true"
        - "fire_alarm_zone_2 = true"
        - "fire_alarm_central = true"

      actions:
        - t=0s:
          action: "disconnect_pcc_breaker"
          reason: "隔离并网，防止电气火灾蔓延"
        - t=5s:
          action: "stop_all_charge_discharge"
          reason: "停止所有功率变换，消除热源"
        - t=10s:
          action: "activate_hvac_smoke_mode"
          reason: "排烟通风，减少烟气聚集"
        - t=30s:
          action: "open_battery_compartment_vent"
          reason: "泄压排气，防止气体积聚爆炸"

    phase_2_soc_release:
      # SOC释放：火灾时将电池SOC降低到安全水平
      enabled: true
      trigger: "fire_alarm_confirmed AND personnel_evacuated"

      soc_release_strategy:
        method: "controlled_discharge_to_load"
        target_soc: 0.05               # 降低到5% SOC
        max_discharge_power_kw: 50    # 小功率放电，确保安全
        max_discharge_duration_min: 60
        priority: "safety_over_all"

        alternative_if_no_load:
          method: "passive_thermal_runaway_cooling"
          action: "activate_contained_cooling_system"
          description: "若无可控负载，则等待BMS自然冷却"

    phase_3_communication:
      - t=0s:
        action: "send_fire_alarm_to_ems_central"
      - t=30s:
        action: "send_sms_to_ops_manager"
      - t=60s:
        action: "send_alarm_to_fire_department (if configured)"
      - t=300s:
        action: "confirm_battery_soc_released"

  # 人员安全
  personnel_safety:
    evacuation_priority: true
    description: "人员安全优先于设备保护"

    evacuation_triggers:
      - condition: "fire_alarm AND smd_level > 2"
        action: "immediate_evacuation"
      - condition: "smoke_detector_active"
        action: "immediate_evacuation"

    access_restriction:
      area: "battery_compartment"
      condition: "fire_alarm_active OR temp > 45°C"
      action: "deny_access_until_cleared"

  # 复归流程
  reset_procedure:
    description: "火灾解除后的系统恢复流程"

    conditions_for_reset:
      - "fire_alarm_cleared_by_fire_department"
      - "battery_compartment_inspected"
      - "smoke_cleared"
      - "temp_normalized_to < 30°C"
      - "no_damage_to_bms_pcs"

    reset_steps:
      1. "Visual inspection of battery system"
      2. "BMS self-test and diagnostic"
      3. "PCS inspection and commissioning"
      4. "Grid synchronization check"
      5. "Gradual reconnection (50% power for 30min)"
      6. "Full operation clearance"

  # 联动日志
  logging:
    enabled: true
    events_logged:
      - fire_alarm_trigger
      - action_executed
      - response_time
      - soc_at_alarm
      - personnel_status
    retention_days: 730              # 保留2年
```

---

# 附录：配置示例与使用指南

## A. 快速启动配置示例

```yaml
# 快速启动示例：广东工业园储能系统
meta:
  name: "广东XX工业园储能策略_v1.0"
  version: "1.0.0"
  province: GD
  created_at: "2025-01-15T10:00:00+08:00"

environment:
  battery_capacity_kwh: 2000.0
  battery_power_kw: 1000.0
  grid_connection_kw: 1200.0
  soh_initial: 0.92
  soh_min_threshold: 0.75
  site_type: industrial

# 直接引用各模块配置
bms_safety:
  soc_max: 0.95
  soc_min: 0.10
  soc_soft_upper_limit: 0.92
  soc_soft_lower_limit: 0.15
  charge_current_max: 500.0
  discharge_current_max: 500.0
  temperature_max: 45.0

pcs_safety:
  power_max_charge: 1000.0
  power_max_discharge: 1000.0

grid_safety:
  grid_connection_limit: 1200.0
  reverse_power_limit: 0.0

peak_shaving_valley_filling:
  enabled: true
  priority: 1
  # 详细参数见模块2.2

demand_control:
  enabled: true
  priority: 2
  demand_threshold:
    contract_demand_kw: 2000.0
    demand_target_kw: 1800.0

emergency_backup:
  enabled: true
  priority: 0
```

## B. 编译验证检查清单

```yaml
compilation_validation:
  schema_check:
    - all_required_fields_present
    - all_enums_valid
    - all_numbers_in_range

  consistency_check:
    - battery_capacity >= battery_power / 2 (可用容量充足)
    - grid_connection >= battery_power (并网容量够用)
    - soc_min < emergency_reserve (备电配置合理)

  safety_check:
    - bms_safety.soc_max < 1.0
    - bms_safety.soc_min > 0.0
    - temperature_max > temperature_min

  economic_check:
    - peak_price > valley_price (峰谷价差存在)
    - estimated_daily_revenue > 0 (预期收益为正)
```

## C. 电价库使用指南

```yaml
electricity_price_usage:
  step_1: "确定省份代码（province字段）"
  step_2: "加载对应省份的tou_config"
  step_3: "根据日期匹配版本号"
  step_4: "识别当前时段（尖峰/峰/平/谷）"
  step_5: "查询实时电价或使用预测电价"

  seasonal_adjustment:
    - "识别当前月份"
    - "检查是否有季节性浮动配置"
    - "应用浮动系数"

  example: |
    province: GD
    date: 2025-01-15
    time: 14:30
    → 尖峰时段 (14-17时)
    → 广东电价: 尖峰 1.4328元/kWh
```

---

**文档版本历史**
| 版本 | 日期 | 修改内容 |
|------|------|----------|
| 1.0.0 | 2025-01-15 | 初始版本，包含5大核心模块 |