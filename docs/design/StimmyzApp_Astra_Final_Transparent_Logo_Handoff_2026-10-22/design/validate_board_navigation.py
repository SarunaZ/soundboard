from pathlib import Path
from playwright.sync_api import sync_playwright
import json
root=Path(__file__).resolve().parents[1]
results={};errors=[]
def ck(name,condition):
 results[name]=bool(condition)
 print(('PASS' if condition else 'FAIL'),name,flush=True)
 if not condition: raise AssertionError(name)
with sync_playwright() as p:
 browser=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=browser.new_page(viewport={'width':1320,'height':970})
 page.set_default_timeout(6500)
 page.on('pageerror',lambda err:errors.append(str(err)))
 page.set_content((root/'prototype/standalone.html').read_text(),wait_until='load')
 ck('default_pages',page.locator('.grid-wrap').get_attribute('data-navigation')=='pages')
 ck('initial_4x4_count_16',page.locator('.grid-wrap>.sound-pad').count()==16)
 ck('no_pad_more_normal_mode',page.locator('.pad-menu-trigger').count()==0)
 page.locator('[data-action="editBoard"]').click()
 ck('choice_in_edit_mode',page.locator('[data-action="setBoardNavigation"]').count()==2)
 ck('pagination_selected_by_default',page.locator('[data-action="setBoardNavigation"][data-value="pages"]').get_attribute('aria-pressed')=='true')
 page.locator('[data-action="setGrid"][data-value="3x4"]').click()
 ck('page_count_2',page.get_by_text('Page 1 of 2').count()==1)
 page.locator('[data-action="boardPage"][data-value="1"]').click()
 ck('quick_first_p2',page.locator('.grid-wrap>.sound-pad.quick').count()==1)
 ck('page2_count',page.locator('.grid-wrap>.sound-pad').count()==5)
 page.locator('[data-action="setBoardNavigation"][data-value="scroll"]').click()
 ck('scroll_set',page.locator('.grid-wrap').get_attribute('data-navigation')=='scroll')
 ck('page_nav_hidden',page.locator('.board-pagination').count()==0)
 ck('initial_3x4_12',page.locator('.grid-wrap>.sound-pad').count()==12)
 ck('scroll_control_active',page.locator('[data-action="setBoardNavigation"][data-value="scroll"]').get_attribute('aria-pressed')=='true')
 ck('scroll_initial_11',page.evaluate('state.boardLoaded[state.board]')==11)
 ck('lazy_button',page.locator('[data-action="loadMoreSounds"]').count()==1)
 # Verify fallback and single Quick Add
 page.locator('[data-action="loadMoreSounds"]').click()
 ck('scroll_all_15',page.locator('.grid-wrap>.sound-pad').count()==16)
 ck('quick_once_scroll',page.locator('.grid-wrap>.sound-pad.quick').count()==1)
 ck('fully_loaded',page.get_by_text('All sounds loaded').count()==1)
 # Switch board, independent navigation defaults and grid
 page.locator('[data-action="boardMenu"]').click();page.locator('[data-action="selectBoard"][data-value="Work"]').click()
 ck('other_board_pages_default',page.locator('.grid-wrap').get_attribute('data-navigation')=='pages')
 ck('other_board_grid_default',page.locator('.grid-wrap').get_attribute('data-grid')=='4x4')
 page.locator('[data-action="boardMenu"]').click();page.locator('[data-action="selectBoard"][data-value="Main board"]').click()
 ck('main_board_scroll_persists',page.locator('.grid-wrap').get_attribute('data-navigation')=='scroll')
 ck('main_board_grid_persists',page.locator('.grid-wrap').get_attribute('data-grid')=='3x4')
 ck('no_pad_menus_if_edit_closed',page.locator('.pad-menu-trigger').count()==15) # remains edit after selecting board
 page.locator('[data-action="editBoard"]').click()
 ck('normal_mode_hide_pad_more',page.locator('.pad-menu-trigger').count()==0)
 ck('quick_arrow_hidden',page.locator('.quick-arrow').count()==0)
 # Search reset: expect count 1 and no pagination or more
 page.locator('#search-board').fill('Bruh')
 ck('search_filters_in_scroll',page.locator('.grid-wrap>.sound-pad').count()==2)
 ck('search_quick_first',page.locator('.grid-wrap>.sound-pad.quick').count()==1)
 page.locator('#search-board').fill('')
 ck('search_cleared_load_initial',page.locator('.grid-wrap>.sound-pad').count()==12)
 # Auto scroll sentinel: browser scroll bottom until observer fires
 page.locator('.screen').evaluate('el=>el.scrollTop=el.scrollHeight')
 page.wait_for_function('state.boardLoaded["Main board"]===15',timeout=5000)
 ck('auto_load_at_bottom',page.locator('.grid-wrap>.sound-pad').count()==16)
 # Sound playback regressions
 page.locator('[data-action="playSound"]').first.click()
 ck('stop_all',page.locator('[data-action="stopAll"]').count()==1)
 ck('progress',page.locator('.pad-progress.is-visible').count()==1)
 page.locator('[data-action="stopAll"]').click()
 # Check settings no new global controls
 page.locator('[data-action="settingsMenu"]').click();page.locator('[data-action="openSettings"]').click()
 ck('no_board_navigation_in_global_settings',page.locator('.settings-screen').get_by_text('Scroll').count()==0)
 ck('existing_master_volume',page.locator('#master-volume').count()==1)
 ck('errors_none',not errors)
 page.locator('[data-action="closeSettings"]').click()
 # visual themes, screenshots for board-edit and normal
 for theme in ['Peach','Mint','Snow','Ice','Vanilla','Coffee']:
  page.locator('#theme-select').select_option(theme)
  page.locator('[data-action="editBoard"]').click()
  ck('navigation_ui_'+theme,page.locator('[data-action="setBoardNavigation"]').count()==2)
  page.locator('[data-action="editBoard"]').click()
 results['javascriptErrors']=errors
 browser.close()
(root/'design/board-navigation-validation.json').write_text(json.dumps(results,indent=2))
print('ALL CHECKS PASSED',len(results)-1)
