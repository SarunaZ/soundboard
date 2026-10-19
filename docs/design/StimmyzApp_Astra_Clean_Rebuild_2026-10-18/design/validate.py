from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parents[1]
errors=[]
with sync_playwright() as p:
  browser=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
  page=browser.new_page(viewport={'width':1440,'height':1000},device_scale_factor=1)
  page.on('pageerror',lambda e: errors.append(str(e)))
  page.set_content((root/"prototype"/"standalone.html").read_text(),wait_until="domcontentloaded")
  page.wait_for_timeout(250)
  for theme in ['Vanilla','Peach','Mint','Snow','Ice','Coffee']:
    page.locator('#theme-select').select_option(theme)
    page.locator('.device').screenshot(path=str(root/'previews'/f'01-board-{theme.lower()}.png'))
  page.locator('#theme-select').select_option('Coffee')
  page.locator('.nav-tab').nth(2).click()
  page.locator('.device').screenshot(path=str(root/'previews'/'00-library-initial-coffee.png'))
  page.locator('.nav-tab').nth(0).click()
  assert page.locator('.pad-image').first.evaluate('(el)=>el.complete && el.naturalWidth>0')
  assert page.locator('.sound-pad').first.locator('.quick-button').is_visible()
  assert page.locator('.quick-arrow').count()==0, 'quick config arrow visible outside edit mode'
  assert page.locator('.nav-tab svg').first.evaluate('(el)=>Math.round(el.getBoundingClientRect().width)')==29
  page.locator('.outline-btn').click()
  assert page.locator('.quick-arrow').count()==1
  page.locator('.quick-arrow').click()
  assert page.get_by_text('Choose local file').is_visible()
  page.locator('.device').screenshot(path=str(root/'previews'/'02-quick-edit-menu-coffee.png'))
  page.get_by_text('Choose local file').click()
  page.locator('.outline-btn').click()
  assert page.locator('.quick-arrow').count()==0
  page.locator('.pad-menu-trigger').first.click()
  assert page.get_by_text('Replace sound').is_visible()
  assert page.locator('[data-action="clear"]').first.evaluate('(el)=>{const r=el.getBoundingClientRect();return document.elementFromPoint(r.left+r.width/2,r.top+r.height/2)?.closest("[data-action=clear]")===el}')
  page.locator('.device').screenshot(path=str(root/'previews'/'03-pad-menu-coffee.png'))
  page.locator('.nav-tab').nth(1).click()
  assert page.get_by_text('Make a sound').is_visible()
  page.evaluate('state.toast="";render()')
  page.locator('.device').screenshot(path=str(root/'previews'/'04-editor-coffee.png'))
  page.locator('#build-select').select_option('personal')
  page.locator('.device').screenshot(path=str(root/'previews'/'05-editor-personal-coffee.png'))
  page.locator('[data-preview-page="trim"]').click()
  page.locator('.device').screenshot(path=str(root/'previews'/'06-trim-coffee.png'))
  wave=page.locator('#waveform').bounding_box()
  start_handle=page.locator('[data-handle="start"]').bounding_box()
  page.mouse.move(start_handle['x']+start_handle['width']/2,start_handle['y']+start_handle['height']/2)
  page.mouse.down()
  page.mouse.move(start_handle['x']+start_handle['width']/2+36,start_handle['y']+start_handle['height']/2)
  page.mouse.up()
  assert float(page.locator('#time-start').inner_text().replace('00:',''))>2.52,'Waveform did not drag'
  page.locator('[data-action="toggleFine"]').click()
  assert page.get_by_text('-100ms').count()==2
  page.locator('.device').screenshot(path=str(root/'previews'/'07-trim-fine-coffee.png'))
  page.locator('[data-action="nextDetails"]').click()
  assert page.get_by_text('Make it yours').is_visible()
  page.locator('.device').screenshot(path=str(root/'previews'/'08-customize-coffee.png'))
  page.locator('[data-action="artSearch"]').click()
  page.locator('.device').screenshot(path=str(root/'previews'/'09-customize-artwork-mock-coffee.png'))
  page.locator('[data-action="saveSound"]').click()
  assert page.locator('.sound-pad').first.locator('.quick-button').count()==1, 'QuickAdd lost first slot after save'
  assert page.locator('.sound-pad').count()==17, 'New sound was not created'
  page.locator('.nav-tab').nth(2).click()
  page.evaluate('state.toast="";render()')
  page.locator('.device').screenshot(path=str(root/'previews'/'10-library-coffee.png'))
  page.locator('.lib-more').first.click()
  assert page.get_by_text('Add to board').count()>0
  page.locator('.device').screenshot(path=str(root/'previews'/'11-library-menu-coffee.png'))
  page.locator('#theme-select').select_option('Vanilla')
  page.locator('.device').screenshot(path=str(root/'previews'/'12-library-vanilla.png'))
  page.set_viewport_size({'width':360,'height':800})
  page.locator('.nav-tab').nth(0).click()
  assert page.locator('.nav-tab svg').first.evaluate('(el)=>Math.round(el.getBoundingClientRect().width)')==29
  assert page.locator('.quick-arrow').count()==0
  page.screenshot(path=str(root/'previews'/'13-mobile-360-vanilla.png'))
  result={'errors':errors,'screenshots':len(list((root/'previews').glob('*.png'))),'checks':['theme variants','quick pinned first','edit-only quick arrow','pad menu','large nav icon','wave drag','fine tune','customize','save appends after quick','library menu']}
  (root/'design'/'validation.json').write_text(json.dumps(result,indent=2))
  print(json.dumps(result,indent=2))
  browser.close()
