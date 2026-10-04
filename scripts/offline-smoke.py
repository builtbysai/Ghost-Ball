"""The installed game opens with no network once it has been loaded online."""
import os,shutil,subprocess,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
port=8139
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_BIN') or shutil.which('google-chrome'),args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1280,'height':720})
        page=context.new_page();errors=[]
        page.on('pageerror',lambda e:errors.append(str(e)))
        page.goto(f'http://127.0.0.1:{port}/');page.wait_for_timeout(1500)
        page.evaluate("navigator.serviceWorker.ready.then(()=>true)")
        page.wait_for_function("navigator.serviceWorker.controller!==null",timeout=8000) if page.evaluate("navigator.serviceWorker.controller===null") else None
        page.reload();page.wait_for_timeout(2500)  # warms the cache with the modules the page really uses
        cached=page.evaluate("caches.keys().then(async keys=>{let n=0;for(const k of keys){n+=(await (await caches.open(k)).keys()).length}return n})")
        assert cached>=20,f'only {cached} responses cached'
        context.set_offline(True)
        page.reload();page.wait_for_timeout(2000)
        assert page.locator('#playBtn').is_visible(),'the lobby did not open offline'
        page.click('#playBtn');page.wait_for_timeout(4200)
        assert page.locator('#gameScreen').is_visible(),'a match did not start offline'
        assert not errors,errors
        print('offline: lobby and match open with no network OK',cached,'cached responses')
        browser.close()
finally:
    server.terminate()
