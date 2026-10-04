"""Keyboard accessibility: modal sheets trap Tab and Escape closes them."""
import os,shutil,subprocess,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
port=8141
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_BIN') or shutil.which('google-chrome'),args=['--no-sandbox'])
        page=browser.new_context(viewport={'width':1280,'height':720}).new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{port}/');page.wait_for_timeout(1000)
        def escaped(sheet):
            count=0
            for _ in range(36):
                page.keyboard.press('Tab')
                if not page.evaluate("s=>document.getElementById(s).contains(document.activeElement)",sheet):count+=1
            return count
        for button,sheet in [('menuSettings','settingsSheet'),('menuGuide','guideSheet'),('menuLocker','lockerSheet')]:
            if page.locator('#clubMenu').is_hidden():
                page.click('#menuBtn');page.wait_for_timeout(400)
            page.click('#'+button);page.wait_for_timeout(500)
            assert escaped(sheet)==0,f'Tab left {sheet}'
            page.keyboard.press('Escape');page.wait_for_timeout(400)
            assert page.locator('#'+sheet).is_hidden(),f'Escape did not close {sheet}'
        page.keyboard.press('Escape')
        page.click('#openSetup');page.wait_for_timeout(500)
        assert escaped('setupSheet')==0,'Tab left the match setup sheet'
        page.keyboard.press('Escape');page.wait_for_timeout(300)
        page.click('#playBtn');page.wait_for_timeout(3800)
        page.click('#pauseButton');page.wait_for_timeout(500)
        assert escaped('pauseMenu')==0,'Tab left the pause menu'
        assert not errors,errors
        print('a11y: Tab is trapped and Escape closes every sheet OK')
        browser.close()
finally:
    server.terminate()
