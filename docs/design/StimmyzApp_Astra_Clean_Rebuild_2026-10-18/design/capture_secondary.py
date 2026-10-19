from pathlib import Path
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
html=(root/'prototype'/'standalone.html').read_text()
with sync_playwright() as p:
 b=p.chromium.launch(headless=True,executable_path='/usr/bin/chromium',args=['--no-sandbox'])
 page=b.new_page(viewport={'width':1440,'height':1000})
 page.set_content(html,wait_until='domcontentloaded')
 page.locator('#theme-select').select_option('Coffee')
 page.locator('.selector').click()
 page.locator('.device').screenshot(path=str(root/'previews'/'14-board-selector-coffee.png'))
 page.evaluate('state.menu=null;startCreate("source")')
 page.locator('.device').screenshot(path=str(root/'previews'/'15-global-source-coffee.png'))
 page.locator('[data-action="record"]').click()
 page.evaluate('state.toast="";render()')
 assert page.get_by_text('Recording a sound').is_visible()
 page.locator('.device').screenshot(path=str(root/'previews'/'16-recording-coffee.png'))
 page.evaluate('state.recording=false;state.activeCreation=false;state.dialog="themes";render()')
 page.locator('.device').screenshot(path=str(root/'previews'/'17-theme-picker-coffee.png'))
 b.close()
