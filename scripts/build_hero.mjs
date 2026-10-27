import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));

const MONO = "ui-monospace,'SF Mono','Cascadia Code',Consolas,'Liberation Mono',monospace";
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const SERIF = "'Songti SC','Noto Serif SC','Source Han Serif SC','SimSun',serif";

const SETS = {
  light: {
    paper:'#F7F4ED', paper2:'#EFEAE0', ink:'#15181C', muted:'#6E6A61',
    hair:'#D9D2C4', accent:'#C4402B', gridOp:0.5
  },
  dark: {
    paper:'#0B0C0E', paper2:'#121316', ink:'#F1EEE6', muted:'#8C877C',
    hair:'#24262B', accent:'#FF6A4D', gridOp:0.6
  }
};

const W = 1600, H = 620, M = 72;
const RX = 820;
const FLANGE_T = 190, FLANGE_H = 24, FLANGE_B = FLANGE_T + FLANGE_H;
const RIB_TOP = FLANGE_B, RIB_BOT = 448;
const RIB_TOP_W = 54, RIB_BOT_W = 38, RIB_PITCH = 120, RIB_COUNT = 6;
const RIB_C = [];
for (let i = 0; i < RIB_COUNT; i++) RIB_C.push(900 + i * RIB_PITCH);
const ACCENT_RIB = 3;

const R = (x,y,w,h,f,ex) => '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+f+'"'+(ex||'')+'/>';
const L = (x1,y1,x2,y2,s,w,ex) => '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+s+'" stroke-width="'+w+'"'+(ex||'')+'/>';
const P = (pts,f,ex) => '<polygon points="'+pts+'" fill="'+f+'"'+(ex||'')+'/>';
const PO = (pts,s,w,ex) => '<polygon points="'+pts+'" fill="none" stroke="'+s+'" stroke-width="'+w+'"'+(ex||'')+'/>';
const C = (cx,cy,r,f,ex) => '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+f+'"'+(ex||'')+'/>';
const CO = (cx,cy,r,s,w,ex) => '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="none" stroke="'+s+'" stroke-width="'+w+'"'+(ex||'')+'/>';
function T(x,y,size,fill,fam,weight,ls,text,anchor,op){
  return '<text x="'+x+'" y="'+y+'" font-family="'+fam+'" font-size="'+size+'" font-weight="'+(weight||400)+'" fill="'+fill+'"'
    +(ls?' letter-spacing="'+ls+'"':'')
    +(anchor?' text-anchor="'+anchor+'"':'')
    +(op?' opacity="'+op+'"':'')
    +'>'+text+'</text>';
}

function defs(c){
  return '<defs>'
    + '<pattern id="hatch" patternUnits="userSpaceOnUse" width="9" height="9" patternTransform="rotate(45)">'
    +   L(0,0,0,9,c.accent,1.1,' opacity="0.85"')
    + '</pattern>'
    + '</defs>';
}

function sheet(c){
  let s = R(0,0,W,H,c.paper);
  for (let i = 0; i <= 8; i++){
    const x = Math.round(M + i * ((W - 2*M) / 8));
    s += L(x, 34, x, H-34, c.hair, 1, ' opacity="'+(c.gridOp*0.16)+'"');
  }
  for (const y of [78, 528]) s += L(M, y, W-M, y, c.hair, 1, ' opacity="'+(c.gridOp*0.55)+'"');
  const a = 11, o = 34;
  const mk = (x,y,dx,dy)=>L(x,y,x+dx*a,y,c.muted,1,' opacity="0.5"') + L(x,y,x,y+dy*a,c.muted,1,' opacity="0.5"');
  s += mk(o,o,1,1) + mk(W-o,o,-1,1) + mk(o,H-o,1,-1) + mk(W-o,H-o,-1,-1);
  return s;
}

function slab(c){
  let s = '';

  s += PO(RX+','+FLANGE_T+' '+(W+80)+','+FLANGE_T+' '+(W+80)+','+FLANGE_B+' '+RX+','+FLANGE_B, c.ink, 1.6);
  for (let i = 0; i < RIB_COUNT; i++){
    const cx = RIB_C[i];
    s += L(cx - RIB_TOP_W/2, FLANGE_B, cx + RIB_TOP_W/2, FLANGE_B, c.ink, 1.6);
  }

  for (let i = 0; i < RIB_COUNT; i++){
    const cx = RIB_C[i];
    const t0 = cx - RIB_TOP_W/2, t1 = cx + RIB_TOP_W/2;
    const b0 = cx - RIB_BOT_W/2, b1 = cx + RIB_BOT_W/2;
    const pts = t0+','+RIB_TOP+' '+t1+','+RIB_TOP+' '+b1+','+RIB_BOT+' '+b0+','+RIB_BOT;
    if (i === ACCENT_RIB){
      s += P(pts, 'url(#hatch)');
      s += PO(pts, c.accent, 1.8);
    } else {
      s += PO(pts, c.ink, 1.6);
    }
    for (const dx of [-11, 0, 11]){
      s += CO(cx+dx, RIB_BOT-30, 3.1, c.ink, 1.1);
    }
    s += L(cx, RIB_TOP+6, cx, RIB_BOT-6, c.hair, 1, ' stroke-dasharray="2 5" opacity="0.9"');
  }

  s += T(RX, 116, 16, c.muted, MONO, 400, '2.4', 'FIG. 01 \u00b7 RIB SECTION');

  const dx0 = RIB_C[0], dx1 = RIB_C[RIB_COUNT-1], dy = 140;
  s += L(dx0, dy, dx1, dy, c.muted, 1);
  for (const x of [dx0, dx1]) s += L(x, dy-7, x, dy+7, c.muted, 1);
  for (let i = 1; i < RIB_COUNT-1; i++){
    const x = RIB_C[i];
    s += L(x, dy-3.5, x, dy+3.5, c.muted, 1, ' opacity="0.55"');
  }
  s += R((dx0+dx1)/2 - 30, dy-13, 60, 26, c.paper);
  s += T((dx0+dx1)/2, dy+6, 17, c.muted, MONO, 400, '2.4', '4200', 'middle');

  const vx = RX - 26;
  s += L(vx, FLANGE_T, vx, RIB_BOT, c.muted, 1);
  s += L(vx-6, FLANGE_T, vx+6, FLANGE_T, c.muted, 1);
  s += L(vx-6, RIB_BOT, vx+6, RIB_BOT, c.muted, 1);
  s += '<text x="'+(vx-13)+'" y="'+((FLANGE_T+RIB_BOT)/2)+'" font-family="'+MONO+'" font-size="17" letter-spacing="2.4" fill="'+c.muted+'" text-anchor="middle" transform="rotate(-90 '+(vx-13)+' '+((FLANGE_T+RIB_BOT)/2)+')">960</text>';

  const NOTES = [
    { i:0, text:'ribbed-floor',  dy:34 },
    { i:1, text:'farmland-soil', dy:52 },
    { i:3, text:'scrcpy-desk',   dy:34 },
    { i:5, text:'web',           dy:52 }
  ];
  for (const n of NOTES){
    const cx = RIB_C[n.i], ty = RIB_BOT + n.dy;
    s += L(cx, RIB_BOT, cx, ty-15, c.muted, 1, ' opacity="0.75"');
    s += C(cx, RIB_BOT, 2.4, c.muted);
    s += T(cx, ty, 17, c.muted, MONO, 400, '1.2', n.text, 'middle');
  }
  return s;
}

function typeBlock(c){
  let s = '';
  s += T(M, 64, 18, c.muted, MONO, 400, '3.2', 'iCXIN \u00b7 ENGINEERING PORTFOLIO');
  s += T(W-M, 64, 18, c.muted, MONO, 400, '2.6', 'SELECTED WORKS / 2024\u20132026', 'end');

  s += T(M-6, 300, 196, c.ink, SANS, 700, '-12', 'CXIN');
  s += R(M, 328, 104, 4, c.accent);
  s += L(M+112, 330, M+124, 330, c.accent, 1.4);

  s += T(M-2, 396, 46, c.ink, SERIF, 600, '2', '\u4ece\u50cf\u7d20\u5230\u6df7\u51dd\u571f\u3002');
  s += T(M+2, 434, 18, c.muted, MONO, 400, '2.8', 'FROM PIXELS TO CONCRETE');

  s += '<g class="pulse">'+R(M+1, 474, 9, 9, c.accent)+'</g>';
  s += T(M+22, 483, 17, c.muted, MONO, 400, '1.4', 'building scrcpy-desk');

  s += L(M, 512, M+150, 512, c.hair, 1);
  s += T(M, 536, 16, c.muted, MONO, 400, '2.6', 'STRUCTURE \u00b7 EDGE \u00b7 DESKTOP \u00b7 WEB');
  return s;
}

function furniture(c){
  let s = '';
  s += L(M, 566, W-M, 566, c.hair, 1);
  s += T(M, 592, 16, c.muted, MONO, 400, '2.2', 'SECTION A\u2013A \u00b7 RIBBED SLAB \u00b7 1:20');
  s += T(W-M, 592, 16, c.muted, MONO, 400, '2.2', 'SHEET 01 / 01', 'end');
  const rx = 36, ry = 462;
  s += '<text x="'+rx+'" y="'+ry+'" font-family="'+MONO+'" font-size="14" letter-spacing="4" fill="'+c.muted+'" opacity="0.8" transform="rotate(-90 '+rx+' '+ry+')">DRAWING NO. CX-2026-01</text>';
  return s;
}

const CSS = '.pulse{animation:pl 3.4s ease-in-out infinite}'
  + '@keyframes pl{0%,100%{opacity:.3}50%{opacity:1}}'
  + '@media (prefers-reduced-motion: reduce){*{animation:none !important}}';

function build(dark){
  const c = dark ? SETS.dark : SETS.light;
  const title = dark
    ? 'CXIN \u2014 dark drafting sheet: a fine-line ribbed slab section, one rib hatched in vermilion, beside the CXIN wordmark.'
    : 'CXIN \u2014 drafting sheet: a fine-line ribbed slab section, one rib hatched in vermilion, beside the CXIN wordmark.';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 620" width="1600" height="620" role="img">'
    + '<title>CXIN \u00b7 from pixels to concrete</title><desc>'+title+'</desc>'
    + '<style>'+CSS+'</style>'
    + defs(c)
    + sheet(c) + slab(c) + typeBlock(c) + furniture(c)
    + '</svg>';
}

const out = join(here, '..', 'assets') + '/';
writeFileSync(out+'hero-dark.svg', build(true), 'utf8');
writeFileSync(out+'hero-light.svg', build(false), 'utf8');
console.log('wrote hero v3 (1600x600)');
