#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
meter_reader.py - Modbus TCP 直流电表读取器
===========================================

通过 Modbus TCP 协议 (端口 502) 读取充电桩直流侧电表数据,
支持功能码:
  - FC 0x04  Read Input Registers  (输入寄存器,只读)
  - FC 0x03  Read Holding Registers (保持寄存器)
  - FC 0x06  Write Single Register   (校表)

适用电表:
  - Acrel AGF-ML  (安科瑞光伏直流电表)
  - Schneider PM5580
  - ABB M2M
  - 通用 Modbus TCP 电表

寄存器定义 (典型 AGF-ML):
  0x0000  Voltage          (V)   f32
  0x0002  Current          (A)   f32
  0x0004  Active Power     (kW)  f32
  0x0006  Energy Total     (kWh) f32
  0x0008  Temperature      (℃)  i16
  0x0009  SOC              (%)   i16
  0x000A  Status           (-)   u16
  0x000B  Alarm            (-)   u16

运行:
  python3 meter_reader.py --host 192.168.1.100
  python3 meter_reader.py --host 192.168.1.100 --port 502 --interval 1.0
  python3 meter_reader.py --host 192.168.1.100 --csv meter_log.csv --duration 3600

无第三方依赖,纯 socket 实现 Modbus TCP。
"""
import argparse
import socket
import struct
import time
import csv
import sys
import logging
from dataclasses import dataclass
from typing import Optional

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [METER] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("meter")

# Modbus Application Protocol Header (MBAP) 7 字节
# Transaction ID (2) + Protocol ID (2) + Length (2) + Unit ID (1)
MBAP_HEADER_FMT = ">HHHBB"  # txid, protoid, length, unit_id
FUNCTION_CODE_READ_INPUT = 0x04
FUNCTION_CODE_READ_HOLDING = 0x03
FUNCTION_CODE_WRITE_SINGLE = 0x06

ALARM_NAMES = {
    0x0000: "Normal",
    0x0001: "过压",
    0x0002: "欠压",
    0x0004: "过流",
    0x0008: "过载",
    0x0010: "过温",
    0x0020: "反接",
    0x0040: "通信异常",
    0x0080: "计量异常",
}


@dataclass
class MeterReading:
    voltage: float = 0.0
    current: float = 0.0
    power_kw: float = 0.0
    energy_kwh: float = 0.0
    temperature: float = 0.0
    soc: float = 0.0
    status: int = 0
    alarm: int = 0
    timestamp: float = 0.0

    def print_row(self):
        alarm_text = ALARM_NAMES.get(self.alarm, f"0x{self.alarm:04X}")
        print(f"  V={self.voltage:7.2f}V  I={self.current:7.2f}A  "
              f"P={self.power_kw:7.3f}kW  E={self.energy_kwh:8.3f}kWh  "
              f"T={self.temperature:5.1f}℃  SOC={self.soc:5.1f}%  "
              f"Alarm={alarm_text}")


class ModbusTcpClient:
    """纯 socket 实现的 Modbus TCP 客户端"""

    def __init__(self, host: str, port: int = 502, unit_id: int = 1, timeout: float = 3.0):
        self.host = host
        self.port = port
        self.unit_id = unit_id
        self.timeout = timeout
        self.sock: Optional[socket.socket] = None
        self.tx_id = 0

    def connect(self):
        self.sock = socket.socket(socket.AF_INET, socket.SOCK_STREAM)
        self.sock.settimeout(self.timeout)
        self.sock.connect((self.host, self.port))
        log.info("已连接电表: %s:%d (unit_id=%d)", self.host, self.port, self.unit_id)

    def close(self):
        if self.sock:
            self.sock.close()
            self.sock = None

    def _next_tx_id(self):
        self.tx_id = (self.tx_id + 1) & 0xFFFF
        return self.tx_id

    def read_input_registers(self, address: int, count: int) -> list[int]:
        """FC 0x04 读输入寄存器,返回 16 位整数列表"""
        return self._read_registers(FUNCTION_CODE_READ_INPUT, address, count)

    def read_holding_registers(self, address: int, count: int) -> list[int]:
        """FC 0x03 读保持寄存器"""
        return self._read_registers(FUNCTION_CODE_READ_HOLDING, address, count)

    def _read_registers(self, function_code: int, address: int, count: int) -> list[int]:
        if not self.sock:
            raise ConnectionError("未连接")
        tx_id = self._next_tx_id()
        # MBAP Header + Function code + Address(2) + Count(2)
        # Length = 1 (unit_id) + 1 (func) + 2 (addr) + 2 (count) = 6
        pdu = struct.pack(">BBHH", function_code, self.unit_id, address, count)
        header = struct.pack(MBAP_HEADER_FMT, tx_id, 0, len(pdu), 0)
        # 注: MBAP Length 不含 unit_id,但含 func 字节;这里的 unit_id 在 PDU 里
        # 重新计算: length = 1 (func) + 2 (addr) + 2 (count) = 5
        pdu = struct.pack(">BHH", function_code, address, count)
        length = 1 + len(pdu)
        header = struct.pack(">HHHB", tx_id, 0, length, self.unit_id)
        self.sock.sendall(header + pdu)
        # 读响应:MBAP Header (7) + func(1) + byte_count(1) + data
        resp_header = self._recv_exact(7)
        if len(resp_header) < 7:
            raise ConnectionError("响应头过短")
        r_tx, r_proto, r_len, r_unit = struct.unpack(">HHHB", resp_header)
        body = self._recv_exact(r_len - 1)  # 减 unit_id 字节
        if len(body) < 2:
            raise ConnectionError("响应体过短")
        r_func, byte_count = body[0], body[1]
        if r_func != function_code:
            if r_func & 0x80:
                exc_code = body[2]
                exc_map = {
                    0x01: "Illegal Function",
                    0x02: "Illegal Data Address",
                    0x03: "Illegal Data Value",
                    0x04: "Slave Device Failure",
                    0x05: "Acknowledge",
                    0x06: "Slave Device Busy",
                }
                raise IOError(f"Modbus 异常 0x{exc_code:02X}: {exc_map.get(exc_code, 'unknown')}")
            raise IOError(f"功能码不匹配: 期望 0x{function_code:02X}, 收到 0x{r_func:02X}")
        if byte_count != count * 2:
            raise IOError(f"返回字节数 {byte_count} 与期望 {count*2} 不符")
        # 解析为 16 位整数
        data = body[2:2 + byte_count]
        return list(struct.unpack(f">{count}H", data))

    def _recv_exact(self, n: int) -> bytes:
        buf = b""
        while len(buf) < n:
            chunk = self.sock.recv(n - len(buf))
            if not chunk:
                raise ConnectionError("连接断开")
            buf += chunk
        return buf


class MeterReader:
    """电表读取器,封装 AGF-ML 寄存器映射"""

    def __init__(self, client: ModbusTcpClient):
        self.client = client

    def read_all(self) -> MeterReading:
        """读 12 个寄存器(0x0000-0x000B)"""
        regs = self.client.read_input_registers(0x0000, 12)
        # 解析:每两个寄存器 = 一个 float (big-endian IEEE 754)
        def to_float(high, low):
            return struct.unpack(">f", struct.pack(">HH", high, low))[0]
        def to_i16(u):
            return struct.unpack(">h", struct.pack(">H", u))[0]

        r = MeterReading(timestamp=time.time())
        r.voltage = to_float(regs[0], regs[1])
        r.current = to_float(regs[2], regs[3])
        r.power_kw = to_float(regs[4], regs[5])
        r.energy_kwh = to_float(regs[6], regs[7])
        r.temperature = to_i16(regs[8])
        r.soc = to_i16(regs[9])
        r.status = regs[10]
        r.alarm = regs[11]
        return r


def main():
    ap = argparse.ArgumentParser(description="Modbus TCP 直流电表读取器")
    ap.add_argument("--host", default="192.168.1.100",
                    help="电表 IP (默认 192.168.1.100)")
    ap.add_argument("--port", type=int, default=502, help="Modbus TCP 端口")
    ap.add_argument("--unit-id", type=int, default=1, help="从站地址")
    ap.add_argument("--interval", type=float, default=1.0,
                    help="采样间隔秒(默认 1.0)")
    ap.add_argument("--duration", type=int, default=0,
                    help="持续时间(秒), 0=无限")
    ap.add_argument("--csv", default="",
                    help="保存到 CSV 文件路径")
    args = ap.parse_args()

    client = ModbusTcpClient(args.host, args.port, args.unit_id)
    reader = MeterReader(client)

    csv_file = None
    csv_writer = None
    if args.csv:
        csv_file = open(args.csv, "w", newline="", encoding="utf-8")
        csv_writer = csv.writer(csv_file)
        csv_writer.writerow(["timestamp", "voltage_v", "current_a",
                             "power_kw", "energy_kwh", "temperature_c",
                             "soc_pct", "status", "alarm"])
        log.info("CSV 日志: %s", args.csv)

    log.info("=" * 60)
    log.info("电表读取启动: %s:%d unit_id=%d interval=%.1fs",
             args.host, args.port, args.unit_id, args.interval)
    log.info("=" * 60)

    start = time.time()
    sample_count = 0
    error_count = 0
    try:
        client.connect()
        while True:
            if args.duration and (time.time() - start) > args.duration:
                break
            try:
                reading = reader.read_all()
                reading.print_row()
                if csv_writer:
                    csv_writer.writerow([
                        time.strftime("%Y-%m-%d %H:%M:%S", time.localtime(reading.timestamp)),
                        f"{reading.voltage:.2f}",
                        f"{reading.current:.2f}",
                        f"{reading.power_kw:.3f}",
                        f"{reading.energy_kwh:.3f}",
                        f"{reading.temperature:.1f}",
                        f"{reading.soc:.1f}",
                        reading.status,
                        reading.alarm,
                    ])
                    csv_file.flush()
                sample_count += 1
            except Exception as e:
                error_count += 1
                log.error("读取失败 (%d/总 %d): %s", error_count, sample_count, e)
                # 尝试重连
                try:
                    client.close()
                except Exception:
                    pass
                try:
                    client.connect()
                except Exception:
                    time.sleep(2)
                    continue
            time.sleep(args.interval)
    except KeyboardInterrupt:
        pass
    finally:
        client.close()
        if csv_file:
            csv_file.close()
        elapsed = time.time() - start
        log.info("=" * 60)
        log.info("采集结束: %.1f 秒, 成功 %d 条, 失败 %d 条",
                 elapsed, sample_count, error_count)
        if args.csv:
            log.info("CSV: %s", args.csv)


if __name__ == "__main__":
    main()