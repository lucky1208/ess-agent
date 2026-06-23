#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
evcc_client.py - EVCC (Electric Vehicle Communication Controller) 车端模拟器
==========================================================================

模拟电动汽车 (EV) 一端的通信控制器,连接到 SECC 充电桩,完成完整的充电
握手 + 充电循环 + 停止流程。

典型硬件部署:
  - 树莓派 4B / Jetson Nano / Linux PC
  - 串口接 BMS (电池管理) 通过 CAN 总线
  - 通过 WiFi 或 PLC (HomePlug Green PHY, QCA7005) 连到 SECC
  - 实际生产中,QCA7005 做 PLC 调制解调,这里我们走 TCP 简化

运行:
  python3 evcc_client.py                          # 默认连 127.0.0.1:15118
  python3 evcc_client.py --host 192.168.1.100     # 连远端充电桩
  python3 evcc_client.py --voltage 400 --current 250 --battery 75

完整交互示例:
  $ python3 secc_server.py   # 终端 A:桩端
  $ python3 evcc_client.py   # 终端 B:车端
"""
import asyncio
import argparse
import json
import time
import uuid
import random
import logging

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [EVCC] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("evcc")


class EvccClient:
    def __init__(self, host: str, port: int, target_v: float,
                 target_i: float, init_soc: float, evcc_id: str):
        self.host = host
        self.port = port
        self.target_v = target_v
        self.target_i = target_i
        self.evcc_id = evcc_id or "EVCC-" + uuid.uuid4().hex[:8].upper()
        self.soc = init_soc
        self.reader = None
        self.writer = None
        self.transaction_id = ""
        self.session_id = ""
        self.call_seq = 0

    async def connect(self):
        log.info("连接 SECC %s:%d ...", self.host, self.port)
        self.reader, self.writer = await asyncio.open_connection(self.host, self.port)
        log.info("已连接")

    def next_id(self):
        self.call_seq += 1
        return f"req-{self.call_seq}"

    async def send(self, msg_type: str, payload: dict) -> dict:
        msg = {"type": msg_type, "id": self.next_id(), **payload}
        line = json.dumps(msg, ensure_ascii=False) + "\n"
        self.writer.write(line.encode("utf-8"))
        await self.writer.drain()
        log.info("→ %s %s", msg_type, json.dumps(payload, ensure_ascii=False)[:120])
        resp_line = await self.reader.readline()
        resp = json.loads(resp_line.decode("utf-8"))
        log.info("← %s result=%s",
                 resp.get("type"), resp.get("result"))
        return resp

    async def charging_loop(self, duration_s: int):
        """CurrentDemand 循环,直到 SOC 满或时间到"""
        log.info("开始充电循环,目标 SOC=100%% 当前=%.1f%%", self.soc)
        start = time.time()
        tick = 0
        while (time.time() - start) < duration_s and self.soc < 100.0:
            ready = self.soc < 95.0
            resp = await self.send("POWER_DELIVERY_REQ", {
                "ready_to_charge": ready,
                "max_voltage": self.target_v,
                "max_current": self.target_i,
            })
            data = resp.get("data", resp)
            self.transaction_id = data.get("transaction_id", self.transaction_id)
            # 更新本地 SOC(桩端也会递增,这里也模拟以加快演示)
            self.soc = data.get("soc", self.soc)
            energy = data.get("meter_value_wh", 0) / 1000.0
            log.info("  [tick %d] SOC=%.1f%%  已充电=%.3f kWh  桩端状态=%s",
                     tick, self.soc, energy, data.get("evse_status"))
            tick += 1
            await asyncio.sleep(1.0)  # 1Hz 节奏

    async def run(self, duration_s: int):
        await self.connect()
        try:
            # 1. SDP: 发现 SECC
            r = await self.send("SDP_REQUEST", {})
            assert r.get("result") == "OK", r
            log.info("桩端 SECC IP=%s PORT=%d",
                     self.host, r.get("port", self.port))

            # 2. SAP: 协商协议
            r = await self.send("SUPPORTED_APP_PROTOCOL_REQ", {
                "app_protocol": ["ISO15118-2", "GB/T-27930-2015", "DIN70121"],
            })
            assert r.get("result") == "OK", r
            log.info("已协商协议: %s", r.get("schema_id"))

            # 3. SessionSetup
            r = await self.send("SESSION_SETUP_REQ", {"evcc_id": self.evcc_id})
            assert r.get("result") == "OK", r
            self.session_id = r.get("session_id", "")
            log.info("会话建立: %s, EVSE_ID=%s", self.session_id, r.get("evse_id"))

            # 4. ServiceDiscovery
            r = await self.send("SERVICE_DISCOVERY_REQ", {})
            assert r.get("result") == "OK", r
            log.info("可用服务: auth=%s, modes=%s",
                     r.get("auth_options"), r.get("energy_transfer_modes"))

            # 5. PaymentServiceSelection (用即插即充 PnC 或刷卡 EIM)
            r = await self.send("PAYMENT_SERVICE_SELECTION_REQ",
                                {"selected": "EIM"})
            assert r.get("result") == "OK", r

            # 6. Authorization
            r = await self.send("AUTHORIZATION_REQ",
                                {"id_token": {"type": "EIM", "value": "RFID-12345"}})
            assert r.get("result") == "OK", r
            log.info("授权成功: %s", r.get("authorization_status"))

            # 7. ChargeParameterDiscovery (报 EV 能力 + 需求)
            r = await self.send("CHARGE_PARAMETER_DISCOVERY_REQ", {
                "max_voltage": self.target_v,
                "max_current": self.target_i,
                "max_power": (self.target_v * self.target_i) / 1000.0,
                "energy_capacity": 75.0,    # kWh
                "current_soc": self.soc,
            })
            assert r.get("result") == "OK", r
            d = r.get("data", r)
            log.info("协商结果: %.1fV × %.1fA = %.2f kW",
                     d.get("agreed_voltage"),
                     d.get("agreed_current"),
                     d.get("agreed_power"))

            # 8. PowerDelivery (开始)
            await self.send("POWER_DELIVERY_REQ",
                            {"ready_to_charge": True,
                             "max_voltage": self.target_v,
                             "max_current": self.target_i})

            # 9. CurrentDemand 循环
            await self.charging_loop(duration_s)

            # 10. PowerDelivery (结束)
            await self.send("POWER_DELIVERY_REQ",
                            {"ready_to_charge": False,
                             "max_voltage": self.target_v,
                             "max_current": self.target_i})

            # 11. SessionStop
            r = await self.send("SESSION_STOP_REQ", {})
            log.info("会话总结: %s",
                     json.dumps(r.get("summary"), ensure_ascii=False, indent=2))

        except Exception as e:
            log.exception("EVCC 流程异常: %s", e)
        finally:
            try:
                self.writer.close()
                await self.writer.wait_closed()
            except Exception:
                pass
            log.info("EVCC 退出")


async def main():
    ap = argparse.ArgumentParser(description="EVCC 车端模拟器")
    ap.add_argument("--host", default="127.0.0.1", help="SECC IP")
    ap.add_argument("--port", type=int, default=15118, help="SECC port")
    ap.add_argument("--voltage", type=float, default=400.0,
                    help="请求电压 V")
    ap.add_argument("--current", type=float, default=250.0,
                    help="请求电流 A")
    ap.add_argument("--battery", type=float, default=20.0,
                    help="起始 SOC %%")
    ap.add_argument("--evcc-id", default="",
                    help="自定义 EVCC ID(默认随机)")
    ap.add_argument("--duration", type=int, default=30,
                    help="充电持续时间 s(默认30秒)")
    args = ap.parse_args()

    log.info("=" * 60)
    log.info("EVCC 启动: 连 %s:%d", args.host, args.port)
    log.info("电池: SOC=%.1f%%, 请求 %.0fV × %.0fA",
             args.battery, args.voltage, args.current)
    log.info("=" * 60)
    cli = EvccClient(args.host, args.port, args.voltage, args.current,
                     args.battery, args.evcc_id)
    await cli.run(args.duration)


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("EVCC 中断")