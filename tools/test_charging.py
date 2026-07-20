from playwright.sync_api import sync_playwright
import time, sys

with sync_playwright() as p:
    browser = p.chromium.launch(headless=True)
    page = browser.new_page(viewport={"width": 1400, "height": 900})
    
    errors = []
    debug_msgs = []
    def handle_console(msg):
        if msg.type == 'error':
            errors.append(msg.text[:300])
        elif '[DEBUG]' in msg.text or '[TEST]' in msg.text:
            debug_msgs.append(msg.text[:300])
    
    page.on('console', handle_console)
    
    # Test local page
    print("Loading http://localhost:8889 ...")
    page.goto('http://localhost:8889', timeout=60000)
    time.sleep(3)
    
    print(f"Page title: {page.title()}")
    print(f"Console errors: {len(errors)}")
    print(f"Debug messages: {len(debug_msgs)}")
    
    # Click 充电智能体
    print("\nClicking 充电智能体...")
    charging_tab = page.locator('text=充电智能体').first
    if charging_tab.is_visible():
        charging_tab.click()
        time.sleep(3)
    else:
        print("ERROR: 充电智能体 tab not visible!")
        sys.exit(1)
    
    # Check page-ch-design
    ch_design = page.locator('#page-ch-design')
    if ch_design.count() > 0:
        is_visible = ch_design.is_visible()
        display = ch_design.evaluate('el => el.style.display')
        rect = ch_design.evaluate('el => { const r = el.getBoundingClientRect(); return {top: r.top, height: r.height, width: r.width} }')
        text = ch_design.evaluate('el => el.textContent.substring(0, 100)')
        print(f"\npage-ch-design:")
        print(f"  visible={is_visible}")
        print(f"  display={display}")
        print(f"  rect={rect}")
        print(f"  text={text[:80]}")
    else:
        print("ERROR: page-ch-design NOT FOUND!")
    
    # Check main-container
    mc = page.locator('.main-container')
    if mc.count() > 0:
        mc_display = mc.evaluate('el => el.style.display')
        print(f"\nmain-container: display={mc_display}")
    
    # Check main.content
    main_el = page.locator('main.content')
    if main_el.count() > 0:
        main_display = main_el.evaluate('el => el.style.display')
        print(f"main.content: display={main_display}")
    
    # Print debug messages
    print(f"\nDebug messages ({len(debug_msgs)}):")
    for msg in debug_msgs[:10]:
        print(f"  {msg}")
    
    # Print first few errors
    if errors:
        print(f"\nConsole errors ({len(errors)}):")
        for e in errors[:5]:
            print(f"  {e[:200]}")
    
    # Take screenshot
    page.screenshot(path='E:/project/储能/ess-platform/tools/screenshot_charging.png')
    print("\nScreenshot saved")
    
    # Now test VPP
    print("\n\n=== Testing VPP ===")
    vpp_tab = page.locator('text=虚拟电厂智能体').first
    if vpp_tab.is_visible():
        vpp_tab.click()
        time.sleep(3)
    
    vpp = page.locator('#page-vpp-unified')
    if vpp.count() > 0:
        is_visible = vpp.is_visible()
        display = vpp.evaluate('el => el.style.display')
        text = vpp.evaluate('el => el.textContent.substring(0, 100)')
        print(f"page-vpp-unified: visible={is_visible} display={display} text={text[:80]}")
    
    # Test synergy
    print("\n=== Testing 算电协同 ===")
    syn_tab = page.locator('text=算电协同智能体').first
    if syn_tab.is_visible():
        syn_tab.click()
        time.sleep(3)
    
    syn = page.locator('#page-syn-unified')
    if syn.count() > 0:
        is_visible = syn.is_visible()
        display = syn.evaluate('el => el.style.display')
        text = syn.evaluate('el => el.textContent.substring(0, 100)')
        print(f"page-syn-unified: visible={is_visible} display={display} text={text[:80]}")
    
    browser.close()
    print("\nDone!")