"""Pack only the offline runtime, with index.html at the ZIP root."""
from pathlib import Path
from zipfile import ZipFile, ZIP_DEFLATED
from html.parser import HTMLParser
root=Path(__file__).resolve().parent.parent
source=root/'dist/minitool'
target=root/'delivery/rasengan-lab-minitool.zip'
allowed={'.html','.css','.js','.json','.png','.jpg','.jpeg','.webp','.svg','.woff','.woff2','.ttf','.mp3','.wav','.ogg'}
class Check(HTMLParser):
    def handle_starttag(self,tag,attrs):
        attrs=dict(attrs)
        assert not any(k.lower().startswith('on') for k in attrs), 'Inline event handler'
        assert tag not in {'iframe','base'}, 'Unsupported HTML element'
        if tag=='script':
            assert attrs.get('src') and attrs.get('type')!='module', 'External classic scripts required'
        for key in ('src','href'):
            if key in attrs:
                value=attrs[key]
                assert not value.startswith(('http:','https:','//','data:','/')), 'External asset'
                asset=(source/value).resolve()
                assert asset.is_relative_to(source.resolve()) and asset.is_file(), 'Missing asset: '+value
Check().feed((source/'index.html').read_text())
files=sorted(p for p in source.rglob('*') if p.is_file())
assert all(p.suffix in allowed for p in files)
target.parent.mkdir(exist_ok=True)
with ZipFile(target,'w',ZIP_DEFLATED,compresslevel=9) as archive:
    for path in files: archive.write(path,path.relative_to(source).as_posix())
assert target.stat().st_size<=10*1024*1024
print(f'{target}\n{len(files)} files, {target.stat().st_size} bytes')
