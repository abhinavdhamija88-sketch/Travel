"""Build a browser-compatible offline demo, without imports or credentials."""
from pathlib import Path
import re
import base64
root = Path(__file__).resolve().parents[1] / 'public'
html = (root / 'index.html').read_text()
search = re.sub(r'^export (?=(?:const|function) )', '', (root / 'search.js').read_text(), flags=re.M)
app = re.sub(r'^import .*?;\s*', '', (root / 'app.js').read_text(), flags=re.M)
script = search + '\n' + app
assert not re.search(r'^\s*(import|export)\s', script, flags=re.M), 'Offline build contains module dependencies'
html = html.replace('<link rel="stylesheet" href="/style.css">', '<style>' + (root / 'style.css').read_text() + '</style>')
html = html.replace('<script type="module" src="/app.js"></script>', '<script>\n(function(){\nglobalThis.ATLAS_OFFLINE_DEMO=true;\n' + script + '\n})();\n</script>')
html = html.replace('href="/"', 'href="#"')
for image in (root / 'assets').glob('*.png'):
    encoded = base64.b64encode(image.read_bytes()).decode('ascii')
    html = html.replace(f'src="/assets/{image.name}"', f'src="data:image/png;base64,{encoded}"')
output = Path('/tmp/atlas-flight-demo-v4.html')
output.write_text(html)
print(f'Created {output}')
