---
name: software-net-oneclick-deploy
description: >
  储能系统一键部署Skill。覆盖服务器预检→基础环境(Docker安装)→
  中间件部署(TDengine/EMQX/PostgreSQL/Redis)→EMS应用微服务部署→
  健康检查→交付报告的全流程自动化。包含服务器预检清单(OS/CPU/RAM/
  磁盘/端口/依赖)、Docker Compose完整编排模板、TDengine数据库初始化
  脚本、EMQX MQTT Broker配置、PostgreSQL EMS Schema初始化、Nginx
  反向代理配置、HTTP/TCP/DB探针健康检查系统。适用场景：储能电站、
  微电网、充电站的EMS系统现场部署与远程运维。
  使用本skill可确保30分钟内完成全部系统部署并通过健康检查。
---

# 储能系统一键部署Skill v1.0

## 目录

- [一、部署架构总览](#一部署架构总览)
- [二、服务器预检清单](#二服务器预检清单)
- [三、Docker环境部署](#三docker环境部署)
- [四、TDengine部署与初始化](#四tdengine部署与初始化)
- [五、EMQX MQTT Broker部署](#五emqx-mqtt-broker部署)
- [六、PostgreSQL部署与初始化](#六postgresql部署与初始化)
- [七、Redis与Nginx部署](#七redis与nginx部署)
- [八、EMS应用微服务部署](#八ems应用微服务部署)
- [九、Docker Compose完整模板](#九docker-compose完整模板)
- [十、数据库Schema初始化](#十数据库schema初始化)
- [十一、健康检查探针体系](#十一健康检查探针体系)
- [十二、一键部署脚本](#十二一键部署脚本)
- [十三、运维常用命令](#十三运维常用命令)
- [十四、部署交付报告模板](#十四部署交付报告模板)
- [十五、常见部署问题排查](#十五常见部署问题排查)

---

## 一、部署架构总览

### 1.1 系统部署架构

```
┌─────────────────────────────────────────────────────────────┐
│                    物理/虚拟服务器                            │
│  Ubuntu 22.04 LTS, CPU >= 8 Core, RAM >= 16GB, SSD >= 256GB │
├─────────────────────────────────────────────────────────────┤
│                    Docker Engine 24+                         │
│                                                              │
│  [中间件层]                                                  │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │ TDengine │ │  EMQX    │ │PostgreSQL│ │  Redis   │       │
│  │ 时序库   │ │ MQTT     │ │ 关系库   │ │  缓存    │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│                                                              │
│  [应用层]                                                    │
│  ┌──────────┐ ┌──────────┐ ┌──────────┐ ┌──────────┐       │
│  │EMS-Core  │ │EMS-API   │ │EMS-WebUI │ │Nginx     │       │
│  │数据采集  │ │REST接口  │ │前端界面  │ │反向代理  │       │
│  └──────────┘ └──────────┘ └──────────┘ └──────────┘       │
│  ┌──────────┐ ┌──────────┐                                  │
│  │EMS-Strgy │ │EMS-Rpt   │                                  │
│  │策略引擎  │ │报表统计  │                                  │
│  └──────────┘ └──────────┘                                  │
└─────────────────────────────────────────────────────────────┘
```

### 1.2 部署时序(6阶段/30分钟)

```
Phase 1: 服务器预检       (3 min)
Phase 2: Docker基础环境   (5 min)
Phase 3: 中间件部署       (8 min)  TDengine+EMQX+PostgreSQL+Redis+Nginx
Phase 4: 数据库初始化     (5 min)  TDengine建库表+PostgreSQL建Schema
Phase 5: EMS微服务部署    (5 min)  EMS-Core/API/WebUI/Strategy
Phase 6: 健康检查+交付    (4 min)  端口/HTTP/DB查询/容器的全部探针
```

---

## 二、服务器预检清单

### 2.1 预检脚本(pre_check.sh)

```bash
#!/bin/bash
echo "=== EMS Server Pre-Check ==="
echo "Date: $(date)"
echo ""

echo "--- OS ---"
cat /etc/os-release | head -3
echo "Kernel: $(uname -r)"
echo "Arch: $(uname -m)"

echo ""
echo "--- CPU ---"
cores=$(nproc)
echo "CPU Cores: $cores (min 4 required)"
if [ $cores -lt 4 ]; then echo "FAIL: Need >=4 cores"; fi

echo ""
echo "--- Memory ---"
mem_total_kb=$(grep MemTotal /proc/meminfo | awk '{print $2}')
mem_total_gb=$((mem_total_kb / 1024 / 1024))
echo "Total: ${mem_total_gb}GB (min 8GB required)"
if [ $mem_total_gb -lt 8 ]; then echo "FAIL: Need >=8GB"; fi

echo ""
echo "--- Disk ---"
df -h / /data 2>/dev/null

echo ""
echo "--- Ports ---"
for port in 80 443 1883 5432 6379 6030 6041 8083 18083 9001 9002 9003 9005; do
    if ss -tlnp 2>/dev/null | grep -q ":$port "; then
        echo "PORT $port: OCCUPIED - FAIL"
    else
        echo "PORT $port: FREE - PASS"
    fi
done

echo ""
echo "--- Docker ---"
docker --version 2>/dev/null || echo "Docker: NOT INSTALLED"
docker compose version 2>/dev/null || echo "Docker Compose: NOT INSTALLED"

echo ""
echo "--- NTP ---"
timedatectl show --property=Timezone --value
systemctl is-active systemd-timesyncd 2>/dev/null || echo "NTP not active"

echo ""
echo "--- Firewall ---"
ufw status 2>/dev/null || firewall-cmd --list-all 2>/dev/null || echo "No firewall"

echo ""
echo "=== Pre-Check Complete ==="
```

### 2.2 预检通过标准

```
检查项           | 必须满足              | 推荐满足
────────────────┼──────────────────────┼──────────────────────
CPU核数          | >= 4 cores           | >= 8 cores
内存             | >= 8 GB              | >= 16 GB
磁盘             | >= 128 GB SSD        | >= 256 GB, 独立数据盘
OS               | Ubuntu 20.04+ / CentOS 7.9+ | Ubuntu 22.04
Docker           | v20+                 | v24+
Docker Compose   | v2+                  | v2.20+
时区             | Asia/Shanghai        |
NTP              | 已同步               |
端口             | 全部空闲             |
```

---

## 三、Docker环境部署

### 3.1 Docker安装(Ubuntu 22.04)

```bash
#!/bin/bash
# install_docker.sh

sudo apt-get remove -y docker docker-engine docker.io containerd runc 2>/dev/null
sudo apt-get update
sudo apt-get install -y ca-certificates curl gnupg lsb-release

sudo mkdir -p /etc/apt/keyrings
curl -fsSL https://download.docker.com/linux/ubuntu/gpg | sudo gpg --dearmor -o /etc/apt/keyrings/docker.gpg

echo "deb [arch=$(dpkg --print-architecture) signed-by=/etc/apt/keyrings/docker.gpg] https://download.docker.com/linux/ubuntu $(lsb_release -cs) stable" | sudo tee /etc/apt/sources.list.d/docker.list > /dev/null

sudo apt-get update
sudo apt-get install -y docker-ce docker-ce-cli containerd.io docker-buildx-plugin docker-compose-plugin

sudo systemctl enable docker
sudo systemctl start docker
sudo usermod -aG docker $USER

sudo mkdir -p /etc/docker
sudo tee /etc/docker/daemon.json <<-'EOF'
{
  "log-driver": "json-file",
  "log-opts": {"max-size": "100m", "max-file": "10"},
  "storage-driver": "overlay2",
  "exec-opts": ["native.cgroupdriver=systemd"],
  "live-restore": true
}
EOF
sudo systemctl restart docker
docker --version
```

### 3.2 项目目录结构

```
/opt/ems/
├── docker-compose.yml
├── .env
├── configs/
│   ├── tdengine/taos.cfg
│   ├── tdengine/init.sql
│   ├── emqx/emqx.conf
│   ├── postgres/init.sql
│   ├── nginx/nginx.conf
│   └── ems/strategy.yaml
├── scripts/
│   ├── pre_check.sh
│   ├── deploy.sh
│   ├── health_check.sh
│   └── backup.sh
├── data/
│   ├── tdengine/
│   ├── emqx/
│   ├── postgres/
│   ├── redis/
│   ├── nginx/
│   ├── ems-logs/core/
│   ├── ems-logs/api/
│   ├── ems-logs/strategy/
│   └── reports/
└── dockerfiles/
```

---

## 四、TDengine部署与初始化

### 4.1 TDengine配置(taos.cfg)

```ini
firstEp                   tdengine:6030
fqdn                      tdengine
serverPort                6030
dataDir                   /var/lib/taos
logDir                    /var/log/taos
cache                     256
blocks                    6
days                      10
keep                      365
numOfThreadsPerCore       2
maxConnections            200
maxConcurrentRequests     256
monitor                   1
walLevel                  1
debugFlag                 135
logKeepDays               30
```

### 4.2 TDengine初始化SQL(init.sql)

```sql
CREATE DATABASE IF NOT EXISTS ems_tsdb
  KEEP 365 DAYS 10 CACHE 256 BLOCKS 6 PRECISION 'ms' WAL_LEVEL 1;
USE ems_tsdb;

-- PCS遥测超表
CREATE STABLE IF NOT EXISTS pcs_telemetry (
  ts TIMESTAMP, active_power FLOAT, reactive_power FLOAT, frequency FLOAT,
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

### 4.3 TDengine Docker配置

```yaml
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
    - ./data/tdengine-log:/var/log/taos
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
    start_period: 30s
```

---

## 五、EMQX MQTT Broker部署

### 5.1 EMQX配置(emqx.conf)

```hcl
listeners.tcp.default {
  bind = "0.0.0.0:1883"
  max_connections = 1024000
}
listeners.ws.default {
  bind = "0.0.0.0:8083"
  websocket.mqtt_path = "/mqtt"
}
dashboard {
  listeners.http { bind = "0.0.0.0:18083" }
  default_username = "admin"
  default_password = "${EMQX_ADMIN_PASSWORD}"
}
mqtt {
  idle_timeout = 60000
  max_packet_size = 1MB
  max_qos_allowed = 2
  retain_available = true
  wildcard_subscription = true
}
node {
  name = "emqx@127.0.0.1"
  process_limit = 2097152
  max_ports = 1048576
}
log {
  file_handlers.default {
    level = info
    max_size = 50MB
    rotation_count = 10
  }
}
```

### 5.2 EMQX ACL规则

```erlang
%% 允许EMS订阅遥测数据
{allow, {username, "ems-server"}, subscribe, ["$share/ems/+/+/+/measure/#"]}.
{allow, {username, "ems-server"}, subscribe, ["$share/ems/+/+/+/alarm/#"]}.
{allow, {username, "ems-server"}, subscribe, ["$share/ems/+/+/+/status/#"]}.
%% 允许EMS下发指令
{allow, {username, "ems-server"}, publish, ["+/+/+/command/#"]}.
{allow, {username, "ems-server"}, publish, ["+/+/+/param/#"]}.
%% 默认拒绝
{deny, all, subscribe, ["$SYS/#", "#"]}.
{deny, all, publish, ["$SYS/#", "#"]}.
```

### 5.3 EMQX Docker配置

```yaml
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
    - ./data/emqx/log:/opt/emqx/log
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
```

---

## 六、PostgreSQL部署与初始化

### 6.1 PostgreSQL Docker配置

```yaml
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
  command: >
    postgres -c max_connections=200 -c shared_buffers=256MB
    -c wal_level=replica -c log_timezone='Asia/Shanghai'
  healthcheck:
    test: ["CMD-SHELL", "pg_isready -U ems -d ems_config"]
    interval: 10s
    timeout: 5s
    retries: 5
```

### 6.2 PostgreSQL初始化SQL

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

-- 用户
CREATE TABLE IF NOT EXISTS ems_users (
    id SERIAL PRIMARY KEY,
    username VARCHAR(64) UNIQUE NOT NULL,
    password_hash VARCHAR(256) NOT NULL,
    role VARCHAR(16) DEFAULT 'viewer',
    site_id VARCHAR(64),
    is_active BOOLEAN DEFAULT true,
    last_login TIMESTAMP,
    created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
);

-- 策略配置
CREATE TABLE IF NOT EXISTS strategy_config (
    id SERIAL PRIMARY KEY,
    strategy_id VARCHAR(64) UNIQUE NOT NULL,
    strategy_name VARCHAR(128) NOT NULL,
    site_id VARCHAR(64) NOT NULL REFERENCES site_config(site_id),
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
CREATE INDEX IF NOT EXISTS idx_strategy_site ON strategy_config(site_id);
CREATE INDEX IF NOT EXISTS idx_oper_log_time ON operation_log(created_at DESC);

-- 初始默认站点
INSERT INTO site_config (site_id, site_name)
VALUES ('station-001', '默认储能电站') ON CONFLICT (site_id) DO NOTHING;

-- 默认峰谷电价(上海大工业)
INSERT INTO price_config (site_id, period_type, start_time, end_time, price_kwh, demand_charge, effective_from)
VALUES
    ('station-001', 'peak',  '09:00', '12:00', 1.20, 35.0, CURRENT_DATE),
    ('station-001', 'peak',  '17:00', '22:00', 1.20, 35.0, CURRENT_DATE),
    ('station-001', 'flat',  '08:00', '09:00', 0.80, 35.0, CURRENT_DATE),
    ('station-001', 'flat',  '12:00', '17:00', 0.80, 35.0, CURRENT_DATE),
    ('station-001', 'flat',  '22:00', '23:00', 0.80, 35.0, CURRENT_DATE),
    ('station-001', 'valley','23:00', '07:00', 0.40, 35.0, CURRENT_DATE)
ON CONFLICT DO NOTHING;
```

---

## 七、Redis与Nginx部署

### 7.1 Redis Docker配置

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

### 7.2 Nginx反向代理配置

```nginx
worker_processes auto;
events { worker_connections 2048; }

http {
    include /etc/nginx/mime.types;
    default_type application/octet-stream;
    sendfile on;
    keepalive_timeout 65;
    client_max_body_size 100M;
    gzip on;
    gzip_types text/plain application/json application/javascript text/css;

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
            proxy_set_header X-Forwarded-For $proxy_add_x_forwarded_for;
        }

        location /api/ {
            proxy_pass http://ems-api:9002/api/;
            proxy_set_header Host $host;
            proxy_set_header X-Real-IP $remote_addr;
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

### 7.3 Nginx Docker配置

```yaml
nginx:
  image: nginx:1.25-alpine
  container_name: ems-nginx
  hostname: nginx
  restart: unless-stopped
  volumes:
    - ./configs/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
    - ./data/nginx/log:/var/log/nginx
  ports:
    - "80:80"
  networks:
    - ems-network
  depends_on:
    ems-api:
      condition: service_healthy
    ems-webui:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://localhost:80/"]
    interval: 15s
    timeout: 5s
    retries: 3
```

---

## 八、EMS应用微服务部署

### 8.1 EMS-Core(数据采集与协议转换)

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
    TDENGINE_PORT: 6030
    EMQX_HOST: emqx
    EMQX_PORT: 1883
    POSTGRES_HOST: postgres
    POSTGRES_PORT: 5432
    POSTGRES_DB: ems_config
    POSTGRES_USER: ems
    POSTGRES_PASSWORD: ${PG_PASSWORD}
    REDIS_HOST: redis
    REDIS_PORT: 6379
    LOG_LEVEL: info
  volumes:
    - ./configs/ems/application.yaml:/app/config/application.yaml:ro
    - ./data/ems-logs/core:/app/logs
  ports:
    - "9001:9001"
  networks:
    - ems-network
  depends_on:
    tdengine:
      condition: service_healthy
    emqx:
      condition: service_healthy
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9001/health"]
    interval: 15s
    timeout: 5s
    retries: 3
    start_period: 30s
```

### 8.2 EMS-API(REST API)

```yaml
ems-api:
  image: ems-api:1.0.0
  container_name: ems-api
  hostname: ems-api
  restart: unless-stopped
  environment:
    TZ: Asia/Shanghai
    PROFILE: production
    TDENGINE_HOST: tdengine
    POSTGRES_HOST: postgres
    POSTGRES_PORT: 5432
    POSTGRES_DB: ems_config
    POSTGRES_USER: ems
    POSTGRES_PASSWORD: ${PG_PASSWORD}
    REDIS_HOST: redis
    REDIS_PORT: 6379
    JWT_SECRET: ${JWT_SECRET}
  volumes:
    - ./data/ems-logs/api:/app/logs
  ports:
    - "9002:9002"
  networks:
    - ems-network
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9002/api/health"]
    interval: 15s
    timeout: 5s
    retries: 3
    start_period: 20s
```

### 8.3 EMS-WebUI(前端界面)

```yaml
ems-webui:
  image: ems-webui:1.0.0
  container_name: ems-webui
  hostname: ems-webui
  restart: unless-stopped
  environment:
    TZ: Asia/Shanghai
  ports:
    - "9003:80"
  networks:
    - ems-network
  depends_on:
    ems-api:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "wget", "-qO-", "http://localhost:80/"]
    interval: 15s
    timeout: 5s
    retries: 3
```

### 8.4 EMS-Strategy(策略引擎)

```yaml
ems-strategy:
  image: ems-strategy:1.0.0
  container_name: ems-strategy
  hostname: ems-strategy
  restart: unless-stopped
  environment:
    TZ: Asia/Shanghai
    POSTGRES_HOST: postgres
    POSTGRES_PORT: 5432
    POSTGRES_DB: ems_config
    POSTGRES_USER: ems
    POSTGRES_PASSWORD: ${PG_PASSWORD}
    REDIS_HOST: redis
    REDIS_PORT: 6379
    EMQX_HOST: emqx
    EMQX_PORT: 1883
    STRATEGY_LOOP_INTERVAL_MS: 1000
  volumes:
    - ./configs/ems/strategy.yaml:/app/config/strategy.yaml:ro
    - ./data/ems-logs/strategy:/app/logs
  ports:
    - "9005:9005"
  networks:
    - ems-network
  depends_on:
    postgres:
      condition: service_healthy
    redis:
      condition: service_healthy
    emqx:
      condition: service_healthy
  healthcheck:
    test: ["CMD", "curl", "-f", "http://localhost:9005/health"]
    interval: 15s
    timeout: 5s
    retries: 3
    start_period: 20s
```

---

## 九、Docker Compose完整模板

### 9.1 环境变量(.env)

```bash
# /opt/ems/.env
# 敏感信息集中管理, 生产环境修改默认密码!

PG_PASSWORD=ChangeMe!2024
EMQX_ADMIN_PASSWORD=admin123
JWT_SECRET=your-jwt-secret-key-change-in-production
NETWORK_SUBNET=172.25.0.0/16
```

### 9.2 完整docker-compose.yml

```yaml
version: '3.8'

networks:
  ems-network:
    driver: bridge
    ipam:
      config:
        - subnet: ${NETWORK_SUBNET:-172.25.0.0/16}

services:
  # ====== 中间件 ======
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
      - ./data/tdengine-log:/var/log/taos
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
      - ./data/emqx/log:/opt/emqx/log
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
    command: >
      postgres -c max_connections=200 -c shared_buffers=256MB -c wal_level=replica
    healthcheck:
      test: ["CMD-SHELL", "pg_isready -U ems -d ems_config"]
      interval: 10s
      timeout: 5s
      retries: 5

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

  # ====== EMS微服务 ======
  ems-core:
    image: ems-core:1.0.0
    container_name: ems-core
    hostname: ems-core
    restart: unless-stopped
    environment:
      TZ: Asia/Shanghai
      TDENGINE_HOST: tdengine
      EMQX_HOST: emqx
      POSTGRES_HOST: postgres
      POSTGRES_DB: ems_config
      POSTGRES_USER: ems
      POSTGRES_PASSWORD: ${PG_PASSWORD}
      REDIS_HOST: redis
    volumes:
      - ./data/ems-logs/core:/app/logs
    ports:
      - "9001:9001"
    networks:
      - ems-network
    depends_on:
      tdengine:
        condition: service_healthy
      emqx:
        condition: service_healthy
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9001/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 30s

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
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9002/api/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 20s

  ems-webui:
    image: ems-webui:1.0.0
    container_name: ems-webui
    hostname: ems-webui
    restart: unless-stopped
    environment:
      TZ: Asia/Shanghai
    ports:
      - "9003:80"
    networks:
      - ems-network
    depends_on:
      ems-api:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:80/"]
      interval: 15s
      timeout: 5s
      retries: 3

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
    volumes:
      - ./configs/ems/strategy.yaml:/app/config/strategy.yaml:ro
      - ./data/ems-logs/strategy:/app/logs
    ports:
      - "9005:9005"
    networks:
      - ems-network
    depends_on:
      postgres:
        condition: service_healthy
      redis:
        condition: service_healthy
      emqx:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "curl", "-f", "http://localhost:9005/health"]
      interval: 15s
      timeout: 5s
      retries: 3
      start_period: 20s

  nginx:
    image: nginx:1.25-alpine
    container_name: ems-nginx
    hostname: nginx
    restart: unless-stopped
    volumes:
      - ./configs/nginx/nginx.conf:/etc/nginx/nginx.conf:ro
      - ./data/nginx/log:/var/log/nginx
    ports:
      - "80:80"
    networks:
      - ems-network
    depends_on:
      ems-api:
        condition: service_healthy
      ems-webui:
        condition: service_healthy
    healthcheck:
      test: ["CMD", "wget", "-qO-", "http://localhost:80/"]
      interval: 15s
      timeout: 5s
      retries: 3
```

---

## 十、数据库Schema初始化

### 10.1 TDengine初始化验证

```bash
#!/bin/bash
# init_tdengine.sh

echo "Waiting for TDengine to be ready..."
until docker exec ems-tdengine taos -s "show databases;" 2>/dev/null | grep -q ems_tsdb; do
  sleep 5
done

echo "Executing TDengine init SQL..."
docker exec -i ems-tdengine taos -s "$(cat /opt/ems/configs/tdengine/init.sql)"

echo "Verifying..."
docker exec ems-tdengine taos -s "SELECT count(*) FROM ems_tsdb.pcs_telemetry_pcs01;"
echo "TDengine initialization complete."
```

### 10.2 PostgreSQL验证

```bash
#!/bin/bash
# verify_postgres.sh

echo "Verifying PostgreSQL..."
docker exec ems-postgres psql -U ems -d ems_config -c "\dt"
docker exec ems-postgres psql -U ems -d ems_config -c "
SELECT 'Tables' as info, count(*) as cnt FROM information_schema.tables WHERE table_schema='public';
"
echo "PostgreSQL verification complete."
```

---

## 十一、健康检查探针体系

### 11.1 健康检查脚本

```bash
#!/bin/bash
# health_check.sh

TOTAL=0; PASS=0; FAIL=0;

check_tcp() {
  local name=$1 host=$2 port=$3
  ((TOTAL++))
  if timeout 5 bash -c "echo >/dev/tcp/$host/$port" 2>/dev/null; then
    echo "[PASS] TCP $name ($host:$port)"
    ((PASS++))
  else
    echo "[FAIL] TCP $name ($host:$port)"
    ((FAIL++))
  fi
}

check_http() {
  local name=$1 url=$2
  ((TOTAL++))
  local code=$(curl -s -o /dev/null -w "%{http_code}" --connect-timeout 5 "$url" 2>/dev/null)
  if [ "$code" -ge 200 ] && [ "$code" -lt 500 ]; then
    echo "[PASS] HTTP $name ($url) -> $code"
    ((PASS++))
  else
    echo "[FAIL] HTTP $name ($url) -> $code"
    ((FAIL++))
  fi
}

check_container() {
  local name=$1
  ((TOTAL++))
  local status=$(docker inspect -f '{{.State.Status}}' "$name" 2>/dev/null)
  if [ "$status" == "running" ]; then
    echo "[PASS] Container $name"
    ((PASS++))
  else
    echo "[FAIL] Container $name -> $status"
    ((FAIL++))
  fi
}

echo "=== EMS Health Check ==="; echo "Time: $(date)"; echo ""

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

### 11.2 健康检查指标

```
探针类型    | 检查项          | 间隔   | 超时  | 重试 | 通过条件
───────────┼────────────────┼───────┼──────┼─────┼────────────────
TCP        | 端口可连接      | 10s   | 5s   | 3    | TCP三次握手成功
HTTP       | 服务响应        | 15s   | 5s   | 3    | 返回200-499
DB Query   | 数据库可查询    | 30s   | 10s  | 3    | 查询返回预期结果
Container  | 容器Running     | 15s   | 5s   | 3    | State=running
```

---

## 十二、一键部署脚本

```bash
#!/bin/bash
# deploy.sh - EMS一键部署脚本
set -e

PROJECT_DIR="/opt/ems"
cd "$PROJECT_DIR"

echo "========================================="
echo "  EMS System One-Click Deploy v1.0"
echo "  Time: $(date)"
echo "========================================="

# Phase 1: Pre-check
echo ""; echo "[1/6] Server Pre-Check..."
bash scripts/pre_check.sh
#if [ $? -ne 0 ]; then echo "Pre-check failed!"; exit 1; fi

# Phase 2: Create directories
echo ""; echo "[2/6] Creating directories..."
mkdir -p configs/{tdengine,emqx,postgres,nginx,ems}
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
echo ""; echo "[4/6] Starting middleware (TDengine/EMQX/PostgreSQL/Redis)..."
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
echo "EMQX Dashboard: http://$IP:18083 (admin/admin123)"
echo ""

if [ $RC -eq 0 ]; then
    echo "STATUS: ALL SERVICES HEALTHY"
else
    echo "STATUS: Some checks failed. Run: docker compose logs"
fi
```

---

## 十三、运维常用命令

### 13.1 Docker运维

```bash
# 服务状态
docker compose ps

# 查看日志
docker compose logs -f --tail=100 ems-core
docker compose logs -f --tail=100 ems-strategy

# 重启服务
docker compose restart ems-core
docker compose restart ems-api

# 启停所有
docker compose stop
docker compose up -d

# 进入容器
docker exec -it ems-core /bin/bash
docker exec -it ems-postgres psql -U ems -d ems_config

# 资源监控
docker stats --no-stream
```

### 13.2 数据库运维

```bash
# TDengine查询
docker exec ems-tdengine taos -s "SELECT last(*) FROM ems_tsdb.pcs_telemetry_pcs01;"
docker exec ems-tdengine taos -s "SELECT ts, soc FROM ems_tsdb.bms_telemetry_bms01 WHERE ts >= NOW - 1h;"

# 备份
docker exec ems-tdengine taosdump -o /var/lib/taos/backup -A
docker exec ems-postgres pg_dump -U ems ems_config > backup_pg_$(date +%Y%m%d).sql

# 恢复
docker exec -i ems-postgres psql -U ems -d ems_config < backup_pg_20260530.sql
```

---

## 十四、部署交付报告模板

```markdown
# EMS系统部署交付报告

## 1. 项目信息
| 项目名称 | XXXXXX |
| 站点编号 | station-xxx |
| 部署日期 | YYYY-MM-DD |
| 部署人员 | XXX |

## 2. 服务器信息
| 项目 | 信息 |
|------|------|
| IP地址 | xxx.xxx.xxx.xxx |
| OS | Ubuntu 22.04 |
| CPU | xx Core |
| 内存 | xx GB |
| 磁盘 | xx GB |
| Docker版本 | x.x.x |

## 3. 部署服务清单
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

## 4. 访问信息
| 系统 | URL | 用户名 | 密码 |
|------|-----|-------|------|
| EMS Web界面 | http://IP | admin | 见.env |
| EMQX管理 | http://IP:18083 | admin | admin123 |

## 5. 健康检查结果
| 检查项 | 结果 |
|-------|------|
| TCP端口检查(9项) | xx/9 PASS |
| HTTP服务检查(5项) | xx/5 PASS |
| 容器状态检查(9项) | xx/9 PASS |
| 数据库连接检查 | PASS |

## 6. 注意事项
- [ ] 修改默认密码(.env文件中的密码)
- [ ] 配置防火墙规则(按需开放端口)
- [ ] 配置域名/SSL证书(如需HTTPS)
- [ ] 配置数据备份策略(crontab每日备份)
- [ ] 配置日志轮转/清理
- [ ] 配置监控告警(钉钉/微信/邮件)

## 7. 数据库备份策略
```
crontab -e:
  0 3 * * * docker exec ems-postgres pg_dump -U ems ems_config > /opt/ems/backups/pg_$(date +\%Y\%m\%d).sql
  30 3 * * * docker exec ems-tdengine taosdump -o /var/lib/taos/backup -A
```

## 8. 签收确认
交付人: __________  日期: __________
接收人: __________  日期: __________
```

---

## 十五、常见部署问题排查

### 15.1 常见问题速查

```
问题                        | 可能原因                | 解决方案
───────────────────────────┼───────────────────────┼───────────────────
端口占用                   | 已有服务使用端口         | ss -tlnp查占用, 修改端口或停止冲突服务
Docker daemon not running  | Docker未启动            | systemctl start docker
镜像拉取失败               | 网络/DNS问题            | 配置镜像加速器 或 离线导入
TDengine启动失败            | 数据目录权限/已损坏     | chown -R 1000:1000 data/tdengine
EMQX节点名冲突              | 集群cookie不一致       | 清理data/emqx重新启动
PostgreSQL密码错误          | 环境变量未生效           | docker compose down -v重新初始化
容器之间无法通信            | 网络配置错误            | docker network ls检查网络
健康检查超时               | 启动时间不够             | 增加start_period
磁盘空间不足               | 日志/数据过多            | df -h检查, 清理旧日志
```

### 15.2 日志查看

```bash
# EMS Core错误日志
docker exec ems-core cat /app/logs/error.log

# TDengine慢查询
docker exec ems-tdengine taos -s "SHOW QUERIES;"

# PostgreSQL慢查询
docker exec ems-postgres psql -U ems -d ems_config -c "
  SELECT query, calls, mean_exec_time FROM pg_stat_statements ORDER BY mean_exec_time DESC LIMIT 10;
"

# EMQX连接统计
curl -s http://localhost:18083/api/v5/monitor_current -u "admin:admin123"
```

### 15.3 备份与恢复

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

find /opt/ems/backups -type d -mtime +30 -exec rm -rf {} \; 2>/dev/null

echo "Backup complete: $BACKUP_DIR"
ls -lh "$BACKUP_DIR"
```

---

*版本：v1.0*
*适用范围：储能电站/微电网/充电站EMS系统现场部署与远程运维*
*下次迭代方向：
  1. Kubernetes (K8s)部署方案(高可用集群)
  2. 基于Ansible的批量部署(多站并行)
  3. 离线部署包(无外网环境)
  4. 部署后自动性能调优(benchmark)
  5. GitOps持续部署集成(ArgoCD)*
