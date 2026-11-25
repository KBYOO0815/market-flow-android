"""Smoke-check the four Market Flow sections on an installed Android APK.
Does not assume any specific live market/news edition exists yet.
"""
from pathlib import Path
import re
import subprocess
import time
import xml.etree.ElementTree as ET

out=Path('evidence')
out.mkdir(exist_ok=True)
def adb(*args):
    return subprocess.run(['adb', *args], capture_output=True, check=True).stdout
def snapshot(name):
    adb('shell','uiautomator','dump','/sdcard/market-flow-ui.xml')
    target=out/(name+'.xml')
    adb('pull','/sdcard/market-flow-ui.xml',str(target))
    (out/(name+'.png')).write_bytes(adb('exec-out','screencap','-p'))
    return list(ET.parse(target).iter('node'))
def tap_text(nodes, value):
    matches=[n for n in nodes if n.get('text')==value and n.get('clickable')=='true']
    if not matches:
        matches=[n for n in nodes if n.get('text')==value]
    assert matches, f'Missing accessible tab: {value}'
    box=matches[0].get('bounds','')
    coords=list(map(int,re.findall(r'\d+',box)))
    assert len(coords)==4, box
    x1,y1,x2,y2=coords
    adb('shell','input','tap',str((x1+x2)//2),str((y1+y2)//2))
    time.sleep(3)
nodes=snapshot('market')
labels=[n.get('text','') for n in nodes]
assert 'Market Flow' in labels, 'Market Flow toolbar missing'
for tab in ('시황','뉴스','특징주','기업분석'):
    assert tab in labels, f'Missing tab {tab}'
assert any('시황' in label for label in labels), 'Market screen unavailable'
assert any(label.startswith('데이터 기준:') for label in labels), 'Market data-basis header missing'
assert any(label in ('6:10','6:40','7:10','8:10','9:10','10:10','11:10','12:10','13:10','14:10','15:40','17:10','18:10','19:10','20:10','23:10') for label in labels), 'Market three-position dial missing'
for tab,label in [('뉴스','news'),('특징주','featured'),('기업분석','analysis'),('시황','market-return')]:
    tap_text(nodes,tab)
    nodes=snapshot(label)
    assert any(n.get('text')=='Market Flow' for n in nodes), f'App missing after switching to {tab}'
    if tab == '시황':
        assert any((n.get('text') or '').startswith('데이터 기준:') for n in nodes), 'Market data basis missing after tab return'
    adb('shell','pidof','com.kbyoo0815.marketflow')
    assert not any('has stopped' in n.get('text','') for n in nodes), f'Crash dialog after {tab}'
print('PASS: Market Flow Android launches and navigates 시황/뉴스/특징주/기업분석.')
