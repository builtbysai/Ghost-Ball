"""Probe the actual deployed page with real clicks, without forcing input."""
from playwright.sync_api import sync_playwright
from pathlib import Path
root=Path(__file__).resolve().parents[1]
(root/'screenshots').mkdir(exist_ok=True)
url='https://builtbysai.com/Ghost-Ball/?probe=20261002'
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/google-chrome',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':844,'height':390},has_touch=True)
 errors=[];failed=[]
 page.on('pageerror',lambda e:errors.append(str(e)))
 page.on('requestfailed',lambda r:failed.append(r.url+': '+str(r.failure)))
 try:
  resp=page.goto(url,wait_until='domcontentloaded',timeout=18000)
  page.wait_for_timeout(1600)
  print('LIVE status',resp.status,'final URL',page.url,'title',page.title())
  print('LIVE request failures',failed[:8],'JS errors',errors[:8])
  print('LIVE assets',page.evaluate("""() => [...document.querySelectorAll('script[src],link[rel=stylesheet]')].map(el=>el.src||el.href)"""))
  page.screenshot(path=str(root/'screenshots'/'live-production-menu.png'))
  for name in ['menuBtn','closeMenu','openSetup','closeSetup','playBtn']:
   try:
    page.locator('#'+name).click(timeout=2400)
    print('LIVE click OK',name)
   except Exception as e:
    print('LIVE click FAIL',name,str(e).splitlines()[0]);break
  else:
   page.wait_for_timeout(1700)
   print('LIVE match visible',page.locator('#gameScreen').is_visible())
   page.screenshot(path=str(root/'screenshots'/'live-production-game.png'))
  print('LIVE final errors',errors[:8])
 except Exception as e:print('LIVE unreachable:',repr(e)[:350])
 finally:b.close()
