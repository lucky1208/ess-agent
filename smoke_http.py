"""smoke_http.py - 起本地 HTTP server 并用 playwright 验证"""
import http.server
import socketserver
import threading
import time
import os
from pathlib import Path

ROOT = Path(r"E:\project\储能\ess-platform\dist").resolve()
PORT = 18999
os.chdir(ROOT)

class Handler(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *args, **kwargs):
        pass

httpd = socketserver.TCPServer(("127.0.0.1", PORT), Handler)
t = threading.Thread(target=httpd.serve_forever, daemon=True)
t.start()
print(f"Serving {ROOT} at http://127.0.0.1:{PORT}/index.html")
time.sleep(0.5)

from playwright.sync_api import sync_playwright

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="chrome", args=["--no-sandbox"])
    context = browser.new_context(viewport={"width": 1600, "height": 1000})
    page = context.new_page()

    msgs = []
    page.on("console", lambda m: msgs.append(f"[{m.type}] {m.text}"))
    page.on("pageerror", lambda e: msgs.append(f"[PAGE_ERROR] {e}"))

    url = f"http://127.0.0.1:{PORT}/index.html"
    print(f"Loading {url} ...")
    page.goto(url, wait_until="load", timeout=90000)
    page.wait_for_timeout(5000)

    print("Switch to EVCC page via JS...")
    try:
        # 用 JS 直接调用 showChargingPage('ch-evcc')
        page.evaluate("typeof showChargingPage === 'function' && showChargingPage('ch-evcc')")
        page.wait_for_timeout(2000)
    except Exception as e:
        print(f"  warning: {e}")

    out1 = Path(r"E:\project\储能\ess-platform\evcc_chip_tab.png")
    page.screenshot(path=str(out1), full_page=True)
    print(f"  chip tab: {out1}")

    print("Switch to program sub-tab via JS...")
    try:
        page.evaluate("typeof showEvccSubTab === 'function' && showEvccSubTab('program')")
        page.wait_for_timeout(2000)
    except Exception as e:
        print(f"  warning: {e}")
    out2 = Path(r"E:\project\储能\ess-platform\evcc_program_tab.png")
    page.screenshot(path=str(out2), full_page=True)
    print(f"  program tab: {out2}")

    print("Switch to demo sub-tab...")
    try:
        page.evaluate("typeof showEvccSubTab === 'function' && showEvccSubTab('demo')")
        page.wait_for_timeout(2000)
    except Exception as e:
        print(f"  warning: {e}")
    out3 = Path(r"E:\project\储能\ess-platform\evcc_demo_tab.png")
    page.screenshot(path=str(out3), full_page=True)
    print(f"  demo tab: {out3}")

    print("Switch to board sub-tab...")
    try:
        page.evaluate("typeof showEvccSubTab === 'function' && showEvccSubTab('board')")
        page.wait_for_timeout(2000)
    except Exception as e:
        print(f"  warning: {e}")
    out4 = Path(r"E:\project\储能\ess-platform\evcc_board_tab.png")
    page.screenshot(path=str(out4), full_page=True)
    print(f"  board tab: {out4}")

    print("Switch to bom sub-tab...")
    try:
        page.evaluate("typeof showEvccSubTab === 'function' && showEvccSubTab('bom')")
        page.wait_for_timeout(2000)
    except Exception as e:
        print(f"  warning: {e}")
    out5 = Path(r"E:\project\储能\ess-platform\evcc_bom_tab.png")
    page.screenshot(path=str(out5), full_page=True)
    print(f"  bom tab: {out5}")

    has_progs = page.evaluate("typeof window.EVCC_PYTHON_PROGRAMS !== 'undefined' && window.EVCC_PYTHON_PROGRAMS.length")
    print(f"window.EVCC_PYTHON_PROGRAMS length: {has_progs}")

    print("\n=== Console (last 30) ===")
    for m in msgs[-30:]:
        print(" ", m)

    errors = [m for m in msgs if "ERROR" in m or "pageerror" in m.lower()]
    print(f"\n{len(errors)} errors detected")

    browser.close()

httpd.shutdown()
print("Done")