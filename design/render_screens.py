"""Create portable SVG UI artboards and PNG previews for the MASS design handoff.
Run: python design/render_screens.py (cairosvg and Pillow required for PNGs).
SVG output requires only Python's standard library.
"""
from pathlib import Path
from html import escape
import math

ROOT=Path(__file__).parent
OUT=ROOT/'screens'; OUT.mkdir(exist_ok=True)
C={'bg':'#151917','surface':'#1d2420','raised':'#252e28','line':'#343d35','text':'#f2f3eb','muted':'#a0aba1','soft':'#77877a','accent':'#c5f17c','ink':'#172017','danger':'#e9a49b'}
W,H=390,844
class SVG:
 def __init__(self,name):
  self.name=name;self.parts=[f'<svg xmlns="http://www.w3.org/2000/svg" width="390" height="844" viewBox="0 0 390 844" role="img" aria-label="MASS mobile weight tracker {escape(name)} screen">','<defs><linearGradient id="grad" x1="0" x2="0" y1="0" y2="1"><stop stop-color="#c5f17c" stop-opacity=".23"/><stop offset="1" stop-color="#c5f17c" stop-opacity="0"/></linearGradient></defs>']
  self.r(0,0,W,H,C['bg'])
 def r(self,x,y,w,h,fill,stroke=None,sw=1,rx=0):
  self.parts.append(f'<rect x="{x}" y="{y}" width="{w}" height="{h}" rx="{rx}" fill="{fill}"'+(f' stroke="{stroke}" stroke-width="{sw}"' if stroke else '')+'/>')
 def l(self,x1,y1,x2,y2,color=None,sw=1,dash=None):
  self.parts.append(f'<line x1="{x1}" y1="{y1}" x2="{x2}" y2="{y2}" stroke="{color or C["line"]}" stroke-width="{sw}"'+(f' stroke-dasharray="{dash}"' if dash else '')+'/>')
 def t(self,x,y,s,size=12,color=None,weight=400,family='Arial,sans-serif',anchor='start',ls=None):
  self.parts.append(f'<text x="{x}" y="{y}" font-family="{family}" font-size="{size}" fill="{color or C["text"]}" font-weight="{weight}" text-anchor="{anchor}"'+(f' letter-spacing="{ls}"' if ls else '')+f'>{escape(s)}</text>')
 def p(self,d,color=None,fill='none',sw=1.8):self.parts.append(f'<path d="{d}" stroke="{color or C["accent"]}" fill="{fill}" stroke-width="{sw}" stroke-linecap="round" stroke-linejoin="round"/>')
 def c(self,x,y,r,fill,opacity=None):self.parts.append(f'<circle cx="{x}" cy="{y}" r="{r}" fill="{fill}"'+(f' opacity="{opacity}"' if opacity is not None else '')+'/>')
 def done(self):
  self.parts.append('</svg>'); p=OUT/self.name;p.write_text(''.join(self.parts),encoding='utf-8');return p

def header(s,settings=True):
 s.r(26,33,4,15,C['accent']);s.r(33,38,4,10,C['accent']);s.r(40,29,4,19,C['accent'])
 s.t(57,48,'mass',24,weight=750,ls=-1.1);s.t(110,48,'.',24,C['accent'],750)
 if settings:
  s.r(333,26,34,34,C['bg'],C['line']);s.l(341,37,359,37,C['text'],1.7);s.l(341,49,359,49,C['text'],1.7);s.l(346,33,346,41,C['text'],1.7);s.l(355,45,355,53,C['text'],1.7)

def htitle(s,label,title):
 s.t(27,105,label,10,C['muted'],700,ls=1.5)
 s.t(27,158,title,46,C['text'],400,'Georgia,serif',ls=-1.4)
 s.c(min(351,30+len(title)*22),150,3,C['accent'])

def stat(s,x,y,label,num,foot):
 s.r(x,y,164,100,C['surface'],C['line'])
 s.t(x+14,y+20,label,10,C['muted'],700,ls=1)
 s.t(x+14,y+59,num,25,C['accent'],650,ls=-.6)
 s.t(x+14,y+82,foot,10,C['muted'])

def bottom(s,active='overview'):
 s.r(0,766,390,78,'#1b211d');s.l(0,766,390,766,C['line'])
 col=C['accent'] if active=='overview' else C['muted'];s.p('M62 799 L71 791 L80 799 V814 H62 Z',col,sw=1.4);s.p('M68 814 V803 H74 V814',col,sw=1.3);s.t(71,831,'Overview',10,col,600,anchor='middle')
 s.r(170,752,50,50,C['accent']);s.l(184,777,206,777,C['ink'],2);s.l(195,766,195,788,C['ink'],2)
 col=C['accent'] if active=='history' else C['muted'];s.p('M310 790 V815 H331 M314 808 L321 800 L326 804 L332 794',col,sw=1.7);s.t(320,831,'History',10,col,600,anchor='middle')

def overview(empty=False):
 s=SVG('06-empty-state.svg' if empty else '01-overview.svg');header(s);s.t(27,101,'WEDNESDAY · 28 OCT',10,C['muted'],700,ls=1.1)
 if not empty:s.r(283,85,82,21,C['bg'],'#53683e');s.t(324,99,'SAMPLE DATA',8,C['accent'],600,anchor='middle',ls=.8)
 s.t(27,150,'Your progress',45,C['text'],400,'Georgia,serif',ls=-1.6);s.t(300,150,'.',45,C['accent'],400,'Georgia,serif')
 s.t(27,189,'LATEST RECORDED WEIGHT',10,C['muted'],700,ls=1.3)
 s.t(27,270,'—' if empty else '62.4',84,C['text'],450,ls=-4)
 s.t(173 if empty else 224,268,'kg',26,C['muted'])
 s.t(27,295,'No entries yet. Start with today.' if empty else 'Last recorded on 28 Oct 2026',12,C['muted'])
 s.l(27,313,363,313)
 stat(s,27,328,'TOTAL CHANGE','—' if empty else '+2.4 kg','In selected period')
 stat(s,199,328,'AVG. PER WEEK','—' if empty else '+0.2 kg','Change per week')
 s.t(27,470,'Weight over time',17,C['text'],600);s.t(363,470,'0 entries' if empty else '10 entries',11,C['soft'],anchor='end')
 s.r(27,488,336,39,C['bg'],C['line'])
 for i,label in enumerate(['7D','30D','3M','6M','1Y','All']):
  x=31+i*55.4
  if i==2:s.r(x,492,53,31,C['accent'])
  s.t(x+26.5,512,label,11,C['ink'] if i==2 else C['muted'],700,anchor='middle')
 if not empty:
  ys=[641,627,637,612,622,587,599,559,574,539];xs=[35,63,88,122,158,195,232,271,307,335]
  for y in [549,588,627,665]:s.l(27,y,363,y,'#344138',1,'2 5')
  s.p('M '+' L '.join(f'{x} {y}' for x,y in zip(xs,ys))+f' L {xs[-1]} 666 L {xs[0]} 666 Z',color='none',fill='url(#grad)',sw=0)
  s.p('M '+' L '.join(f'{x} {y}' for x,y in zip(xs,ys)),C['accent'],sw=2.6)
  for x,y in zip(xs,ys):s.c(x,y,2.6,C['accent'])
  s.c(xs[-1],ys[-1],9,C['accent'],.2);s.c(xs[-1],ys[-1],4.3,C['accent'])
  s.t(27,696,'01 Aug',10,C['muted']);s.t(195,696,'14 Sep',10,C['muted'],anchor='middle');s.t(363,696,'28 Oct',10,C['muted'],anchor='end')
 else:
  s.r(27,547,336,151,C['surface'],C['line']);s.t(195,596,'Your chart starts here',17,C['text'],600,anchor='middle');s.t(195,624,'Log your first weight to begin tracking.',11,C['muted'],anchor='middle')
 s.l(27,716,363,716);s.t(27,742,'Last entry' if not empty else 'Ready when you are',16,C['text'],600)
 bottom(s);return s.done()

def history():
 s=SVG('03-history.svg');header(s);htitle(s,'THE RECORD','History');s.t(27,184,'Every check-in, all in one place.',13,C['muted'])
 s.r(27,209,336,91,C['surface'],C['line']);s.l(195,209,195,300)
 s.t(43,234,'TOTAL ENTRIES',10,C['muted'],700,ls=1);s.t(43,277,'10',29,C['text'],600)
 s.t(211,234,'FIRST LOGGED',10,C['muted'],700,ls=1);s.t(211,277,'01 Aug',26,C['text'],600)
 s.t(27,341,'OCTOBER 2026',11,C['muted'],700,ls=1.1)
 rows=[(28,'Wednesday','62.4 kg','+0.4 kg'),(20,'Tuesday','62.0 kg','−0.1 kg'),(10,'Saturday','62.1 kg','+0.7 kg'),(1,'Thursday','61.4 kg','−0.2 kg')]
 y=356
 for day,dow,weight,delta in rows:
  s.l(27,y,363,y);s.t(27,y+43,f'{day:02d}',28,C['text'],400,'Georgia,serif');s.t(72,y+29,dow,12,C['text'],600);s.t(72,y+47,f'{day:02d} October 2026',10,C['muted']);s.t(363,y+28,weight,16,C['text'],600,anchor='end');s.t(363,y+46,delta,10,C['danger'] if delta.startswith('−') else C['accent'],anchor='end');y+=77
 s.l(27,y,363,y);s.t(27,703,'SEPTEMBER 2026',11,C['muted'],700,ls=1);bottom(s,'history');return s.done()

def settings():
 s=SVG('04-settings.svg');header(s);htitle(s,'MAKE IT YOURS','Settings');s.t(27,184,'A few things, just how you like them.',13,C['muted'])
 s.t(27,238,'PREFERENCES',10,C['muted'],700,ls=1.3);s.l(27,251,363,251);s.t(27,280,'Weight units',14,C['text'],600);s.t(27,301,'Choose how weights are displayed',11,C['muted'])
 s.r(270,261,93,41,C['bg'],C['line']);s.r(274,265,41,33,C['accent']);s.t(295,286,'kg',12,C['ink'],600,anchor='middle');s.t(340,286,'lb',12,C['muted'],600,anchor='middle');s.l(27,318,363,318)
 s.t(27,370,'YOUR DATA',10,C['muted'],700,ls=1.3);s.l(27,383,363,383)
 s.t(27,413,'Export to CSV',14,C['text'],600);s.t(27,433,'Keep a copy of your entries',11,C['muted']);s.p('M345 423 L359 409 M350 409 H359 V418',C['accent'],sw=1.8);s.l(27,453,363,453)
 s.t(27,484,'Clear all entries',14,C['danger'],600);s.t(27,504,'Permanently remove saved weights',11,C['muted']);s.p('M345 491 L359 477 M350 477 H359 V486',C['danger'],sw=1.8);s.l(27,526,363,526)
 s.r(27,571,336,122,C['surface'],C['line']);s.p('M48 592 V608 M40 600 H56 M43 595 L53 605 M53 595 L43 605',C['accent'],sw=1.7);s.t(80,602,'Private by design',14,C['text'],600);s.t(80,625,'Your entries are stored in this browser,',11,C['muted']);s.t(80,644,'on this device. Nothing is uploaded',11,C['muted']);s.t(80,663,'to a server by this prototype.',11,C['muted'])
 s.t(27,736,'MASS / DESIGN PROTOTYPE / V1.0',9,C['soft'],700,ls=1);bottom(s,'settings');return s.done()

def onboarding():
 s=SVG('05-onboarding.svg');header(s,False)
 s.r(27,91,336,191,C['surface'],C['line']);
 for y in [134,180,226]:s.l(43,y,348,y,'#344138',1,'2 5')
 xs=[43,75,111,143,175,207,240,272,314,348];ys=[246,242,228,231,207,207,178,184,151,116]
 s.p('M '+' L '.join(f'{x} {y}' for x,y in zip(xs,ys))+' L 348 280 L 43 280 Z',color='none',fill='url(#grad)',sw=0)
 s.p('M '+' L '.join(f'{x} {y}' for x,y in zip(xs,ys)),C['accent'],sw=3)
 s.c(348,116,8,C['accent'],.18);s.c(348,116,4,C['accent'])
 s.t(27,328,'A SMALL HABIT, A CLEARER PICTURE',10,C['muted'],700,ls=1)
 s.t(27,385,'Track the',47,C['text'],400,'Georgia,serif');s.t(27,434,'little changes',47,C['text'],400,'Georgia,serif');s.t(336,434,'.',47,C['accent'],400,'Georgia,serif')
 s.t(27,469,'One number a day. A better understanding',13,C['muted']);s.t(27,487,'of your progress over time.',13,C['muted'])
 s.t(27,529,'PREFERRED UNIT',10,C['muted'],700,ls=1.3)
 s.r(27,541,162,54,C['surface'],C['accent']);s.r(198,541,165,54,C['surface'],C['line'])
 s.t(41,574,'Kilograms',13,C['text'],600);s.t(176,574,'kg',11,C['accent'],600,anchor='end');s.t(212,574,'Pounds',13,C['text'],600);s.t(349,574,'lb',11,C['muted'],600,anchor='end')
 s.t(27,630,'STARTING WEIGHT  (OPTIONAL)',10,C['muted'],700,ls=1.1)
 s.r(27,640,336,52,C['surface'],C['line']);s.t(43,670,'e.g. 60.0',14,C['soft']);s.t(348,670,'kg',13,C['muted'],anchor='end')
 s.r(27,714,336,53,C['accent']);s.t(44,746,'Get started',14,C['ink'],700);s.p('M331 750 L348 733 M337 733 H348 V744',C['ink'],sw=2)
 s.t(195,790,'No account needed. Your data stays in your browser.',10,C['soft'],anchor='middle')
 return s.done()

def log():
 s=SVG('02-log-weight.svg');header(s);s.t(27,150,'Your progress',45,C['text'],400,'Georgia,serif');s.t(27,225,'62.4',81,C['text']);stat(s,27,306,'TOTAL CHANGE','+2.4 kg','In selected period');stat(s,199,306,'AVG. PER WEEK','+0.2 kg','Change per week')
 s.r(0,0,390,844,'#050706');s.parts[-1]=s.parts[-1].replace('fill="#050706"','fill="#050706" opacity="0.77"')
 s.r(0,253,390,591,C['bg'], '#55644e');s.r(172,264,46,3,'#51634f')
 s.t(27,317,'DAILY CHECK-IN',10,C['muted'],700,ls=1.4);s.t(27,363,'Log weight',39,C['text'],400,'Georgia,serif');s.t(227,363,'.',39,C['accent'],400,'Georgia,serif')
 s.r(331,297,32,32,C['bg'],C['line']);s.p('M340 305 L355 320 M355 305 L340 320',C['text'],sw=1.7)
 s.t(27,409,'WEIGHT',10,C['muted'],700,ls=1.4);s.t(27,490,'62.4',75,C['text'],450,ls=-3);s.t(343,487,'kg',22,C['muted'],anchor='end');s.l(27,510,363,510,C['accent'],2)
 s.t(27,549,'DATE',10,C['muted'],700,ls=1.2);s.r(27,563,336,53,C['surface'],C['line']);s.t(43,596,'28 October 2026',14,C['text']);s.r(332,579,16,14,'none',C['muted']);s.l(332,584,348,584,C['muted']);s.l(336,577,336,581,C['muted']);s.l(344,577,344,581,C['muted'])
 s.t(27,643,'Previous measurement: 62.0 kg on 20 Oct',12,C['muted'])
 s.r(27,680,336,57,C['accent']);s.t(44,714,'Save measurement',14,C['ink'],700);s.p('M331 718 L348 701 M337 701 H348 V712',C['ink'],sw=2)
 return s.done()

paths=[overview(),log(),history(),settings(),onboarding(),overview(True)]
print('Generated',len(paths),'SVG artboards')
try:
 import cairosvg
 for p in paths:cairosvg.svg2png(url=str(p),write_to=str(ROOT/'previews'/p.name.replace('.svg','.png')),output_width=780,output_height=1688)
 print('Generated PNG previews')
except ImportError:print('Install cairosvg to render optional PNG previews')
try:
 from PIL import Image,ImageDraw,ImageFont
 thumbs=[]
 for p in paths:
  f=ROOT/'previews'/p.name.replace('.svg','.png')
  if f.exists():
   im=Image.open(f).convert('RGB');im.thumbnail((390,844));thumbs.append((p.name,im))
 if thumbs:
  cols=3;cellw=430;cellh=928;rows=math.ceil(len(thumbs)/cols)
  sheet=Image.new('RGB',(cols*cellw+40,rows*cellh+70),'#0f1210');d=ImageDraw.Draw(sheet)
  d.text((32,17),'MASS / MOBILE DESIGN ARTBOARDS',fill='#f2f3eb')
  for i,(name,im) in enumerate(thumbs):
   x=30+(i%cols)*cellw;y=52+(i//cols)*cellh
   sheet.paste(im,(x,y));d.text((x,y+852),name.replace('.svg','').upper(),fill='#c5f17c')
  sheet.save(ROOT/'contact-sheet.png')
  print('Generated contact sheet')
except ImportError: pass
