"""Load the actual versioned HTML, CSS and ESM graph over localhost."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import os,shutil

root=Path(__file__).resolve().parents[1]
server=ThreadingHTTPServer(('127.0.0.1',0),partial(SimpleHTTPRequestHandler,directory=str(root)))
thread=Thread(target=server.serve_forever,daemon=True);thread.start()
try:
 with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_BIN') or shutil.which('google-chrome'),args=['--no-sandbox'])
  context=browser.new_context(viewport={'width':844,'height':390},service_workers='block')
  page=context.new_page();errors=[];failures=[]
  page.on('pageerror',lambda e:errors.append(str(e)))
  page.on('requestfailed',lambda r:failures.append(r.url))
  url=f'http://127.0.0.1:{server.server_port}/'
  response=page.goto(url,wait_until='load')
  page.wait_for_timeout(450)
  assert response.status==200 and not errors and not failures,{'response':response.status,'errors':errors,'failed':failures}
  assert page.evaluate("attractCanvas.width>30 && document.querySelector('script[type=importmap]')!==null"),'versioned assets did not load'
  assert page.locator('#lobby').is_visible()
  page.locator('#menuBtn').click()
  assert page.locator('#clubMenu').is_visible()
  page.locator('#closeMenu').click()
  page.locator('#playBtn').click()
  page.wait_for_timeout(1640)
  assert page.locator('#pauseButton').is_visible() and not errors,errors
  print('HTTP module graph, versioned stylesheets and unforced menu/game clicks passed')
  context.close();browser.close()
finally:
 server.shutdown();server.server_close()
