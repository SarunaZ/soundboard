import base64, json, re
from pathlib import Path
root=Path(__file__).resolve().parents[1]
folder=root/'prototype'
html=(folder/'index.html').read_text()
css=(folder/'app.css').read_text()
js=(folder/'app.js').read_text()
files={p.name:'data:image/png;base64,'+base64.b64encode(p.read_bytes()).decode() for p in (folder/'assets').glob('*.png')}
js='const embeddedAssets='+json.dumps(files)+';\n'+js
js=js.replace('src="assets/stimmyz-logo-transparent.png"', f'src="{files["stimmyz-logo-transparent.png"]}"')
js=js.replace("`assets/${s.file||'yippee.png'}`","embeddedAssets[s.file||'yippee.png']")
js=js.replace('`<img src="assets/${esc(state.artChoice)}" alt="Selected artwork preview"/>`', '`<img src="${embeddedAssets[state.artChoice]}" alt="Selected artwork preview"/>`')
js=js.replace('`<img src="assets/${esc(state.artChoice)}" alt="Selected artwork preview"/>`', '`<img src="${embeddedAssets[state.artChoice]}" alt="Selected artwork preview"/>`')
html=html.replace('<link rel="stylesheet" href="app.css" />','<style>'+css+'</style>')
html=html.replace('<script src="app.js"></script>','<script>'+js+'</script>')
# Replace optional relative links with reference filenames. Browsers can access files if extracted from ZIP.
(folder/'standalone.html').write_text(html)
print('Standalone:', len(html),'characters; assets:',len(files))
