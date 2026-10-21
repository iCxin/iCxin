import { writeFileSync } from 'node:fs';
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';

const here = dirname(fileURLToPath(import.meta.url));
const MONO = "ui-monospace,'SF Mono','Cascadia Code',Consolas,'Liberation Mono',monospace";
const SANS = "'Helvetica Neue',Helvetica,Arial,sans-serif";
const CJKF = "'PingFang SC','Hiragino Sans GB','Microsoft YaHei','Noto Sans SC',sans-serif";

const SETS = {
  light: { paper:'#F4F1EA', ink:'#101215', muted:'#6E6A62', hair:'#D5CEC0', accent:'#D93E24', gridOp:0.055 },
  dark:  { paper:'#0C0D0F', ink:'#F0EDE6', muted:'#8A857B', hair:'#23252A', accent:'#FF5C3A', gridOp:0.07 }
};

const W = 1600, H = 520, M = 64;
const COMB = { x0: 732, flangeY: 150, flangeH: 46, ribTop: 196, ribBot: 404, topW: 64, botW: 44, pitch: 128, ribs: 7 };
const CENTERS = [];
for (let i = 0; i < COMB.ribs; i++) CENTERS.push(COMB.x0 + i * COMB.pitch + COMB.topW / 2);

const R = (x,y,w,h,f,ex) => '<rect x="'+x+'" y="'+y+'" width="'+w+'" height="'+h+'" fill="'+f+'"'+(ex||'')+'/>';
const L = (x1,y1,x2,y2,s,w,ex) => '<line x1="'+x1+'" y1="'+y1+'" x2="'+x2+'" y2="'+y2+'" stroke="'+s+'" stroke-width="'+w+'"'+(ex||'')+'/>';
const P = (pts,f,ex) => '<polygon points="'+pts+'" fill="'+f+'"'+(ex||'')+'/>';
const C = (cx,cy,r,f,ex) => '<circle cx="'+cx+'" cy="'+cy+'" r="'+r+'" fill="'+f+'"'+(ex||'')+'/>';
function T(x,y,size,fill,fam,weight,ls,text,anchor,op){
  return '<text x="'+x+'" y="'+y+'" font-family="'+fam+'" font-size="'+size+'" font-weight="'+(weight||400)+'" fill="'+fill+'"'
    +(ls?' letter-spacing="'+ls+'"':'')
    +(anchor?' text-anchor="'+anchor+'"':'')
    +(op?' opacity="'+op+'"':'')
    +'>'+text+'</text>';
}

function grid(c){
  let s='';
  for(let i=0;i<=12;i++){
    const x = Math.round(M + i*((W-2*M)/12));
    s += L(x, 40, x, H-40, c.hair, 1, ' opacity="'+c.gridOp+'"');
  }
  return s;
}

function crops(c){
  const a=10, o=36, col=c.muted;
  const mk=(x,y,dx,dy)=>L(x,y,x+dx*a,y,col,1,' opacity="0.45"')+L(x,y,x,y+dy*a,col,1,' opacity="0.45"');
  return mk(o,o,1,1)+mk(W-o,o,-1,1)+mk(o,H-o,1,-1)+mk(W-o,H-o,-1,-1);
}

function comb(c){
  let s='';
  const right = W + 64;
  s += R(COMB.x0, COMB.flangeY, right-COMB.x0, COMB.flangeH, c.ink);
  for(let i=0;i<COMB.ribs;i++){
    const x = COMB.x0 + i*COMB.pitch;
    const inset = (COMB.topW-COMB.botW)/2;
    const pts = [x+','+COMB.ribTop, (x+COMB.topW)+','+COMB.ribTop, (x+COMB.topW-inset)+','+COMB.ribBot, (x+inset)+','+COMB.ribBot].join(' ');
    const fill = (i===3) ? c.accent : c.ink;
    s += P(pts, fill);
    const cx = x + COMB.topW/2;
    const dotFill = (i===3) ? c.paper : c.paper;
    for(const dx of [-15,0,15]) s += C(cx+dx, COMB.ribBot-34, 6.5, dotFill, ' opacity="0.92"');
  }
  return s;
}

function dims(c){
  let s='';
  const y = 112, x1 = CENTERS[0], x2 = CENTERS[COMB.ribs-1];
  s += L(x1, y, x2, y, c.muted, 1);
  s += L(x1, y-7, x1, y+7, c.muted, 1);
  s += L(x2, y-7, x2, y+7, c.muted, 1);
  const label='4200';
  const mid=(x1+x2)/2;
  s += R(mid-28, y-13, 56, 26, c.paper);
  s += T(mid, y+6, 16, c.muted, MONO, 400, '2', label, 'middle');
  const vx = COMB.x0 - 30;
  s += L(vx, COMB.ribTop, vx, COMB.ribBot, c.muted, 1);
  s += L(vx-7, COMB.ribTop, vx+7, COMB.ribTop, c.muted, 1);
  s += L(vx-7, COMB.ribBot, vx+7, COMB.ribBot, c.muted, 1);
  s += R(vx-40, (COMB.ribTop+COMB.ribBot)/2-13, 54, 26, c.paper);
  s += '<text x="'+(vx-13)+'" y="'+((COMB.ribTop+COMB.ribBot)/2+5)+'" font-family="'+MONO+'" font-size="16" letter-spacing="2" fill="'+c.muted+'" text-anchor="middle" transform="rotate(-90 '+(vx-13)+' '+((COMB.ribTop+COMB.ribBot)/2+5)+')">960</text>';
  return s;
}

const NOTES = [
  { i:0, text:'ribbed-floor' },
  { i:1, text:'farmland-soil' },
  { i:3, text:'scrcpy-desk' },
  { i:5, text:'web' }
];

function notes(c){
  let s='';
  for(let k=0;k<NOTES.length;k++){
    const n = NOTES[k];
    const cx = CENTERS[n.i];
    const ty = (k % 2 === 0) ? COMB.ribBot + 40 : COMB.ribBot + 62;
    s += L(cx, COMB.ribBot, cx, ty - 14, c.muted, 1, ' opacity="0.7"');
    s += C(cx, COMB.ribBot, 2.6, c.muted);
    s += T(cx, ty, 16, c.muted, MONO, 400, '1.2', n.text, 'middle');
  }
  return s;
}

function typeBlock(c){
  let s='';
  s += T(M, 96, 18, c.muted, MONO, 400, '3.4', 'ENGINEERING PORTFOLIO — 2024/2026');
  s += T(M-4, 286, 236, c.ink, SANS, 700, '-11', 'CXIN');
  s += R(M, 306, 138, 5, c.accent);
  s += T(M, 372, 46, c.ink, CJKF, 600, '1.5', '\u4ece\u50cf\u7d20\u5230\u6df7\u51dd\u571f\u3002');
  s += T(M+2, 410, 22, c.muted, MONO, 400, '1.6', 'from pixels to concrete');
  s += '<g class="pulse">'+C(M+6, 440, 5.5, c.accent)+'</g>';
  s += T(M+22, 446, 18, c.muted, MONO, 400, '1.4', 'building scrcpy-desk');
  return s;
}

function furniture(c){
  let s='';
  s += L(M, 472, W-M, 472, c.hair, 1);
  s += T(M, 496, 16, c.muted, MONO, 400, '1.6', 'SECTION A\u2013A \u00b7 RIBBED SLAB');
  s += T(W-M, 496, 16, c.muted, MONO, 400, '1.6', 'SHEET 01/01', 'end');
  const rx = 30, ry = 436;
  s += '<text x="'+rx+'" y="'+ry+'" font-family="'+MONO+'" font-size="13" letter-spacing="4" fill="'+c.muted+'" opacity="0.8" transform="rotate(-90 '+rx+' '+ry+')">DRAWING NO. CX-001</text>';
  return s;
}

const CSS = '.pulse{animation:pl 3.2s ease-in-out infinite}'
  + '@keyframes pl{0%,100%{opacity:.35}50%{opacity:1}}'
  + '@media (prefers-reduced-motion: reduce){*{animation:none !important}}';

function build(dark){
  const c = dark ? SETS.dark : SETS.light;
  const body = grid(c) + comb(c) + dims(c) + notes(c) + typeBlock(c) + furniture(c) + crops(c);
  const title = dark
    ? 'CXIN \u2014 dark drawing sheet: a ribbed concrete slab section, one rib in signal red, beside the CXIN wordmark.'
    : 'CXIN \u2014 drawing sheet: a ribbed concrete slab section, one rib in signal red, beside the CXIN wordmark.';
  return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 520" width="1600" height="520" role="img">'
    + '<title>CXIN \u00b7 from pixels to concrete</title><desc>'+title+'</desc>'
    + '<style>'+CSS+'</style>'
    + R(0,0,W,H,c.paper)
    + body
    + '</svg>';
}

const out = join(here, '..', 'assets') + '/';
writeFileSync(out+'hero-dark.svg', build(true), 'utf8');
writeFileSync(out+'hero-light.svg', build(false), 'utf8');
console.log('wrote hero-dark.svg / hero-light.svg');