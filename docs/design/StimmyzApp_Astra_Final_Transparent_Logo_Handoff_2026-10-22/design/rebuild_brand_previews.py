"""Recreate all screenshots that display Board, Editor or Library; final transparent logo version."""
from pathlib import Path
import base64
from PIL import Image,ImageDraw,ImageFont
from playwright.sync_api import sync_playwright
root=Path(__file__).resolve().parents[1]
out=root/'previews';out.mkdir(exist_ok=True)

with sync_playwright() as p:
 b=p.chromium.launch(executable_path='/usr/bin/chromium',headless=True,args=['--no-sandbox','--disable-dev-shm-usage'])
 page=b.new_page(viewport={'width':1300,'height':1030},device_scale_factor=1)
 page.set_default_timeout(7000)
 errors=[];page.on('pageerror',lambda e:errors.append(str(e)))
 page.set_content((root/'prototype/standalone.html').read_text(),wait_until='load')
 def set_board(theme='Vanilla',grid='4x4',navigation='pages',edit=False,board_page=0):
  page.evaluate('''({theme,grid,navigation,edit,page})=>{
  state.theme=theme;state.page='board';state.edit=edit;state.menu=null;
  state.search='';state.boardGrid[state.board]=grid;
  state.boardNavigation[state.board]=navigation;state.boardPages[state.board]=page;
  state.boardLoaded[state.board]=grid==='3x4'?11:15;render(false);
  }''',{'theme':theme,'grid':grid,'navigation':navigation,'edit':edit,'page':board_page})
 def set_tab(tab,theme):
  page.evaluate('''({tab,theme})=>{state.theme=theme;state.page=tab;state.edit=false;state.menu=null;state.activeCreation=false;render(false)}''',{'tab':tab,'theme':theme})
 def shot(name):page.locator('.device').screenshot(path=str(out/name))
 for theme in ['Peach','Mint','Snow','Ice','Vanilla','Coffee']:
  low=theme.lower()
  set_board(theme=theme)
  shot(f'board-4x4-{low}.png')
  shot(f'brand-board-{low}.png')
  set_board(theme=theme,grid='3x4',navigation='pages')
  shot(f'board-pages-3x4-{low}.png')
  set_board(theme=theme,grid='3x4',navigation='scroll')
  shot(f'board-scroll-3x4-{low}.png')
  for tab in ['editor','library']:
   set_tab(tab,theme)
   shot(f'transparent-{tab}-{low}.png')
   if theme=='Coffee':shot(f'brand-{tab}-coffee.png')
  if theme in ['Vanilla','Coffee']:
   set_tab('board',theme)
   shot(f'transparent-board-{low}.png')
 for theme in ['Vanilla','Coffee']:
  low=theme.lower()
  set_board(theme=theme,grid='4x4',navigation='pages')
  shot(f'board-pages-4x4-{low}.png')
  set_board(theme=theme,grid='3x4',navigation='pages')
  shot(f'board-normal-3x4-{low}.png')
  shot(f'board-normal-3x4-{low}.png')
  set_board(theme=theme,grid='3x4',navigation='pages',edit=True)
  shot(f'edit-board-3x4-{low}.png')
  set_board(theme=theme,grid='3x4',navigation='pages',edit=True,board_page=1)
  shot(f'board-pages-3x4-page2-{low}.png')
  shot(f'edit-board-3x4-page2-{low}.png')
  shot(f'board-edit-3x4-page2-{low}.png')
 set_board(theme='Coffee',grid='4x4',edit=True)
 shot('board-edit-4x4-coffee.png');shot('edit-board-4x4-coffee.png')
 set_board(theme='Coffee',grid='3x4',edit=True)
 shot('board-edit-3x4-coffee.png')
 page.locator('[data-action="padMenu"]').first.click()
 shot('board-pad-menu-edit-only-coffee.png')
 set_board(theme='Vanilla',grid='4x4',navigation='scroll')
 shot('board-scroll-4x4-vanilla.png')
 set_board(theme='Vanilla',grid='3x4',navigation='scroll')
 shot('board-scroll-normal-vanilla.png')
 set_board(theme='Coffee');shot('board-coffee-wordmark.png');shot('approved-board-coffee.png')
 set_board(theme='Vanilla');shot('board-vanilla-wordmark.png');shot('approved-board-vanilla.png')
 page.set_viewport_size({'width':375,'height':812})
 for theme in ['Vanilla','Coffee']:
  set_board(theme=theme,grid='3x4',navigation='scroll',edit=True)
  shot(f'board-scroll-edit-mobile-{theme.lower()}.png')
  if theme=='Vanilla':shot('edit-board-3x4-mobile-vanilla.png')
 page.set_viewport_size({'width':1300,'height':1030})
 # real light/dark transparent showcase derived from latest brand-preview.html
 brand=b.new_page(viewport={'width':1180,'height':1050},device_scale_factor=1)
 brand_html=(root/'prototype/brand-preview.html').read_text()
 uri='data:image/png;base64,'+base64.b64encode((root/'prototype/assets/stimmyz-logo-transparent.png').read_bytes()).decode()
 brand_html=brand_html.replace('src="assets/stimmyz-logo-transparent.png"','src="'+uri+'"')
 brand.set_content(brand_html,wait_until='load')
 brand.screenshot(path=str(out/'brand-showcase.png'),full_page=True)
 brand.screenshot(path=str(out/'transparent-logo-light-dark.png'),full_page=True)
 brand.close()
 assert not errors,errors
 b.close()

# current comparisons + overview; all screenshots from real interactive prototype
fontpath='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
smallfont=ImageFont.truetype(fontpath,20)
headingfont=ImageFont.truetype(fontpath,34)
names=[('BOARD / VANILLA','transparent-board-vanilla.png'),('EDITOR / VANILLA','transparent-editor-vanilla.png'),('LIBRARY / COFFEE','transparent-library-coffee.png')]
imgs=[Image.open(out/f).convert('RGB') for _,f in names]
target_w=340; margin=27; cap=50
resized=[]
for im in imgs:
 h=round(im.height*target_w/im.width)
 resized.append(im.resize((target_w,h),Image.Resampling.LANCZOS))
w=target_w*3+margin*4
h=max(im.height for im in resized)+cap+margin*2
sheet=Image.new('RGB',(w,h),(242,245,253))
d=ImageDraw.Draw(sheet)
for i,((label,_),im) in enumerate(zip(names,resized)):
 x=margin+i*(target_w+margin)
 d.text((x+8,margin+5),label,fill=(47,43,75),font=smallfont)
 sheet.paste(im,(x,margin+cap))
sheet.save(out/'00-final-three-tabs.png')
# themes
names=['Peach','Mint','Snow','Ice','Vanilla','Coffee']
imgs=[Image.open(out/f'brand-board-{t.lower()}.png').convert('RGB') for t in names]
scale=.48; imgw=round(imgs[0].width*scale);imgh=round(imgs[0].height*scale)
pad=24;caption=44
sheet=Image.new('RGB',(imgw*3+pad*4,(imgh+caption)*2+pad*3),(242,245,249))
d=ImageDraw.Draw(sheet)
for i,(name,img) in enumerate(zip(names,imgs)):
 x=pad+(i%3)*(imgw+pad);y=pad+(i//3)*(imgh+caption+pad)
 d.text((x+8,y+5),name.upper(),fill=(27,36,58),font=smallfont)
 sheet.paste(img.resize((imgw,imgh),Image.Resampling.LANCZOS),(x,y+caption))
sheet.save(out/'00-brand-themes.png')
# nav sheet
names=[('PAGES / COFFEE','board-pages-3x4-coffee.png'),('SCROLL / COFFEE','board-scroll-3x4-coffee.png'),('EDIT BOARD','board-edit-3x4-coffee.png')]
imgs=[Image.open(out/f).convert('RGB') for _,f in names]
thumbs=[]
for im in imgs:
 t=im.copy();t.thumbnail((340,700),Image.Resampling.LANCZOS);thumbs.append(t)
W=sum(t.width for t in thumbs)+pad*4;H=max(t.height for t in thumbs)+pad*2+60
canvas=Image.new('RGB',(W,H),(244,245,249));dr=ImageDraw.Draw(canvas)
for i,(name,f) in enumerate(names):
 x=pad+sum(t.width for t in thumbs[:i])+pad*i;y=pad
 dr.text((x+4,y+11),name,fill=(26,40,48),font=smallfont)
 canvas.paste(thumbs[i],(x,y+60))
canvas.save(out/'00-board-navigation-comparison.png')
print('Updated final logo screenshots for six themes, all three tabs, and the existing board modes')
