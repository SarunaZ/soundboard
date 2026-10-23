"""Final approved transparent Stimmyz logo; offline browser and responsive acceptance checks."""
from pathlib import Path
from PIL import Image
from playwright.sync_api import sync_playwright
from hashlib import sha256
import json
root=Path(__file__).resolve().parents[1]
assets=root/'prototype/assets';out=root/'previews'
results=[]
def check(name,condition):
 ok=bool(condition);results.append({'check':name,'pass':ok})
 if not ok:raise AssertionError(name)
 return ok
source=assets/'stimmyz-logo-approved-transparent-source.png'
derived=assets/'stimmyz-logo-transparent.png'
check('Original exact source SHA256', sha256(source.read_bytes()).hexdigest()=='46684884e65efadf941d4341742dc6f42c9189f5c63ff1526f94b3a656372c29')
original=Image.open(source).convert('RGBA');im=Image.open(derived).convert('RGBA')
check('Original 2172x724 RGBA',original.size==(2172,724))
check('Actual source alpha transparency',original.getpixel((0,0))[3]==0 and original.getchannel('A').getextrema()==(0,255))
check('Derived actual alpha transparency',im.getpixel((0,0))[3]==0 and im.getchannel('A').getextrema()==(0,255))
check('Source sparkle not cropped',im.getchannel('A').getbbox()[2]<im.width-8)
check('S icon untouched',sha256((assets/'stimmyz-app-icon.png').read_bytes()).hexdigest()=='2e78bfd90b6aed2aabe9b6dbd46f5f12e2d8c13e9a16e67dcb9e233a114d9fb2')
check('Retired dark logo removed from active assets',not (assets/'stimmyz-logo-original.png').exists())
check('Retired SVG is not an active resource',not (assets/'stimmyz-wordmark.svg').exists())
html=(root/'prototype/standalone.html').read_text()
with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':1250,'height':1000})
 page.set_default_timeout(7000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content(html,wait_until='load')
 for theme in ['Peach','Mint','Snow','Ice','Vanilla','Coffee']:
  page.locator('#theme-select').select_option(theme)
  for tab in ['board','editor','library']:
   page.locator(f'[data-preview-page="{tab}"]').click()
   img=page.locator('.brand-wordmark')
   check(f'{theme} / {tab}: logo visible',img.count()==1 and img.evaluate('e=>e.complete && e.naturalWidth>0'))
   check(f'{theme} / {tab}: true transparent asset embedded',img.get_attribute('src').startswith('data:image/png;base64,'))
   check(f'{theme} / {tab}: not stretched',img.evaluate('e=>Math.abs(e.naturalWidth/e.naturalHeight - e.getBoundingClientRect().width/e.getBoundingClientRect().height)<.35'))
   check(f'{theme} / {tab}: accessible name',img.get_attribute('alt')=='Stimmyz')
   check(f'{theme} / {tab}: no plaque',page.locator('.brand-plaque').count()==0 and page.locator('.brand').evaluate('e=>getComputedStyle(e).backgroundColor==="rgba(0, 0, 0, 0)" && getComputedStyle(e).backgroundImage==="none"'))
   check(f'{theme} / {tab}: overflow not overlapping',page.locator('.brand-row').evaluate('e=>{let a=e.querySelector(".brand-wordmark").getBoundingClientRect(),b=e.querySelector(".brand-more").getBoundingClientRect();return a.right+2<=b.left}'))
   check(f'{theme} / {tab}: no duplicate sparkle',page.locator('.brand-spark').count()==0)
  page.locator('[data-preview-page="board"]').click()
  check(theme+' no pad menus in play mode',page.locator('.pad-menu-trigger').count()==0)
 # critical interactions
 page.locator('#theme-select').select_option('Vanilla')
 page.locator('[data-preview-page="board"]').click()
 page.locator('[data-action="settingsMenu"]').click()
 check('Settings menu opens',page.locator('[data-action="openSettings"]').count()==1)
 page.locator('[data-action="openSettings"]').click()
 check('Master volume still present',page.locator('#master-volume').count()==1)
 page.locator('[data-action="closeSettings"]').click()
 page.locator('[data-preview-page="editor"]').click()
 check('Device recording remains primary',page.locator('.device-primary').count()==1)
 page.locator('[data-preview-page="details"]').click()
 page.locator('[data-action="artGiphy"]').click()
 check('GIPHY picker unchanged',page.locator('.giphy-picker').count()==1)
 page.locator('[data-preview-page="board"]').click()
 page.locator('[data-action="editBoard"]').click()
 check('Edit-only pad menu appears',page.locator('.pad-menu-trigger').count()>0)
 check('Board grid modes retained',page.locator('[data-action="setGrid"]').count()==2)
 check('Board navigation modes retained',page.locator('[data-action="setBoardNavigation"]').count()==2)
 # small widths; CSS responsive grid for studio vs iframe phone
 for width in [320,360,375,412]:
  page.set_viewport_size({'width':width,'height':850})
  for tab in ['board','editor','library']:
   page.evaluate('(tab)=>{state.page=tab;state.edit=false;state.menu=null;state.activeCreation=false;render(false)}',tab)
   check(f'{width}px {tab} header has no overlap',page.locator('.brand-row').evaluate('e=>{let a=e.querySelector(".brand-wordmark").getBoundingClientRect(),b=e.querySelector(".brand-more").getBoundingClientRect(),r=e.getBoundingClientRect();return a.right+2<=b.left && a.left>=r.left && b.right<=r.right+1}'))
  check(f'{width}px no outer horizontal overflow',page.evaluate('document.documentElement.scrollWidth<=innerWidth+1'))
 check('No browser JS errors',not errors)
 b.close()
(root/'design/wordmark-validation.json').write_text(json.dumps({'total':len(results),'passed':sum(v['pass'] for v in results),'results':results},indent=2))
print('PASS',len(results),'final transparent-logo checks')
