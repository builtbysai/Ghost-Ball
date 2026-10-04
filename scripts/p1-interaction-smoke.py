"""Live browser checks for the new foul-to-placement experience.

The test exports a small hook only in its temporary in-memory module. Nothing
is added to the production bundle or global scope of the shipped game.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
import base64, os, re, shutil

root=Path(__file__).resolve().parents[1]
(root/'screenshots').mkdir(exist_ok=True)
def module_data(name,cache=None):
    cache=cache if cache is not None else {}
    if name in cache:return cache[name]
    src=(root/'src'/name).read_text()
    if name=='main.js':
        src+="""
window.__ghostTest={
 simulateFoul(){
  resetMatch();
  current.players='local';
  current.turn=1;
  const worked=current.expireShotClock();
  turnUI();
  return {worked,turn:current.turn,ballInHand:current.ballInHand};
 },
 worldToScreen(x,y){
  const [lx,ly]=table.project(x,y),rect=$('gameCanvas').getBoundingClientRect();
  return mobileLandscape()?{x:rect.right-ly,y:rect.top+lx}:{x:rect.left+lx,y:rect.top+ly};
 },
 snapshot(){
  const cue=current.sim.cue();
  return {turn:current.turn,ballInHand:current.ballInHand,
          placement, cue:{x:cue.x,y:cue.y},legal:current.sim.canPlaceCue(cue.x,cue.y)};
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
    for name in ['style.css','landscape.css','transition.css','feel.css','polish.css','responsive-ui.css','match-ui.css']:
        doc=re.sub(fr'<link rel="stylesheet" href="src/{re.escape(name)}(?:\?[^"]*)?">',
                   f'<style>{(root/"src"/name).read_text()}</style>',doc)
    doc=doc.replace('<link rel="manifest" href="manifest.webmanifest">','')
    return re.sub(r'<script type="module" src="src/main\.js(?:\?[^"]*)?"></script>',
                  f'<script type="module">import "{module_data("main.js")}";</script>',doc)

with sync_playwright() as p:
    chrome=os.environ.get('CHROMIUM_BIN') or shutil.which('chromium') or shutil.which('google-chrome')
    browser=p.chromium.launch(headless=True,executable_path=chrome,args=['--no-sandbox'])
    for width,height in [(844,390),(390,844)]:
        context=browser.new_context(viewport={'width':width,'height':height},
          device_scale_factor=1,is_mobile=True,has_touch=True)
        page=context.new_page()
        errors=[]
        page.on('pageerror',lambda error:errors.append(str(error)))
        page.set_content(html_source(),wait_until='load')
        page.locator('#playBtn').click()
        page.wait_for_timeout(1850)
        assert page.locator('#gameScreen').is_visible(), 'match failed to load'
        foul=page.evaluate('window.__ghostTest.simulateFoul()')
        assert foul=={'worked':True,'turn':0,'ballInHand':True},foul
        assert page.locator('#turnBanner').is_visible(),'foul turn banner missing'
        assert 'BALL IN HAND' in page.locator('#turnBannerKicker').inner_text(),'banner must say who has ball in hand'
        assert 'ball in hand' in page.locator('#turnRecap').inner_text().lower(),'persistent recap missing'
        assert page.locator('#guideBadge').is_hidden(),'temporary foul cue must not overlap the placement hint'
        assert page.locator('#placementTools').is_visible(),'ball-in-hand tools absent'
        assert page.locator('#spinButton').is_hidden(),'spin controls must give way to placement'
        assert page.locator('#placementTools').evaluate('(el)=>el.scrollHeight<=el.clientHeight+1'),'placement tools clipped'
        target=page.evaluate('window.__ghostTest.worldToScreen(718,250)')
        page.mouse.move(target['x'],target['y'])
        page.mouse.down()
        state=page.evaluate('window.__ghostTest.snapshot()')
        assert state['placement'] and not state['placement']['legal'], 'occupied point was treated as legal'
        suggestion=state['placement']['suggestion']
        assert suggestion and suggestion['distance']<=48, 'nearby legal landing preview absent'
        page.screenshot(path=str(root/'screenshots'/f'foul-placement-{width}x{height}.png'))
        page.wait_for_timeout(3100)
        assert page.locator('#turnBanner').is_hidden(),'temporary foul banner did not dismiss'
        assert page.locator('#turnRecap').is_visible(),'the recap must outlive the banner'
        assert page.locator('#guideBadge').is_visible(),'placement hint did not return'
        page.screenshot(path=str(root/'screenshots'/f'placement-hint-{width}x{height}.png'))
        page.mouse.up()
        staged=page.evaluate('window.__ghostTest.snapshot()')
        assert staged['ballInHand'] and staged['placement']['candidate'], 'tap should stage placement'
        assert page.locator('#placeCueConfirm').is_enabled(),'valid draft cannot be confirmed'
        page.locator('#placeCueConfirm').click()
        after=page.evaluate('window.__ghostTest.snapshot()')
        assert not after['ballInHand'] and after['legal'], 'confirmed suggestion did not place cue legally'
        assert abs(after['cue']['x']-suggestion['x'])<.01
        assert abs(after['cue']['y']-suggestion['y'])<.01
        # Captured drags ending outside the entire canvas are cancellations.
        again=page.evaluate('window.__ghostTest.simulateFoul()')
        assert again['ballInHand'] and again['turn']==0
        clear=page.evaluate('window.__ghostTest.worldToScreen(500,300)')
        page.mouse.move(clear['x'],clear['y'])
        page.mouse.down()
        rect=page.locator('#gameCanvas').bounding_box()
        page.mouse.move(rect['x']+rect['width']+32,rect['y']+rect['height']/2,steps=4)
        page.mouse.up()
        cancelled=page.evaluate('window.__ghostTest.snapshot()')
        assert cancelled['ballInHand'],'off-canvas placement was unexpectedly accepted'
        retry=page.evaluate('window.__ghostTest.worldToScreen(440,300)')
        page.mouse.move(retry['x'],retry['y'])
        page.mouse.down()
        page.mouse.move(retry['x']+32,retry['y']+4,steps=6)
        page.mouse.up()
        assert not page.evaluate('window.__ghostTest.snapshot()')['ballInHand'], 'drag release remained stuck after cancellation'
        again=page.evaluate('window.__ghostTest.simulateFoul()')
        assert again['ballInHand']
        page.locator('#gameCanvas').focus()
        before=page.evaluate('window.__ghostTest.snapshot()')['placement']['candidate']
        page.keyboard.press('ArrowRight')
        afterNudge=page.evaluate('window.__ghostTest.snapshot()')['placement']['candidate']
        assert afterNudge['x']>before['x'], 'keyboard placement nudge did not move'
        page.keyboard.press('Enter')
        assert not page.evaluate('window.__ghostTest.snapshot()')['ballInHand'],'keyboard Enter did not confirm placement'
        assert not errors,errors
        print(f'{width}x{height}: foul announcement and legal touch/click placement OK')
        context.close()
    browser.close()
