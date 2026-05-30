# 一键部署 Skill v1.0

> 设计人：卢继雄 | 基于5年微网项目实战训练

## 概述
自动化站端服务部署：服务器预检→Docker/TDengine/EMQX/Postgres/EMS服务部署→健康检查→交付报告。

## 输入
- 目标服务器 (IP/SSH端口/用户名)
- 部署模块选择 (SCADA/EMS/网关/告警/大屏/优化/交易/AI/孪生)

## 输出
- 部署报告: 每模块状态/版本/端口/健康检查结果
- 配置文件备份路径
- 验证URL列表

## 规则

### R1: 服务器预检
- 检查: CPU核数≥4, 内存≥8GB, 磁盘≥200GB SSD
- 检查: OS为Ubuntu 22.04/Debian 12
- 检查: 端口80/443/1883/502/2404/6041/6379/5432可用
- 检查: Docker已安装或可安装

### R2: Docker部署
- 拉取镜像: ems-server, scada-server, protocol-gateway, alarm-service
- 创建网络: ess-network
- 设置volume: tdengine-data, postgres-data, redis-data

### R3: TDengine部署
- 端口: 6041(REST)/6030(C)
- 创建数据库: ess_telemetry
- 创建超级表: meters (ts/timestamp, voltage/float, current/float, power/float, soc/float)

### R4: EMQX部署
- 端口: 1883(TCP)/8883(TLS)/18083(Dashboard)
- 创建认证: username/password
- 创建ACL: site/{project}/*

### R5: PostgreSQL部署
- 端口: 5432
- 创建库: ess_config
- 初始化表: devices/strategies/alarms/schedules/users

### R6: EMS服务部署
- 端口: 8080(API)/8081(gRPC)
- 注入: 策略配置YAML + 协议点表Excel
- 启动: strategy-engine + protocol-gateway + alarm-engine

### R7: 健康检查
- 每服务: HTTP GET /health → 200 OK
- TDengine: taos -s "show databases"
- EMQX: GET /api/v5/status
- PostgreSQL: pg_isready
- 超时: 60s, 重试3次

### R8: 交付报告
- 生成: 部署时间/版本/模块状态/健康结果/URL清单
- 格式: Markdown + JSON

## 验证Checklist
- [ ] 所有预检项通过
- [ ] 所有容器running
- [ ] 所有健康检查200
- [ ] 端口无冲突
- [ ] 数据库可连接
- [ ] 交付报告已生成
