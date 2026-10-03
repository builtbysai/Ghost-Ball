"""Full viewport/pointer smoke with screenshot artifacts for every supported layout."""
from pathlib import Path
from playwright.sync_api import sync_playwright
import base64, os, re, shutil

root = Path(__file__).resolve().parents[1]
(root / 'screenshots').mkdir(exist_ok=True)

def module_data(name, cache=None):
    cache = cache if cache is not None else {}
    if name in cache:
        return cache[name]
    src = (root / 'src' / name).read_text()
    src = re.sub(r"(from\s+)'\./([^']+)'",
                 lambda m: m.group(1) + "'" + module_data(m.group(2), cache) + "'", src)
    url = 'data:text/javascript;base64,' + base64.b64encode(src.encode()).decode()
    cache[name] = url
    return url

def html_source():
    doc = (root / 'index.html').read_text()
    for name in ['style.css', 'landscape.css', 'transition.css', 'feel.css', 'polish.css', 'responsive-ui.css']:
        doc = re.sub(fr'<link rel="stylesheet" href="src/{re.escape(name)}(?:\?[^"]*)?">',
                     f'<style>{(root / "src" / name).read_text()}</style>', doc)
    doc = doc.replace('<link rel="manifest" href="manifest.webmanifest">', '')
    return re.sub(r'<script type="module" src="src/main\.js(?:\?[^"]*)?"></script>',
                  f'<script type="module">import "{module_data("main.js")}";</script>',doc)

def inside_viewport(rect, width, height, tolerance=2):
    return rect['x'] >= -tolerance and rect['y'] >= -tolerance and (
        rect['x'] + rect['width'] <= width + tolerance and
        rect['y'] + rect['height'] <= height + tolerance)

def separate(a,b,label,tolerance=1):
    if not a or not b: raise AssertionError(f'{label}: missing geometry')
    x=min(a['x']+a['width'],b['x']+b['width'])-max(a['x'],b['x'])
    y=min(a['y']+a['height'],b['y']+b['height'])-max(a['y'],b['y'])
    assert x<=tolerance or y<=tolerance, f'{label} overlap: {a} vs {b}'

def within(inner,outer,label,tolerance=1):
    assert inner and outer, f'{label}: missing bounds'
    assert inner['x']>=outer['x']-tolerance and inner['y']>=outer['y']-tolerance and (
        inner['x']+inner['width']<=outer['x']+outer['width']+tolerance and
        inner['y']+inner['height']<=outer['y']+outer['height']+tolerance), f'{label} clipped'

with sync_playwright() as p:
    chrome = os.environ.get('CHROMIUM_BIN') or shutil.which('chromium') or shutil.which('google-chrome')
    browser = p.chromium.launch(headless=True, executable_path=chrome, args=['--no-sandbox'])
    for width, height in [(844, 390), (1280, 720), (568, 320), (390, 844)]:
        context = browser.new_context(viewport={'width': width, 'height': height},
                                      device_scale_factor=1, is_mobile=width < 900, has_touch=True)
        page = context.new_page()
        errors = []
        page.on('pageerror', lambda err: errors.append(str(err)))
        page.set_content(html_source(), wait_until='load')
        page.wait_for_timeout(180)
        resting=page.evaluate('attractCanvas.toDataURL()')
        page.wait_for_timeout(380)
        assert page.evaluate('attractCanvas.toDataURL()') != resting, 'pregame cue never animated'
        assert page.locator('#lobby').is_visible(), 'lobby missing'
        assert inside_viewport(page.locator('#playBtn').bounding_box(), width, height), 'play button clipped'
        assert page.locator('#roomPlaque').inner_text() == '1911'
        assert page.locator('#roomArt').inner_text() == 'THE OBSERVATORY'
        page.locator('#nextRoom').click()
        assert page.locator('#roomPlaque').inner_text() == '1927', 'room history did not update'
        assert page.locator('#roomArt').inner_text() == 'THE FOUNDRY', 'framed art did not update'
        page.locator('#nextRoom').click()
        assert page.locator('#roomArt').inner_text() == 'THE WINTERGARDEN'
        assert page.locator('#roomPlaque').inner_text() == '1938'
        if width in (1280,568):
            page.screenshot(path=str((root / 'screenshots' / f'wintergarden-{width}x{height}.png').resolve()))
        page.locator('#nextRoom').click()
        assert page.locator('#roomArt').inner_text() == 'THE AFTERHOURS'
        assert page.locator('#roomPlaque').inner_text() == '1964'
        if width in (1280,568):
            page.screenshot(path=str((root / 'screenshots' / f'afterhours-{width}x{height}.png').resolve()))
        for _ in range(3): page.locator('#prevRoom').click()
        assert page.locator('#roomArt').inner_text() == 'THE OBSERVATORY'
        page.screenshot(path=str((root / 'screenshots' / f'menu-{width}x{height}.png').resolve()))
        # Verify actual pointer hit targets, not force-click bypasses.
        if width<900:
            hit=page.locator('#menuBtn').bounding_box()
            page.touchscreen.tap(hit['x']+hit['width']/2,hit['y']+hit['height']/2)
            assert page.locator('#clubMenu').is_visible(), 'actual touch could not open menu'
            page.locator('#closeMenu').click()
        page.locator('#menuBtn').click()
        assert page.locator('#clubMenu').is_visible()
        page.locator('#closeMenu').click()
        page.locator('#openSetup').click()
        assert page.locator('#setupSheet').is_visible()
        page.locator('#closeSetup').click()
        page.locator('#playBtn').click()
        page.wait_for_timeout(520)
        assert page.locator('.table-flight').count() == 1, 'flight not started'
        page.wait_for_timeout(1240)
        assert page.locator('.table-flight').count() == 0, 'flight not cleaned up'
        assert page.locator('#gameScreen').is_visible(), 'match missing'
        assert page.locator('#pauseButton').is_visible(), 'pause control missing'
        assert page.locator('#shootBtn').count() == 0
        assert page.locator('#leaveGame').count() == 0
        assert not errors, errors
        game_canvas = page.locator('#gameCanvas').bounding_box()
        assert inside_viewport(game_canvas, width, height), f'table clipped: {game_canvas}'
        assert page.evaluate('document.documentElement.scrollWidth <= innerWidth && document.documentElement.scrollHeight <= innerHeight')
        # The pause button, rival cards, center label, tokens and numbered slots
        # must have dedicated geometry, including the smallest landscape layouts.
        hud=[page.locator(s).bounding_box() for s in ['#pauseButton','#oneCard','.match-center','#twoCard']]
        for i in range(len(hud)):
            for j in range(i+1,len(hud)): separate(hud[i],hud[j],f'{width}x{height}: HUD {i}/{j}')
        for card,token,slots in [('#oneCard','#oneCard .player-token','#ballsOne'),('#twoCard','#twoCard .player-token','#ballsTwo')]:
            separate(page.locator(token).bounding_box(),page.locator(slots).bounding_box(),f'{width}x{height}: {card} token/balls')
            within(page.locator(slots).bounding_box(),page.locator(card).bounding_box(),f'{width}x{height}: {card} slots')
        assert page.locator('#ballsOne .ball-number').all_text_contents()==['1','2','3','4','5','6','7']
        assert page.locator('#ballsTwo .ball-number').all_text_contents()==['9','10','11','12','13','14','15']
        page.screenshot(path=str((root / 'screenshots' / f'match-{width}x{height}.png').resolve()))
        page.locator('#pauseButton').click()
        assert page.locator('#pauseMenu').is_visible(), 'pause panel missing'
        pause=page.locator('.pause-card').bounding_box()
        within(pause,page.locator('#pauseMenu').bounding_box(),f'{width}x{height}: pause panel')
        assert page.locator('.pause-card').evaluate('(el)=>el.scrollHeight<=el.clientHeight+1'), 'pause has internal overflow'
        for b in page.locator('.pause-actions button').all(): within(b.bounding_box(),pause,f'{width}x{height}: pause action')
        page.screenshot(path=str((root/'screenshots'/f'pause-{width}x{height}.png').resolve()))
        page.locator('#pauseSettings').click()
        assert page.locator('#settingsSheet').is_visible(), 'pause preferences missing'
        prefs=page.locator('.prefs-panel').bounding_box()
        assert inside_viewport(prefs,width,height), f'preferences clipped: {prefs}'
        assert page.locator('.prefs-panel').evaluate('(el)=>el.scrollHeight<=el.clientHeight+1'), 'preferences have internal overflow'
        page.locator('[data-power-side="right"]').click()
        assert page.locator('#gameScreen').evaluate("(el)=>el.classList.contains('power-right')"), 'power-side preference unresponsive'
        page.locator('[data-power-side="left"]').click()
        assert not page.locator('#gameScreen').evaluate("(el)=>el.classList.contains('power-right')"), 'power-side reset failed'
        page.screenshot(path=str((root/'screenshots'/f'preferences-{width}x{height}.png').resolve()))
        page.locator('#closeSettings').click()
        assert page.locator('#pauseMenu').is_visible(), 'pause did not survive preferences'
        page.locator('#resumeMatch').click()
        assert page.locator('#pauseMenu').is_hidden(), 'could not resume'
        track = page.locator('#powerTrack').bounding_box()
        sideways = width < height and width <= 820
        start = (track['x'] + (track['width'] - 20 if sideways else track['width']/2),
                 track['y'] + (track['height']/2 if sideways else 20))
        end = (start[0]-track['width']*.75 if sideways else start[0],
               start[1] if sideways else start[1]+track['height']*.75)
        page.mouse.move(*start)
        page.mouse.down()
        page.mouse.up()
        assert page.locator('#gameScreen').get_attribute('data-shots') == '0', 'tap fired'
        # Pointer capture must not turn a sideways / outside release into a shot.
        page.mouse.move(*start)
        page.mouse.down()
        page.mouse.move(*end, steps=10)
        unsafe=(end[0],track['y']+track['height']+65) if sideways else (track['x']+track['width']+80,end[1])
        page.mouse.move(*unsafe, steps=4)
        page.mouse.up()
        assert page.locator('#gameScreen').get_attribute('data-shots') == '0', 'outside pull fired'
        page.mouse.move(*start)
        page.mouse.down()
        page.mouse.move(*end, steps=10)
        assert page.locator('#powerTrack').evaluate("(el) => Number(el.style.getPropertyValue('--tension'))") >= .50
        page.mouse.up()
        page.wait_for_timeout(80)
        assert page.locator('#gameScreen').get_attribute('data-shots') == '1', 'pull failed'
        page.locator('#pauseButton').click()
        page.locator('#rerack').click()
        assert page.locator('#gameScreen').get_attribute('data-shots') == '0', 'restart failed'
        assert page.locator('#pauseMenu').is_hidden(), 'restart remained paused'
        if width<900:
            # Genuine touch events catch mobile pointer capture regressions.
            cdp=context.new_cdp_session(page)
            cdp.send('Input.dispatchTouchEvent',{'type':'touchStart','touchPoints':[{'x':start[0],'y':start[1]}]})
            for i in range(1,12):
                x=start[0]+(end[0]-start[0])*i/11
                y=start[1]+(end[1]-start[1])*i/11
                cdp.send('Input.dispatchTouchEvent',{'type':'touchMove','touchPoints':[{'x':x,'y':y}]})
            cdp.send('Input.dispatchTouchEvent',{'type':'touchEnd','touchPoints':[]})
            page.wait_for_timeout(90)
            assert page.locator('#gameScreen').get_attribute('data-shots')=='1', 'touch release failed to shoot'
        # Physical-screen safety: a deliberate 100% pull fires BEFORE the
        # finger reaches the screen boundary, even without a pointerup.
        page.locator('#pauseButton').click()
        page.locator('#rerack').click()
        track=page.locator('#powerTrack').bounding_box()
        max_start=(track['x']+track['width']-20,track['y']+track['height']/2) if sideways else (track['x']+track['width']/2,track['y']+20)
        max_end=(track['x']+4,track['y']+track['height']/2) if sideways else (track['x']+track['width']/2,track['y']+track['height']-4)
        page.mouse.move(*max_start)
        page.mouse.down()
        page.mouse.move(*max_end,steps=18)
        assert page.locator('#gameScreen').get_attribute('data-shots')=='1', 'full pull failed to auto-fire at rail end'
        page.mouse.up()
        assert page.locator('#gameScreen').get_attribute('data-shots')=='1', 'captured release fired twice'
        page.locator('#pauseButton').click()
        page.locator('#quitMatch').click()
        page.wait_for_timeout(500)
        assert page.locator('.table-flight').count() == 1, 'reverse flight not started'
        page.wait_for_timeout(1220)
        assert page.locator('#lobby').is_visible() and page.locator('#gameScreen').is_hidden(), 'return to lobby failed'
        assert not errors, f'{width}x{height}: {errors}'
        print(f'{width}x{height}: lobby, HUD bounds, pause, preferences, shot, restart, reverse flight OK')
        context.close()
    browser.close()
