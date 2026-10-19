from pathlib import Path
from PIL import Image, ImageDraw, ImageFont
root=Path(__file__).resolve().parents[1]
p=root/'previews'
font_path='/usr/share/fonts/truetype/dejavu/DejaVuSans.ttf'
bold_path='/usr/share/fonts/truetype/dejavu/DejaVuSans-Bold.ttf'
f=ImageFont.truetype(bold_path,29)
f2=ImageFont.truetype(font_path,18)
fs=ImageFont.truetype(font_path,14)
def mosaic(files,names,filename,cols,cellw=265,cellh=560):
 rows=(len(files)+cols-1)//cols
 margin=30;head=90
 img=Image.new('RGB',(cols*cellw+(cols+1)*margin,rows*(cellh+70)+(rows+1)*margin+head),'#F7F3FF')
 d=ImageDraw.Draw(img)
 d.text((margin,23),'Stimmyz · visual implementation reference',font=f,fill='#281C45')
 d.text((margin,60),'Captured from the rebuilt interactive HTML — no separate static layout',font=fs,fill='#6A5E87')
 for i,(file,name) in enumerate(zip(files,names)):
  x=margin+(i%cols)*(cellw+margin)
  y=head+margin+(i//cols)*(cellh+70+margin)
  t=Image.open(p/file).convert('RGB')
  t.thumbnail((cellw,cellh),Image.Resampling.LANCZOS)
  x1=x+(cellw-t.width)//2
  img.paste(t,(x1,y))
  d.text((x+10,y+cellh+9),name,font=f2,fill='#241A40')
 img.save(p/filename,optimize=True)
 print(filename,img.size)
mosaic([f'01-board-{x}.png' for x in ['peach','mint','snow','ice','vanilla','coffee']],['Peach','Mint','Snow','Ice','Vanilla','Coffee'],'00-six-theme-comparison.png',3,cellw=265,cellh=550)
mosaic(['01-board-coffee.png','05-editor-personal-coffee.png','00-library-initial-coffee.png'],['Board (Coffee)','Editor / Source (personal)','Library (Coffee)'],'00-three-main-screens.png',3,cellw=330,cellh=700)
mosaic(['06-trim-coffee.png','07-trim-fine-coffee.png','08-customize-coffee.png'],['Trim · drag handles','Trim · fine tune expanded','Customize · optional art'],'00-create-flow.png',3,cellw=310,cellh=670)
