"""P2 rendered referee and two-person turn-ownership acceptance checks.

Temporary in-memory hook is appended to the test module only; no debug globals
or fake match controls are shipped to production.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import base64,os,re,shutil

root=Path(__file__).resolve().parents[1]
(root/'screenshots').mkdir(exist_ok=True)

def module_data(name,cache=None):
    cache=cache if cache is not None else {}
    if name in cache:return cache[name]
    src=(root/'src'/name).read_text()
    if name=='main.js':
        src+="""
window.__ghostRules={
  stage(shot,groups){
    resetMatch();
    current.players='local';current.turn=0;current.break=false;current.groups=groups;
    current.turnShot={first:shot.first,pots:shot.pots,rail:shot.rail,
      groupAtStart:shot.groupAtStart,railBalls:[],potRecords:[]};
    current.resolve();turnUI();
    return {turn:current.turn,ballInHand:current.ballInHand,
      over:current.over,winner:current.winner,
      groups:[...current.groups],last:current.history.at(-1)};
  }
};
"""
    src=re.sub(r"(from\s+)'\./([^']+)'",
       lambda m:m.group(1)+"'"+module_data(m.group(2),cache)+"'",src)
    url='data:text/javascript;base64,'+base64.b64encode(src.encode()).decode()
    cache[name]=url
    return url

def html_source():
    doc=(root/'index.html').read_text()
    for name in ['style.css','landscape.css','transition.css','feel.css','polish.css','responsive-ui.css','match-ui.css','guide.css']:
        doc=re.sub(fr'<link rel="stylesheet" href="src/{re.escape(name)}(?:\?[^"]*)?">',
               f'<style>{(root/"src"/name).read_text()}</style>',doc)
    doc=doc.replace('<link rel="manifest" href="manifest.webmanifest">','')
    return re.sub(r'<script type="module" src="src/main\.js(?:\?[^"]*)?"></script>',
      f'<script type="module">import "{module_data("main.js")}";</script>',doc)

with sync_playwright() as p:
    chrome=os.environ.get('CHROMIUM_BIN') or shutil.which('chromium') or shutil.which('google-chrome')
    browser=p.chromium.launch(headless=True,executable_path=chrome,args=['--no-sandbox'])
    for width,height in [(844,390),(568,320),(390,844)]:
        context=browser.new_context(viewport={'width':width,'height':height},
           device_scale_factor=1,is_mobile=True,has_touch=True)
        page=context.new_page();errors=[]
        page.on('pageerror',lambda err:errors.append(str(err)))
        page.set_content(html_source(),wait_until='load')
        page.locator('#playBtn').click()
        page.wait_for_timeout(1800)
        assert page.locator('#gameScreen').is_visible(), 'match not open'
        wrong=page.evaluate("""window.__ghostRules.stage(
            {first:9,pots:[],rail:true,groupAtStart:'solids'},
            ['solids','stripes'])""")
        assert wrong['turn']==1 and wrong['ballInHand'],wrong
        assert wrong['last']['reason']=='wrong-ball-first'
        assert page.locator('#turnLabel').inner_text()=='P2 PLACING'
        assert page.locator('#turnLabel').evaluate('(el)=>el.scrollWidth<=el.clientWidth+2'), 'pass-and-play turn truncated'
        assert 'WRONG BALL' in page.locator('#turnBannerKicker').inner_text()
        assert 'wrong ball first' in page.locator('#turnRecap').inner_text().lower()
        assert page.locator('#placementTools').is_visible()
        page.screenshot(path=str(root/'screenshots'/f'p2-foul-{width}x{height}.png'))
        assignment=page.evaluate("""window.__ghostRules.stage(
            {first:1,pots:[1],rail:true,groupAtStart:'open'},
            [null,null])""")
        assert assignment['groups']==['solids','stripes']
        assert assignment['turn']==0 and not assignment['ballInHand']
        assert page.locator('#turnLabel').inner_text()=='P1 TURN'
        assert page.locator('#turnLabel').evaluate('(el)=>el.scrollWidth<=el.clientWidth+2'), 'assignment turn truncated'
        assert 'SOLIDS' in page.locator('#tableToast').inner_text()
        page.screenshot(path=str(root/'screenshots'/f'p2-assignment-{width}x{height}.png'))
        early=page.evaluate("""window.__ghostRules.stage(
            {first:7,pots:[7,8],rail:true,groupAtStart:'solids'},
            ['solids','stripes'])""")
        assert early['over'] and early['winner']==1,early
        assert early['last']['reason']=='early-eight'
        assert page.locator('#matchResult').is_visible()
        assert 'PLAYER TWO WINS' in page.locator('#matchResultTitle').inner_text()
        assert 'EARLY EIGHT' in page.locator('#resultLastShotText').inner_text(), 'last shot not grounded'
        assert page.evaluate('document.activeElement.id')=='playAgain', 'rematch button did not receive focus'
        overlay=page.locator('#matchResult')
        assert overlay.evaluate('(el)=>el.scrollHeight<=el.clientHeight+2'), 'result overlay internal scrolling'
        page.screenshot(path=str(root/'screenshots'/f'p2-end-{width}x{height}.png'))
        page.locator('#playAgain').click()
        assert page.locator('#matchResult').is_hidden(),'rematch left the result visible'
        assert page.locator('#gameScreen').get_attribute('data-shots')=='0'
        assert not errors,f'{width}x{height}: {errors}'
        print(f'{width}x{height}: referee foul, turn, rack end, rematch responsive OK')
        context.close()
    browser.close()
