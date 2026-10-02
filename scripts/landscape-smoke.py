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
    for style in ['style.css','landscape.css','transition.css']:
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
        if (w,h) in ((844,390),(390,844)):
            page.wait_for_timeout(160)
            screenshot=root/'screenshots'/f'menu-{w}x{h}.png'
            screenshot.parent.mkdir(exist_ok=True)
            page.screenshot(path=str(screenshot))
        page.locator('#playBtn').click(force=True)
        if (w,h) in ((844,390),(390,844)):
            page.wait_for_timeout(880)
            screenshot=root/'screenshots'/f'entrance-mid-{w}x{h}.png'
            page.screenshot(path=str(screenshot))
            page.wait_for_timeout(1030)
        else:
            page.wait_for_timeout(1850)
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
            page.evaluate('''() => {
                const c=document.querySelector("#gameCanvas");
                window.__cueBefore=c.getContext("2d").getImageData(0,0,c.width,c.height).data.slice();
            }''')
            page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y+bar['height']*.62,steps=9)
            page.wait_for_timeout(80)
            charged=page.evaluate('''() => {
                const bar=document.querySelector("#powerTrack"),handle=document.querySelector("#pullHandle");
                const c=document.querySelector("#gameCanvas");
                const after=c.getContext("2d").getImageData(0,0,c.width,c.height).data;
                let delta=0;for(let i=0;i<after.length;i+=9)delta+=Math.abs(after[i]-window.__cueBefore[i]);
                return {charge:parseFloat(bar.style.getPropertyValue("--charge")),
                        pulling:bar.classList.contains("is-pulling"),
                        travel:handle.getBoundingClientRect().top-bar.getBoundingClientRect().top,delta};
            }''')
            assert charged['charge']>.48 and charged['pulling'] and charged['travel']>bar['height']*.40,charged
            assert charged['delta']>500,'cue did not visibly retract while pulling'
            if (w,h)==(844,390):
                screenshot=root/'screenshots'/'charged-844x390.png'
                page.screenshot(path=str(screenshot))
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
                page.locator('#rerack').click()
                page.locator('#inGameSettings').click()
                page.locator('#releaseToggle').uncheck()
                page.locator('#closeSettings').click()
                page.mouse.move(x,y);page.mouse.down();page.mouse.move(x,y+bar['height']*.62,steps=8);page.mouse.up()
                assert page.locator('#gameScreen').get_attribute('data-shots')=='0','manual mode auto-fired'
                assert page.locator('#powerTrack').evaluate('(e)=>e.classList.contains("is-ready")'),'manual mode lost tension'
                page.locator('#shootBtn').click()
                assert page.locator('#gameScreen').get_attribute('data-shots')=='1','manual shoot button did not fire'
        else:
            assert not before['gate'] and not before['view'],'obsolete view/orientation controls remain'
        screenshot=root/'screenshots'/f'landscape-{w}x{h}.png';screenshot.parent.mkdir(exist_ok=True);page.screenshot(path=str(screenshot))
        assert not err,f'browser errors: {err}'
        print((w,h), 'summary', {'canvas':[round(before['canvas'][k]) for k in ['x','y','width','height']], 'track':[round(before['track'][k]) for k in ['width','height']], 'aim':[round(before['aim'][k]) for k in ['width','height']], 'scroll':before['over'], 'rotate':before['gate'],'view':before['view'],'shots':page.evaluate('document.querySelector("#turnLabel").textContent')}, 'errors',err)
        context.close()
    browser.close()
