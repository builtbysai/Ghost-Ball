import asyncio,re,base64,json
from pathlib import Path
from playwright.async_api import async_playwright
# Mock GPU integration: verifies wiring and fallback, not shader pixels or hardware speed.
root=Path(__file__).resolve().parents[1];urls={}
for name in ['physics','random','game','render','audio','camera3d','render3d','main']:
 s=(root/'src'/f'{name}.js').read_text()
 s=re.sub(r"(['\"])\./([\w-]+)\.js\1",lambda m: f"'{urls[m.group(2)]}'" if m.group(2) in urls else m.group(0),s)
 if name=='main':s+="\nwindow.__ghostTest={get:()=>({view,current,webgl}),setView:chooseView,scratch:()=>{current.ballInHand=true;current.sim.cue().pocketed=true;current.sim.moving=false;}}";main=s
 else:urls[name]='data:text/javascript;base64,'+base64.b64encode(s.encode()).decode()
html=(root/'index.html').read_text().replace('<link rel="stylesheet" href="src/style.css">','<style>'+(root/'src/style.css').read_text()+'</style>').replace('<script type="module" src="src/main.js"></script>',f'<script type="module">{main}</script>')
mock='''() => {
Object.defineProperty(window,'localStorage',{configurable:true,value:{getItem:()=>null,setItem:()=>{}}});
const original=HTMLCanvasElement.prototype.getContext;
window.__glStats={draw:0,sizes:[],uniformModels:[],textures:0};
let seq=0;
const gl={};
const consts=['VERTEX_SHADER','FRAGMENT_SHADER','COMPILE_STATUS','LINK_STATUS','ARRAY_BUFFER','STATIC_DRAW','FLOAT','TRIANGLES','TEXTURE_2D','RGBA','UNSIGNED_BYTE','TEXTURE_MIN_FILTER','LINEAR_MIPMAP_LINEAR','TEXTURE_MAG_FILTER','LINEAR','DEPTH_TEST','LEQUAL','BLEND','SRC_ALPHA','ONE_MINUS_SRC_ALPHA','COLOR_BUFFER_BIT','DEPTH_BUFFER_BIT','TEXTURE0','VERSION'];
consts.forEach((name,i)=>gl[name]=i+1);
for (const op of ['shaderSource','compileShader','attachShader','linkProgram','deleteShader','bindVertexArray','bindBuffer','bufferData','enableVertexAttribArray','vertexAttribPointer','bindTexture','texImage2D','texParameteri','generateMipmap','enable','depthFunc','blendFunc','viewport','clearColor','clear','useProgram','uniformMatrix4fv','uniform3fv','uniform1i','activeTexture','deleteVertexArray','deleteBuffer','deleteTexture','deleteProgram'])gl[op]=(...args)=>{if(op==='uniformMatrix4fv')window.__glStats.uniformModels.push(Array.from(args[2]).slice(0,4));if(op==='texImage2D')window.__glStats.textures++};
for (const op of ['createShader','createProgram','createVertexArray','createBuffer','createTexture'])gl[op]=()=>({id:++seq});
gl.getShaderParameter=()=>true;gl.getProgramParameter=()=>true;gl.getAttribLocation=(_,n)=>n==='position'?0:n==='normal'?1:2;gl.getUniformLocation=(_,n)=>n;gl.getParameter=()=> 'mock WebGL2';gl.drawArrays=()=>{window.__glStats.draw++};
gl.getExtension=()=>({loseContext:()=>document.querySelector('#webglCanvas').dispatchEvent(new Event('webglcontextlost',{cancelable:true})),restoreContext:()=>document.querySelector('#webglCanvas').dispatchEvent(new Event('webglcontextrestored'))});
HTMLCanvasElement.prototype.getContext=function(type,...rest){return this.id==='webglCanvas'&&type==='webgl2'?gl:original.call(this,type,...rest)};
}'''
async def run():
 async with async_playwright() as p:
  browser=await p.chromium.launch(executable_path=__import__('os').environ.get('CHROMIUM_PATH','/usr/bin/chromium'),headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
  for w,h in [[390,844],[320,568],[844,390],[1280,720]]:
   page=await browser.new_page(viewport={'width':w,'height':h},device_scale_factor=1,has_touch=True,is_mobile=w<500,service_workers='block')
   errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
   await page.evaluate(mock);await page.set_content(html,wait_until='domcontentloaded');await page.wait_for_timeout(130)
   await page.click('#openSetup');await page.click('#lobbyViews button[data-view="webgl"]');await page.wait_for_timeout(180)
   await page.click('#closeSetup');await page.click('#playBtn');await page.wait_for_timeout(250)
   data=await page.evaluate('''() => ({draw:__glStats.draw,tex:__glStats.textures,view:__ghostTest.get().view,camera:__ghostTest.get().webgl?.camera.portrait,hidden:document.getElementById('webglCanvas').hidden,overflow:document.documentElement.scrollWidth>innerWidth||document.documentElement.scrollHeight>innerHeight})''')
   # Aiming uses ray-to-felt and does not trigger a shot when adjusting the power slider.
   await page.evaluate('''() => {const r=gameCanvas.getBoundingClientRect(),v=__ghostTest.get().webgl,position=v.camera.projectWorld(v.camera.toWorld(700,180,0));const c=gameCanvas;
      c.dispatchEvent(new PointerEvent('pointerdown',{pointerId:1,clientX:r.left+position.sx,clientY:r.top+position.sy,bubbles:true}));
      c.dispatchEvent(new PointerEvent('pointerup',{pointerId:1,clientX:r.left+position.sx,clientY:r.top+position.sy,bubbles:true})); }''')
   await page.locator('#powerRange').fill('78');data['safePower']=await page.locator('#shootBtn').is_enabled()
   if w==390:
    await page.evaluate("document.querySelector('#webglCanvas').getContext('webgl2').getExtension('WEBGL_lose_context').loseContext()")
    await page.wait_for_timeout(90)
    data['fallback']=await page.evaluate('''() => ({view:__ghostTest.get().view,hidden:webglCanvas.hidden})''')
    await page.evaluate("document.querySelector('#webglCanvas').getContext('webgl2').getExtension('WEBGL_lose_context').restoreContext()")
    await page.locator('#gameView').click();await page.wait_for_timeout(80)
    data['restored']=await page.evaluate('''() => ({view:__ghostTest.get().view,hidden:webglCanvas.hidden,textures:__glStats.textures})''')
   assert data['view']=='webgl' and data['draw']>0 and data['tex']==16 and not data['hidden'] and not data['overflow'] and data['safePower'],data
   assert not errors,errors
   if w==390:
    assert data['fallback']=={'view':'perspective','hidden':True} and data['restored']['view']=='webgl' and data['restored']['textures']==32
   print(json.dumps({'size':[w,h],**data,'errors':errors}),flush=True)
   await page.close()
  await browser.close()
asyncio.run(run())
print('Mock WebGL browser wiring passed. Actual GPU shader/visual testing is still required.')
