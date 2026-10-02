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
    for name in ['style.css','landscape.css','transition.css','feel.css','polish.css','responsive-ui.css']:
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
        assert page.locator('#tableToast').is_visible(),'foul event toast missing'
        assert page.locator('#guideBadge').is_hidden(),'temporary foul cue must not overlap the placement hint'
        target=page.evaluate('window.__ghostTest.worldToScreen(718,250)')
        page.mouse.move(target['x'],target['y'])
        page.mouse.down()
        state=page.evaluate('window.__ghostTest.snapshot()')
        assert state['placement'] and not state['placement']['legal'], 'occupied point was treated as legal'
        suggestion=state['placement']['suggestion']
        assert suggestion and suggestion['distance']<=48, 'nearby legal landing preview absent'
        page.screenshot(path=str(root/'screenshots'/f'foul-placement-{width}x{height}.png'))
        page.wait_for_timeout(1800)
        assert page.locator('#tableToast').is_hidden(),'temporary foul cue did not dismiss'
        assert page.locator('#guideBadge').is_visible(),'placement hint did not return'
        page.screenshot(path=str(root/'screenshots'/f'placement-hint-{width}x{height}.png'))
        page.mouse.up()
        after=page.evaluate('window.__ghostTest.snapshot()')
        assert not after['ballInHand'] and after['legal'], 'suggested location did not place cue legally'
        assert abs(after['cue']['x']-suggestion['x'])<.01
        assert abs(after['cue']['y']-suggestion['y'])<.01
        assert not errors,errors
        print(f'{width}x{height}: foul announcement and legal touch/click placement OK')
        context.close()
    browser.close()
