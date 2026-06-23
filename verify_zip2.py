"""verify_zip2.py - 用 download 拦截验证 zip"""
import os, time, base64
from pathlib import Path
from playwright.sync_api import sync_playwright

ROOT = Path(r"E:\project\储能\ess-platform\dist")
os.chdir(ROOT)
import http.server, socketserver, threading
PORT = 18999
class H(http.server.SimpleHTTPRequestHandler):
    def log_message(self, *a, **k): pass
httpd = socketserver.TCPServer(("127.0.0.1", PORT), H)
threading.Thread(target=httpd.serve_forever, daemon=True).start()
time.sleep(0.5)

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True, channel="chrome", args=["--no-sandbox"])
    page = browser.new_context(viewport={"width": 1600, "height": 1000},
                               accept_downloads=True).new_page()
    page.goto(f"http://127.0.0.1:{PORT}/index.html", wait_until="load", timeout=90000)
    page.wait_for_timeout(5000)
    msgs = []
    page.on("console", lambda m: msgs.append(f"[{m.type}] {m.text}"))
    page.on("pageerror", lambda e: msgs.append(f"[PAGE_ERROR] {e}"))

    page.evaluate("showChargingPage('ch-evcc')")
    page.wait_for_timeout(2000)
    page.evaluate("showEvccSubTab('program')")
    page.wait_for_timeout(2000)

    # 验证 panel 确实显示了 + 找到按钮
    has_panel = page.evaluate("document.getElementById('chEvccPanel-program') && document.getElementById('chEvccPanel-program').style.display")
    print(f"chEvccPanel-program display: {has_panel}")
    btn_count = page.evaluate("document.querySelectorAll('button').length")
    print(f"Total buttons: {btn_count}")
    btn_texts = page.evaluate("Array.from(document.querySelectorAll('button')).map(b=>b.textContent.trim()).filter(t=>t.includes('下载')||t.includes('打包')||t.includes('查看'))")
    print(f"EVCC-related buttons: {btn_texts}")

    print("Triggering downloadEvccAllZip via button click...")
    # scroll into view first
    page.evaluate("document.querySelector(\"button[onclick='downloadEvccAllZip()']\")?.scrollIntoView({block:'center'})")
    page.wait_for_timeout(500)
    with page.expect_download(timeout=15000) as dl_info:
        page.click("button[onclick='downloadEvccAllZip()']")
    download = dl_info.value
    print("\n=== Console messages (last 30) ===")
    for m in msgs[-30:]:
        print(" ", m)
    out_zip = Path(r"E:\project\储能\ess-platform\evcc-secc-programs.zip")
    download.save_as(str(out_zip))
    print(f"Saved: {out_zip} ({out_zip.stat().st_size} bytes)")

    import zipfile
    with zipfile.ZipFile(out_zip) as zf:
        names = zf.namelist()
        print(f"Zip contains {len(names)} files:")
        for n in names:
            info = zf.getinfo(n)
            print(f"  {n}  ({info.file_size} bytes)")

    # 同时验证单个 .py 下载
    print("\nTesting single .py download via button click...")
    with page.expect_download(timeout=10000) as dl_info:
        page.locator("button:has-text('下载 .py')").first.click()
    d2 = dl_info.value
    out_py = Path(r"E:\project\储能\ess-platform\evcc_secc_server.py")
    d2.save_as(str(out_py))
    print(f"Saved: {out_py} ({out_py.stat().st_size} bytes)")
    print("First 3 lines:")
    print('\n'.join(out_py.read_text(encoding='utf-8').splitlines()[:3]))

    browser.close()
httpd.shutdown()
print("Done")