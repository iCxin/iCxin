
import { writeFileSync } from 'node:fs';
const RAD=Math.PI/180,SQ=Math.sqrt(1.6),TAU=Math.PI*2;
const AZ=45,EL=30;
const SINA=Math.sin(AZ*RAD),COSA=Math.cos(AZ*RAD),SINE=Math.sin(EL*RAD),COSE=Math.cos(EL*RAD);
const VIEW=[COSA*COSE,SINA*COSE,SINE];
const LIGHT=(function(){const v=[-0.42,0.42,0.80],l=Math.hypot(v[0],v[1],v[2]);return[v[0]/l,v[1]/l,v[2]/l];})();
const add=(a,b)=>[a[0]+b[0],a[1]+b[1],a[2]+b[2]];
const sub=(a,b)=>[a[0]-b[0],a[1]-b[1],a[2]-b[2]];
const mul=(a,s)=>[a[0]*s,a[1]*s,a[2]*s];
const dot=(a,b)=>a[0]*b[0]+a[1]*b[1]+a[2]*b[2];
const cross=(a,b)=>[a[1]*b[2]-a[2]*b[1],a[2]*b[0]-a[0]*b[2],a[0]*b[1]-a[1]*b[0]];
const unit=(a)=>{const l=Math.hypot(a[0],a[1],a[2])||1;return[a[0]/l,a[1]/l,a[2]/l];};
let PR={o:[0,0],scale:1};
const iso=(p)=>[PR.o[0]+(p[0]*SINA-p[1]*COSA)*PR.scale*SQ,PR.o[1]+((p[0]*COSA+p[1]*SINA)*SINE-p[2]*COSE)*PR.scale*SQ];
const isoU=(p)=>[(p[0]*SINA-p[1]*COSA)*SQ,((p[0]*COSA+p[1]*SINA)*SINE-p[2]*COSE)*SQ];
const n1=(v)=>{const r=Math.round(v*10)/10;return r===0?0:r;};
const path=(pts,close)=>pts.map((p,i)=>(i?'L':'M')+n1(p[0])+' '+n1(p[1])).join('')+(close?'Z':'');
const esc=(s)=>String(s).replace(/&/g,'&amp;').replace(/</g,'&lt;').replace(/>/g,'&gt;').replace(/"/g,'&quot;');
const att=(o)=>{let s='';for(const k in o){const v=o[k];if(v===undefined||v===false)continue;s+=' '+k+'="'+v+'"';}return s;};
const PATH=(d,o)=>'<path'+att(Object.assign({d:d},o||{}))+'/>';
const RECT=(o)=>'<rect'+att(o)+'/>';
const CIR=(o)=>'<circle'+att(o)+'/>';
const GRP=(o,inner)=>'<g'+att(o)+'>'+inner+'</g>';
const TXT=(o,text)=>'<text'+att(o)+'>'+text+'</text>';
const LINE=(d,stroke,w,extra)=>PATH(d,Object.assign({fill:'none',stroke:stroke,'stroke-width':w,'stroke-linecap':'round','stroke-linejoin':'round'},extra||{}));
const THEMES={
 dark:{bg:'#0B1020',grid:'#1E2A45',ink:'#F3F6FA',muted:'#93A2BC',brass:'#E8B44A',brassDeep:'#8A5F16',signal:'#5BE2D0',shadow:'#04070D',txt:'#AFC2DC',
  m:{
   bench:{s:['#1E2942','#24314C','#2A3855','#31405F'],cap:'#425474',rim:'#8699BB',edge:'#080E1A'},
   frame:{s:['#151E32','#192338','#1D283F','#222E47'],cap:'#2C3A55',rim:'#4C617E',edge:'#060B14'},
   leg:{s:['#121A2C','#162034','#1A253B','#1E2A42'],cap:'#26334C',rim:'#42536F',edge:'#050A12'},
   brass:{s:['#6E4A11','#8A5F16','#BE8A2C','#D8A03B'],cap:'#E8B44A',rim:'#FFE4A8',edge:'#3A2606'},
   board:{s:['#2A3245','#2F384C','#343E53','#3A455A'],cap:'#1F2635',rim:'#5A6884',edge:'#0C1018'},
   rail:{s:['#35435F','#3D4C6A','#455576','#4D5E81'],cap:'#5A6D92',rim:'#8FA0C0',edge:'#0E1522'},
   graph:{s:['#39486A','#415273','#495C7F','#51668B'],cap:'#5C7198',rim:'#B0BFDA',edge:'#101724'},
   screen:{s:['#050810','#060A14','#080C18','#0A0F1E'],cap:'#101B2E',rim:'#22304E',edge:'#03050A'},
   slab:{s:['#1A2438','#222E45','#2B3852','#33425F'],cap:'#3C4C6B',rim:'#6C80A4',edge:'#070C16'},
   slabTop:{s:['#202B42','#28344D','#303D58','#384766'],cap:'#4A5B7C',rim:'#8A9CBA',edge:'#080E1A'},
   cutS:{s:['#141C2C','#141C2C','#141C2C','#141C2C'],cap:'#141C2C',rim:'#141C2C',edge:'#04070E'},
   soil:{s:['#2E2214','#38291A','#42311E','#4C3823'],cap:'#5A4429',rim:'#7C6038',edge:'#1A1109'},
   steel:{s:['#33415E','#3A4A69','#415274','#485B80'],cap:'#54688E',rim:'#93A5C6',edge:'#0C1320'},
   steelHi:{s:['#455774','#4E6182','#576B8E','#60759A'],cap:'#6E82A8',rim:'#B4C2DA',edge:'#111827'},
   spring:{s:['#5A6D90','#657AA0','#7086AE','#7B92BC'],cap:'#8FA3C8',rim:'#D2DDEE',edge:'#1A2333'},
   leaf:{s:['#2E7A72','#348A80','#3A9A8F','#40AA9E'],cap:'#5BE2D0',rim:'#C6F8F1',edge:'#0C3330'},
   wood:{s:['#6B5638','#7A6240','#8A6F48','#9A7D50'],cap:'#B08F5C',rim:'#E2C89C',edge:'#2A2114'},
   paperW:{s:['#8C93A6','#959CB0','#9EA5B9','#A7AEC2'],cap:'#C3C9D8',rim:'#E8ECF4',edge:'#5B6274'}
  }},
 light:{bg:'#F7F5F0',grid:'#E4DFD4',ink:'#131922',muted:'#5B6675',brass:'#A9701A',brassDeep:'#7A4E10',signal:'#0E8F80',shadow:'#B0A794',txt:'#C9D5E4',
  m:{
   bench:{s:['#B4AC9C','#C0B8A8','#C9C1B1','#D9D3C7'],cap:'#EFEAE0',rim:'#FFFFFF',edge:'#8A8376'},
   frame:{s:['#A49C8C','#AEA696','#B8B0A0','#C4BDAD'],cap:'#DCD6C9',rim:'#F8F4EA',edge:'#7E7769'},
   leg:{s:['#9C9484','#A79F8F','#B1A999','#BBB3A3'],cap:'#CFC8B8',rim:'#F2EDE2',edge:'#797264'},
   brass:{s:['#7A4E10','#8F5F14','#A9701A','#BE7E22'],cap:'#D19A3C',rim:'#F5D495',edge:'#4A2E08'},
   board:{s:['#8F8878','#9A9382','#A59E8D','#B0A898'],cap:'#B4AC9C',rim:'#F1ECE1',edge:'#6F6859'},
   rail:{s:['#8F8878','#9A9382','#A59E8D','#B0A898'],cap:'#C8C1B1',rim:'#F4EFE4',edge:'#6F6859'},
   graph:{s:['#232B3B','#293244','#2F394C','#354053'],cap:'#414D61',rim:'#7A889E',edge:'#0B0F17'},
   screen:{s:['#0C1220','#0E1526','#101A2D','#131E34'],cap:'#1A2740',rim:'#31415E',edge:'#05080F'},
   slab:{s:['#B6AFA2','#C0B9AC','#CAC3B6','#D4CDC0'],cap:'#EDE8DD',rim:'#FFFFFF',edge:'#8A8273'},
   slabTop:{s:['#C2BBAE','#CCC5B8','#D6CFC2','#E0D9CC'],cap:'#F6F1E7',rim:'#FFFFFF',edge:'#948C7D'},
   cutS:{s:['#948D80','#948D80','#948D80','#948D80'],cap:'#948D80',rim:'#948D80',edge:'#6B6458'},
   soil:{s:['#6E5940','#7A6449','#866F52','#927A5B'],cap:'#A98D68',rim:'#C9AC84',edge:'#4C3C29'},
   steel:{s:['#A8A192','#B2AC9C','#BCB6A6','#C6C0B0'],cap:'#DFD9CD',rim:'#FFFFFF',edge:'#847D70'},
   steelHi:{s:['#B8B1A1','#C1BAAB','#CAC3B4','#D3CCBD'],cap:'#EAE5DA',rim:'#FFFFFF',edge:'#8D8678'},
   spring:{s:['#968F80','#A19A8B','#ACA596','#B7B0A1'],cap:'#D0C9BA',rim:'#F4EFE5',edge:'#797264'},
   leaf:{s:['#5E9E90','#6AA99B','#76B4A6','#82BFB1'],cap:'#A8D8CC',rim:'#E4F8F2',edge:'#3E6B62'},
   wood:{s:['#B08F5C','#BA9A68','#C4A574','#CEB080'],cap:'#E2C89C',rim:'#F6E4C2',edge:'#7A6240'},
   paperW:{s:['#DCD6C9','#E2DCD0','#E8E2D7','#EEE9DE'],cap:'#FFFFFF',rim:'#FFFFFF',edge:'#ADA598'}
  }}
};
let TH,M,T;
const PARTS=[];
let REC=false,WORLD=[];
function toneOf(n){const l=dot(n,LIGHT);if(l<0.02)return 0;if(l<0.30)return 1;if(l<0.62)return 2;return 3;}
const isFlat=(n)=>n[2]>0.86;
function convexHull(points){
  const pts=points.slice().sort((a,b)=>a[0]-b[0]||a[1]-b[1]);
  if(pts.length<3)return pts;
  const cr=(o,a,b)=>(a[0]-o[0])*(b[1]-o[1])-(a[1]-o[1])*(b[0]-o[0]);
  const lo=[];for(const p of pts){while(lo.length>=2&&cr(lo[lo.length-2],lo[lo.length-1],p)<=0)lo.pop();lo.push(p);}
  const up=[];for(let i=pts.length-1;i>=0;i--){const p=pts[i];while(up.length>=2&&cr(up[up.length-2],up[up.length-1],p)<=0)up.pop();up.push(p);}
  return lo.slice(0,-1).concat(up.slice(0,-1));
}
function prism(ring,F,h,mat,opt){
  opt=opt||{};
  const N=ring.length;
  const pt=(a,b,c)=>[F.o[0]+F.u[0]*a+F.v[0]*b+F.n[0]*c,F.o[1]+F.u[1]*a+F.v[1]*b+F.n[1]*c,F.o[2]+F.u[2]*a+F.v[2]*b+F.n[2]*c];
  const bot=ring.map(function(r){return pt(r[0],r[1],0);});
  const top=ring.map(function(r){return pt(r[0],r[1],h);});
  if(REC){for(const p of bot)WORLD.push(p);for(const p of top)WORLD.push(p);}
  let ca=0,cb=0;for(const r of ring){ca+=r[0];cb+=r[1];}ca/=N;cb/=N;
  const cen=pt(ca,cb,0);
  const faces=[];
  for(let i=0;i<N;i++){
    const j=(i+1)%N;
    let nr=unit(cross(sub(bot[j],bot[i]),F.n));
    const mid=mul(add(bot[i],bot[j]),0.5);
    if(dot(nr,sub(mid,cen))<0)nr=mul(nr,-1);
    faces.push({i:i,j:j,nr:nr,vis:dot(nr,VIEW)>0.0004,ang:0});
  }
  for(let i=0;i<N;i++){const p=faces[(i-1+N)%N],c=faces[i];c.ang=Math.acos(Math.max(-1,Math.min(1,dot(p.nr,c.nr))))/RAD;}
  const capVis=dot(F.n,VIEW)>0.0004;
  const capTone=mat.cap||mat.s[3];
  const out=[];
  out.push(PATH(path(convexHull(bot.concat(top).map(iso)),true),{fill:mat.s[0]}));
  if(capVis){
    const cp=path(top.map(iso),true);
    out.push(PATH(cp,{fill:capTone}));
    if(opt.rim!==false)out.push(PATH(cp,{fill:'none',stroke:mat.rim,'stroke-width':(opt.rimW||1),'stroke-linejoin':'round',opacity:(opt.rimO!==undefined?opt.rimO:0.7)}));
  }
  for(const f of faces) if(f.vis){
    const d=path([bot[f.i],bot[f.j],top[f.j],top[f.i]].map(iso),true);
    const fill=isFlat(f.nr)?capTone:mat.s[toneOf(f.nr)];
    out.push(PATH(d,{fill:fill,stroke:fill,'stroke-width':0.6,'stroke-linejoin':'round'}));
  }
  let lines='';
  for(const f of faces) if(f.vis){
    lines+=path([bot[f.i],bot[f.j]].map(iso));
    if(f.ang>(opt.crease!==undefined?opt.crease:17))lines+=path([bot[f.i],top[f.i]].map(iso));
  }
  if(capVis)lines+=path(top.map(iso),true);
  if(lines)out.push(PATH(lines,{fill:'none',stroke:mat.edge,'stroke-width':(opt.edgeW||1.1),'stroke-linejoin':'round','stroke-linecap':'round'}));
  if(opt.extra)out.push(opt.extra);
  return out.join('');
}
function rectRing(a0,b0,w,d){return[[a0,b0],[a0+w,b0],[a0+w,b0+d],[a0,b0+d]];}
function roundRing(a0,b0,w,d,r,steps){
  steps=steps||6;
  const rr=Math.max(0,Math.min(r,w/2,d/2));
  if(rr<=0.001)return rectRing(a0,b0,w,d);
  const out=[];
  const cs=[[a0+w-rr,b0+rr,-90],[a0+w-rr,b0+d-rr,0],[a0+rr,b0+d-rr,90],[a0+rr,b0+rr,180]];
  for(const c of cs){for(let k=0;k<=steps;k++){const a=(c[2]+90*k/steps)*RAD;out.push([c[0]+rr*Math.cos(a),c[1]+rr*Math.sin(a)]);}}
  return out;
}
function circleRing(cx,cy,r,steps){steps=steps||22;const o=[];for(let k=0;k<steps;k++){const a=k/steps*TAU;o.push([cx+r*Math.cos(a),cy+r*Math.sin(a)]);}return o;}
const PLAN={o:[0,0,0],u:[1,0,0],v:[0,1,0],n:[0,0,1]};
const planBox=(x,y,w,d,z,h,mat,opt)=>prism(rectRing(x,y,w,d),{o:[0,0,z],u:PLAN.u,v:PLAN.v,n:PLAN.n},h,mat,opt);
const planRound=(x,y,w,d,r,z,h,mat,opt)=>prism(roundRing(x,y,w,d,r),{o:[0,0,z],u:PLAN.u,v:PLAN.v,n:PLAN.n},h,mat,opt);
const planCircle=(cx,cy,r,z,h,mat,opt)=>prism(circleRing(cx,cy,r),{o:[0,0,z],u:PLAN.u,v:PLAN.v,n:PLAN.n},h,mat,opt);
function quad(p0,p1,p2,p3,fill,opt){
  opt=opt||{};
  if(REC)WORLD.push(p0,p1,p2,p3);
  const o=Object.assign({fill:fill},opt.attrs||{});
  if(opt.stroke)o.stroke=opt.stroke;
  if(opt.sw)o['stroke-width']=opt.sw;
  if(opt.op!==undefined)o.opacity=opt.op;
  return PATH(path([p0,p1,p2,p3].map(iso),true),o);
}
function faceMatrix(o,u,v){
  const p0=iso(o),pu=iso(add(o,u)),pv=iso(add(o,v));
  const a=sub(pu,p0),b=sub(pv,p0);
  const f=(x)=>Math.round(x*1000)/1000;
  return'matrix('+f(a[0])+' '+f(a[1])+' '+f(b[0])+' '+f(b[1])+' '+f(p0[0])+' '+f(p0[1])+')';
}
const line3=(pts,stroke,w,extra)=>PATH(path(pts.map(iso)),Object.assign({fill:'none',stroke:stroke,'stroke-width':w,'stroke-linecap':'round','stroke-linejoin':'round'},extra||{}));
const put=(s)=>PARTS.push(s);
const B={x0:-10,y0:-10,w:446,d:180,top:76,thick:13};
function mulberry(a){return function(){a|=0;a=a+0x6D2B79F5|0;let t=Math.imul(a^a>>>15,1|a);t=t+Math.imul(t^t>>>7,61|t)^t;return((t^t>>>14)>>>0)/4294967296;};}
const shadowQuad=(x,y,w,d,op)=>quad([x,y,B.top+0.12],[x+w,y,B.top+0.12],[x+w,y+d,B.top+0.12],[x,y+d,B.top+0.12],T.shadow,{op:op,attrs:{filter:'url(#soft2)'}});
function bench(){
  const top=B.top,tx0=B.x0,ty0=B.y0,tw=B.w,td=B.d;
  put(quad([tx0+4,ty0+2,0],[tx0+tw+14,ty0+2,0],[tx0+tw+14,ty0+td+20,0],[tx0+4,ty0+td+20,0],T.shadow,{op:0.34,attrs:{filter:'url(#soft)'}}));
  const leg=(x,y,mat)=>{
    put(planBox(x-3,y-3,22,22,0,4,mat));
    put(planBox(x,y,16,16,4,top-26,mat));
    put(planBox(x-1.5,y-1.5,19,19,top-26,9,mat));
    put(planBox(x+4,y+4,8,8,2.4,2,M.brass));
  };
  leg(20,20,M.frame); leg(tx0+tw-36,20,M.frame);
  put(planBox(38,22,tw-76,9,20,7,M.frame));
  put(planBox(38,22,tw-76,9,42,6,M.frame));
  put(planBox(tx0+12,ty0+12,tw-24,td-24,top-24,13,M.frame));
  put(planRound(tx0,ty0,tw,td,7,top-B.thick,B.thick,M.bench));
  let grain='';
  for(const gy of [ty0+42,ty0+84,ty0+126])grain+=path([iso([tx0+16,gy,top+0.06]),iso([tx0+tw-16,gy,top+0.06])]);
  put(PATH(grain,{fill:'none',stroke:T.grid,'stroke-width':1.2,opacity:0.35}));
  put(quad([tx0+14,ty0+td-12,top+0.12],[tx0+tw-14,ty0+td-12,top+0.12],[tx0+tw-14,ty0+td-4,top+0.12],[tx0+14,ty0+td-4,top+0.12],M.brass.cap,{}));
  for(const c of [[tx0+18,ty0+18],[tx0+tw-18,ty0+18],[tx0+18,ty0+td-18],[tx0+tw-18,ty0+td-18]])put(planCircle(c[0],c[1],2.8,top+0.12,1.5,M.steel));
  leg(20,ty0+td-36,M.leg); leg(tx0+tw-36,ty0+td-36,M.leg);
}
/* ---------- shared: a device facing the viewer, turned phi off the plan axes ---------- */
function deviceFrame(cx,cy,baseZ,phiDeg,tiltDeg,w){
  const p=phiDeg*RAD,t=tiltDeg*RAD;
  const up=[Math.sin(p),-Math.cos(p),0];
  const nn=unit([Math.cos(p)*Math.cos(t),Math.sin(p)*Math.cos(t),Math.sin(t)]);
  const vv=unit(cross(up,nn));
  return {o:[cx-up[0]*w/2,cy-up[1]*w/2,baseZ],u:up,v:vv,n:nn};
}
const MON={cx:222,cy:56,w:132,h:80,d:30,z0:76,stand:26,phi:14,tilt:7};
function monitorUI(w,h){
  const s1=M.screen.s[1],s2=M.screen.s[2],s3=M.screen.s[3];
  let s='';
  s+=RECT({x:0,y:0,width:w,height:5.2,fill:s1});
  for(let i=0;i<3;i++)s+=RECT({x:(w-14+i*4.4).toFixed(1),y:2,width:2,height:1.7,fill:T.muted,opacity:0.4});
  s+=RECT({x:5,y:2.3,width:18,height:1.8,fill:T.txt,opacity:0.5});
  const rows=[[7,12,26],[7,29,38],[7,46,30]];
  for(let i=0;i<rows.length;i++){
    const x=rows[i][0],y=rows[i][1],rw=rows[i][2];
    s+=RECT({x:x,y:y,width:rw+26,height:11,rx:2.8,fill:i===1?'#1E2C46':M.screen.s[3]});
    s+=RECT({x:x+3,y:y+2.9,width:rw,height:3,fill:T.txt,opacity:0.92});
    s+=RECT({x:x+3,y:y+6.9,width:(rw*0.6).toFixed(1),height:1.8,fill:T.txt,opacity:0.34});
  }
  s+=RECT({x:(w-42).toFixed(1),y:46,width:34,height:10,rx:2.8,fill:T.signal,opacity:0.3});
  s+=RECT({x:7,y:(h-14).toFixed(1),width:3.2,height:8.4,fill:T.signal,class:'cur'});
  s+=RECT({x:12,y:(h-13.4).toFixed(1),width:26,height:2,fill:T.txt,opacity:0.5});
  s+=RECT({x:12,y:(h-9.6).toFixed(1),width:17,height:1.8,fill:T.txt,opacity:0.28});
  return GRP({},s);
}
function monitor(){
  const cx=MON.cx,cy=MON.cy;
  put(shadowQuad(cx-34,cy-30,72,64,0.45));
  // stand: rotated base + neck
  const P2={o:[cx,cy,B.top],u:[Math.cos(MON.phi*RAD),Math.sin(MON.phi*RAD),0],v:[-Math.sin(MON.phi*RAD),Math.cos(MON.phi*RAD),0],n:[0,0,1]};
  put(prism(roundRing(-30,-22,60,44,10,6),P2,3.4,M.steel,{cap:M.steel.cap,rim:M.steel.rim}));
  put(prism(roundRing(-24,-16,48,32,8,6),{...P2,o:[cx,cy,B.top+3.4]},2.2,M.steelHi));
  put(prism(rectRing(-11,-8,22,16),{...P2,o:[cx,cy,B.top+5.5]},MON.stand-8,M.steel,{cap:M.steelHi.cap,rim:M.steel.rim}));
  const bodyZ=B.top+MON.stand;
  const F=deviceFrame(cx,cy,bodyZ,MON.phi,MON.tilt,MON.w);
  put(prism(rectRing(0,0,MON.w,MON.h),F,-MON.d,M.graph,{cap:M.graph.cap,rim:M.graph.rim}));
  // screen
  const sx=7,sw=MON.w-14,sz=7,sh=MON.h-14;
  const at=(a,b,c)=>[F.o[0]+F.u[0]*a+F.v[0]*b+F.n[0]*c,F.o[1]+F.u[1]*a+F.v[1]*b+F.n[1]*c,F.o[2]+F.u[2]*a+F.v[2]*b+F.n[2]*c];
  put(quad(at(sx-2.6,sz-2.6,0.5),at(sx+sw+2.6,sz-2.6,0.5),at(sx+sw+2.6,sz+sh+2.6,0.5),at(sx-2.6,sz+sh+2.6,0.5),M.screen.cap));
  put(quad(at(sx,sz,0.9),at(sx+sw,sz,0.9),at(sx+sw,sz+sh,0.9),at(sx,sz+sh,0.9),M.screen.s[0]));
  put(GRP({transform:faceMatrix(at(sx,sz+sh,1.2),F.u,mul(F.v,-1))},monitorUI(sw,sh)));
  // power LED in bezel
  const led=iso(at(sx+sw+2,sz+sh+2.2,1.4));
  put(GRP({class:'led'},CIR({cx:n1(led[0]),cy:n1(led[1]),r:2.3,fill:T.signal})+CIR({cx:n1(led[0]),cy:n1(led[1]),r:5.8,fill:T.signal,opacity:0.13})));
  // cable to bench
  const cab=[at(6,MON.h,0.4),at(-16,MON.h+16,-14),at(-36,MON.h+22,-30),[cx-56,cy+34,B.top+2]];
  put(line3(cab,M.frame.s[0],2.6));
  put(CIR({cx:n1(iso(cab[3])[0]),cy:n1(iso(cab[3])[1]),r:2.6,fill:M.frame.cap}));
}
const PH={cx:388,cy:152,w:50,hgt:92,d:14,phi:20,tilt:14,mount:26};
function phoneUI(w,h){
  const s1=M.screen.s[1],s3=M.screen.s[3];
  let s='';
  s+=RECT({x:0,y:0,width:w,height:h*0.055,fill:s1});
  s+=RECT({x:w*0.05,y:h*0.017,width:w*0.2,height:h*0.021,fill:T.txt,opacity:0.35});
  s+=RECT({x:w*0.76,y:h*0.017,width:w*0.17,height:h*0.021,fill:T.signal,opacity:0.6});
  const rh=h*0.125, gap=h*0.05, y0=h*0.17;
  const widths=[0.56,0.78,0.66];
  for(let i=0;i<3;i++){
    const y=y0+i*(rh+gap), rw=w*widths[i];
    const bx=(i===2? w*0.9-rw-6 : w*0.06);
    s+=RECT({x:bx.toFixed(1),y:y.toFixed(1),width:(rw+6).toFixed(1),height:rh.toFixed(1),rx:(rh*0.28).toFixed(1),fill:i===2?s3:s1});
    s+=RECT({x:(bx+3).toFixed(1),y:(y+rh*0.3).toFixed(1),width:(rw*0.9).toFixed(1),height:(h*0.017).toFixed(1),fill:T.txt,opacity:0.38});
    s+=RECT({x:(bx+3).toFixed(1),y:(y+rh*0.62).toFixed(1),width:(rw*0.5).toFixed(1),height:(h*0.014).toFixed(1),fill:T.txt,opacity:0.18});
  }
  s+=RECT({x:(w*0.06).toFixed(1),y:(h*0.78).toFixed(1),width:(w*0.055).toFixed(1),height:(h*0.075).toFixed(1),fill:T.signal,class:'cur'});
  s+=RECT({x:(w*0.13).toFixed(1),y:(h*0.79).toFixed(1),width:(w*0.42).toFixed(1),height:(h*0.019).toFixed(1),fill:T.txt,opacity:0.26});
  s+=RECT({x:(w*0.32).toFixed(1),y:(h*0.955).toFixed(1),width:(w*0.36).toFixed(1),height:(h*0.02).toFixed(1),rx:1,fill:T.txt,opacity:0.3});
  return GRP({},s);
}
function phone(){
  const cx=PH.cx,cy=PH.cy,baseZ=B.top+PH.mount;
  // mount: base puck + slim column + yoke
  put(shadowQuad(cx-16,cy-14,32,28,0.4));
  put(planCircle(cx,cy,15,B.top,3.4,M.steel,{cap:M.steelHi.cap,rim:M.steel.rim}));
  put(planCircle(cx,cy,6,B.top+3.4,PH.mount-6,M.steel));
  const F=deviceFrame(cx,cy,baseZ,PH.phi,PH.tilt,PH.w);
  // yoke under the phone
  put(prism(rectRing(PH.w*0.1,-3,PH.w*0.8,6),F,2.4,M.steelHi,{cap:M.steelHi.cap}));
  put(prism(roundRing(0,0,PH.w,PH.hgt,4.2,6),F,PH.d,M.graph,{cap:M.graph.cap,rim:M.graph.rim,edgeW:1.2}));
  const at=(a,b,c)=>[F.o[0]+F.u[0]*a+F.v[0]*b+F.n[0]*c,F.o[1]+F.u[1]*a+F.v[1]*b+F.n[1]*c,F.o[2]+F.u[2]*a+F.v[2]*b+F.n[2]*c];
  const ins=3.2,sw=PH.w-ins*2,sh=PH.hgt-ins*2-2;
  put(quad(at(ins-1.6,ins+PH.hgt-ins*2+1.4,0.4),at(ins+sw+1.6,ins+PH.hgt-ins*2+1.4,0.4),at(ins+sw+1.6,PH.hgt-ins+1.4,0.4),at(ins-1.6,PH.hgt-ins+1.4,0.4),M.screen.cap));
  put(quad(at(ins,PH.hgt-ins,0.7),at(ins+sw,PH.hgt-ins,0.7),at(ins+sw,ins+2,0.7),at(ins,ins+2,0.7),M.screen.s[0]));
  put(GRP({transform:faceMatrix(at(ins,PH.hgt-ins,1),F.u,mul(F.v,-1))},phoneUI(sw,sh)));
  // side key + camera dot for scale
  put(prism(rectRing(-1.2,PH.hgt*0.55,1.8,14),F,PH.d*0.55,M.steel,{rim:false}));
  const cam=iso(at(PH.w-7,PH.hgt-6,0.8));
  put(CIR({cx:n1(cam[0]),cy:n1(cam[1]),r:1.5,fill:M.screen.cap}));
}
const BRD={hinge:66,y0:8,len:104,hgt:94,tilt:56,thick:6};
function ribbedSlab(S,w,h){
  const t=7,ribH=13,ribs=4;
  put(prism(rectRing(0,0,w,h),S,t,M.slab,{cap:M.slab.cap,rim:M.slab.rim}));
  const gap=(h-12)/ribs;
  for(let k=0;k<ribs;k++){
    const b0=5+k*gap+2.6,bw=gap-5.2;
    // shadow slot on the deck
    put(quad(add(add(S.o,mul(S.v,b0-0.9)),mul(S.n,t+0.06)),add(add(S.o,mul(S.v,b0)),mul(S.n,t+0.06)),add(add(add(S.o,mul(S.v,b0)),mul(S.u,w)),mul(S.n,t+0.06)),add(add(add(S.o,mul(S.v,b0-0.9)),mul(S.u,w)),mul(S.n,t+0.06)),M.cutS.cap,{op:0.75}));
    put(prism(rectRing(0,b0,w,bw),{o:add(S.o,mul(S.n,t)),u:S.u,v:S.v,n:S.n},ribH,M.slabTop,{cap:M.slabTop.cap,rim:M.slabTop.rim,rimO:0.55}));
  }
  // section cut at u=w
  const cutPlane=add(S.o,mul(S.u,w+0.1));
  const cq=(b0,b1,c0,c1,fill,st)=>quad(add(add(cutPlane,mul(S.v,b0)),mul(S.n,c0)),add(add(cutPlane,mul(S.v,b1)),mul(S.n,c0)),add(add(cutPlane,mul(S.v,b1)),mul(S.n,c1)),add(add(cutPlane,mul(S.v,b0)),mul(S.n,c1)),fill,{stroke:st,sw:0.8});
  cq(0,h,0,t,M.cutS.cap,M.cutS.edge);
  for(let k=0;k<ribs;k++){
    const b0=5+k*gap+2.6,bw=gap-5.2;
    cq(b0,b0+bw,t,t+ribH,M.cutS.cap,M.cutS.edge);
    for(let d=0;d<2;d++){
      const p=add(add(add(cutPlane,mul(S.v,b0+bw*(0.3+d*0.4))),mul(S.n,t+ribH*0.55)),mul(S.u,0.28));
      const q2=iso(p);
      put(CIR({cx:n1(q2[0]),cy:n1(q2[1]),r:1.5,fill:M.brass.cap}));
    }
  }
  for(let d=0;d<3;d++){
    const p=add(add(add(cutPlane,mul(S.v,3.5+d*(h-7)/2)),mul(S.n,t*0.5)),mul(S.u,0.28));
    const q2=iso(p);
    put(CIR({cx:n1(q2[0]),cy:n1(q2[1]),r:1.1,fill:M.brass.cap}));
  }
  // dimension ticks on the deck edge
  let dim='';
  for(let k=0;k<=4;k++){
    const x=4+k*(w-8)/4;
    const p0=add(add(S.o,mul(S.u,x)),mul(S.n,t+0.3));
    dim+=path([iso(p0),iso(add(p0,mul(S.v,k%2===0?11:6.6)))]);
  }
  put(PATH(dim,{stroke:M.brass.cap,'stroke-width':1,fill:'none',opacity:0.85}));
}
function draftingBoard(){
  const a=BRD.tilt*RAD;
  const v=[-Math.sin(a),0,Math.cos(a)],u=[0,1,0],n=unit(cross(u,v));
  const F={o:[BRD.hinge,BRD.y0,B.top],u:u,v:v,n:n};
  put(shadowQuad(BRD.hinge-8,BRD.y0-8,34,BRD.len+16,0.5));
  for(const yy of [BRD.y0+10,BRD.y0+BRD.len-24]){
    put(line3([[BRD.hinge+20,yy,B.top],[BRD.hinge+v[0]*54,yy,B.top+v[2]*54]],M.frame.s[0],4.8));
    put(planBox(BRD.hinge+11,yy-5,17,10,B.top,3.2,M.frame));
  }
  put(prism(roundRing(0,0,BRD.len,BRD.hgt,3.4,4),F,BRD.thick,M.board,{cap:M.board.cap,rim:M.board.rim}));
  const fo=BRD.thick;
  put(prism(rectRing(0,0,7,BRD.hgt),{o:add(F.o,mul(n,fo)),u:u,v:v,n:n},3.2,M.rail,{rim:M.rail.rim}));
  put(prism(rectRing(BRD.len-7,0,7,BRD.hgt),{o:add(F.o,mul(n,fo)),u:u,v:v,n:n},3.2,M.rail,{rim:M.rail.rim}));
  put(prism(rectRing(2,BRD.hgt-9,BRD.len-4,6),{o:add(F.o,mul(n,fo)),u:u,v:v,n:n},4.6,M.rail));
  put(prism(rectRing(3,0,BRD.len-6,10),{o:add(F.o,mul(n,fo)),u:u,v:v,n:n},1.6,M.steel,{rim:false}));
  let ticks='';
  for(let k=0;k<=18;k++){
    const x=6+k*((BRD.len-12)/18),big=k%3===0;
    const p0=add(add(F.o,mul(n,fo+1.6)),add(mul(u,x),mul(v,1.2)));
    ticks+=path([iso(p0),iso(add(p0,mul(v,big?6.6:3.8)))]);
  }
  put(PATH(ticks,{stroke:M.brass.cap,'stroke-width':0.9,fill:'none',opacity:0.8}));
  const S={o:add(add(F.o,mul(n,fo+1.6)),add(mul(u,18),mul(v,20))),u:u,v:v,n:n};
  ribbedSlab(S,74,62);
  for(const c of [[7,70],[70,70]])put(prism(rectRing(c[0],c[1],8,10),{o:add(F.o,mul(n,fo)),u:u,v:v,n:n},5.5,M.brass,{cap:T.brassDeep}));
}
function soilTray(){
  const X=38,Y=122,W=102,D=46,z=B.top,rimH=13;
  put(shadowQuad(X-6,Y-6,W+12,D+12,0.45));
  put(prism(rectRing(X,Y,W,D),{o:[0,0,z],u:PLAN.u,v:PLAN.v,n:PLAN.n},rimH,M.steelHi,{cap:M.steelHi.cap,rim:M.steelHi.rim}));
  const inX=X+7,inY=Y+7,inW=W-14,inD=D-14,soilZ=z+4.4;
  put(quad([inX,inY,z+rimH+0.1],[inX+inW,inY,z+rimH+0.1],[inX+inW,inY+inD,z+rimH+0.1],[inX,inY+inD,z+rimH+0.1],M.soil.s[0]));
  put(quad([inX,inY,z+rimH+0.1],[inX+inW,inY,z+rimH+0.1],[inX+inW,inY,soilZ],[inX,inY,soilZ],M.soil.s[1]));
  put(quad([inX,inY,z+rimH+0.1],[inX,inY+inD,z+rimH+0.1],[inX,inY+inD,soilZ],[inX,inY,soilZ],M.soil.s[0]));
  put(quad([inX,inY+2,soilZ],[inX+inW,inY+2,soilZ],[inX+inW,inY+inD,soilZ],[inX,inY+inD,soilZ],M.soil.cap));
  let crumb='';
  const rnd=mulberry(7);
  for(let k=0;k<30;k++){
    const px=inX+4+rnd()*(inW-8),py=inY+5+rnd()*(inD-9);
    const q=iso([px,py,soilZ+0.2]);
    crumb+=CIR({cx:n1(q[0]),cy:n1(q[1]),r:n1(0.6+rnd()*1),fill:M.soil.s[0],opacity:(0.3+rnd()*0.35).toFixed(2)});
  }
  put(GRP({},crumb));
  const bx=inX+inW*0.42,by=inY+inD*0.62;
  const s0=[bx,by,soilZ],s1=[bx+0.6,by-1.2,soilZ+16],s2v=[bx+1.4,by-2,soilZ+31];
  put(line3([s0,s1,s2v],T.signal,1.7));
  const tip=iso(s2v);
  for(let i=0;i<2;i++){
    const side=i===0?-1:1;
    const pts=[];
    for(let k=0;k<=10;k++){
      const t=k/10,len=19,wid=6.6;
      pts.push([tip[0]+side*(t*len),tip[1]-t*len*0.85-Math.sin(t*Math.PI)*wid]);
    }
    for(let k=10;k>=0;k--){
      const t=k/10,len=19,wid=2.8;
      pts.push([tip[0]+side*(t*len),tip[1]-t*len*0.85+Math.sin(t*Math.PI)*wid]);
    }
    put(PATH(path(pts,true),{fill:M.leaf.cap,stroke:M.leaf.edge,'stroke-width':1.1,'stroke-linejoin':'round'}));
    put(LINE('M'+n1(tip[0])+' '+n1(tip[1])+'L'+n1(tip[0]+side*16)+' '+n1(tip[1]-13),M.leaf.edge,0.9,{opacity:0.45}));
  }
  const pb=[inX+inW*0.78,inY+inD*0.20,soilZ-4],pt2=[pb[0]+4.5,pb[1]+5.5,soilZ+33];
  put(line3([pb,pt2],M.steelHi.cap,2.4));
  put(line3([pt2,[pt2[0]+1.6,pt2[1]+2,pt2[2]+4.6]],M.steelHi.cap,2.4));
  put(planCircle(pt2[0]+1.6,pt2[1]+2,2.7,pt2[2]+4.6,2,M.brass,{cap:M.brass.cap}));
  const lgX=X+W+22,lgY=Y+4;
  put(shadowQuad(lgX-5,lgY-5,52,42,0.4));
  put(line3([pt2,[pt2[0]+9,pt2[1]+2,pt2[2]-17],[lgX-6,lgY+16,z+15],[lgX+1,lgY+10,z+10]],M.frame.s[0],2));
  put(planRound(lgX,lgY,46,34,3,z,18,M.graph,{cap:M.graph.cap,rim:M.graph.rim}));
  put(planBox(lgX+5,lgY+5,36,3,z+18,0.6,M.steel));
  let vents='';
  for(let k=0;k<3;k++)vents+=path([iso([lgX+10,lgY+34.4,z+13.4-k*3.8]),iso([lgX+36,lgY+34.4,z+13.4-k*3.8])]);
  put(PATH(vents,{stroke:M.screen.s[1],'stroke-width':3,'stroke-linecap':'round',fill:'none'}));
  const ledP=iso([lgX+41,lgY+34.5,z+6.4]);
  put(GRP({class:'led2'},CIR({cx:n1(ledP[0]),cy:n1(ledP[1]),r:2.3,fill:T.signal})+CIR({cx:n1(ledP[0]),cy:n1(ledP[1]),r:5,fill:T.signal,opacity:0.12})));
  const lp=iso([lgX+7,lgY+34.6,z+16]);
  put(RECT({x:n1(lp[0]),y:n1(lp[1]),width:16,height:1.6,fill:T.muted,opacity:0.35}));
}
function looseParts(){
  // (no loose sheet: the phone owns this air)
  // ruler along the front edge
  const F={o:[152,156,B.top],u:unit([1,0.04,0]),v:[0,0,1],n:[0,0,1]};
  const L=224;
  put(shadowQuad(148,152,L,22,0.35));
  put(prism(rectRing(0,0,L,14),F,2.6,M.steelHi,{cap:M.steelHi.cap,rim:true}));
  let tk='';
  for(let k=0;k<=46;k++){
    const x=4+k*(L-8)/46,big=k%5===0;
    const p0=add(add(F.o,mul(F.u,x)),mul(F.v,0.9));
    const p1=add(add(F.o,mul(F.u,x)),mul(F.v,big?8:4.6));
    tk+=path([iso([p0[0],p0[1],B.top+2.7]),iso([p1[0],p1[1],B.top+2.7])]);
  }
  put(PATH(tk,{stroke:M.bench.edge,'stroke-width':1,fill:'none',opacity:0.55}));
  put(quad([F.o[0]+2,F.o[1]+0.7,B.top+2.78],[F.o[0]+2,F.o[1]+3.4,B.top+2.78],[F.o[0]+46,F.o[1]+4.6,B.top+2.78],[F.o[0]+46,F.o[1]+1.9,B.top+2.78],M.brass.cap,{op:0.9}));
  // spring
  const cx=396,cy=116,r=5.8,zc=B.top+6;
  const pts=[];
  for(let k=0;k<=77;k++){
    const s=k/77,ang=s*5.5*TAU;
    pts.push([cx+s*26-13,cy+r*Math.cos(ang),zc+r*Math.sin(ang)]);
  }
  put(line3(pts,M.spring.cap,1.7));
  // screws
  for(const c of [[238,148],[250,140],[258,156]]){
    put(planCircle(c[0],c[1],3.3,B.top,1.7,M.steelHi));
    put(planCircle(c[0],c[1],1.7,B.top+1.7,1.2,M.steel));
  }
  // pencil
  const AX=unit([1,0.42,0]);
  const Fp={o:[382,84,B.top+3.6],u:unit(cross(AX,[0,0,1])),v:[0,0,1],n:AX};
  put(shadowQuad(376,76,64,26,0.35));
  put(prism(circleRing(0,0,3.6,6),Fp,56,M.wood,{cap:M.wood.cap,rim:M.wood.rim}));
  put(prism(circleRing(0,0,3.7,6),Fp,7,M.steelHi,{cap:M.steelHi.cap}));
  put(prism(circleRing(0,0,3.6,6),{o:add(Fp.o,mul(Fp.n,56)),u:Fp.u,v:Fp.v,n:Fp.n},10,M.slab,{cap:M.screen.s[1]}));
}
let LINKPX=[];
function link(){
  const a=[PH.cx-PH.w/2-2,PH.cy-2,B.top+PH.mount+PH.hgt*0.55];
  const b=[MON.cx+MON.w/2-6,MON.cy+4,B.top+MON.stand+MON.h*0.5];
  const nodes=[a,[a[0]-6,a[1]-34,B.top+PH.mount+PH.hgt+18],[b[0]+26,b[1]+16,B.top+MON.stand+MON.h+14],b];
  LINKPX=nodes.map(iso);
  put(PATH(path(LINKPX),{fill:'none',stroke:T.signal,'stroke-width':1.8,'stroke-dasharray':'7 7',opacity:0.75,'stroke-linecap':'round'}));
  for(let i=0;i<2;i++){
    const p=LINKPX[0];
    put(GRP({class:'flow',style:'animation-delay:'+(-i*2.5).toFixed(2)+'s'},RECT({x:n1(p[0]-2.9),y:n1(p[1]-2.9),width:5.8,height:5.8,fill:T.signal})));
  }
  put(CIR({cx:n1(LINKPX[0][0]),cy:n1(LINKPX[0][1]),r:2.5,fill:T.signal}));
  put(CIR({cx:n1(LINKPX[3][0]),cy:n1(LINKPX[3][1]),r:2.5,fill:T.signal}));
}
function scene(){bench();draftingBoard();monitor();phone();link();soilTray();looseParts();}
function backdrop(){
  const step=46;
  let g='';
  for(let x=-560;x<=860;x+=step)g+=path([iso([x,-560,0]),iso([x,660,0])]);
  for(let y=-560;y<=660;y+=step)g+=path([iso([-560,y,0]),[860,y,0]]);
  put(GRP({id:'grid',opacity:0.32,mask:'url(#fadeMask)'},PATH(g,{fill:'none',stroke:T.grid,'stroke-width':1})));
}
function motes(){
  let s='';
  const rnd=mulberry(23);
  for(let k=0;k<20;k++){
    const x=650+rnd()*900,y=70+rnd()*390,r=0.9+rnd()*1.8;
    s+=CIR({cx:n1(x),cy:n1(y),r:n1(r),fill:T.muted,opacity:0.26,class:'mote',style:'animation-delay:'+(-rnd()*24).toFixed(1)+'s'});
  }
  return GRP({id:'motes'},s);
}
function typeColumn(){
  const X=88;
  const mono="ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, 'Liberation Mono', monospace";
  const cjk="'PingFang SC', 'Microsoft YaHei', 'Noto Sans CJK SC'";
  const disp="'Segoe UI', 'Helvetica Neue', Arial, sans-serif";
  let s='';
  s+=TXT({x:X,y:148,'font-family':mono,'font-size':20,'letter-spacing':4.2,fill:T.muted},'ENGINEERING · 工程现场');
  s+=TXT({x:X-5,y:250,'font-family':disp+', '+cjk,'font-size':106,'font-weight':700,'letter-spacing':2,fill:T.ink},'CXIN');
  s+=RECT({x:X,y:270,width:132,height:4,rx:2,fill:T.brass});
  s+=LINE('M'+(X+143)+' 265v13M'+(X+136.5)+' 271.5h13',T.brass,1.4);
  s+=TXT({x:X,y:328,'font-family':disp+', '+cjk,'font-size':34,fill:T.ink},'从像素到混凝土。');
  s+=TXT({x:X,y:366,'font-family':mono,'font-size':20,'letter-spacing':1.2,fill:T.muted},'from pixels to concrete');
  const cy=392,ch=36,cw=302;
  s+=RECT({x:X,y:cy,width:cw,height:ch,rx:18,fill:'none',stroke:T.grid,'stroke-width':1.2});
  s+=GRP({class:'led3'},CIR({cx:X+22,cy:cy+ch/2,r:4.5,fill:T.signal}));
  s+=TXT({x:X+38,y:cy+25,'font-family':mono,'font-size':20,fill:T.muted},'building scrcpy-desk');
  return GRP({id:'type'},s);
}
function callouts(A){
  const mono="ui-monospace, 'SF Mono', 'Cascadia Code', Consolas, 'Liberation Mono', monospace";
  const items=[
    {t:'ribbed-floor',ax:A.board[0],ay:A.board[1],lx:744,ly:92,anchor:'start'},
    {t:'scrcpy-desk',ax:A.mon[0],ay:A.mon[1],lx:A.mon[0]+58,ly:64,anchor:'start'},
    {t:'farmland-soil',ax:A.tray[0],ay:A.tray[1],lx:744,ly:224,anchor:'start'}
  ];
  let s='';
  for(const it of items){
    const ly=Math.max(it.ly,46);
    const vx=it.lx-it.ax,vy=ly-it.ay,L=Math.hypot(vx,vy)||1;
    const ex=it.ax+vx*(1-11/L),ey=it.ay+vy*(1-11/L);
    s+=LINE('M'+n1(ex)+' '+n1(ey)+'L'+n1(it.lx)+' '+n1(ly),T.muted,1,{opacity:0.5});
    s+=CIR({cx:n1(it.ax),cy:n1(it.ay),r:3.4,fill:T.muted});
    s+=CIR({cx:n1(it.ax),cy:n1(it.ay),r:7.5,fill:'none',stroke:T.muted,'stroke-width':1,opacity:0.3});
    s+=TXT({x:n1(it.anchor==='end'?it.lx-2:it.lx+2),y:n1(ly+22),'text-anchor':it.anchor,'font-family':mono,'font-size':20,fill:T.muted},it.t);
  }
  return GRP({id:'callouts'},s);
}
const CSS=[
'.led{animation:ledp 3.6s ease-in-out infinite}',
'.led2{animation:ledp 3.6s ease-in-out infinite;animation-delay:-1.4s}',
'.led3{animation:ledp 3.6s ease-in-out infinite;animation-delay:-2.2s}',
'.cur{animation:blink 1.1s steps(1,end) infinite}',
'.flow{animation:flowd 5s linear infinite}',
'.mote{animation:drift 24s linear infinite}',
'@keyframes ledp{0%,100%{opacity:.45}50%{opacity:1}}',
'@keyframes blink{0%,49%{opacity:1}50%,100%{opacity:0}}',
'@keyframes drift{0%{transform:translate(0,0);opacity:0}18%{opacity:.5}78%{opacity:.3}100%{transform:translate(12px,-26px);opacity:0}}',
'@media (prefers-reduced-motion: reduce){*{animation:none !important}}'
].join('');
function flowCss(){
  const p=LINKPX;if(!p||p.length<2)return'';
  const total=p.reduce((a,q,i)=>i?a+Math.hypot(q[0]-p[i-1][0],q[1]-p[i-1][1]):0,0);
  let acc=0,stops='';
  for(let i=0;i<p.length;i++){
    if(i>0)acc+=Math.hypot(p[i][0]-p[i-1][0],p[i][1]-p[i-1][1]);
    stops+=Math.round((total?acc/total:0)*100)+'%{transform:translate('+n1(p[i][0]-p[0][0])+'px,'+n1(p[i][1]-p[0][1])+'px)}';
  }
  return'@keyframes flowd{0%{transform:translate(0px,0px);opacity:0}6%{opacity:.95}90%{opacity:.9}'+stops+'100%{opacity:0}}';
}
const TARGET={x:742,y:20,w:774,h:434};
function buildFile(theme,dbg){
  TH=theme;M=theme.m;T=theme;
  PARTS.length=0;WORLD=[];REC=true;
  PR={o:[0,0],scale:1};
  scene();
  const pts=WORLD.map(isoU);
  let bx0=Infinity,bx1=-Infinity,by0=Infinity,by1=-Infinity;
  for(const p of pts){if(p[0]<bx0)bx0=p[0];if(p[0]>bx1)bx1=p[0];if(p[1]<by0)by0=p[1];if(p[1]>by1)by1=p[1];}
  const scale=Math.min(TARGET.w/(bx1-bx0),TARGET.h/(by1-by0));
  const o=[TARGET.x+TARGET.w/2-(bx0+bx1)/2*scale,TARGET.y+TARGET.h/2-(by0+by1)/2*scale];
  PR={o:o,scale:scale};
  REC=false;PARTS.length=0;
  backdrop();
  const bgEnd=PARTS.length;
  scene();
  const sceneSvg=PARTS.slice(bgEnd).join('');
  const bgSvg=PARTS.slice(0,bgEnd).join('');
  const A={
    board:iso([26,12,114]),
    mon:iso([MON.cx+MON.w*0.30,MON.cy+2,B.top+MON.stand+MON.h+1]),
    tray:iso([120,150,B.top+9])
  };
  if(dbg){
    const P=(n,p)=>console.log(n,p.map(n1).join(', '));
    P('bench L',iso([B.x0,B.y0+B.d,B.top]));P('bench R',iso([B.x0+B.w,B.y0,B.top]));
    P('bench F',iso([B.x0+B.w,B.y0+B.d,B.top]));P('bench back',iso([B.x0,B.y0,B.top]));
    P('feet F',iso([B.x0+B.w-20,B.y0+B.d-20,0]));
    P('board top',iso([BRD.hinge+v0(),BRD.y0+60,B.top+62]));
    P('mon top',iso([MON.cx,MON.cy,B.top+MON.stand+MON.h]));
    P('phone',iso([PH.cx,PH.cy,B.top+PH.mount+PH.hgt*0.5]));
    P('tray',[A.tray[0],A.tray[1]]);
    console.log('content x',n1(bx0*scale+o[0]),'..',n1(bx1*scale+o[0]),' y',n1(by0*scale+o[1]),'..',n1(by1*scale+o[1]),'scale',scale.toFixed(3));
  }
  const body=[GRP({id:'backdrop'},bgSvg),motes(),GRP({id:'workbench'},sceneSvg),callouts(A),typeColumn()].join('');
  const title=theme===THEMES.dark?'Dark hero: an isometric engineering workbench where a monitor mirrors a phone, a ribbed concrete slab model leans on a drafting board and a soil tray grows a sprout, beside the CXIN wordmark.':'Light hero: the same isometric engineering workbench rendered on warm paper.';
  const defs='<defs>'
   +'<filter id="soft" x="-30%" y="-30%" width="160%" height="160%"><feGaussianBlur stdDeviation="15"/></filter>'
   +'<filter id="soft2" x="-90%" y="-90%" width="280%" height="280%"><feGaussianBlur stdDeviation="4.5"/></filter>'
   +'<linearGradient id="fadeGrad" x1="0" y1="0" x2="1" y2="0"><stop offset="0" stop-color="#fff" stop-opacity="0"/><stop offset="0.18" stop-color="#fff" stop-opacity="1"/><stop offset="1" stop-color="#fff" stop-opacity="1"/></linearGradient>'
   +'<mask id="fadeMask"><rect x="0" y="0" width="1600" height="480" fill="url(#fadeGrad)"/></mask>'
   +'</defs>';
  const head='<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 1600 480" width="1600" height="480" role="img">'
   +'<title>iCxin / from pixels to concrete</title><desc>'+esc(title)+'</desc>'
   +'<style>'+CSS+flowCss()+'</style>'+defs
   +RECT({x:0,y:0,width:1600,height:480,fill:T.bg});
  return head+body+'</svg>';
}
function v0(){return -Math.sin(BRD.tilt*RAD);}
import { fileURLToPath } from 'node:url';
import { dirname, join } from 'node:path';
const here = dirname(fileURLToPath(import.meta.url));
const out = join(here, '..', 'assets') + '/';
const DBG = process.argv.includes('--debug');
writeFileSync(out+'hero-dark.svg',buildFile(THEMES.dark,DBG),'utf8');
writeFileSync(out+'hero-light.svg',buildFile(THEMES.light,DBG),'utf8');
console.log('wrote ' + out + 'hero-{dark,light}.svg');
