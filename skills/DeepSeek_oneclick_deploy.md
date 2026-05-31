---
name: DeepSeek-oneclick-deploy
description: >
  储能系统一键部署综合Skill v2.0。融合跨平台预检(PowerShell+Bash)、.env参数配置模板、
  Modbus/CAN/IEC104多协议采集YAML配置、EMQX→TDengine规则引擎桥接、
  FRP+WireGuard远程运维通道、Docker Compose全栈编排。
  覆盖从服务器预检到健康检查的完整一键部署流程,20分钟完成全部系统上线。
  适用场景:储能站现场工程师一键部署/远程运维。
  适用对象:现场部署工程师、运维工程师、项目经理。
---

# 储能系统一键部署综合Skill v2.0

## 目录

- [一、部署架构总览](#一部署架构总览)
- [二、跨平台预检脚本](#二跨平台预检脚本)
- [三、.env参数配置模板](#三env参数配置模板)
- [四、Modbus TCP采集配置](#四modbus-tcp采集配置)
- [五、CAN采集配置](#五can采集配置)
- [六、IEC104采集配置](#六iec104采集配置)
- [七、EMQX规则引擎配置(桥接TDengine)](#七emqx规则引擎配置桥接tdengine)
- [八、TDengine数据库设计](#八tdengine数据库设计)
- [九、PostgreSQL配置数据库](#九postgresql配置数据库)
- [十、Redis与Nginx部署](#十redis与nginx部署)
- [十一、EMS微服务Docker配置](#十一ems微服务docker配置)
- [十二、Docker Compose完整模板](#十二docker-compose完整模板)
- [十三、FRP+WireGuard远程运维](#十三frpwireguard远程运维)
- [十四、一键部署脚本](#十四一键部署脚本)
- [十五、健康检查探针体系](#十五健康检查探针体系)
- [十六、备份恢复脚本](#十六备份恢复脚本)
- [十七、部署交付检查清单](#十七部署交付检查清单)

---

## 一、部署架构总览

### 1.1 系统拓扑

```
┌─────────────────────────────────────────────────────────────────┐
│                    储能站服务器 / 工控机                          │
│         Ubuntu 22.04+ / Windows Server 2019+                     │
│         CPU ≥ 8核 | 内存 ≥ 16GB | SSD ≥ 256GB                    │
├─────────────────────────────────────────────────────────────────┤
│                    Docker Engine 24+                             │
│                                                                 │
│  【中间件层】                                                     │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ TDengine │ │  EMQX    │ │PostgreSQL│ │  Redis   │           │
│  │  时序库   │ │ MQTT     │ │  关系库   │ │  缓存    │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│                                                                 │
│  【应用层】                                                       │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │EMS-Core  │ │EMS-API   │ │EMS-WebUI │ │ Nginx    │           │
│  │数据采集  │ │ REST接口  │ │ 前端界面  │ │反向代理  │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
│  ┌──────────┐ ┌──────────┐                                      │
│  │EMS-Strgy │ │EMS-Rpt   │                                      │
│  │ 策略引擎  │ │ 报表统计  │                                      │
│  └──────────┘ └──────────┘                                      │
│                                                                 │
│  【采集驱动层】                                                   │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐           │
│  │ModbusTCP │ │ IEC104   │ │CAN采集   │ │ MQTT     │           │
│  │ Master   │ │ Master   │ │ Service  │ │ Client   │           │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘           │
└─────────────────────────────────────────────────────────────────┘
         │
         ▼
  【南向设备】
  PCS（功率变流器）← CAN / Modbus TCP / IEC104
  BMS（电池管理）← CAN / Modbus TCP
  电表（PCC关口）← Modbus RTU / IEC104
  消防主机← 干接点 / Modbus TCP
```

### 1.2 部署时序(6阶段/约20分钟)

```
Phase 1: 服务器预检        (3 min) — 硬件/OS/依赖/端口检查
Phase 2: Docker环境        (2 min) — Docker和docker-compose安装
Phase 3: 中间件部署        (5 min) — TDengine + EMQX + PostgreSQL + Redis
Phase 4: 采集驱动+数据库初始化 (5 min) — 南向驱动配置 + EMQX规则 + TDengine超级表
Phase 5: EMS微服务部署      (3 min) — EMS Core/API/WebUI/Strategy
Phase 6: 健康检查+交付      (2 min) — 全部探针验证 + 交付报告
```

### 1.3 部署包目录结构

```
/opt/ems/                        # Linux部署根目录
C:\EMS\                          # Windows部署根目录
├── .env                         # ★ 唯一需要工程师修改的配置
├── docker-compose.yml           # 完整容器编排
├── configs/
│   ├── tdengine/taos.cfg + init.sql
│   ├── emqx/emqx.conf + acl.conf + rules/
│   ├── postgres/init.sql
│   ├── nginx/nginx.conf
│   ├── collector/
│   │   ├── modbus_tcp.yaml     # Modbus TCP采集配置
│   │   ├── iec104.yaml          # IEC104采集配置
│   │   └── can.yaml             # CAN采集配置
│   └── ems/
│       ├── core_config.yaml
│       └── strategy.yaml
├── scripts/
│   ├── pre_check.ps1 / pre_check.sh
│   ├── deploy.sh / deploy.ps1
│   ├── health_check.sh
│   ├── backup.sh / restore.sh
│   └── remote_ops_setup.sh
├── data/
│   ├── tdengine/ emqx/ postgres/ redis/
│   └── ems-logs/
└── dockerfiles/
```

---

## 二、跨平台预检脚本

### 2.1 Windows预检(PowerShell)

```powershell
# pre_check.ps1 - EMS部署预检脚本（Windows）
# 使用方法：以管理员身份运行 PowerShell

$Global:PASS_COUNT = 0
$Global:FAIL_COUNT = 0

function Test-Requirement {
    param($Name, $Condition, $Required)
    $color = if ($Condition) { "Green" } else { "Red" }
    if (-not $Condition) { $Global:FAIL_COUNT++ } else { $Global:PASS_COUNT++ }
    Write-Host "  $(if($Condition){'✓'}else{'✗'}) $Name" -ForegroundColor $color
}

# CPU检查
$cpuCores = (Get-CimInstance Win32_ComputerSystem).NumberOfLogicalProcessors
Test-Requirement "CPU逻辑核心数: $cpuCores (要求≥4)" ($cpuCores -ge 4) $true

# 内存检查
$totalMemGB = [math]::Round((Get-CimInstance Win32_ComputerSystem).TotalPhysicalMemory / 1GB, 1)
Test-Requirement "总物理内存: ${totalMemGB}GB (要求≥8GB)" ($totalMemGB -ge 8) $true

# 磁盘检查
Get-CimInstance Win32_LogicalDisk -Filter "DriveType='3'" | ForEach-Object {
    $freeGB = [math]::Round($_.FreeSpace / 1GB, 1)
    Test-Requirement "磁盘 $($_.DeviceID) 可用: ${freeGB}GB (要求≥50GB)" ($freeGB -ge 50) $true
}

# Docker检查
$dockerVersion = & docker --version 2>$null
Test-Requirement "Docker已安装" ($dockerVersion -ne $null) $true
$dockerRunning = (Get-Service docker -ErrorAction SilentlyContinue).Status -eq 'Running'
Test-Requirement "Docker服务运行中" $dockerRunning $true

# 端口冲突检查
$requiredPorts = @(1883, 8083, 5432, 6379, 6030, 6041, 8080, 8081, 18083)
foreach ($port in $requiredPorts) {
    $connections = Get-NetTCPConnection -LocalPort $port -ErrorAction SilentlyContinue
    Test-Requirement "端口 $port 可用" ($connections -eq $null) $true
}

# 结果汇总
Write-Host "通过: $Global:PASS_COUNT 项, 失败: $Global:FAIL_COUNT 项"
```

### 2.2 Linux预检(Bash)

```bash
#!/bin/bash
# pre_check.sh - EMS部署预检脚本（Linux/Ubuntu）
PASS=0; FAIL=0

check() {
    local label="$1"; local cond=$2
    if [ "$cond" = "1" ]; then echo -e "  ✓ $label"; ((PASS++))
    else echo -e "  ✗ $label"; ((FAIL++)); fi
}

CORES=$(nproc 2>/dev/null || echo 4)
check "CPU核心数: $CORES (要求≥4)" $([ $CORES -ge 4 ] && echo 1 || echo 0)

MEM_KB=$(grep MemTotal /proc/meminfo | awk '{print $2}')
MEM_GB=$((MEM_KB / 1024 / 1024))
check "总物理内存: ${MEM_GB}GB (要求≥8GB)" $([ $MEM_GB -ge 8 ] && echo 1 || echo 0)

ROOT_FREE=$(df / | tail -1 | awk '{print $4/1024/1024}')
check "根分区可用: $(printf '%.1f' $ROOT_FREE)GB (要求≥50GB)" $([ $(echo "$ROOT_FREE > 50" | bc -l) -eq 1 ] && echo 1 || echo 0)

for PORT in 1883 8083 5432 6379 6030 6041 8080 8081; do
    if ss -tlnp 2>/dev/null | grep -q ":$PORT "; then
        check "端口 $PORT 已占用" 0
    else
        check "端口 $PORT 可用" 1
    fi
done

echo "通过: $PASS 项, 失败: $FAIL 项"
[ $FAIL -gt 0 ] && exit 1 || exit 0
```

### 2.3 预检通过标准

| 检查项 | 必须满足 | 推荐满足 |
|--------|---------|---------|
| CPU核数 | ≥ 4核 | ≥ 8核 |
| 内存 | ≥ 8GB | ≥ 16GB |
| 磁盘 | ≥ 50GB可用 | ≥ 100GB可用 |
| OS | Ubuntu 20.04+ / Win Server 2019+ | Ubuntu 22.04 |
| Docker | v20+ | v24+ |
| Docker Compose | v2+ | v2.20+ |
| 端口 | 全部空闲 | — |
| 时间偏差 | ≤ 5分钟 | ≤ 1分钟 |

---

## 三、.env参数配置模板

`★` = 工程师必须根据项目实际填写的参数

```bash
# ============================================================
# EMS一键部署配置文件 (.env)
# ★ 复制本文件为 .env，修改★标记的参数
# ============================================================

# 项目基本信息
SITE_NAME="浙江杭州XX工业园储能站"         # ★ 站点名称
SITE_ID="ems-hangzhou-001"                # ★ 站点唯一ID

# TDengine配置
TDENGINE_VERSION="3.2.3.0"
TDENGINE_DATABASE="ems_tsdb"
TDENGINE_PASSWORD="taosdata"              # ★ 修改为强密码
TDENGINE_KEEP_DAYS="365"

# EMQX配置
EMQX_VERSION="5.4.1"
EMQX_ADMIN_PASSWORD="Emqx@2024"          # ★ 修改为强密码

# PostgreSQL配置
PG_PASSWORD="Pg@2024Ems"                 # ★ 修改为强密码
PG_DATABASE="ems_config"

# Redis配置
REDIS_PASSWORD="Redis@2024Ems"           # ★ 修改为强密码
REDIS_MAXMEMORY="512mb"

# JWT密钥
JWT_SECRET="your-jwt-secret-change-in-production"  # ★ 修改

# 采集配置
COLLECTOR_MODBUS_TCP_ENABLED="true"
COLLECTOR_CAN_ENABLED="true"
COLLECTOR_IEC104_ENABLED="false"
COLLECTOR_INTERVAL_MS="1000"

# PCS设备 ★
PCS_001_ID="pcs-001"
PCS_001_IP="192.168.1.10"                # ★ PCS IP
PCS_001_PORT="502"
PCS_001_SLAVE_ID="1"
PCS_001_CAN_CHANNEL="0"
PCS_001_CAN_BITRATE="250000"
PCS_001_RATED_POWER_KW="500"            # ★ PCS额定功率

# BMS设备
BMS_001_ID="bms-001"
BMS_001_CAN_CHANNEL="0"
BMS_001_RATED_CAPACITY_KWH="500"         # ★ 电池额定容量

# 电表
METER_PCC_IP="192.168.1.20"              # ★ 电表IP

# 策略默认
STRATEGY_DEFAULT_MODE="peak_shaving"
STRATEGY_TARGET_SOC_MIN="20"
STRATEGY_TARGET_SOC_MAX="95"

# 远程运维 ★
REMOTE_OPS_ENABLED="false"
FRP_SERVER_HOST=""                        # ★ FRP服务器IP
FRP_AUTH_TOKEN=""                         # ★ FRP认证Token
WIREGUARD_PORT="51820"

# 备份
BACKUP_ENABLED="true"
BACKUP_CRON="0 2 * * *"
BACKUP_RETENTION_DAYS="7"
```

---

## 四、Modbus TCP采集配置

```yaml
# modbus_tcp.yaml
version: "1.0"
collector:
  type: modbus_tcp
  enabled: ${COLLECTOR_MODBUS_TCP_ENABLED}
  error_retry_count: 3
  connect_timeout_ms: 3000
  read_timeout_ms: 5000

devices:
  - device_id: "pcs-001"
    device_name: "1号PCS"
    enabled: true
    host: "${PCS_001_IP}"
    port: ${PCS_001_PORT}
    slave_id: ${PCS_001_SLAVE_ID}
    byte_order: big_endian
    poll_interval_ms: 1000

    holding_registers:
      telemetry:
        - {name: "active_power", address: 4000, type: int16, scale: 0.1, unit: "kW"}
        - {name: "reactive_power", address: 4001, type: int16, scale: 0.1, unit: "kVar"}
        - {name: "voltage_ab", address: 4002, type: uint16, scale: 0.1, unit: "V"}
        - {name: "current_a", address: 4004, type: int16, scale: 0.01, unit: "A"}
        - {name: "frequency", address: 4007, type: uint16, scale: 0.01, unit: "Hz"}
        - {name: "dc_voltage", address: 4010, type: uint16, scale: 0.1, unit: "V"}
        - {name: "dc_current", address: 4011, type: int16, scale: 0.1, unit: "A"}
        - {name: "pcs_temperature", address: 4020, type: int16, scale: 0.1, unit: "°C"}
        - {name: "total_energy_charged", address: 4030, count: 2, type: uint32, unit: "kWh"}
        - {name: "total_energy_discharged", address: 4032, count: 2, type: uint32, unit: "kWh"}
      control:
        - {name: "active_power_setpoint", address: 4100, type: int16, writable: true, min: -500, max: 500}
        - {name: "pcs_start_stop", address: 4102, type: uint16, writable: true, enum_values: {1:"stop",2:"start",3:"emergency_stop"}}
    input_registers:
      - {name: "pcs_status", address: 5000, type: uint16, enum_values: {0:"standby",1:"running",2:"fault"}}

  - device_id: "meter-pcc"
    device_name: "PCC关口表"
    enabled: true
    host: "${METER_PCC_IP}"
    port: ${METER_PCC_PORT}
    slave_id: ${METER_PCC_SLAVE_ID}
    byte_order: big_endian
    poll_interval_ms: 1000
    holding_registers:
      - {name: "voltage_a", address: 0, type: uint16, scale: 0.1, unit: "V"}
      - {name: "voltage_b", address: 1, type: uint16, scale: 0.1, unit: "V"}
      - {name: "voltage_c", address: 2, type: uint16, scale: 0.1, unit: "V"}
      - {name: "current_a", address: 3, type: uint16, scale: 0.01, unit: "A"}
      - {name: "active_power_total", address: 13, count: 2, type: int32, scale: 0.1, unit: "kW"}
      - {name: "active_energy_import", address: 100, count: 2, type: uint32, scale: 0.01, unit: "kWh"}
      - {name: "active_energy_export", address: 102, count: 2, type: uint32, scale: 0.01, unit: "kWh"}
      - {name: "demand_current", address: 200, type: uint16, scale: 0.001, unit: "A"}
```

---

## 五、CAN采集配置

```yaml
# can.yaml
version: "1.0"
collector:
  type: can
  enabled: ${COLLECTOR_CAN_ENABLED}

can_interfaces:
  - name: "can0"
    channel: 0
    enabled: true
    bitrate: 250000
    sample_point: 0.875
    termination: 120

devices:
  - device_id: "pcs-001"
    device_name: "1号PCS"
    interface: "can0"
    protocol: "huawei_pcs_can"
    rx_messages:
      - can_id: "0x1801F001"
        dlc: 8
        interval_ms: 1000
        fields:
          - {name: "active_power", byte_start: 0, byte_len: 2, type: int16, scale: 0.1, unit: "kW"}
          - {name: "reactive_power", byte_start: 2, byte_len: 2, type: int16, scale: 0.1, unit: "kVar"}
          - {name: "voltage_ab", byte_start: 4, byte_len: 2, type: uint16, scale: 0.1, unit: "V"}
      - can_id: "0x1802F001"
        dlc: 8
        interval_ms: 1000
        fields:
          - {name: "frequency", byte_start: 0, byte_len: 2, type: uint16, scale: 0.01, unit: "Hz"}
          - {name: "dc_voltage", byte_start: 2, byte_len: 2, type: uint16, scale: 0.1, unit: "V"}
          - {name: "dc_current", byte_start: 4, byte_len: 2, type: int16, scale: 0.1, unit: "A"}
    tx_messages:
      - can_id: "0x1808F001"
        dlc: 8
        interval_ms: 100
        fields:
          - {name: "active_power_setpoint", byte_start: 0, byte_len: 2, type: int16, scale: 0.1, writable: true, min: -500, max: 500}
          - {name: "command_type", byte_start: 6, byte_len: 1, type: uint8, writable: true, enum_values: {0:"stop",1:"start"}}

  - device_id: "bms-001"
    device_name: "BMS系统"
    interface: "can0"
    protocol: "custom_bms_can"
    rx_messages:
      - can_id: "0x1803F001"
        dlc: 8
        interval_ms: 1000
        timeout_ms: 5000
        fields:
          - {name: "soc", byte_start: 0, byte_len: 2, type: uint16, scale: 0.1, unit: "%"}
          - {name: "soh", byte_start: 2, byte_len: 2, type: uint16, scale: 0.1, unit: "%"}
          - {name: "total_voltage", byte_start: 4, byte_len: 2, type: uint16, scale: 0.1, unit: "V"}
          - {name: "total_current", byte_start: 6, byte_len: 2, type: int16, scale: 0.1, unit: "A"}
```

---

## 六、IEC104采集配置

```yaml
# iec104.yaml
version: "1.1"
collector:
  type: iec104
  enabled: ${COLLECTOR_IEC104_ENABLED}

connection:
  host: "192.168.1.100"              # ★ IEC104服务端IP
  port: 2404
  t0_timeout_s: 30
  t1_timeout_s: 15
  t2_timeout_s: 10
  t3_timeout_s: 20
  k_octets: 12
  w_octets: 8

asdu_types:
  type_id_1:
    type_id: 1
    description: "单点遥信"
    ioa_range: [1, 100]
    mapping:
      1: "breaker_status"
      2: "isolation_switch_status"
      3: "ground_switch_status"
      4: "protection_trip_status"

  type_id_13:
    type_id: 13
    description: "标度化测量值"
    ioa_range: [301, 400]
    mapping:
      301: "active_power_kw"
      302: "reactive_power_kvar"
      303: "voltage_ab"
      304: "voltage_bc"
      305: "current_a"
      306: "frequency"

  type_id_45:
    type_id: 45
    description: "步调节信息"
    ioa_range: [401, 410]
    mapping:
      401: "tap_position"

commands:
  single_command:
    - {name: "breaker_open", ioa: 1}
    - {name: "breaker_close", ioa: 1}
  double_command:
    - {name: "tap_up", ioa: 401}
    - {name: "tap_down", ioa: 401}
  regulating_command:
    - {name: "active_power_setpoint", ioa: 201, type: setpoint_normalized, min: -1.0, max: 1.0}
```

---

## 七、EMQX规则引擎配置(桥接TDengine)

### 7.1 规则SQL:遥测数据→TDengine

通过EMQX Dashboard或HTTP API创建以下规则:

**规则1:解析PCS遥测并写入TDengine**

```json
{
  "name": "ems_telemetry_to_tdengine",
  "sql": "SELECT\n  timestamp as ts,\n  payload.active_power as active_power,\n  payload.reactive_power as reactive_power,\n  payload.voltage_ab as voltage_a,\n  payload.voltage_bc as voltage_b,\n  payload.current_a as current_a,\n  payload.dc_voltage as dc_voltage,\n  payload.dc_current as dc_current,\n  clientid as device_id,\n  'station-001' as site_id\nFROM\n  \"ems/+/+/+/measure\"\nWHERE\n  payload.device_type = 'pcs'",
  "actions": [
    {
      "name": "write_to_tdengine",
      "params": {
        "sql": "INSERT INTO ems_tsdb.pcs_telemetry_${device_id} USING ems_tsdb.pcs_telemetry TAGS('${device_id}','${device_id}','station-001') VALUES(${ts},${active_power},${reactive_power},${voltage_a},${voltage_b},${current_a},${dc_voltage},${dc_current})"
      }
    }
  ]
}
```

**规则2:解析BMS遥测并写入TDengine**

```json
{
  "name": "ems_bms_to_tdengine",
  "sql": "SELECT\n  timestamp as ts,\n  payload.soc as soc,\n  payload.soh as soh,\n  payload.total_voltage as total_voltage,\n  payload.total_current as total_current,\n  payload.max_cell_voltage as max_cell_voltage,\n  payload.min_cell_voltage as min_cell_voltage,\n  payload.max_cell_temp as max_cell_temp,\n  payload.min_cell_temp as min_cell_temp,\n  clientid as device_id\nFROM\n  \"ems/+/+/+/measure\"\nWHERE\n  payload.device_type = 'bms'",
  "actions": [
    {
      "name": "write_to_tdengine",
      "params": {
        "sql": "INSERT INTO ems_tsdb.bms_telemetry_${device_id} USING ems_tsdb.bms_telemetry TAGS('${device_id}','${device_id}','station-001') VALUES(${ts},${soc},${soh},${total_voltage},${total_current},${max_cell_voltage},${min_cell_voltage},${max_cell_temp},${min_cell_temp})"
      }
    }
  ]
}
```

### 7.2 EMQX ACL规则

```erlang
%% 允许EMS订阅遥测数据
{allow, {username, "ems-server"}, subscribe, ["$share/ems/+/+/+/measure/#"]}.
{allow, {username, "ems-server"}, subscribe, ["$share/ems/+/+/+/alarm/#"]}.
%% 允许EMS下发指令
{allow, {username, "ems-server"}, publish, ["+/+/+/command/#"]}.
{allow, {username, "ems-server"}, publish, ["+/+/+/param/#"]}.
%% 默认拒绝
{deny, all, subscribe, ["$SYS/#", "#"]}.
```

---

## 八、TDengine数据库设计

### 8.1 TDengine初始化SQL

```sql
CREATE DATABASE IF NOT EXISTS ems_tsdb
  KEEP 365 DAYS 10 CACHE 256 BLOCKS 6 PRECISION 'ms' WAL_LEVEL 1;
USE ems_tsdb;

-- PCS遥测超表
CREATE STABLE IF NOT EXISTS pcs_telemetry (
  ts TIMESTAMP, active_power FLOAT, reactive_power FLOAT,
  voltage_a FLOAT, voltage_b FLOAT, voltage_c FLOAT,
  current_a FLOAT, current_b FLOAT, current_c FLOAT,
  dc_voltage FLOAT, dc_current FLOAT, dc_power FLOAT,
  temp_igbt_a FLOAT, temp_igbt_b FLOAT, temp_igbt_c FLOAT
) TAGS (device_id NCHAR(32), device_name NCHAR(64), site_id NCHAR(64));

-- BMS遥测超表
CREATE STABLE IF NOT EXISTS bms_telemetry (
  ts TIMESTAMP, soc FLOAT, soh FLOAT,
  total_voltage FLOAT, total_current FLOAT, total_power FLOAT,
  max_cell_voltage FLOAT, min_cell_voltage FLOAT,
  max_cell_temp FLOAT, min_cell_temp FLOAT,
  insulation_r_plus FLOAT, insulation_r_minus FLOAT
) TAGS (device_id NCHAR(32), device_name NCHAR(64), site_id NCHAR(64));

-- 电表遥测超表
CREATE STABLE IF NOT EXISTS meter_telemetry (
  ts TIMESTAMP, voltage_a FLOAT, voltage_b FLOAT, voltage_c FLOAT,
  current_a FLOAT, current_b FLOAT, current_c FLOAT,
  active_power_total FLOAT, reactive_power_total FLOAT,
  energy_active_import FLOAT, energy_active_export FLOAT,
  demand_current FLOAT
) TAGS (device_id NCHAR(32), device_name NCHAR(64), site_id NCHAR(64));

-- 告警事件表
CREATE STABLE IF NOT EXISTS alarm_events (
  ts TIMESTAMP, alarm_level TINYINT, alarm_code INT,
  alarm_message NCHAR(256), device_type NCHAR(16),
  ack_status TINYINT, recover_time TIMESTAMP
) TAGS (device_id NCHAR(32), site_id NCHAR(64));

-- 创建子表
CREATE TABLE IF NOT EXISTS pcs_telemetry_pcs01 USING pcs_telemetry
  TAGS ('pcs01', 'PCS1号', 'station-001');
CREATE TABLE IF NOT EXISTS bms_telemetry_bms01 USING bms_telemetry
  TAGS ('bms01', 'BMS系统', 'station-001');
CREATE TABLE IF NOT EXISTS meter_telemetry_meter_pcc USING meter_telemetry
  TAGS ('meter_pcc', 'PCC关口表', 'station-001');
```

### 8.2 TDengine连续查询(CQP)

```sql
-- 分钟级聚合(PCS功率)
CREATE TABLE IF NOT EXISTS pcs_power_1min USING pcs_telemetry TAGS('agg');

-- 小时级聚合(充放电量)
CREATE TABLE IF NOT EXISTS bess_energy_1h USING bms_telemetry TAGS('agg_hourly');

-- 天级统计
CREATE TABLE IF NOT EXISTS daily_summary (
  ts TIMESTAMP, total_charge_kwh FLOAT, total_discharge_kwh FLOAT,
  max_soc FLOAT, min_soc FLOAT, avg_soc FLOAT,
  revenue_estimated FLOAT
) TAGS (site_id NCHAR(64));
```

---

## 九、PostgreSQL配置数据库

```sql
-- 站点配置
CREATE TABLE IF NOT EXISTS site_config (
    id SERIAL PRIMARY KEY,
    site_id VARCHAR(64) UNIQUE NOT NULL,
    site_name VARCHAR(128) NOT NULL,
    timezone VARCHAR(32) DEFAULT 'Asia/Shanghai',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 设备注册
CREATE TABLE IF NOT EXISTS device_registry (
    id SERIAL PRIMARY KEY,
    device_id VARCHAR(32) UNIQUE NOT NULL,
    device_name VARCHAR(128) NOT NULL,
    device_type VARCHAR(16) NOT NULL,
    site_id VARCHAR(64) NOT NULL REFERENCES site_config(site_id),
    protocol VARCHAR(16) NOT NULL,
    ip_address VARCHAR(45),
    port INTEGER,
    slave_id INTEGER,
    is_enabled BOOLEAN DEFAULT true,
    extra_config JSONB DEFAULT '{}',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 策略配置
CREATE TABLE IF NOT EXISTS strategy_config (
    id SERIAL PRIMARY KEY,
    strategy_id VARCHAR(64) UNIQUE NOT NULL,
    strategy_name VARCHAR(128) NOT NULL,
    site_id VARCHAR(64) NOT NULL,
    strategy_type VARCHAR(32) NOT NULL,
    config_json JSONB NOT NULL DEFAULT '{}',
    is_enabled BOOLEAN DEFAULT true,
    priority INTEGER DEFAULT 0,
    updated_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 电价配置
CREATE TABLE IF NOT EXISTS price_config (
    id SERIAL PRIMARY KEY,
    site_id VARCHAR(64) NOT NULL,
    period_type VARCHAR(8) NOT NULL,
    start_time TIME NOT NULL,
    end_time TIME NOT NULL,
    price_kwh DECIMAL(6,3) NOT NULL,
    demand_charge DECIMAL(8,2),
    effective_from DATE NOT NULL,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 操作日志
CREATE TABLE IF NOT EXISTS operation_log (
    id SERIAL PRIMARY KEY,
    site_id VARCHAR(64) NOT NULL,
    user_id INTEGER,
    action VARCHAR(64) NOT NULL,
    target_device VARCHAR(32),
    new_value JSONB,
    result VARCHAR(16) DEFAULT 'success',
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 索引
CREATE INDEX IF NOT EXISTS idx_device_site ON device_registry(site_id);
CREATE INDEX IF NOT EXISTS idx_device_type ON device_registry(device_type);
CREATE INDEX IF NOT EXISTS idx_oper_log_time ON operation_log(created_at DESC);

-- 初始默认数据
INSERT INTO site_config (site_id, site_name) VALUES ('station-001', '默认储能电站') ON CONFLICT DO NOTHING;

INSERT INTO price_config (site_id, period_type, start_time, end_time, price_kwh, demand_charge, effective_from)
VALUES
    ('station-001', 'peak', '09:00', '12:00', 1.20, 35.0, CURRENT_DATE),
    ('station-001', 'peak', '17:00', '22:00', 1.20, 35.0, CURRENT_DATE),
    ('station-001', 'flat', '08:00', '09:00', 0.80, 35.0, CURRENT_DATE),
    ('station-001', 'flat', '12:00', '17:00', 0.80, 35.0, CURRENT_DATE),
    ('station-001', 'valley', '23:00', '07:00', 0.40, 35.0, CURRENT_DATE)
ON CONFLICT DO NOTHING;
```

---

## 十、Redis与Nginx部署

### 10.1 Redis Docker配置

```yaml
redis:
  image: redis:7-alpine
  container_name: ems-redis
  hostname: redis
  restart: unless-stopped
  command: redis-server --appendonly yes --maxmemory 512mb --maxmemory-policy allkeys-lru
  volumes:
    - ./data/redis:/data
  ports:
    - "6379:6379"
  networks:
    - ems-network
  healthcheck:
    test: ["CMD", "redis-cli", "ping"]
    interval: 10s
    timeout: 5s
    retries: 5
```

### 10.2 Nginx反向代理配置

```nginx
worker_processes auto;
events { worker_connections 2048; }

http {
    include /etc/nginx/mime.types;
    sendfile on;
    keepalive_timeout 65;
    client_max_body_size 100M;
    gzip on;

    map $http_upgrade $connection_upgrade {
        default upgrade;
        '' close;
    }

    server {
        listen 80;
        server_name _;

        location / {
            proxy_pass http://ems-webui:80;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
        }

        location /api/ {
            proxy_pass http://ems-api:9002/api/;
            proxy_set_header Host $host;
            proxy_connect_timeout 30s;
            proxy_read_timeout 60s;
        }

        location /emqx/ {
            proxy_pass http://emqx:18083/;
            proxy_set_header Host $host;
        }

        location /mqtt {
            proxy_pass http://emqx:8083/mqtt;
            proxy_http_version 1.1;
            proxy_set_header Upgrade $http_upgrade;
            proxy_set_header Connection $connection_upgrade;
        }
    }
}
```

---

## 十一、EMS微服务Docker配置

### 11.1 EMS-Core(数据采集与协议转换)

```yaml
ems-core:
  image: ems-core:1.0.0
  container_name: ems-core
  hostname: ems-core
  restart: unless-stopped
  environment:
    TZ: Asia/Shanghai
    PROFILE: production
    TDENGINE_HOST: tdengine
    EMQX_HOST: emqx
    POSTGRES_HOST: postgres
    POSTGRES_DB: ems_config
    POSTGRES_USER: ems
    POSTGRES_PASSWORD: ${PG_PASSWORD}
    REDIS_HOST: redis
    LOG_LEVEL: info
  volumes:
    - ./data/ems-logs/core:/app/logs
  ports:
    - "9001:9001"
  networks:
    - ems-network
  depends_on:
    tdengine: {condition: service_healthy}
    emqx: {condition: service_healthy}
    postgres: {condition: service_healthy}
    redis: {condition: service_healthy}
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9001/health"]
    interval: 15s
    timeout: 5s
    retries: 3
    start_period: 30s
```

### 11.2 EMS-API(REST API)

```yaml
ems-api:
  image: ems-api:1.0.0
  container_name: ems-api
  hostname: ems-api
  restart: unless-stopped
  environment:
    TZ: Asia/Shanghai
    TDENGINE_HOST: tdengine
    POSTGRES_HOST: postgres
    POSTGRES_DB: ems_config
    POSTGRES_USER: ems
    POSTGRES_PASSWORD: ${PG_PASSWORD}
    REDIS_HOST: redis
    JWT_SECRET: ${JWT_SECRET}
  volumes:
    - ./data/ems-logs/api:/app/logs
  ports:
    - "9002:9002"
  networks:
    - ems-network
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9002/api/health"]
    interval: 15s
    timeout: 5s
    retries: 3
    start_period: 20s
```

### 11.3 EMS-Strategy(策略引擎)

```yaml
ems-strategy:
  image: ems-strategy:1.0.0
  container_name: ems-strategy
  hostname: ems-strategy
  restart: unless-stopped
  environment:
    TZ: Asia/Shanghai
    POSTGRES_HOST: postgres
    POSTGRES_DB: ems_config
    POSTGRES_USER: ems
    POSTGRES_PASSWORD: ${PG_PASSWORD}
    REDIS_HOST: redis
    EMQX_HOST: emqx
    STRATEGY_LOOP_INTERVAL_MS: 1000
  volumes:
    - ./configs/ems/strategy.yaml:/app/config/strategy.yaml:ro
    - ./data/ems-logs/strategy:/app/logs
  ports:
    - "9005:9005"
  networks:
    - ems-network
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9005/health"]
    interval: 15s
    timeout: 5s
    retries: 3
    start_period: 20s
```

---

## 十二、Docker Compose完整模板

### 12.1 环境变量(.env关键项)

```bash
PG_PASSWORD=ChangeMe!2024
EMQX_ADMIN_PASSWORD=admin123
JWT_SECRET=your-jwt-secret-key-change-in-production
NETWORK_SUBNET=172.25.0.0/16
```

### 12.2 docker-compose.yml(精简版关键服务)

```yaml
version: '3.8'

networks:
  ems-network:
    driver: bridge
    ipam:
      config:
        - subnet: ${NETWORK_SUBNET:-172.25.0.0/16}

services:
  tdengine:
    image: tdengine/tdengine:3.2.3.0
    container_name: ems-tdengine
    hostname: tdengine
    restart: unless-stopped
    environment:
      TZ: Asia/Shanghai
      TAOS_FQDN: tdengine
    volumes:
      - ./configs/tdengine/taos.cfg:/etc/taos/taos.cfg:ro
      - ./configs/tdengine/init.sql:/docker-entrypoint-initdb.d/init.sql:ro
      - ./data/tdengine:/var/lib/taos
    ports:
      - "6030:6030"
      - "6041:6041"
    networks:
      - ems-network
    healthcheck:
      test: ["CMD-SHELL", "taos -s 'show databases;' 2>&1 | grep -q ems_tsdb || exit 1"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 40s

  emqx:
    image: emqx/emqx:5.4.1
    container_name: ems-emqx
    hostname: emqx
    restart: unless-stopped
    environment:
      TZ: Asia/Shanghai
      EMQX_NODE_NAME: emqx@127.0.0.1
      EMQX_DASHBOARD__DEFAULT_PASSWORD: ${EMQX_ADMIN_PASSWORD:-admin123}
    volumes:
      - ./configs/emqx/emqx.conf:/opt/emqx/etc/emqx.conf:ro
      - ./data/emqx/data:/opt/emqx/data
    ports:
      - "1883:1883"
      - "8083:8083"
      - "18083:18083"
    networks:
      - ems-network
    healthcheck:
      test: ["CMD", "/opt/emqx/bin/emqx", "ctl", "status"]
      interval: 15s
      timeout: 10s
      retries: 5
      start_period: 30s

  postgres:
    image: postgres:15-alpine
    container_name: ems-postgres
    hostname: postgres
    restart: unless-stopped
    environment:
      TZ: Asia/Shanghai
      POSTGRES_USER: ems
      POSTGRES_PASSWORD: ${PG_PASSWORD}
      POSTGRES_DB: ems_config
    volumes:
      - ./configs/postgres/init.sql:/docker-entrypoint-initdb.d/01-init.sql:ro
      - ./data/postgres:/var/lib/postgresql/data
    ports:
      - "5432:5432"
    networks:
      - ems-network
    command: postgres -c max_connections=200 -c shared_buffers=256MB
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ems -d ems_config"]
      interval: 10s
      timeout: 5s
      retries: 5
```

---

## 十三、FRP+WireGuard远程运维

### 13.1 FRP内网穿透配置

**frpc.ini(现场侧客户端)**:

```ini
[common]
server_addr = ${FRP_SERVER_HOST}
server_port = ${FRP_SERVER_PORT}
token = ${FRP_AUTH_TOKEN}

[ssh]
type = tcp
local_ip = 127.0.0.1
local_port = 22
remote_port = ${FRP_SSH_PORT}

[rdp]
type = tcp
local_ip = 127.0.0.1
local_port = 3389
remote_port = ${FRP_RDP_PORT}

[http]
type = tcp
local_ip = 127.0.0.1
local_port = 80
remote_port = ${FRP_HTTP_PORT}
```

### 13.2 WireGuard VPN配置

**wg0.conf(现场侧)**:

```ini
[Interface]
PrivateKey = <自动生成>
Address = 10.88.0.2/24
ListenPort = ${WIREGUARD_PORT}

[Peer]
PublicKey = <运维中心公钥>
Endpoint = ${FRP_SERVER_HOST}:${WIREGUARD_PORT}
AllowedIPs = 10.88.0.0/24
PersistentKeepalive = 25
```

### 13.3 远程运维配置脚本

```bash
#!/bin/bash
# remote_ops_setup.sh
# 自动配置FRP+WireGuard远程运维通道

if [ "$REMOTE_OPS_TYPE" = "frp" ]; then
    echo "配置FRP内网穿透..."
    cat > /opt/ems/frp/frpc.ini << EOF
[common]
server_addr = ${FRP_SERVER_HOST}
server_port = ${FRP_SERVER_PORT}
token = ${FRP_AUTH_TOKEN}
[ssh]
type = tcp
local_ip = 127.0.0.1
local_port = 22
remote_port = ${FRP_SSH_PORT}
EOF
    docker run -d --name frpc --restart unless-stopped \
        -v /opt/ems/frp/frpc.ini:/etc/frp/frpc.ini \
        --network host \
        snowdreamtech/frpc
    echo "FRP配置完成"
fi

if [ "$REMOTE_OPS_TYPE" = "wireguard" ]; then
    echo "配置WireGuard..."
    apt-get install -y wireguard
    # 生成密钥对
    wg genkey | tee /etc/wireguard/privatekey | wg pubkey > /etc/wireguard/publickey
    echo "WireGuard配置完成, 请将公钥发送给运维中心"
fi
```

---

## 十四、一键部署脚本

```bash
#!/bin/bash
# deploy.sh - EMS一键部署脚本
set -e

PROJECT_DIR="/opt/ems"
cd "$PROJECT_DIR"

echo "========================================="
echo "  EMS System One-Click Deploy v2.0"
echo "  Time: $(date)"
echo "========================================="

# Phase 1: Pre-check
echo ""; echo "[1/6] Server Pre-Check..."
bash scripts/pre_check.sh

# Phase 2: Create directories
echo ""; echo "[2/6] Creating directories..."
mkdir -p configs/{tdengine,emqx,postgres,nginx,ems,collector}
mkdir -p scripts
mkdir -p data/{tdengine,emqx,postgres,redis,nginx,ems-logs/{core,api,strategy},reports}

# Phase 3: Environment config
echo ""; echo "[3/6] Configuring environment..."
if [ ! -f .env ]; then
    PG_PASS=$(openssl rand -base64 16 2>/dev/null || echo "ChangeMe!2024")
    JWT_SEC=$(openssl rand -base64 32 2>/dev/null || echo "ChangeMe!2024")
    cat > .env << EOF
PG_PASSWORD=$PG_PASS
EMQX_ADMIN_PASSWORD=admin123
JWT_SECRET=$JWT_SEC
NETWORK_SUBNET=172.25.0.0/16
EOF
    echo "Generated .env file. Save credentials!"
fi

# Phase 4: Pull images and start middleware
echo ""; echo "[4/6] Starting middleware..."
docker compose pull
docker compose up -d tdengine emqx postgres redis
echo "Waiting for middleware (40s)..."
sleep 40

# Phase 5: Start EMS services
echo ""; echo "[5/6] Starting EMS application services..."
docker compose up -d ems-core ems-api ems-webui ems-strategy nginx
echo "Waiting for services (30s)..."
sleep 30

# Phase 6: Health check
echo ""; echo "[6/6] Running health checks..."
bash scripts/health_check.sh
RC=$?

echo ""
echo "========================================="
echo "  Deployment Complete"
echo "========================================="
IP=$(hostname -I 2>/dev/null | awk '{print $1}')
echo "EMS Web UI:    http://$IP"
echo "EMQX Dashboard: http://$IP:18083"
echo ""

if [ $RC -eq 0 ]; then
    echo "STATUS: ALL SERVICES HEALTHY"
else
    echo "STATUS: Some checks failed. Run: docker compose logs"
fi
```

---

## 十五、健康检查探针体系

### 15.1 健康检查脚本

```bash
#!/bin/bash
# health_check.sh
TOTAL=0; PASS=0; FAIL=0;

check_tcp() {
    local name=$1 host=$2 port=$3
    ((TOTAL++))
    if timeout 5 bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null; then
        echo "[PASS] TCP $name ($host:$port)"; ((PASS++))
    else
        echo "[FAIL] TCP $name ($host:$port)"; ((FAIL++))
    fi
}

check_http() {
    local name=$1 url=$2
    ((TOTAL++))
    local code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$url" 2>/dev/null)
    if [ "$code" -ge 200 ] && [ "$code" -lt 500 ]; then
        echo "[PASS] HTTP $name ($url) -> $code"; ((PASS++))
    else
        echo "[FAIL] HTTP $name ($url) -> $code"; ((FAIL++))
    fi
}

check_container() {
    local name=$1
    ((TOTAL++))
    local status=$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null)
    if [ "$status" = "running" ]; then
        echo "[PASS] Container $name"; ((PASS++))
    else
        echo "[FAIL] Container $name -> $status"; ((FAIL++))
    fi
}

echo "=== EMS Health Check ==="
echo "Time: $(date)"; echo ""

# TCP端口
check_tcp "TDengine"   localhost 6030
check_tcp "EMQX"       localhost 1883
check_tcp "PostgreSQL" localhost 5432
check_tcp "Redis"      localhost 6379
check_tcp "Nginx"      localhost 80
check_tcp "EMS-Core"   localhost 9001
check_tcp "EMS-API"    localhost 9002
check_tcp "EMS-WebUI"  localhost 9003
check_tcp "EMS-Strategy" localhost 9005

echo ""
# HTTP探针
check_http "EMS-Core Health"    http://localhost:9001/health
check_http "EMS-API Health"     http://localhost:9002/api/health
check_http "EMS-Strategy"       http://localhost:9005/health
check_http "Nginx"              http://localhost:80/
check_http "EMQX Dashboard"     http://localhost:18083/

echo ""
# 容器状态
for c in ems-tdengine ems-emqx ems-postgres ems-redis ems-core ems-api ems-webui ems-strategy ems-nginx; do
    check_container $c
done

echo ""
echo "============================"
echo "Results: $PASS/$TOTAL passed"
if [ $FAIL -eq 0 ]; then echo "STATUS: ALL HEALTHY"; else echo "STATUS: $FAIL FAILED"; fi
exit $FAIL
```

### 15.2 健康检查指标

| 探针类型 | 检查项 | 间隔 | 超时 | 重试 | 通过条件 |
|---------|-------|-----|------|-----|---------|
| TCP | 端口可连接 | 10s | 5s | 3 | TCP三次握手成功 |
| HTTP | 服务响应 | 15s | 5s | 3 | 返回200-499 |
| DB Query | 数据库可查询 | 30s | 10s | 3 | 查询返回预期结果 |
| Container | 容器Running | 15s | 5s | 3 | State=running |

---

## 十六、备份恢复脚本

```bash
#!/bin/bash
# backup.sh - 数据库备份脚本
BACKUP_DIR="/opt/ems/backups/$(date +%Y%m%d)"
mkdir -p "$BACKUP_DIR"

# PostgreSQL备份
docker exec ems-postgres pg_dump -U ems ems_config > "$BACKUP_DIR/pg_backup.sql"

# TDengine备份
docker exec ems-tdengine taosdump -o /var/lib/taos/backup -A
docker cp ems-tdengine:/var/lib/taos/backup "$BACKUP_DIR/tdengine"

# EMS配置备份
tar -czf "$BACKUP_DIR/ems_configs.tar.gz" configs/

# 清理30天前备份
find /opt/ems/backups -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null

echo "Backup complete: $BACKUP_DIR"
```

---

## 十七、部署交付检查清单

### 17.1 部署服务清单

| 服务 | 镜像版本 | 端口 | 状态 |
|------|---------|------|------|
| TDengine | 3.2.3.0 | 6030/6041 | RUNNING |
| EMQX | 5.4.1 | 1883/8083/18083 | RUNNING |
| PostgreSQL | 15 | 5432 | RUNNING |
| Redis | 7 | 6379 | RUNNING |
| Nginx | 1.25 | 80 | RUNNING |
| EMS-Core | 1.0.0 | 9001 | RUNNING |
| EMS-API | 1.0.0 | 9002 | RUNNING |
| EMS-WebUI | 1.0.0 | 9003 | RUNNING |
| EMS-Strategy | 1.0.0 | 9005 | RUNNING |

### 17.2 访问信息

| 系统 | URL | 用户名 | 密码 |
|------|-----|-------|------|
| EMS Web界面 | http://IP | admin | 见.env |
| EMQX管理 | http://IP:18083 | admin | admin123 |

### 17.3 部署后注意事项

- [ ] 修改默认密码(.env文件中的密码)
- [ ] 配置防火墙规则(按需开放端口)
- [ ] 配置域名/SSL证书(如需HTTPS)
- [ ] 配置数据备份策略(crontab每日备份)
- [ ] 配置日志轮转/清理
- [ ] 配置监控告警(钉钉/微信/邮件)

### 17.4 常见部署问题

| 问题 | 可能原因 | 解决方案 |
|------|---------|---------|
| 端口占用 | 已有服务使用端口 | ss -tlnp查占用, 修改端口 |
| Docker daemon not running | Docker未启动 | systemctl start docker |
| 镜像拉取失败 | 网络/DNS问题 | 配置镜像加速器或离线导入 |
| TDengine启动失败 | 数据目录权限 | chown -R 1000:1000 data/tdengine |
| PostgreSQL密码错误 | 环境变量未生效 | docker compose down -v重新初始化 |
| 容器间无法通信 | 网络配置错误 | docker network ls检查网络 |
| 健康检查超时 | 启动时间不够 | 增加start_period |

---

## 附录A:端口清单

| 端口 | 服务 | 用途 |
|------|------|------|
| 80 | Nginx | Web界面入口 |
| 443 | Nginx | HTTPS(WSS) |
| 1883 | EMQX | MQTT TCP |
| 8083 | EMQX | MQTT WebSocket |
| 18083 | EMQX | Dashboard |
| 5432 | PostgreSQL | 数据库 |
| 6379 | Redis | 缓存 |
| 6030 | TDengine | 客户端连接 |
| 6041 | TDengine | REST API |
| 9001 | EMS-Core | 数据采集 |
| 9002 | EMS-API | REST API |
| 9005 | EMS-Strategy | 策略引擎 |

## 附录B:目录结构规范

```
/opt/ems/
├── .env
├── docker-compose.yml
├── configs/
│   ├── tdengine/taos.cfg + init.sql
│   ├── emqx/emqx.conf + acl.conf + rules/
│   ├── postgres/init.sql
│   ├── nginx/nginx.conf
│   ├── collector/{modbus_tcp,iec104,can}.yaml
│   └── ems/{core_config,strategy}.yaml
├── scripts/
│   ├── pre_check.sh/ps1, deploy.sh/ps1
│   ├── health_check.sh, backup.sh
│   └── remote_ops_setup.sh
├── data/{tdengine,emqx,postgres,redis,ems-logs}
└── dockerfiles/
```

---

*版本:v2.0*
*适用范围:储能电站/微电网/充电站EMS系统现场部署与远程运维*
*参考标准:GB/T 36558、DL/T 698、IEC 61850*
