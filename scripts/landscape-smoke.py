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
    for name in ['style.css', 'landscape.css', 'transition.css', 'feel.css', 'polish.css', 'responsive-ui.css', 'match-ui.css', 'sheets.css', 'rooms.css', 'online.css', 'cue-locker.css', 'local-record.css', 'skill-drills.css']:
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
        assert page.locator('#roomMastery').is_visible()
        assert page.locator('#roomMasteryCount').inner_text()=='0 / 3'
        assert inside_viewport(page.locator('#roomMastery').bounding_box(),width,height),'mastery badge clipped'
        assert page.locator('#roomArt').inner_text() == 'THE OBSERVATORY'
        page.locator('#nextRoom').click()
        assert page.locator('#roomPlaque').inner_text() == '1927', 'room history did not update'
        assert page.locator('#roomArt').inner_text() == 'THE FOUNDRY', 'framed art did not update'
        page.locator('#nextRoom').click()
        assert page.locator('#roomArt').inner_text() == 'THE WINTERGARDEN'
        assert page.locator('#roomPlaque').inner_text() == '1938'
        assert page.locator('#roomMastery').is_visible(),'Wintergarden has an authored mastery path'
        assert page.locator('#roomMasteryNext').inner_text().endswith('GLASS ANGLE')
        if width in (1280,568):
            page.screenshot(path=str((root / 'screenshots' / f'wintergarden-{width}x{height}.png').resolve()))
        page.locator('#nextRoom').click()
        assert page.locator('#roomArt').inner_text() == 'THE AFTERHOURS'
        assert page.locator('#roomMasteryNext').inner_text().endswith('MIDNIGHT BANK')
        assert page.locator('#roomPlaque').inner_text() == '1964'
        if width in (1280,568):
            page.screenshot(path=str((root / 'screenshots' / f'afterhours-{width}x{height}.png').resolve()))
        for _ in range(3): page.locator('#prevRoom').click()
        assert page.locator('#roomArt').inner_text() == 'THE OBSERVATORY'
        # Actually start a new venue's match and test its live entrance on
        # both standard desktop and shortest supported touch landscape.
        chosen='THE OBSERVATORY'
        if width in (1280,568):
            for _ in range(2 if width==1280 else 3):
                page.locator('#nextRoom').click()
            chosen='THE WINTERGARDEN' if width==1280 else 'THE AFTERHOURS'
            assert page.locator('#roomArt').inner_text() == chosen
        page.screenshot(path=str((root / 'screenshots' / f'menu-{width}x{height}.png').resolve()))
        # Verify actual pointer hit targets, not force-click bypasses.
        if width<900:
            hit=page.locator('#menuBtn').bounding_box()
            page.touchscreen.tap(hit['x']+hit['width']/2,hit['y']+hit['height']/2)
            assert page.locator('#clubMenu').is_visible(), 'actual touch could not open menu'
            page.locator('#closeMenu').click()
        page.locator('#menuBtn').click()
        assert page.locator('#clubMenu').is_visible()
        page.locator('#menuChallenges').click()
        page.wait_for_timeout(450)
        assert page.locator('#challengeSheet').is_visible() and page.locator('#challengeCards button').count()==10
        cpanel=page.locator('.challenge-panel').bounding_box()
        assert inside_viewport(cpanel,width,height),f'{width}x{height}: challenge picker clipped'
        assert page.locator('.challenge-panel').evaluate('(el)=>el.scrollHeight<=el.clientHeight+1'), 'challenge panel overflow'
        assert page.locator('#challengeCards').evaluate('(el)=>el.scrollHeight<=el.clientHeight+1'), 'skill cards clipped'
        page.screenshot(path=str((root/'screenshots'/f'skill-drills-{width}x{height}.png').resolve()))
        for card in page.locator('#challengeCards button').all():
            assert inside_viewport(card.bounding_box(),width,height),'authored skill card outside viewport'
            fits=card.evaluate('(el)=>({scroll:el.scrollHeight,client:el.clientHeight})')
            assert fits['scroll']<=fits['client']+1,f"{width}x{height}: {card.get_attribute('data-drill')} text clipped: {fits}"
        page.keyboard.press('Escape')
        assert page.locator('#challengeSheet').is_hidden() and page.locator('#clubMenu').is_visible()
        assert page.evaluate('document.activeElement.id')=='menuChallenges','skill picker focus not restored'
        page.locator('#menuLocker').click()
        page.wait_for_timeout(450)
        assert page.locator('#lockerSheet').is_visible(), 'Cue Locker failed to open'
        assert page.locator('#lockerGrid [data-cue]').count()==6, 'six original cues not rendered'
        assert page.locator('#lockerEquip').is_disabled(), 'already equipped starter should not re-equip'
        assert page.locator('#lockerGrid [data-cue="nightfall"]').get_attribute('aria-label').startswith('Nightfall, locked')
        panel=page.locator('.locker-panel').bounding_box()
        within(panel,page.locator('#lockerSheet').bounding_box(),f'{width}x{height}: locker bounds')
        assert page.locator('.locker-panel').evaluate('(el)=>el.scrollHeight<=el.clientHeight+1'), 'locker scroll trapped'
        assert page.locator('.locker-collection').evaluate('(el)=>el.scrollHeight<=el.clientHeight+1'), 'cue collection clipped'
        page.locator('#lockerGrid [data-cue="nightfall"]').click()
        assert page.locator('#lockerEquip').is_disabled(), 'locked cue must not equip'
        page.locator('#lockerGrid [data-cue="house"]').focus()
        page.keyboard.press('ArrowRight')
        assert page.locator('[data-cue="smoke"]').get_attribute('aria-pressed')=='true', 'arrow selection did not advance'
        page.locator('#lockerEquip').click()
        assert page.locator('[data-cue="smoke"]').get_attribute('aria-label').endswith('equipped')
        page.locator('#lockerFavorite').click()
        assert page.locator('#lockerFavorite').get_attribute('aria-pressed')=='true'
        page.screenshot(path=str((root/'screenshots'/f'cue-locker-{width}x{height}.png').resolve()))
        page.keyboard.press('Escape')
        assert page.locator('#lockerSheet').is_hidden() and page.locator('#clubMenu').is_visible()
        assert page.evaluate('document.activeElement.id')=='menuLocker', 'Locker focus not restored'
        page.locator('#menuLocker').click()
        page.wait_for_timeout(450)
        assert page.locator('[data-cue="smoke"]').get_attribute('aria-label').endswith('equipped'), 'equipment did not survive reopen'
        page.locator('#closeLocker').click()
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
        assert page.locator('#roundLabel').inner_text() == chosen, 'match used the wrong venue'
        assert page.locator('#pauseButton').is_visible(), 'pause control missing'
        # Focus must land on the table so Space / arrows work without clicking first.
        assert page.evaluate('document.activeElement.id')=='gameCanvas', 'focus stayed on a lobby control'
        page.keyboard.press('ArrowRight')
        assert page.locator('#aimReadout').inner_text()=='2°', 'one arrow press moves the aim a visible 2 degrees'
        page.keyboard.press('Shift+ArrowLeft')
        assert page.locator('#aimReadout').inner_text()=='1.75°', 'Shift refines to a quarter degree'
        page.keyboard.press('ArrowLeft')
        # A tap: keydown and keyup in one tick. Two separate driver round trips can be
        # >150 ms apart on a loaded runner, which is a genuine hold, not a tap.
        page.evaluate("""()=>{for(const type of ['keydown','keyup'])
          window.dispatchEvent(new KeyboardEvent(type,{code:'Space',key:' ',bubbles:true,cancelable:true}));}""")
        page.wait_for_timeout(200)
        assert page.locator('#gameScreen').get_attribute('data-shots')=='0', 'a Space tap fired a shot'
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
        # Open table: neutral ghost slots only (no numbered sample balls) plus the 8-ball slot.
        for tray in ('#ballsOne','#ballsTwo'):
            assert page.locator(f'{tray} .ball-slot.ghost').count()==7, f'{tray}: open table must show 7 ghost slots'
            assert page.locator(f'{tray} .ball-number').all_text_contents()==['8'], f'{tray}: only the 8 slot is numbered while open'
            assert page.locator(f'{tray} .eight-slot').get_attribute('data-state')=='inactive'
        assert page.locator('#shotClock').is_visible(), 'the shot clock is the prominent timer'
        assert page.locator('#muteButton').is_visible(), 'in-match mute control missing'
        page.screenshot(path=str((root / 'screenshots' / f'match-{width}x{height}.png').resolve()))
        page.locator('#pauseButton').click()
        page.wait_for_timeout(450)  # sheet entrance animation settles
        assert page.locator('#pauseMenu').is_visible(), 'pause panel missing'
        pause=page.locator('.pause-card').bounding_box()
        within(pause,page.locator('#pauseMenu').bounding_box(),f'{width}x{height}: pause panel')
        assert page.locator('.pause-card').evaluate('(el)=>el.scrollHeight<=el.clientHeight+1'), 'pause has internal overflow'
        for b in page.locator('.pause-actions button').all(): within(b.bounding_box(),pause,f'{width}x{height}: pause action')
        page.screenshot(path=str((root/'screenshots'/f'pause-{width}x{height}.png').resolve()))
        page.locator('#pauseSettings').click()
        page.wait_for_timeout(450)
        assert page.locator('#settingsSheet').is_visible(), 'pause preferences missing'
        prefs=page.locator('.prefs-panel').bounding_box()
        assert inside_viewport(prefs,width,height), f'preferences clipped: {prefs}'
        assert page.locator('.prefs-panel').evaluate('(el)=>el.scrollHeight<=el.clientHeight+1'), 'preferences have internal overflow'
        page.locator('#openRecord').click()
        page.wait_for_timeout(450)
        assert page.locator('#recordSheet').is_visible() and page.locator('#settingsSheet').is_hidden(), 'private record panel failed to open'
        assert page.locator('#recordMatches').inner_text()=='0', 'new record should have no fake matches'
        record=page.locator('.record-panel').bounding_box()
        assert inside_viewport(record,width,height), f'{width}x{height}: record clipped {record}'
        assert page.locator('.record-panel').evaluate('(el)=>el.scrollHeight<=el.clientHeight+1'), 'record panel scroll overflow'
        assert page.locator('.record-privacy').evaluate('(el)=>el.scrollHeight<=el.clientHeight+1'), 'privacy controls overflow'
        # Inline data-URL smoke has an opaque browser origin: storage is
        # correctly unavailable. Guarded reset must be disabled, not forced.
        if page.locator('#resetRecord').is_enabled():
            page.locator('#resetRecord').click()
            assert page.locator('#recordConfirm').is_visible()
            page.locator('#cancelRecordReset').click()
            assert page.locator('#recordConfirm').is_hidden(), 'cancel failed'
        else:
            assert page.locator('#recordStorage').inner_text()=='SESSION ONLY'
            assert page.locator('#recordConfirm').is_hidden(), 'unavailable storage offered destructive reset'
        page.screenshot(path=str((root/'screenshots'/f'local-record-{width}x{height}.png').resolve()))
        page.keyboard.press('Escape')
        assert page.locator('#recordSheet').is_hidden() and page.locator('#settingsSheet').is_visible(), 'Escape did not restore preferences'
        assert page.evaluate('document.activeElement.id')=='openRecord', 'record focus did not return'
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
        page.wait_for_timeout(1900)  # the balls flock back into the rack; the table is input-locked until they land
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
        page.wait_for_timeout(1900)  # rack flock settles
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
