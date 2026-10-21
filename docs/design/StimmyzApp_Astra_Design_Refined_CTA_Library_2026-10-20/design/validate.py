"""Validate the self-contained Stimmyz device-first UI and capture reproducible screenshots.
UI only: this never records audio or exercises native Android APIs.
"""
from pathlib import Path
from playwright.sync_api import sync_playwright
from PIL import Image, ImageOps, ImageDraw, ImageFont
import json
root=Path(__file__).resolve().parents[1]
html=(root/'prototype'/'standalone.html').read_text()
previews=root/'previews'
previews.mkdir(exist_ok=True)
checks={}
errors=[]
def open_ref(browser,theme='Vanilla',page_name='board'):
    page=browser.new_page(viewport={'width':1440,'height':1000}, device_scale_factor=1)
    page.on('pageerror',lambda e: errors.append(str(e)))
    page.set_content(html,wait_until='domcontentloaded')
    if theme!='Vanilla':page.locator('#theme-select').select_option(theme)
    if page_name!='board':page.locator(f'[data-action="navigate"][data-value="{page_name}"]').click()
    return page
with sync_playwright() as p:
    b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
    board=open_ref(b)
    checks['quick_add_first']=board.locator('.grid-wrap > .sound-pad').first.get_attribute('class')=='sound-pad quick'
    checks['quick_add_default']=board.locator('.quick-button span').inner_text()=='Record device audio'
    checks['quick_add_has_no_arrow_in_normal_mode']=board.locator('.quick-arrow').count()==0
    checks['nav_icon_size']=board.locator('.nav-tab .icon').first.evaluate('(e)=>getComputedStyle(e).width')
    board.locator('[data-action="editBoard"]').click()
    checks['quick_arrow_only_in_edit']=board.locator('.quick-arrow').count()==1
    board.locator('[data-action="quickMenu"]').click()
    checks['quick_choices']=board.locator('.pad-action-menu button').all_inner_texts()
    checks['has_four_quick_choices']=len(checks['quick_choices'])==4
    board.locator('[data-action="editBoard"]').click()
    board.locator('[data-action="padMenu"]').first.click()
    checks['pad_menu_items']=board.locator('.pad-action-menu button').all_inner_texts()
    checks['pad_menu_operable']=len(checks['pad_menu_items'])==4
    board.locator('[data-action="navigate"][data-value="library"]').click()
    board.locator('[data-action="libraryMenu"]').first.click()
    checks['library_menu_items']=board.locator('.library-action-menu button').all_inner_texts()
    checks['library_menu_operable']=len(checks['library_menu_items'])==5
    board.close()

    ed=open_ref(b,page_name='editor')
    checks['main_cta']=ed.locator('.device-primary').inner_text().strip()
    checks['secondary_methods']=ed.locator('.secondary-method strong').all_inner_texts()
    checks['device_first_editor']=checks['main_cta']=='Record device audio' and checks['secondary_methods']==['Record your voice','Import audio or video']
    ed.locator('.device-primary').click()
    checks['active_device_recording']=ed.locator('.capture-in-progress h3').inner_text()=='Capture audio from another app'
    ed.locator('.flow-bottom[data-action="deviceRecord"]').click()
    checks['device_capture_to_trim']=ed.locator('#waveform').count()==1
    ed.locator('#waveform [data-handle="start"]').scroll_into_view_if_needed()
    bbox=ed.locator('#waveform [data-handle="start"]').bounding_box()
    original=float(ed.locator('#time-start').inner_text()[3:])
    ed.mouse.move(bbox['x']+bbox['width']/2,bbox['y']+bbox['height']/2)
    ed.mouse.down();ed.mouse.move(bbox['x']+bbox['width']/2+12,bbox['y']+bbox['height']/2);ed.mouse.up()
    changed=float(ed.locator('#time-start').inner_text()[3:])
    checks['waveform_drag']=changed>original
    ed.locator('[data-action="nextDetails"]').click()
    checks['customize_step']=ed.locator('#sound-name').count()==1
    ed.locator('#sound-name').fill('Device clip test')
    ed.locator('[data-action="saveSound"]').click()
    checks['saved_sound_visible']=ed.locator('.sound-pad').filter(has_text='Device clip test').count()>0
    checks['quick_add_persists_after_save']=ed.locator('.grid-wrap > .sound-pad').first.get_attribute('class')=='sound-pad quick'
    ed.close()

    lib=open_ref(b,page_name='library')
    checks['library_cta']=lib.locator('.library-primary').inner_text().strip()
    lib.locator('[data-action="beginCreate"]').click()
    checks['source_order']=lib.locator('.flow-source-option strong').all_inner_texts()
    checks['source_device_first']='Record device audio' in checks['source_order'][0]
    lib.close()

    screenshot_paths={}
    def shot(page, name):
        dest=previews/name
        page.locator('#app').screenshot(path=str(dest))
        screenshot_paths[name]=str(dest)
    for t in ['Peach','Mint','Snow','Ice','Vanilla','Coffee']:
        page=open_ref(b,theme=t,page_name='editor')
        shot(page,f'editor-{t.lower()}.png')
        if t in ('Vanilla','Coffee'):
            page.locator('.device-primary').click()
            shot(page,f'capture-{t.lower()}.png')
        page.close()
    for t in ['Vanilla','Coffee']:
        page=open_ref(b,theme=t)
        shot(page,f'board-{t.lower()}.png')
        page.locator('[data-action="navigate"][data-value="library"]').click()
        shot(page,f'library-{t.lower()}.png')
        page.locator('[data-action="beginCreate"]').click()
        shot(page,f'source-{t.lower()}.png')
        page.locator('.flow-source-option.featured').click()
        checks[f'featured_source_starts_{t}']=page.locator('.capture-in-progress').count()==1
        page.locator('.flow-bottom[data-action="deviceRecord"]').click()
        shot(page,f'trim-{t.lower()}.png')
        page.locator('[data-action="nextDetails"]').click()
        shot(page,f'customize-{t.lower()}.png')
        page.close()
    page=open_ref(b,theme='Coffee')
    page.locator('[data-action="editBoard"]').click()
    page.locator('[data-action="quickMenu"]').click()
    shot(page,'quick-add-edit-only-coffee.png')
    page.locator('[data-action="editBoard"]').click()
    page.locator('[data-action="padMenu"]').first.click()
    shot(page,'pad-menu-coffee.png')
    page.locator('[data-action="navigate"][data-value="library"]').click()
    page.locator('[data-action="libraryMenu"]').first.click()
    shot(page,'library-menu-coffee.png')
    page.close()
    narrow=b.new_page(viewport={'width':360,'height':800},device_scale_factor=1)
    narrow.set_content(html,wait_until='domcontentloaded')
    narrow.locator('[data-action="navigate"][data-value="editor"]').click()
    shot(narrow,'mobile-360-editor.png')
    checks['no_360_width_overflow']=not narrow.evaluate('document.documentElement.scrollWidth > window.innerWidth')
    narrow.close()
    b.close()

# Build actual screenshot-based overview images
for name,imgs,columns in [
    ('00-device-first-overview.png',['board-vanilla.png','editor-vanilla.png','capture-vanilla.png','source-vanilla.png'],4),
    ('00-device-first-coffee.png',['board-coffee.png','editor-coffee.png','capture-coffee.png','source-coffee.png'],4),
    ('00-three-main-screens.png',['board-vanilla.png','editor-vanilla.png','library-vanilla.png'],3),
    ('00-editor-six-themes.png',[f'editor-{n}.png' for n in ('peach','mint','snow','ice','vanilla','coffee')],6)
]:
    parts=[Image.open(previews/i).convert('RGB') for i in imgs]
    pad=22;w=max(x.width for x in parts);h=max(x.height for x in parts)
    canvas=Image.new('RGB',(columns*w+(columns+1)*pad,h+2*pad),'#E8E3F0')
    for j,part in enumerate(parts):
        canvas.paste(part,(pad+j*(w+pad),pad))
    canvas.save(previews/name,optimize=True)
checks['js_errors']=errors
(root/'design'/'device-first-test-results.json').write_text(json.dumps(checks,indent=2))
failures=[k for k,v in checks.items() if v is False or (k=='js_errors' and v)]
print(json.dumps({'checks':checks,'failures':failures},indent=2))
if failures: raise SystemExit('FAILED: '+','.join(failures))
