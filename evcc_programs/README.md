# EVCC / SECC 可运行 Python 程序包

5 个真实可独立运行的 Python 程序,覆盖 EVCC/SECC 全链路通信:
ISO 15118-2 / GBT 27930 / OCPP 2.0.1 / CAN 总线 / Modbus 电表。

全部使用 Python 3.8+ 标准库实现,**无需 pip install**,拿到代码即可运行。
Windows / Linux / macOS 跨平台兼容(其中 `can_monitor.py` 需 Linux + SocketCAN)。

## 文件清单

| 文件 | 角色 | 协议 | 用途 |
|------|------|------|------|
| `secc_server.py` | 桩端 SECC | ISO 15118-2 / GBT 27930 (JSON 简化) | TCP 服务器,接收 EVCC 充电握手 |
| `evcc_client.py` | 车端 EVCC | ISO 15118-2 / GBT 27930 | TCP 客户端,完成完整充电会话 |
| `can_monitor.py` | 总线监控 | GBT 27930 / UDS (CAN 2.0B) | SocketCAN 实时报文监控 |
| `ocpp_charge_point.py` | OCPP 桩 | OCPP 2.0.1 | 纯 stdlib WebSocket + Boot/Heartbeat/Transaction |
| `meter_reader.py` | 电表读取 | Modbus TCP | 读直流电表 V/I/P/E/SOC |

## 快速开始

### 演示 1: 桩端 ↔ 车端完整握手 (1 台机器)

终端 A:
```bash
python3 secc_server.py --max-power 100
```

终端 B:
```bash
python3 evcc_client.py --voltage 400 --current 250 --duration 30
```

车端会完成:
SDP → SAP → SessionSetup → ServiceDiscovery → PaymentServiceSelection →
Authorization → ChargeParameterDiscovery → PowerDelivery →
CurrentDemand 循环(每秒报电压电流、SOC、累计电能)→ SessionStop

### 演示 2: OCPP 桩连接到 CSMS (需要 OCPP 后端)

没有现成 CSMS 时,可以装一个本地测试 server:
```bash
pip install ocpp  # 或其他 OCPP 库
# 启动一个简易 WebSocket 端口 9000
python3 -c "
import asyncio, websockets
async def echo(ws, path):
    async for msg in ws:
        print('CSMS 收到:', msg)
        # 简单回 CALLRESULT
        import json
        data = json.loads(msg)
        if data[0] == 2:
            await ws.send(json.dumps([3, data[1], {'status': 'Accepted'}]))
asyncio.run(websockets.serve(echo, '127.0.0.1', 9000))
asyncio.get_event_loop().run_forever()
"
```

然后:
```bash
python3 ocpp_charge_point.py --csms ws://127.0.0.1:9000 --cp-id CP-DEMO --simulate
```

### 演示 3: Modbus TCP 直流电表读取

```bash
python3 meter_reader.py --host 192.168.1.100 --interval 1.0
# 或保存到 CSV
python3 meter_reader.py --host 192.168.1.100 --csv meter_log.csv
```

### 演示 4: CAN 总线监控 (仅 Linux)

先创建虚拟 CAN 接口:
```bash
sudo modprobe vcan
sudo ip link add dev vcan0 type vcan
sudo ip link set up vcan0
```

注入模拟报文并监控:
```bash
python3 can_monitor.py --iface vcan0 --simulate
```

## 实际硬件部署指南

### EVCC 板 (车端)

推荐芯片: **NXP S32K344** (ARM Cortex-M7, ASIL-D)
或国产替代: **兆易 GD32A503** (Cortex-M33)

参考板卡:
  - NXP FS32K344EVB        (官方, ~$200)
  - 大陆集团 VCU 评估板    (车规, ~$500)
  - 自研车规板 (SCH 见 ess-agent E-01 图纸)

外设接线:
  - 2× CAN-FD → 接整车 CAN / 充电 CAN
  - 1× 100BASE-T1 车载以太网 → 接 T-Box
  - 1× PLC (QCA7005) → 接充电枪控制引脚
  - 1× CP/PP 模拟前端 (TLF35584)
  - 1× Secure Element (TPM 2.0)

烧录流程:
  1. 用 J-Link / OpenSDA 烧 U-Boot + Kernel
  2. 启动后通过 USB / SD 卡更新本 Python 包
  3. systemd 服务:`/etc/systemd/system/evcc.service` 开机自启
  4. OTA: 通过 4G 模块 `swupdate` 升级

### SECC 板 (桩端)

推荐芯片: **RK3568** (四核 A55) 或 **NXP i.MX 8M Plus**
国产替代: **全志 T113 / 瑞芯微 RK3568J**

参考板卡:
  - 迅为 RK3568 核心板 + 底板 (~¥400)
  - NXP i.MX 8M Plus EVK (~$400)
  - 树莓派 4B (开发测试用, ~¥350)

外设接线:
  - 2× CAN-FD → 接 VCU/BCU
  - 1× 千兆以太网 → 接交换机 / 上位机
  - 1× 4G 模块 (移远 EC200N) → 接天线
  - 1× WiFi/BT (RTL8822CS) → 刷卡器
  - 1× HDMI → 7" 显示屏
  - 1× RS485 (Modbus RTU) → 接电表 / CDU
  - 1× CP/PP + 绝缘检测 → 接充电枪

## 协议对应真实标准

| 程序 | 简化实现 | 真实标准 | 差异 |
|------|----------|----------|------|
| secc_server.py / evcc_client.py | JSON over TCP | ISO 15118-2 (EXI over TCP/TLS) | 替换 EXI 编码为 JSON |
| can_monitor.py | SocketCAN + struct | GBT 27930 / ISO 11898 | 直接解析,无差异 |
| ocpp_charge_point.py | JSON over WS | OCPP 2.0.1 (JSON over WS) | 仅核心消息,无完整 30+ Action |
| meter_reader.py | Modbus TCP 502 | IEC 61158 / Modbus | 寄存器映射视电表型号而定 |

## 升级到生产级

要把这 5 个脚本用于真实充电桩生产,建议:

1. **ISO 15118-2**:用 [RISE-V2G](https://github.com/SwitchEV/RISE-V2G) 或
   [EVerest](https://github.com/EVerest) 项目做 EXI 编码和 TLS,本 JSON 协议作为
   调试接口保留。

2. **OCPP 2.0.1**:用 [python-ocpp](https://github.com/mobilityhouse/ocpp) 库,
   完整支持 30+ Action。

3. **CAN 监控**:用 [python-can](https://github.com/hardbyte/python-can) +
   [cantools](https://github.com/cantools/cantools) 解析 DBC 文件。

4. **Modbus**:用 [pymodbus](https://github.com/riptideio/pymodbus) 处理复杂
   事务,本脚本足够电表这种只读场景。

5. **生产部署**:用 PyInstaller 打包成单文件二进制,systemd 服务化,加看门狗
   (systemd Restart=on-failure),NTP 时间同步,日志走 rsyslog / Promtail。

## 调试技巧

- Wireshark 抓 TCP 15118 看 SECC↔EVCC JSON 报文
- `can-utils` (`candump vcan0`) 看 CAN 原始帧
- `websocat ws://127.0.0.1:9000` 调试 OCPP
- `mbpoll -m tcp -a 1 192.168.1.100 -t 4 -r 1 -c 6` 调试 Modbus

## 联系方式

ess-agent.com | lu-ESS-Agent
© 卢继雄 2026 - 请尊重知识产权