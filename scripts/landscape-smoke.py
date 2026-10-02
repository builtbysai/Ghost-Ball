"""Optional local Playwright smoke check: python scripts/landscape-smoke.py"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import mimetypes, re, base64, os, shutil
root=Path(__file__).resolve().parents[1]
def module_data(name, cache=None):
    cache=cache if cache is not None else {}
    if name in cache: return cache[name]
    src=(root/'src'/name).read_text()
    def sub(m):
        other=m.group(2)
        url=module_data(other,cache)
        return f"{m.group(1)}'{url}'"
    src=re.sub(r"(from\s+)'\./([^']+)'",sub,src)
    url='data:text/javascript;base64,'+base64.b64encode(src.encode()).decode()
    cache[name]=url
    return url
def html_source():
    doc=(root/'index.html').read_text()
    for style in ['style.css','landscape.css','transition.css','feel.css']:
        doc=doc.replace(f'<link rel="stylesheet" href="src/{style}">',f'<style>{(root/"src"/style).read_text()}</style>')
    doc=doc.replace('<link rel="manifest" href="manifest.webmanifest">','')
    doc=doc.replace('<script type="module" src="src/main.js"></script>',f'<script type="module">import "{module_data("main.js")}";</script>')
    return doc
with sync_playwright() as p:
    browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_BIN') or shutil.which('chromium') or shutil.which('google-chrome'),args=['--no-sandbox'])
    for w,h in [(844,390),(1280,720),(568,320),(390,844)]:
        context=browser.new_context(viewport={'width':w,'height':h},device_scale_factor=1,is_mobile=w<900,has_touch=True)
        page=context.new_page();err=[]
        page.on('pageerror',lambda e:err.append(str(e)))
        page.set_content(html_source(),wait_until='load')
        page.locator('#playBtn').click(force=True)
        page.wait_for_timeout(540)
        entering=page.evaluate("""() => ({
         flight:document.querySelectorAll('.table-flight').length,
         glow:document.querySelectorAll('.flight-stage').length,
         transform:document.querySelector('.table-flight')?.style.transform||''
        })""")
        assert entering['flight']==1 and entering['glow']==1 and 'scale(' in entering['transform'],f'entrance did not render {entering}'
        if (w,h)==(844,390):
            screenshot=root/'screenshots'/'flight-mid-844x390.png';screenshot.parent.mkdir(exist_ok=True);page.screenshot(path=str(screenshot))
        page.wait_for_timeout(1250)
        assert page.locator('.table-flight').count()==0 and page.locator('.flight-stage').count()==0,'flight did not clean up'
        ready=page.evaluate("""() => ({entering:gameScreen.classList.contains('entering'),disabled:shootBtn.disabled,canvasDrawn:gameCanvas.width>1,turn:turnLabel.textContent})""")
        assert not ready['entering'] and not ready['disabled'] and ready['canvasDrawn'] and not err,{'ready':ready,'errors':err}
        before=page.evaluate('({canvas:document.querySelector("#gameCanvas").getBoundingClientRect().toJSON(), track:document.querySelector("#powerTrack").getBoundingClientRect().toJSON(), aim:document.querySelector("#aimWheel").getBoundingClientRect().toJSON(), hud:document.querySelector(".match-hud").getBoundingClientRect().toJSON(), over: document.documentElement.scrollWidth > innerWidth || document.documentElement.scrollHeight > innerHeight, gate:document.querySelector("#rotateGate")!==null, view:document.querySelector("#gameView")!==null})')
        assert not before['over'],f'overflow {w}x{h}'
        assert not before['gate'] and not before['view']
        if w>h:
            assert before['canvas']['y']+before['canvas']['height'] < h+1,f'clipped table {w}x{h}'
            screenshot=root/'screenshots'/f'preview-{w}x{h}.png';screenshot.parent.mkdir(exist_ok=True);page.screenshot(path=str(screenshot))
            # Touch/mouse input parity: wheel, spin modal, safety tap, committed shot.
            wheel=before['aim'];x=wheel['x']+wheel['width']/2;y=wheel['y']+wheel['height']/2
            old=int(page.locator('#aimWheel').get_attribute('aria-valuenow'))
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y-40,steps=5);page.mouse.up()
            assert int(page.locator('#aimWheel').get_attribute('aria-valuenow'))!=old,'aim wheel inert'
            page.locator('#spinButton').click()
            ball=page.locator('#spinBall').bounding_box()
            page.mouse.move(ball['x']+ball['width']*.72,ball['y']+ball['height']*.26)
            page.mouse.down();page.mouse.up()
            assert page.locator('#spinLabel').inner_text()!='CENTER','spin selection inert'
            page.locator('#spinDone').click()
            assert page.locator('#spinSheet').is_hidden(),'spin overlay stuck open'
            bar=before['track'];x=bar['x']+bar['width']/2;y=bar['y']+20
            page.mouse.move(x,y);page.mouse.down();page.mouse.up();page.wait_for_timeout(100)
            assert page.locator('#gameScreen').get_attribute('data-shots')=='0','short tap fired a shot'
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y+bar['height']*.82,steps=9)
            charged=page.evaluate("""() => ({
             tension:Number(powerTrack.style.getPropertyValue('--tension')),
             visible:powerValue.textContent,armed:powerTrack.classList.contains('armed'),
             shots:gameScreen.dataset.shots
            })""")
            assert charged['tension']>=.68 and charged['armed'] and charged['visible'].endswith('%') and charged['shots']=='0',charged
            if (w,h)==(844,390):
                page.screenshot(path=str(root/'screenshots'/'loaded-cue-844x390.png'))
            page.mouse.up();page.wait_for_timeout(120)
            assert page.locator('#gameScreen').get_attribute('data-shots')=='1','pull did not fire shot'
            if (w,h)==(844,390):
                page.locator('#rerack').click()
                assert page.locator('#gameScreen').get_attribute('data-shots')=='0'
                # Actual synthesized touch pointer path, not mouse-only.
                cdp=context.new_cdp_session(page)
                touch=lambda ty,yy: cdp.send('Input.dispatchTouchEvent',{'type':ty,'touchPoints':[] if ty=='touchEnd' else [{'x':x,'y':yy}]})
                touch('touchStart',y)
                for step in range(1,9): touch('touchMove',y+bar['height']*.62*step/8)
                touch('touchEnd',y+bar['height']*.62)
                page.wait_for_timeout(100)
                assert page.locator('#gameScreen').get_attribute('data-shots')=='1','touch pull did not fire'
        else:
            assert not before['gate'] and not before['view'],'obsolete view/orientation controls remain'
        screenshot=root/'screenshots'/f'landscape-{w}x{h}.png';screenshot.parent.mkdir(exist_ok=True);page.screenshot(path=str(screenshot))
        assert not err,f'browser errors: {err}'
        print((w,h), 'summary', {'canvas':[round(before['canvas'][k]) for k in ['x','y','width','height']], 'track':[round(before['track'][k]) for k in ['width','height']], 'aim':[round(before['aim'][k]) for k in ['width','height']], 'scroll':before['over'], 'rotate':before['gate'],'view':before['view'],'shots':page.evaluate('document.querySelector("#turnLabel").textContent')}, 'errors',err)
        context.close()
    browser.close()
