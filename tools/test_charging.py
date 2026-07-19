from playwright.sync_api import sync_playwright
import time

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    
    # Collect console messages
    errors = []
    def handle_console(msg):
        if msg.type == 'error':
            errors.append(f"[ERROR] {msg.text[:200]}")
        elif '[DEBUG]' in msg.text:
            errors.append(f"[DEBUG] {msg.text[:200]}")
    
    page.on('console', handle_console)
    
    page.goto('http://localhost:8889', timeout=30000)
    time.sleep(2)
    
    print("=== Initial page loaded ===")
    print(f"Title: {page.title()}")
    
    # Check if "充电智能体" tab exists
    charging_tab = page.locator('text=充电智能体').first
    print(f"充电智能体 tab exists: {charging_tab.is_visible()}")
    
    # Click 充电智能体
    charging_tab.click()
    time.sleep(2)
    
    print("\n=== After clicking 充电智能体 ===")
    
    # Check page-ch-design visibility
    ch_design = page.locator('#page-ch-design')
    if ch_design.count() > 0:
        is_visible = ch_design.is_visible()
        box = ch_design.bounding_box()
        display = ch_design.evaluate('el => el.style.display')
        print(f"page-ch-design: visible={is_visible}, display={display}, box={box}")
    else:
        print("page-ch-design: NOT FOUND")
    
    # Check main-container
    mc = page.locator('.main-container')
    if mc.count() > 0:
        mc_display = mc.evaluate('el => el.style.display')
        mc_box = mc.bounding_box()
        print(f"main-container: display={mc_display}, box={mc_box}")
    
    # Check main.content
    main_el = page.locator('main.content')
    if main_el.count() > 0:
        main_display = main_el.evaluate('el => el.style.display')
        main_box = main_el.bounding_box()
        print(f"main.content: display={main_display}, box={main_box}")
    
    # Check body scroll height vs viewport
    scroll_h = page.evaluate('document.body.scrollHeight')
    client_h = page.evaluate('document.documentElement.clientHeight')
    print(f"body scrollHeight={scroll_h}, clientHeight={client_h}")
    
    # Check if page-ch-design is in viewport
    ch_top = ch_design.evaluate('el => el.getBoundingClientRect().top') if ch_design.count() > 0 else 'N/A'
    print(f"page-ch-design top position: {ch_top}")
    
    # Print debug console messages
    print(f"\n=== Console messages ({len(errors)}) ===")
    for e in errors[:20]:
        print(e)
    
    # Take screenshot
    page.screenshot(path='E:/project/储能/ess-platform/tools/debug_charging.png')
    print("\nScreenshot saved to tools/debug_charging.png")
    
    browser.close()