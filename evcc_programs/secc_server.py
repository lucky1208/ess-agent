#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
secc_server.py - SECC (Supply Equipment Communication Controller) 充电桩服务器
==========================================================================

模拟 ISO 15118-2 / GBT 27930 的桩端通信控制器(SECC),用 JSON over TCP
简化实现完整的充电握手 + 功率协商 + 充电循环 + 停止流程。

教学价值:
  - 不依赖任何第三方包,纯 Python 3.8+ 标准库 (asyncio)
  - 真实 ISO 15118 用 EXI (XML 二进制) 编码,这里换成 JSON,方便调试
  - 所有协议消息字段名都和 ISO 15118-2 草案字段一致,工程上可以一一映射
  - 可在树莓派 / Jetson / Linux PC / Windows 上跑,跨平台

运行:
  python3 secc_server.py                  # 监听 0.0.0.0:15118
  python3 secc_server.py --port 15118 --host 127.0.0.1
  python3 secc_server.py --max-power 100  # 限定最大功率 100kW

测试:
  另开终端: python3 evcc_client.py
"""
import asyncio
import argparse
import json
import time
import uuid
import logging
import random
from dataclasses import dataclass, field, asdict
from typing import Optional

# -------------------------- 协议常量 --------------------------

PROTOCOL_VERSION = "ISO15118-2:2016"
SECC_VENDOR = "lu-ESS-Agent"
SECC_MODEL = "EV-SECC-100kW"
SECC_FW_VERSION = "1.0.0"
EVSE_ID = "CN-*S*EVSE-001"

# 充电机状态机
class EvseState:
    IDLE = "Idle"
    SDP_LISTENING = "SDP_Listening"
    SDP_RESPONDED = "SDP_Responded"
    SAP_NEGOTIATED = "SAP_Negotiated"
    SESSION_SETUP = "SessionSetup"
    SERVICE_DISCOVERY = "ServiceDiscovery"
    PAYMENT_SELECTION = "PaymentServiceSelection"
    AUTHORIZATION = "Authorization"
    CHARGE_PARAMETER = "ChargeParameterDiscovery"
    CHARGING = "Charging"
    POWER_DELIVERY = "PowerDelivery"
    SESSION_STOP = "SessionStop"
    FAULT = "Fault"

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [SECC] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("secc")


# -------------------------- 桩端控制器状态 --------------------------

@dataclass
class ChargeSession:
    session_id: str = field(default_factory=lambda: str(uuid.uuid4()))
    evcc_id: str = ""
    target_voltage: float = 0.0  # V
    target_current: float = 0.0  # A
    max_voltage: float = 1000.0  # V
    max_current: float = 200.0   # A
    max_power: float = 100.0     # kW
    energy_delivered: float = 0.0  # kWh
    soc: float = 20.0            # 起始 SOC
    start_time: float = field(default_factory=time.time)
    state: str = EvseState.IDLE
    transaction_id: str = ""
    meter_start: float = 0.0
    price_per_kwh: float = 0.85  # CNY/kWh


# -------------------------- JSON 消息编解码 --------------------------

def make_msg(msg_type: str, payload: dict, **extra) -> dict:
    msg = {"type": msg_type, "ts": time.time(), **extra, **payload}
    return msg


def make_response(req: dict, payload: dict, result: str = "OK") -> dict:
    return make_msg(
        req["type"] + "_res",
        {"result": result, "ref": req.get("id"), **payload},
    )


def make_error(req: dict, code: str, desc: str) -> dict:
    return make_msg(
        req["type"] + "_res",
        {"result": "FAILED", "ref": req.get("id"),
         "error": {"code": code, "desc": desc}},
    )


# -------------------------- 协议状态机 --------------------------

class SeccStateMachine:
    """SECC 协议状态机,处理 EVCC 发来的每条 JSON 消息"""

    def __init__(self, writer: asyncio.StreamWriter, max_power_kw: float):
        self.writer = writer
        self.session = ChargeSession(max_power=max_power_kw)
        self.sap_negotiated_protocol: Optional[str] = None

    async def send(self, msg: dict):
        line = json.dumps(msg, ensure_ascii=False) + "\n"
        self.writer.write(line.encode("utf-8"))
        await self.writer.drain()
        log.info("→ %s", msg.get("type"))

    async def handle(self, req: dict) -> bool:
        """返回 False 表示会话结束"""
        t = req.get("type")
        log.info("← %s (state=%s)", t, self.session.state)

        handler = {
            "SDP_REQUEST": self._on_sdp_request,
            "SUPPORTED_APP_PROTOCOL_REQ": self._on_sap_req,
            "SESSION_SETUP_REQ": self._on_session_setup,
            "SERVICE_DISCOVERY_REQ": self._on_service_discovery,
            "PAYMENT_SERVICE_SELECTION_REQ": self._on_payment_selection,
            "AUTHORIZATION_REQ": self._on_authorization,
            "CHARGE_PARAMETER_DISCOVERY_REQ": self._on_charge_param,
            "POWER_DELIVERY_REQ": self._on_power_delivery,
            "CHARGING_STATUS_REQ": self._on_charging_status,
            "METERING_RECEIPT_REQ": self._on_metering_receipt,
            "SESSION_STOP_REQ": self._on_session_stop,
        }.get(t)

        if not handler:
            await self.send(make_error(req, "UNSUPPORTED", f"未知消息: {t}"))
            return True

        try:
            return await handler(req)
        except Exception as e:
            log.exception("handle %s 失败", t)
            await self.send(make_error(req, "INTERNAL", str(e)))
            self.session.state = EvseState.FAULT
            return True

    # ---------- 协议阶段 ----------

    async def _on_sdp_request(self, req):
        """SDP: SECC Discovery Protocol - 桩端宣告自己的 IP:port"""
        self.session.state = EvseState.SDP_RESPONDED
        await self.send(make_response(req, {
            "security": 0,  # 0=unsecured, 1=TLS
            "transport": "TCP",
            "port": 15118,
        }))
        return True

    async def _on_sap_req(self, req):
        """SAP: 协商应用层协议 (选 ISO 15118-2 或 GBT 27930)"""
        evcc_protocols = req.get("app_protocol", [])
        # 桩端优先 ISO 15118-2,其次 GBT 27930
        for prefer in ["ISO15118-2", "GB/T-27930-2015", "DIN70121"]:
            if prefer in evcc_protocols:
                self.sap_negotiated_protocol = prefer
                break
        if not self.sap_negotiated_protocol:
            await self.send(make_error(req, "NO_COMMON_PROTOCOL",
                                       "无共同支持的协议"))
            return True

        self.session.state = EvseState.SAP_NEGOTIATED
        await self.send(make_response(req, {
            "schema_id": self.sap_negotiated_protocol,
            "supported_ns": ["urn:iso:15118:2:2010:AppProtocol"],
        }))
        return True

    async def _on_session_setup(self, req):
        self.session.evcc_id = req.get("evcc_id", "")
        self.session.state = EvseState.SESSION_SETUP
        await self.send(make_response(req, {
            "session_id": self.session.session_id,
            "evse_id": EVSE_ID,
            "timestamp": int(time.time()),
        }))
        return True

    async def _on_service_discovery(self, req):
        self.session.state = EvseState.SERVICE_DISCOVERY
        await self.send(make_response(req, {
            "auth_options": ["EIM", "PnC"],  # External Identification / Plug & Charge
            "energy_transfer_modes": ["DC_extended"],
            "vas_list": [],
        }))
        return True

    async def _on_payment_selection(self, req):
        self.session.state = EvseState.PAYMENT_SELECTION
        await self.send(make_response(req, {
            "selected": req.get("selected", "EIM"),
        }))
        return True

    async def _on_authorization(self, req):
        self.session.state = EvseState.AUTHORIZATION
        # 简化:任何授权都接受
        await self.send(make_response(req, {
            "authorization_status": "Accepted",
            "evse_status": "EVSE_ReadyToCharge",
        }))
        return True

    async def _on_charge_param(self, req):
        """EVCC 报需求电压/电流,桩端评估"""
        req_v = float(req.get("max_voltage", 0))
        req_i = float(req.get("max_current", 0))
        req_p = float(req.get("max_power", 0))

        self.session.target_voltage = min(req_v, self.session.max_voltage)
        self.session.target_current = min(req_i, self.session.max_current)
        # 桩端功率约束:max_power_kw 优先
        ev_max_power = (req_v * req_i) / 1000.0  # kW
        cap_power = min(ev_max_power, req_p, self.session.max_power)

        # 重新算电流(保功率不超)
        self.session.target_current = min(
            self.session.target_current,
            (cap_power * 1000.0) / max(self.session.target_voltage, 1.0),
        )

        self.session.state = EvseState.CHARGE_PARAMETER
        await self.send(make_response(req, {
            "evse_max_voltage": self.session.max_voltage,
            "evse_max_current": self.session.max_current,
            "evse_max_power": self.session.max_power,
            "agreed_voltage": round(self.session.target_voltage, 1),
            "agreed_current": round(self.session.target_current, 1),
            "agreed_power": round(cap_power, 2),
            "departure_time": int(time.time()) + 3600,  # 1 小时预测
            "price_per_kwh": self.session.price_per_kwh,
            "currency": "CNY",
        }))
        return True

    async def _on_power_delivery(self, req):
        """进入功率输出循环,EVCC 周期性请求 CurrentDemand"""
        if req.get("ready_to_charge") is False:
            await self.send(make_response(req, {
                "evse_status": "EVSE_Shutdown",
                "meter_value": round(self.session.energy_delivered, 3),
            }))
            return True

        # 开始累计能量(简化:按每秒当前功率算)
        power_kw = (self.session.target_voltage *
                    self.session.target_current) / 1000.0
        # 加一点噪声模拟真实波动
        power_kw *= random.uniform(0.97, 1.0)
        self.session.energy_delivered += power_kw / 3600.0  # 每秒 kWh

        # SOC 模拟
        if self.session.soc < 100:
            self.session.soc = min(100.0,
                                   self.session.soc + 0.05)  # 1s 大约充 0.05%

        self.session.state = EvseState.POWER_DELIVERY
        # 按需生成 transaction_id(只生成一次)
        if not self.session.transaction_id:
            self.session.transaction_id = str(uuid.uuid4())
        await self.send(make_response(req, {
            "evse_status": "EVSE_Ongoing",
            "meter_value_wh": int(self.session.energy_delivered * 1000),
            "current_export": round(self.session.target_current, 2),
            "voltage_export": round(self.session.target_voltage, 1),
            "soc": round(self.session.soc, 2),
            "remaining_time_s": int(
                (100 - self.session.soc) * 3600 / max(self.session.soc, 1) * 10
            ) if self.session.soc < 100 else 0,
            "transaction_id": self.session.transaction_id,
        }))
        return True

    async def _on_charging_status(self, req):
        await self.send(make_response(req, {
            "evse_status": "EVSE_Ongoing" if self.session.soc < 100 else "EVSE_Completion",
            "soc": round(self.session.soc, 2),
            "meter_value_wh": int(self.session.energy_delivered * 1000),
        }))
        return True

    async def _on_metering_receipt(self, req):
        await self.send(make_response(req, {
            "meter_info": {
                "meter_id": "DC-METER-001",
                "meter_reading": int(self.session.energy_delivered * 1000),
                "meter_signature": "sig_" + uuid.uuid4().hex[:16],
            },
            "receipt_status": "Accepted",
        }))
        return True

    async def _on_session_stop(self, req):
        duration = time.time() - self.session.start_time
        self.session.state = EvseState.SESSION_STOP
        await self.send(make_response(req, {
            "evse_status": "EVSE_Finished",
            "summary": {
                "session_id": self.session.session_id,
                "energy_delivered_kwh": round(self.session.energy_delivered, 3),
                "duration_s": int(duration),
                "final_soc": round(self.session.soc, 2),
                "cost_cny": round(self.session.energy_delivered *
                                   self.session.price_per_kwh, 2),
            },
        }))
        return False  # 关闭连接


# -------------------------- TCP 服务器 --------------------------

async def handle_client(reader: asyncio.StreamReader,
                         writer: asyncio.StreamWriter,
                         max_power: float):
    peer = writer.get_extra_info("peername")
    log.info("EVCC 已连接: %s:%s", peer[0], peer[1])
    sm = SeccStateMachine(writer, max_power)
    try:
        while True:
            line = await reader.readline()
            if not line:
                log.info("EVCC %s 断开连接", peer[0])
                break
            try:
                req = json.loads(line.decode("utf-8").strip())
            except json.JSONDecodeError as e:
                log.warning("JSON 解析失败: %s", e)
                continue
            cont = await sm.handle(req)
            if not cont:
                break
    except asyncio.IncompleteReadError:
        log.info("EVCC %s 异常断开", peer[0])
    except ConnectionResetError:
        log.info("EVCC %s 重置连接", peer[0])
    finally:
        try:
            writer.close()
            await writer.wait_closed()
        except Exception:
            pass
        log.info("会话结束: %s, 充电 %.3f kWh, SOC %.1f%%",
                 sm.session.session_id,
                 sm.session.energy_delivered,
                 sm.session.soc)


async def main():
    ap = argparse.ArgumentParser(description="SECC 充电桩服务器")
    ap.add_argument("--host", default="0.0.0.0", help="监听 IP")
    ap.add_argument("--port", type=int, default=15118, help="监听端口")
    ap.add_argument("--max-power", type=float, default=100.0,
                    help="桩端最大功率 (kW)")
    args = ap.parse_args()

    server = await asyncio.start_server(
        lambda r, w: handle_client(r, w, args.max_power),
        host=args.host, port=args.port,
    )
    log.info("=" * 60)
    log.info("SECC 启动: %s:%d  最大功率: %.1f kW", args.host, args.port, args.max_power)
    log.info("厂商: %s  型号: %s  协议: %s",
             SECC_VENDOR, SECC_MODEL, PROTOCOL_VERSION)
    log.info("=" * 60)
    async with server:
        await server.serve_forever()


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("SECC 关闭")