#!/usr/bin/env python3
# -*- coding: utf-8 -*-
"""
can_monitor.py - CAN 总线监控 (GBT 27930 / UDS / CANopen)
==========================================================

通过 Linux SocketCAN 接口监控充电桩 CAN 总线报文,实时解析 GBT 27930
充电通信协议报文,并支持 ISO 14229 (UDS) 诊断服务。

支持的协议:
  - GBT 27930-2015  电动汽车非车载充电机与 BMS 之间的通信协议
  - ISO 14229-1     UDS (Unified Diagnostic Services)
  - CAN 2.0B        标准帧 / 扩展帧

报文样例(GBT 27930 充电握手阶段):
  0x18F00001 [8]  CHM  充电机握手报文  (BCU/SECC -> EV)
  0x18F00002 [8]  BHM  BMS 握手报文    (EV -> BCU/SECC)
  0x18F00003 [8]  CRM  充电机辨识报文
  ...
  0x18F01003 [8]  CML  充电机最大输出能力
  0x18EBFF00 [8]  CTS  充电机时间同步

准备虚拟 CAN 接口 (Linux):
  sudo modprobe vcan
  sudo ip link add dev vcan0 type vcan
  sudo ip link set up vcan0

运行:
  python3 can_monitor.py --iface vcan0
  python3 can_monitor.py --iface can0 --filter 0x18F00000:0x1FFFFF00
  python3 can_monitor.py --duration 60   # 监控 60 秒自动退出

非 Linux 平台会输出降级提示。
"""
import argparse
import socket
import struct
import time
import signal
import sys
import platform
import logging
from collections import defaultdict

logging.basicConfig(
    level=logging.INFO,
    format="[%(asctime)s] [CAN] [%(levelname)s] %(message)s",
    datefmt="%H:%M:%S",
)
log = logging.getLogger("can")


# -------------------------- CAN 帧结构 --------------------------
# Linux SocketCAN frame layout (struct can_frame):
#   can_id (4 bytes) | can_dlc (1) | __pad (3) | __res0 (4) | __res1 (4) | data (8)
# 总长 16 字节

CAN_FRAME_FMT = "=IBB3x4x8s"
CAN_FRAME_SIZE = struct.calcsize(CAN_FRAME_FMT)


# -------------------------- GBT 27930 协议 ID 定义 --------------------------

# GBT 27930 充电协议报文 CAN ID (29 位扩展帧)
GBT_27930_PIDS = {
    # 握手阶段
    0x18F00001: ("CHM", "充电机握手报文", "BCU->EV"),
    0x18F00002: ("BHM", "BMS 握手报文",   "EV->BCU"),
    # 辨识阶段
    0x18F00003: ("CRM", "充电机辨识报文", "BCU->EV"),
    0x18F00004: ("BRM", "BMS 辨识报文",   "EV->BCU"),
    # 配置阶段
    0x18F00005: ("BCP", "BMS 配置参数",   "EV->BCU"),
    0x18F00006: ("CTS", "时间同步",       "BCU->EV"),
    0x18F00007: ("CML", "充电机最大能力", "BCU->EV"),
    0x18F00008: ("BRO", "BMS 准备就绪",   "EV->BCU"),
    0x18F00009: ("CRO", "充电机准备就绪", "BCU->EV"),
    # 充电阶段
    0x18F00101: ("BCL", "电池充电需求",   "EV->BCU"),
    0x18F00102: ("BCS", "电池充电状态",   "EV->BCU"),
    0x18F00103: ("BSM", "BMS 状态信息",   "EV->BCU"),
    0x18F00104: ("BMV", "单体电池电压",   "EV->BCU"),
    0x18F00105: ("BMT", "BMS 温度",       "EV->BCU"),
    0x18F00106: ("BSP", "BMS 预留",       "EV->BCU"),
    0x18F00110: ("CCS", "充电机充电状态", "BCU->EV"),
    0x18F00111: ("CCM", "充电机控制报文", "BCU->EV"),
    0x18F00112: ("CMO", "充电机输出电压电流", "BCU->EV"),
    0x18F00113: ("CMV", "充电机单体电压", "BCU->EV"),
    0x18F00114: ("CMT", "充电机温度",     "BCU->EV"),
    0x18F00115: ("CST", "充电机状态",     "BCU->EV"),
    0x18F00116: ("CSD", "充电机统计",     "BCU->EV"),
    # 结束阶段
    0x18F00201: ("BSD", "BMS 统计数据",   "EV->BCU"),
    0x18F00202: ("CSD", "充电机结束",     "BCU->EV"),
    0x18F00203: ("BEM", "BMS 错误报文",   "EV->BCU"),
    0x18F00204: ("CEM", "充电机错误报文", "BCU->EV"),
}

# UDS (ISO 14229) 服务 ID
UDS_SERVICES = {
    0x10: "DiagnosticSessionControl",
    0x11: "ECUReset",
    0x14: "ClearDiagnosticInformation",
    0x19: "ReadDTCInformation",
    0x22: "ReadDataByIdentifier",
    0x23: "ReadMemoryByAddress",
    0x27: "SecurityAccess",
    0x2E: "WriteDataByIdentifier",
    0x31: "RoutineControl",
    0x34: "RequestDownload",
    0x35: "RequestUpload",
    0x36: "TransferData",
    0x37: "RequestTransferExit",
    0x3E: "TesterPresent",
    0x83: "AccessTimingParameter",
    0x84: "SecuredDataTransmission",
    0x85: "ControlDTCSetting",
    0x86: "ResponseOnEvent",
    0x87: "LinkControl",
}


# -------------------------- 报文解析器 --------------------------

def decode_can_id(can_id: int):
    """分解 29 位扩展 ID:EFF=1, RTR=0, ID=can_id & 0x1FFFFFFF"""
    is_extended = bool(can_id & 0x80000000)
    is_error = bool(can_id & 0x20000000)
    arb_id = can_id & 0x1FFFFFFF
    return is_extended, is_error, arb_id


def parse_gbt_27930(can_id: int, data: bytes):
    """解析 GBT 27930 报文,返回 (短名, 描述, 解码值字符串)"""
    info = GBT_27930_PIDS.get(can_id)
    if not info:
        return None
    short_name, desc, direction = info

    decoded = ""
    if short_name == "CHM":
        # 0x18F00001 [8]: byte0=PJM 版本, byte1-3=桩号, byte4-5=握手阶段 (00-04)
        ver = data[0]
        stage = data[4]
        stage_map = {0: "未握手", 1: "握手识别", 2: "参数配置",
                     3: "充电中", 4: "充电结束"}
        decoded = f"协议版本={ver:02X} 桩号={data[1:4].hex()} 阶段={stage_map.get(stage, stage)}"

    elif short_name == "BHM":
        # 0x18F00002: byte0-1=最大允许电压(mV), byte2-3=最大允许电流(A*10), byte4=握手状态
        v_max = (data[0] << 8 | data[1]) / 1000.0
        i_max = (data[2] << 8 | data[3]) / 10.0
        decoded = f"BMS 最大允充: {v_max:.1f}V / {i_max:.1f}A"

    elif short_name == "BCL":
        # 0x18F00101: 充电需求  byte0-1=电压需求V, byte2-3=电流需求A*10
        v_dem = (data[0] << 8 | data[1]) / 1000.0
        i_dem = (data[2] << 8 | data[3]) / 10.0
        decoded = f"BMS 请求: {v_dem:.1f}V × {i_dem:.1f}A = {v_dem*i_dem/1000:.2f}kW"

    elif short_name == "BCS":
        # 0x18F00102: byte0-1=充电电压V*100, byte2-3=充电电流A*10, byte4=SOC%, byte5=剩余充电时间min
        v = (data[0] << 8 | data[1]) / 100.0
        i = (data[2] << 8 | data[3]) / 10.0
        soc = data[4]
        tmin = data[5]
        decoded = f"实际充电: {v:.1f}V × {i:.1f}A, SOC={soc}%, 剩{tmin}min"

    elif short_name == "BSM":
        # byte0=最高单体电压(0.01V), byte1=SOC%, byte2=剩余时间min, byte3-7=状态标志
        v_max_cell = data[0] / 100.0
        soc = data[1]
        tmin = data[2]
        flags = data[3]
        decoded = (f"最高单体={v_max_cell:.2f}V SOC={soc}% "
                   f"剩{tmin}min 状态={flags:02X}")

    elif short_name == "CCM":
        # 充电机控制: byte0=电压输出V, byte1=电流输出A, byte2-3=占空比
        v = data[0]
        i = data[1]
        decoded = f"桩端输出: {v}V × {i}A"

    elif short_name == "CST":
        # byte0=充电机状态 (00=待机 01=充电 02=充满 03=异常)
        state = data[0]
        state_map = {0: "待机", 1: "充电", 2: "充满", 3: "异常", 4: "握手"}
        decoded = f"桩端状态: {state_map.get(state, f'0x{state:02X}')}"

    elif short_name == "BSD":
        # byte0-1=中止原因, byte2-3=本次充电累计电能 (kWh*10), byte4=SOC
        reason = data[0]
        energy = (data[2] << 8 | data[3]) / 10.0
        soc = data[4]
        decoded = f"中止原因=0x{reason:02X} 累计={energy:.1f}kWh SOC={soc}%"

    return short_name, desc, direction, decoded


def parse_uds(can_id: int, data: bytes):
    """简单解析 UDS 报文(诊断服务)"""
    if len(data) < 1:
        return None
    sid = data[0] & 0xBF  # 抹掉 positive/negative response bit
    if sid not in UDS_SERVICES:
        return None
    is_positive = not (data[0] & 0x40)
    name = UDS_SERVICES[sid]
    if is_positive:
        return f"UDS Positive Response: {name} (SID+0x40=0x{data[0]:02X})"
    else:
        # Negative response: byte1 = NRC (Negative Response Code)
        nrc_map = {
            0x12: "subFunctionNotSupported",
            0x13: "incorrectMessageLengthOrInvalidFormat",
            0x14: "responseTooLong",
            0x21: "busyRepeatRequest",
            0x22: "conditionsNotCorrect",
            0x24: "requestSequenceError",
            0x31: "requestOutOfRange",
            0x33: "securityAccessDenied",
            0x35: "invalidKey",
            0x36: "exceededNumberOfAttempts",
            0x37: "requiredTimeDelayNotExpired",
            0x72: "generalProgrammingFailure",
            0x78: "requestCorrectlyReceivedResponsePending",
            0x7E: "subFunctionNotSupportedInActiveSession",
            0x7F: "serviceNotSupportedInActiveSession",
        }
        nrc = data[2] if len(data) > 2 else 0
        return f"UDS Negative Response: {name} NRC=0x{nrc:02X}({nrc_map.get(nrc, 'unknown')})"


# -------------------------- SocketCAN 接口 --------------------------

class SocketCan:
    def __init__(self, iface: str):
        self.iface = iface
        self.sock = None

    def open(self):
        self.sock = socket.socket(socket.AF_CAN, socket.SOCK_RAW,
                                  socket.CAN_RAW)
        try:
            self.sock.bind((self.iface,))
            log.info("已绑定 CAN 接口: %s", self.iface)
        except OSError as e:
            log.error("绑定 %s 失败: %s", self.iface, e)
            log.error("如果是 Linux,先执行:")
            log.error("  sudo modprobe vcan && sudo ip link add dev %s type vcan && sudo ip link set up %s",
                      self.iface, self.iface)
            raise

    def recv(self, timeout: float = 1.0) -> bytes | None:
        self.sock.settimeout(timeout)
        try:
            return self.sock.recv(CAN_FRAME_SIZE)
        except socket.timeout:
            return None

    def send(self, can_id: int, data: bytes):
        if len(data) != 8:
            data = data.ljust(8, b"\x00")[:8]
        arb_id = can_id | 0x80000000  # EFF
        frame = struct.pack(CAN_FRAME_FMT, arb_id, len(data), 0, data)
        self.sock.send(frame)

    def close(self):
        if self.sock:
            self.sock.close()


def decode_frame(frame: bytes) -> tuple | None:
    if len(frame) < CAN_FRAME_SIZE:
        return None
    can_id, dlc, _, data = struct.unpack(CAN_FRAME_FMT, frame[:CAN_FRAME_SIZE])
    is_ext, is_err, arb_id = decode_can_id(can_id)
    return is_ext, is_err, arb_id, dlc, data[:dlc]


# -------------------------- 模拟发送(用于无真实 CAN 场景) --------------------------

def simulate_gbt_27930_traffic(sock: SocketCan):
    """注入 GBT 27930 报文(用于演示和测试)"""
    log.info("注入模拟 GBT 27930 报文...")
    msgs = [
        (0x18F00001, b"\x01\x00\x00\x00\x01\x00\x00\x00", "CHM 握手"),
        (0x18F00002, b"\x09\x60\x03\x20\x00\x00\x00\x00", "BHM 最大允充 240V*80A"),
        (0x18F00003, b"\x01\x00\x00\x00\x00\x00\x00\x00", "CRM 辨识"),
        (0x18F00004, b"\x01\x06\x00\x00\x75\x00\x00\x00", "BRM BMS 版本 + 75kWh"),
        (0x18F00101, b"\x09\x60\x03\x20\x00\x00\x00\x00", "BCL 请求 240V*80A"),
        (0x18F00102, b"\x09\x60\x03\x20\x32\x3c\x00\x00", "BCS 实际 + SOC=50%"),
        (0x18F00103, b"\x86\x32\x3c\x00\x00\x00\x00\x00", "BSM 单体电压"),
        (0x18F00110, b"\x02\x01\x00\x00\x00\x00\x00\x00", "CCS 充电状态"),
        (0x18F00115, b"\x01\x00\x00\x00\x00\x00\x00\x00", "CST 桩端充电中"),
    ]
    for can_id, data, label in msgs:
        sock.send(can_id, data)
        log.info("  TX: %s", label)
        time.sleep(0.05)


# -------------------------- 主监控循环 --------------------------

def main():
    ap = argparse.ArgumentParser(description="CAN 总线监控 (GBT 27930 / UDS)")
    ap.add_argument("--iface", default="vcan0",
                    help="CAN 接口名 (Linux: vcan0/can0, 默认 vcan0)")
    ap.add_argument("--duration", type=int, default=0,
                    help="监控时长(秒), 0=无限")
    ap.add_argument("--filter", default="",
                    help="CAN ID 过滤器,格式 'can_id:mask',例如 '0x18F00000:0x1FFFFF00'")
    ap.add_argument("--simulate", action="store_true",
                    help="无真实 CAN 时启用,先注入模拟报文再接收")
    ap.add_argument("--show-data", action="store_true",
                    help="打印原始 data 字节")
    args = ap.parse_args()

    if platform.system() != "Linux":
        log.warning("⚠ 当前平台 %s 不支持 SocketCAN", platform.system())
        log.warning("请在 Linux 上运行,或在 Windows 用 PEAK / Vector VN16xx 适配器")
        log.warning("演示模式:打印 GBT 27930 协议解析样例后退出")
        print_demo_decoding()
        return

    sock = SocketCan(args.iface)
    sock.open()

    if args.filter:
        can_id, mask = [int(x, 0) for x in args.filter.split(":")]
        sock.sock.setsockopt(socket.SOL_CAN_RAW, socket.CAN_RAW_FILTER,
                             struct.pack("=II", can_id, mask))
        log.info("已应用过滤器: ID=0x%08X MASK=0x%08X", can_id, mask)

    if args.simulate:
        simulate_gbt_27930_traffic(sock)

    counter = defaultdict(int)
    running = True

    def stop(*_):
        nonlocal running
        running = False
        log.info("收到退出信号")

    signal.signal(signal.SIGINT, stop)
    if hasattr(signal, "SIGTERM"):
        signal.signal(signal.SIGTERM, stop)

    log.info("开始监控 CAN 接口 %s ... (Ctrl-C 停止)", args.iface)
    start = time.time()
    try:
        while running:
            if args.duration and (time.time() - start) > args.duration:
                break
            frame = sock.recv(timeout=0.5)
            if frame is None:
                continue
            decoded = decode_frame(frame)
            if not decoded:
                continue
            is_ext, is_err, arb_id, dlc, data = decoded
            counter[arb_id] += 1
            ts = time.strftime("%H:%M:%S")
            tag = "EFF" if is_ext else "SFF"
            if is_err:
                tag = "ERR"
            print(f"{ts} {tag} 0x{arb_id:08X} [{dlc}] {data.hex().upper()}", end="")

            # 尝试 GBT 27930 解析
            gbt = parse_gbt_27930(arb_id, data)
            if gbt:
                short, desc, direction, decoded_str = gbt
                print(f"  | {short} ({desc}, {direction})  {decoded_str}")
            elif arb_id & 0x700 == 0x700 and data:
                # UDS 诊断帧 CAN ID 通常 0x7DF/0x7E0-0x7E7
                uds = parse_uds(arb_id, data)
                if uds:
                    print(f"  | {uds}")
                else:
                    print()
            else:
                print()

            if not args.show_data:
                pass

    except KeyboardInterrupt:
        pass
    finally:
        sock.close()
        elapsed = time.time() - start
        log.info("=" * 60)
        log.info("监控结束,共接收 %d 条报文, 持续 %.1f 秒",
                 sum(counter.values()), elapsed)
        log.info("按 CAN ID 统计 (Top 10):")
        for arb_id, cnt in sorted(counter.items(),
                                  key=lambda x: -x[1])[:10]:
            label = GBT_27930_PIDS.get(arb_id, (None,))[0] or f"0x{arb_id:X}"
            log.info("  %-8s 0x%08X  %d 条", label, arb_id, cnt)


def print_demo_decoding():
    """非 Linux 平台演示样例"""
    log.info("GBT 27930 报文解析样例:")
    samples = [
        (0x18F00002, b"\x09\x60\x03\x20\x00\x00\x00\x00", "BHM"),
        (0x18F00101, b"\x09\x60\x03\x20\x00\x00\x00\x00", "BCL"),
        (0x18F00102, b"\x09\x60\x03\x20\x32\x3c\x00\x00", "BCS"),
        (0x18F00103, b"\x86\x32\x3c\x00\x00\x00\x00\x00", "BSM"),
    ]
    for can_id, data, label in samples:
        r = parse_gbt_27930(can_id, data)
        if r:
            short, desc, direction, decoded = r
            print(f"  {label}: {decoded}")


if __name__ == "__main__":
    main()