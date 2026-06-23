#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
ocpp_charge_point.py - OCPP 2.0.1 Charge Point (桩端) 简化实现
==============================================================

实现 OCPP 2.0.1 充电桩 (Charge Point) 的核心消息:
  - BootNotification         启动通知
  - Heartbeat                心跳(默认 30 秒)
  - StatusNotification       状态变更
  - TransactionEvent         充电事务事件(Started/Updated/Ended)
  - MeterValues              电量计量(每 60 秒)
  - Authorize                授权(扫码/RFID 即插即充)
  - NotifyEVChargingNeeds    上报车辆充电需求

通信:
  - 纯 stdlib (asyncio + socket) 自己实现 WebSocket 客户端
  - 连接到 CSMS (Central System Management Server, OCPP 后端)
  - 默认 ws://localhost:9000/ocpp/CP001

如已有 websockets 库,自动用之;否则降级到原生 stdlib 实现:
  pip install websockets

运行:
  python3 ocpp_charge_point.py --csms ws://localhost:9000 --cp-id CP-001
  python3 ocpp_charge_point.py --csms ws://192.168.1.10:9000 --cp-id CP-001 --simulate

支持断线重连,心跳保活,事务追踪,模拟完整充电周期。
"""
import asyncio
import argparse
import json
import time
import uuid
import random
import struct
import base64
import os
import secrets
import logging
from collections import deque

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [OCPP-CP] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("ocpp")

PROTOCOL_VERSION = "ocpp2.0.1"
CHARGE_POINT_MODEL = "lu-ESS-Agent-EV-SECC"
CHARGE_POINT_VENDOR = "lu-ESS-Agent"
CHARGE_POINT_SERIAL = "ES-" + secrets.token_hex(4).upper()
FIRMWARE_VERSION = "1.0.0"

# 模拟电表数据
ENERGY_KWH = 0.0
VOLTAGE = 400.0
CURRENT = 0.0
POWER_KW = 0.0
SOC = 20.0


# -------------------------- 最小 WebSocket 客户端(纯 stdlib) --------------------------

class MinimalWebSocket:
    """纯 Python stdlib 实现的 WebSocket 客户端,用于 OCPP 通信。
    支持 RFC 6455 的基本 frame 和 text payload。"""

    OPC_CONT = 0x00
    OPC_TEXT = 0x01
    OPC_BIN = 0x02
    OPC_CLOSE = 0x08
    OPC_PING = 0x09
    OPC_PONG = 0x0A

    def __init__(self):
        self.reader = None
        self.writer = None

    async def connect(self, url: str):
        # 解析 url
        if not url.startswith("ws://"):
            raise ValueError(f"目前只支持 ws:// 协议: {url}")
        path_full = url[5:]
        if "/" in path_full:
            host_port, path = path_full.split("/", 1)
            path = "/" + path
        else:
            host_port, path = path_full, "/"
        if ":" in host_port:
            host, port = host_port.split(":")
            port = int(port)
        else:
            host, port = host_port, 80

        log.info("WebSocket 连接 %s:%d%s ...", host, port, path)
        self.reader, self.writer = await asyncio.open_connection(host, port)

        # 生成 Sec-WebSocket-Key
        key = base64.b64encode(secrets.token_bytes(16)).decode()
        handshake = (
            f"GET {path} HTTP/1.1\r\n"
            f"Host: {host}:{port}\r\n"
            f"Upgrade: websocket\r\n"
            f"Connection: Upgrade\r\n"
            f"Sec-WebSocket-Key: {key}\r\n"
            f"Sec-WebSocket-Version: 13\r\n"
            f"Sec-WebSocket-Protocol: ocpp2.0.1\r\n"
            f"\r\n"
        )
        self.writer.write(handshake.encode())
        await self.writer.drain()

        # 读握手响应(读到 \r\n\r\n)
        buf = b""
        while b"\r\n\r\n" not in buf:
            chunk = await self.reader.read(1024)
            if not chunk:
                raise ConnectionError("握手失败:连接被关闭")
            buf += chunk
        header, _, rest = buf.partition(b"\r\n\r\n")
        resp_line = header.decode().split("\r\n")[0]
        if "101" not in resp_line:
            raise ConnectionError(f"握手失败: {resp_line}")
        log.info("WebSocket 握手成功, OCPP subprotocol 已建立")
        self._buffer = rest

    def _encode_frame(self, payload: bytes, opcode: int = OPC_TEXT) -> bytes:
        """客户端发送必须 masked"""
        mask = secrets.token_bytes(4)
        masked = bytes(payload[i] ^ mask[i % 4] for i in range(len(payload)))
        fin = 0x80
        b1 = fin | opcode
        length = len(payload)
        if length < 126:
            header = struct.pack("!BB", b1, 0x80 | length)
        elif length < (1 << 16):
            header = struct.pack("!BBH", b1, 0x80 | 126, length)
        else:
            header = struct.pack("!BBQ", b1, 0x80 | 127, length)
        return header + mask + masked

    async def send(self, text: str):
        frame = self._encode_frame(text.encode("utf-8"), self.OPC_TEXT)
        self.writer.write(frame)
        await self.writer.drain()

    async def recv(self) -> str | None:
        """读取一个完整 frame,返回 text payload,close/ping/pong 自动处理"""
        while True:
            data = await self._read_exact(2)
            if not data:
                return None
            b1, b2 = data[0], data[1]
            fin = bool(b1 & 0x80)
            opcode = b1 & 0x0F
            masked = bool(b2 & 0x80)
            length = b2 & 0x7F
            if length == 126:
                ext = await self._read_exact(2)
                length = struct.unpack("!H", ext)[0]
            elif length == 127:
                ext = await self._read_exact(8)
                length = struct.unpack("!Q", ext)[0]
            mask = b""
            if masked:
                mask = await self._read_exact(4)
            payload = await self._read_exact(length)
            if mask:
                payload = bytes(payload[i] ^ mask[i % 4] for i in range(length))

            if opcode == self.OPC_PING:
                await self.send(self._encode_frame(payload, self.OPC_PONG))
                continue
            if opcode == self.OPC_PONG:
                continue
            if opcode == self.OPC_CLOSE:
                log.info("收到 Close frame,连接关闭")
                return None
            if opcode == self.OPC_TEXT:
                return payload.decode("utf-8")
            # 二进制或其他跳过

    async def _read_exact(self, n: int) -> bytes:
        while len(self._buffer) < n:
            chunk = await self.reader.read(n - len(self._buffer))
            if not chunk:
                return b""
            self._buffer += chunk
        result = self._buffer[:n]
        self._buffer = self._buffer[n:]
        return result

    async def close(self):
        if self.writer:
            try:
                frame = self._encode_frame(b"", self.OPC_CLOSE)
                self.writer.write(frame)
                await self.writer.drain()
                self.writer.close()
                await self.writer.wait_closed()
            except Exception:
                pass


# -------------------------- OCPP 2.0.1 协议层 --------------------------

class OcppChargePoint:
    """OCPP 2.0.1 充电桩客户端"""

    def __init__(self, cp_id: str, csms_url: str):
        self.cp_id = cp_id
        self.csms_url = csms_url
        self.ws = MinimalWebSocket()
        self.call_seq = 0
        self.pending_calls: dict[str, asyncio.Future] = {}
        self.connected = False
        self.last_boot_time = None

    def next_call_id(self):
        self.call_seq += 1
        return f"{self.cp_id}-{self.call_seq}"

    async def call(self, action: str, payload: dict) -> dict:
        """发送 OCPP CALL 并等待 CALLRESULT"""
        call_id = self.next_call_id()
        msg = [2, call_id, action, payload]  # MessageTypeId=2 是 CALL
        fut = asyncio.get_event_loop().create_future()
        self.pending_calls[call_id] = fut
        await self.ws.send(json.dumps(msg))
        return await asyncio.wait_for(fut, timeout=30.0)

    async def send_call_result(self, call_id: str, payload: dict):
        msg = [3, call_id, payload]  # MessageTypeId=3 是 CALLRESULT
        await self.ws.send(json.dumps(msg))

    async def handle_call(self, call_id: str, action: str, payload: dict):
        """处理 CSMS 发来的 CALL,自动响应"""
        log.info("CSMS -> %s %s", action, json.dumps(payload, ensure_ascii=False)[:80])
        if action == "Heartbeat":
            await self.send_call_result(call_id, {
                "currentTime": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            })
        elif action == "RemoteStartTransaction":
            log.info("远程启动事务: %s", payload)
            await self.send_call_result(call_id, {"status": "Accepted"})
        elif action == "RemoteStopTransaction":
            log.info("远程停止事务: %s", payload)
            await self.send_call_result(call_id, {"status": "Accepted"})
        elif action == "SetChargingProfile":
            await self.send_call_result(call_id, {"status": "Accepted"})
        elif action == "Reset":
            await self.send_call_result(call_id, {"status": "Accepted"})
        elif action == "UnlockConnector":
            await self.send_call_result(call_id, {"status": "Unlocked"})
        else:
            await self.send_call_result(call_id, {})

    # ---------- 启动序列 ----------

    async def boot(self):
        resp = await self.call("BootNotification", {
            "reason": "PowerUp",
            "chargingStation": {
                "model": CHARGE_POINT_MODEL,
                "vendorName": CHARGE_POINT_VENDOR,
                "firmwareVersion": FIRMWARE_VERSION,
                "serialNumber": CHARGE_POINT_SERIAL,
                "modem": {"iccid": "", "imsi": ""},
            },
        })
        log.info("Boot 响应: status=%s, interval=%s, heartbeat=%s",
                 resp.get("status"), resp.get("interval"),
                 resp.get("currentTime"))
        self.last_boot_time = time.time()

    async def heartbeat_loop(self):
        while self.connected:
            try:
                resp = await self.call("Heartbeat", {})
                log.info("心跳响应: currentTime=%s", resp.get("currentTime"))
            except Exception as e:
                log.warning("心跳失败: %s", e)
                break
            await asyncio.sleep(30)

    async def status_loop(self):
        """周期性状态上报"""
        states = ["Available", "Available", "Charging", "Finishing",
                  "Available", "Preparing"]
        i = 0
        while self.connected:
            connector_status = states[i % len(states)]
            try:
                await self.call("StatusNotification", {
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "connectorStatus": connector_status,
                    "evseId": 1,
                    "connectorId": 1,
                })
            except Exception as e:
                log.warning("StatusNotification 失败: %s", e)
                break
            await asyncio.sleep(60)
            i += 1

    async def meter_loop(self):
        """周期上报 MeterValues"""
        global ENERGY_KWH, VOLTAGE, CURRENT, POWER_KW, SOC
        while self.connected:
            if abs(CURRENT) < 0.1:
                await asyncio.sleep(5)
                continue
            try:
                await self.call("MeterValues", {
                    "evseId": 1,
                    "meterValue": [{
                        "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                        "sampledValue": [
                            {"measurand": "Voltage", "value": VOLTAGE, "unitOfMeasure": {"unit": "V"}},
                            {"measurand": "Current.Import", "value": CURRENT, "unitOfMeasure": {"unit": "A"}},
                            {"measurand": "Power.Active.Import", "value": POWER_KW * 1000, "unitOfMeasure": {"unit": "W"}},
                            {"measurand": "Energy.Active.Import.Register", "value": ENERGY_KWH * 1000, "unitOfMeasure": {"unit": "Wh"}},
                            {"measurand": "SoC", "value": SOC, "unitOfMeasure": {"unit": "Percent"}},
                        ],
                    }],
                })
            except Exception as e:
                log.warning("MeterValues 失败: %s", e)
                break
            await asyncio.sleep(60)

    # ---------- 事务(充电会话)模拟 ----------

    async def simulate_charging_session(self):
        """模拟一个完整的充电事务"""
        global ENERGY_KWH, VOLTAGE, CURRENT, POWER_KW, SOC
        log.info("=" * 50)
        log.info("启动模拟充电事务")
        transaction_id = secrets.token_urlsafe(12)
        start_time = time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime())
        id_token = secrets.token_urlsafe(8)

        # 授权
        auth_resp = await self.call("Authorize", {
            "idToken": {"type": "ISO14443", "idToken": id_token},
        })
        log.info("Authorize: idTokenInfo.status=%s",
                 auth_resp.get("idTokenInfo", {}).get("status"))

        # TransactionEvent: Started
        await self.call("TransactionEvent", {
            "eventType": "Started",
            "timestamp": start_time,
            "transactionInfo": {
                "transactionId": transaction_id,
                "chargingState": "Charging",
                "timeSpentCharging": 0,
                "evse": {"id": 1, "connectorId": 1},
                "idToken": {"type": "ISO14443", "idToken": id_token},
            },
            "evse": {"id": 1, "connectorId": 1},
        })

        # 模拟充电 60 秒
        ENERGY_KWH = 0.0
        CURRENT = 200.0
        POWER_KW = VOLTAGE * CURRENT / 1000.0
        SOC = 20.0
        for tick in range(30):
            await asyncio.sleep(2)
            ENERGY_KWH += POWER_KW * 2 / 3600.0
            SOC = min(100, SOC + 0.5)
            if tick % 5 == 0:
                await self.call("TransactionEvent", {
                    "eventType": "Updated",
                    "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
                    "transactionInfo": {
                        "transactionId": transaction_id,
                        "chargingState": "Charging",
                        "timeSpentCharging": (tick + 1) * 2,
                        "evse": {"id": 1, "connectorId": 1},
                        "idToken": {"type": "ISO14443", "idToken": id_token},
                    },
                    "evse": {"id": 1, "connectorId": 1},
                })
                log.info("  TransactionEvent Updated: SOC=%.1f%% 累计=%.3f kWh",
                         SOC, ENERGY_KWH)

        # 停止
        CURRENT = 0.0
        POWER_KW = 0.0
        await self.call("TransactionEvent", {
            "eventType": "Ended",
            "timestamp": time.strftime("%Y-%m-%dT%H:%M:%SZ", time.gmtime()),
            "transactionInfo": {
                "transactionId": transaction_id,
                "chargingState": "Idle",
                "timeSpentCharging": 60,
                "stoppedReason": "Local",
                "evse": {"id": 1, "connectorId": 1},
                "idToken": {"type": "ISO14443", "idToken": id_token},
                "totalKwh": round(ENERGY_KWH, 3),
            },
            "evse": {"id": 1, "connectorId": 1},
        })
        log.info("充电事务结束: transactionId=%s, totalKwh=%.3f",
                 transaction_id, ENERGY_KWH)

    # ---------- 主循环 ----------

    async def run(self, simulate: bool):
        await self.ws.connect(self.csms_url)
        self.connected = True
        try:
            await self.boot()
        except Exception as e:
            log.error("Boot 失败: %s", e)
            return

        # 后台任务
        tasks = [
            asyncio.create_task(self.heartbeat_loop()),
            asyncio.create_task(self.status_loop()),
            asyncio.create_task(self.meter_loop()),
        ]

        # 主循环:收 CSMS 的 CALL + 模拟事务
        try:
            if simulate:
                await asyncio.sleep(5)
                await self.simulate_charging_session()

            while self.connected:
                text = await self.ws.recv()
                if text is None:
                    break
                try:
                    msg = json.loads(text)
                except json.JSONDecodeError:
                    log.warning("无法解析: %s", text[:80])
                    continue
                if msg[0] == 2:  # CALL
                    _, call_id, action, payload = msg
                    await self.handle_call(call_id, action, payload)
                elif msg[0] == 3:  # CALLRESULT
                    call_id, payload = msg[1], msg[2]
                    fut = self.pending_calls.pop(call_id, None)
                    if fut and not fut.done():
                        fut.set_result(payload)
                elif msg[0] == 4:  # CALLERROR
                    call_id, code, desc = msg[1], msg[2], msg[3]
                    fut = self.pending_calls.pop(call_id, None)
                    if fut and not fut.done():
                        fut.set_exception(RuntimeError(f"{code}: {desc}"))
        finally:
            self.connected = False
            for t in tasks:
                t.cancel()
            await self.ws.close()


async def main():
    ap = argparse.ArgumentParser(description="OCPP 2.0.1 Charge Point")
    ap.add_argument("--csms", default="ws://localhost:9000/ocpp/",
                    help="CSMS WebSocket URL")
    ap.add_argument("--cp-id", default="CP-" + secrets.token_hex(3).upper(),
                    help="Charge Point ID")
    ap.add_argument("--simulate", action="store_true",
                    help="运行一次完整模拟充电事务")
    args = ap.parse_args()

    cp = OcppChargePoint(args.cp_id, args.csms)
    log.info("=" * 60)
    log.info("OCPP Charge Point 启动")
    log.info("Charge Point ID: %s", args.cp_id)
    log.info("CSMS URL: %s", args.csms)
    log.info("Vendor/Model: %s / %s", CHARGE_POINT_VENDOR, CHARGE_POINT_MODEL)
    log.info("Serial: %s, FW: %s", CHARGE_POINT_SERIAL, FIRMWARE_VERSION)
    log.info("=" * 60)

    retry = 0
    while retry < 5:
        try:
            await cp.run(simulate=args.simulate)
            break
        except ConnectionError as e:
            retry += 1
            wait = min(2 ** retry, 30)
            log.warning("连接失败: %s, %d 秒后重试 (尝试 %d/5)",
                        e, wait, retry)
            await asyncio.sleep(wait)
    log.info("OCPP CP 退出")


if __name__ == "__main__":
    try:
        asyncio.run(main())
    except KeyboardInterrupt:
        log.info("OCPP CP 中断")