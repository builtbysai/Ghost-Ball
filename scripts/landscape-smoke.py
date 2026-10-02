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
    for name in ['style.css', 'landscape.css', 'transition.css', 'feel.css', 'polish.css']:
        doc = re.sub(fr'<link rel="stylesheet" href="src/{re.escape(name)}(?:\\?[^"]*)?">',
                     f'<style>{(root / "src" / name).read_text()}</style>', doc)
    doc = doc.replace('<link rel="manifest" href="manifest.webmanifest">', '')
    return re.sub(r'<script type="module" src="src/main\\.js(?:\\?[^"]*)?"></script>',
                  f'<script type="module">import "{module_data("main.js")}";</script>',doc)

def inside_viewport(rect, width, height, tolerance=2):
    return rect['x'] >= -tolerance and rect['y'] >= -tolerance and (
        rect['x'] + rect['width'] <= width + tolerance and
        rect['y'] + rect['height'] <= height + tolerance)

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
        page.locator('#nextRoom').click()
        assert page.locator('#roomPlaque').inner_text() == '1927', 'room history did not update'
        page.locator('#prevRoom').click()
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
        page.screenshot(path=str((root / 'screenshots' / f'match-{width}x{height}.png').resolve()))
        page.locator('#pauseButton').click()
        assert page.locator('#pauseMenu').is_visible(), 'pause panel missing'
        page.locator('#pauseSettings').click()
        assert page.locator('#settingsSheet').is_visible(), 'pause preferences missing'
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
