"""Regenerate index.html's import map from src/*.js and the release id in sw.js.
Run after adding or renaming a module: python3 scripts/sync-importmap.py [new-release-id]"""
import json,os,re,sys
from pathlib import Path
root=Path(__file__).resolve().parent.parent
sw=(root/'sw.js').read_text()
release=sys.argv[1] if len(sys.argv)>1 else re.search(r'const RELEASE="([^"]+)"',sw).group(1)
old=re.search(r'const RELEASE="([^"]+)"',sw).group(1)
html=(root/'index.html').read_text().replace(old,release)
(root/'sw.js').write_text(sw.replace(old,release))
mods=sorted(f for f in os.listdir(root/'src') if f.endswith('.js') and f!='main.js')
imports={f'./src/{f}':f'./src/{f}?v={release}' for f in mods}
html=re.sub(r'<script type="importmap">.*?</script>','<script type="importmap">'+json.dumps({'imports':imports},separators=(',',':'))+'</script>',html,count=1,flags=re.S)
(root/'index.html').write_text(html)
print(f'import map: {len(imports)} modules, release {release}')
