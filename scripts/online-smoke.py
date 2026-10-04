"""Two tabs play an online private match over the same-browser transport (?transport=tabs)."""
import os,shutil,subprocess,sys,time
from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parent.parent
port=8141
server=subprocess.Popen([sys.executable,'-m','http.server',str(port),'--bind','127.0.0.1'],cwd=root,stdout=subprocess.DEVNULL,stderr=subprocess.DEVNULL)
time.sleep(1)
HOOK="""
window.__t={game:()=>current,shoot(a,p){angle=a;power=p;fire();},
 view(){return current?{turn:current.turn,shots:current.shots,seat:current.localSeat,moving:current.sim.moving,balls:current.sim.balls.map(b=>[b.id,Math.round(b.x*100),Math.round(b.y*100),b.pocketed]).join('|'),label:document.getElementById('turnLabel').textContent,over:current.over}:null;}};
"""
def hook(route):
    response=route.fetch();route.fulfill(response=response,body=response.text()+HOOK,headers={**response.headers,'content-type':'text/javascript'})
try:
    with sync_playwright() as p:
        browser=p.chromium.launch(headless=True,executable_path=os.environ.get('CHROMIUM_BIN') or shutil.which('chromium') or shutil.which('google-chrome'),args=['--no-sandbox'])
        context=browser.new_context(viewport={'width':1100,'height':700})
        context.add_init_script("try{localStorage.setItem('ghostball-controls-taught','yes')}catch(e){}")
        context.route('**/src/main.js*',hook)
        errors=[]
        host=context.new_page();guest=context.new_page()
        for page in (host,guest):page.on('pageerror',lambda e:errors.append(str(e)))
        host.goto(f'http://127.0.0.1:{port}/?transport=tabs');host.wait_for_timeout(800)
        host.click('#menuBtn');host.click('#menuOnline');host.click('#onlineHost')
        host.wait_for_function("document.getElementById('onlineCodeShown').textContent.length===6 && !document.getElementById('onlineCodeShown').textContent.includes('-')")
        code=host.inner_text('#onlineCodeShown')
        guest.goto(f'http://127.0.0.1:{port}/?transport=tabs&join={code}');guest.wait_for_timeout(800)
        assert guest.locator('#onlineSheet').is_visible(),'join link did not open the online sheet'
        assert guest.input_value('#onlineCode')==code
        guest.click('#onlineJoin')
        for page in (host,guest):page.wait_for_selector('#gameScreen',state='visible',timeout=8000)
        host.wait_for_timeout(2500);guest.wait_for_timeout(500)
        hv,gv=host.evaluate('window.__t.view()'),guest.evaluate('window.__t.view()')
        assert hv['seat']==0 and gv['seat']==1,(hv,gv)
        assert hv['balls']==gv['balls'],'tables differ at the start'
        assert 'BREAK' in hv['label'] and 'OPPONENT' in gv['label'],(hv['label'],gv['label'])
        host.evaluate('window.__t.shoot(0,.9)')
        for _ in range(60):
            host.wait_for_timeout(250)
            hv,gv=host.evaluate('window.__t.view()'),guest.evaluate('window.__t.view()')
            if hv['shots']==1 and gv['shots']==1 and not hv['moving'] and not gv['moving']:break
        assert hv['shots']==gv['shots']==1,(hv,gv)
        assert hv['balls']==gv['balls'],'replicas drifted after the break'
        assert hv['turn']==gv['turn']
        # the player now up answers with a shot of their own (placing first on a scratch)
        up=host if hv['turn']==0 else guest
        if up.evaluate('window.__t.game().ballInHand'):
            up.evaluate("(()=>{const g=window.__t.game();g.placeCue(240,250);})()")
        host.wait_for_timeout(400)
        for n in range(2):
            hv,gv=host.evaluate('window.__t.view()'),guest.evaluate('window.__t.view()')
            up=host if hv['turn']==0 else guest
            if up.evaluate('window.__t.game().ballInHand'):
                up.evaluate("window.__t.game().placeCue(240,250)");up.wait_for_timeout(300)
            before=hv['shots']
            up.evaluate(f'window.__t.shoot({0.4+n*.5},.55)')
            for _ in range(60):
                host.wait_for_timeout(250)
                hv,gv=host.evaluate('window.__t.view()'),guest.evaluate('window.__t.view()')
                if hv['shots']==before+1 and gv['shots']==before+1 and not hv['moving'] and not gv['moving']:break
            assert hv['balls']==gv['balls'] and hv['turn']==gv['turn'],('drift after shot',before+1,hv,gv)
        guest.screenshot(path='/tmp/online-guest.png');host.screenshot(path='/tmp/online-host.png')
        print('online: two tabs joined, break replicated, tables identical, seat', hv['turn'],'is up OK')
        assert not errors,errors
        browser.close()
finally:
    server.terminate()
