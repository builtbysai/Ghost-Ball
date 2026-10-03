"""Load the actual versioned HTML, CSS and ESM graph over localhost."""
from pathlib import Path
from playwright.sync_api import sync_playwright
from http.server import ThreadingHTTPServer,SimpleHTTPRequestHandler
from functools import partial
from threading import Thread
import os,shutil,json

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
  page.locator('#menuLocker').click()
  assert page.locator('#lockerStatus').inner_text()!='SESSION ONLY', 'local HTTP storage should work'
  page.locator('[data-cue="smoke"]').click()
  assert page.locator('#lockerEquip').is_enabled()
  page.locator('#lockerEquip').click()
  page.locator('#lockerFavorite').click()
  assert page.locator('#lockerFavorite').get_attribute('aria-pressed')=='true'
  page.locator('#closeLocker').click()
  page.locator('#closeMenu').click()
  page.reload(wait_until='load')
  page.wait_for_timeout(100)
  page.locator('#menuBtn').click()
  page.locator('#menuLocker').click()
  assert page.locator('[data-cue="smoke"]').get_attribute('aria-label').endswith('equipped'), 'equipped cue lost after reload'
  assert page.locator('#lockerFavorite').get_attribute('aria-pressed')=='true', 'favorite lost after reload'
  page.locator('#closeLocker').click()
  page.locator('#menuSettings').click()
  page.locator('#openRecord').click()
  assert page.locator('#recordStorage').inner_text()=='THIS DEVICE ONLY'
  with page.expect_download() as download_info:
   page.locator('#exportRecord').click()
  exported=json.loads(Path(download_info.value.path()).read_text())
  assert exported['selectedCue']=='smoke' and 'smoke' in exported['favorites'], 'export omitted persistent equipment'
  # A first tap must never erase progress. No browser confirm() deadlocks.
  page.locator('#resetRecord').click()
  assert page.locator('#recordConfirm').is_visible()
  assert page.evaluate("JSON.parse(localStorage.getItem('ghostball-progress-v1')).selectedCue")=='smoke'
  page.locator('#confirmRecordReset').click()
  assert page.locator('#recordMatches').inner_text()=='0'
  assert page.locator('#recordMessage').inner_text()=='Local match history and equipment progress cleared.'
  assert page.evaluate("localStorage.getItem('ghostball-progress-v1')") in (None,'null'), 'reset left a shadow record'
  page.locator('#closeRecord').click()
  assert page.locator('#settingsSheet').is_visible()
  page.locator('#closeSettings').click()
  assert page.locator('#clubMenu').is_visible()
  page.locator('#menuLocker').click()
  assert page.locator('[data-cue="house"]').get_attribute('aria-label').endswith('equipped'), 'reset failed to revert equipped cue'
  assert page.locator('#lockerFavorite').get_attribute('aria-pressed')=='false', 'reset failed to clear favorites'
  page.locator('#closeLocker').click()
  page.locator('#closeMenu').click()
  page.locator('#playBtn').click()
  page.wait_for_timeout(1640)
  assert page.locator('#pauseButton').is_visible() and not errors,errors
  print('HTTP module graph, persistent cues, local export, guarded reset and unforced game clicks passed')
  context.close();browser.close()
finally:
 server.shutdown();server.server_close()
