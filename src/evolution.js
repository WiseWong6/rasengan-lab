/* 轴对称、无绕轴旋转的欧拉方程近似求解。无依赖，浏览器与 Node 共用。
   q = ωφ / ρ 随流体输运；χ = ψ / ρ² 满足 χρρ + 3χρ/ρ + χyy = -q。
   用有限体积径向算子、松弛求解和守恒的限幅通量输运。有限网格会产生数值扩散。
   外边界为随当前涡量冲量与中心更新的远场偶极近似；观察坐标以初始速度 1 前进。
   此处不使用预设拖尾／涡环路径，不求解浮力、黏性、可压缩性或三维紊流。 */
(function(root){
  'use strict';
  class VortexEvolution {
    constructor(stretch=1,{spacing=.06,iterations=45,frameSpeed=1}={}){
      this.frameSpeed=frameSpeed;
      this.dr=3/Math.round(3/spacing);this.dy=11/Math.round(11/spacing);
      this.nr=Math.round(3/spacing)+1;this.ny=Math.round(11/spacing)+1;
      this.ymin=-7;this.ymax=4;this.rmax=3;this.stretch=stretch;this.time=0;this.iterations=iterations;
      const size=this.nr*this.ny;
      for(const key of ['q','chi','ur','uy','forward','next','slopeR','slopeY','fluxR','fluxY'])this[key]=new Float64Array(size);
      this.ap=new Float64Array(this.nr);this.am=new Float64Array(this.nr);
      this.ap[0]=8/this.dr**2;
      for(let i=1;i<this.nr;i++){
        const r=i*this.dr,lo=r-this.dr/2,hi=r+this.dr/2,volume=(hi**4-lo**4)/4;
        this.ap[i]=hi**3/(this.dr*volume);this.am[i]=lo**3/(this.dr*volume);
      }
      for(let j=0;j<this.ny;j++)for(let i=0;i<this.nr;i++){
        const r=i*this.dr,y=this.ymin+j*this.dy,R=Math.hypot(r,y),deformed=Math.sqrt(r*r*stretch+y*y/stretch**2);
        const t=Math.max(0,Math.min(1,(1-deformed)/(.9*spacing)+.5));
        this.q[j*this.nr+i]=7.5*t*t*(3-2*t);
        this.chi[j*this.nr+i]=R<=1?1.25-.75*R*R:.5/R**3;
      }
      this.solve(900);this.initial=this.diagnostics();
    }
    sample(grid,r,y){
      const x=Math.max(0,Math.min(this.nr-1.000001,Math.abs(r)/this.dr));
      const z=Math.max(0,Math.min(this.ny-1.000001,(y-this.ymin)/this.dy));
      const i=Math.floor(x),j=Math.floor(z),a=x-i,b=z-j,k=j*this.nr+i;
      return (grid[k]*(1-a)+grid[k+1]*a)*(1-b)+(grid[k+this.nr]*(1-a)+grid[k+this.nr+1]*a)*b;
    }
    velocity(p){
      const r=Math.hypot(p[0],p[2]),radial=this.sample(this.ur,r,p[1]),axial=this.sample(this.uy,r,p[1]);
      return r<1e-12?[0,axial,0]:[radial*p[0]/r,axial,radial*p[2]/r];
    }
    inside(p){return p[0]*p[0]*this.stretch+p[2]*p[2]*this.stretch+p[1]*p[1]/this.stretch**2<=1;}
    contains(p,margin=0){return Math.hypot(p[0],p[2])<this.rmax-margin&&p[1]>this.ymin+margin&&p[1]<this.ymax-margin;}
    mapInitial(p){return[p[0]/Math.sqrt(this.stretch),p[1]*this.stretch,p[2]/Math.sqrt(this.stretch)];}
    diagnostics(){
      let mass=0,impulse=0,center=0,max=0,tail=0,axis=0;
      for(let j=1;j<this.ny-1;j++)for(let i=0;i<this.nr-1;i++){
        const r=i*this.dr,y=this.ymin+j*this.dy,q=this.q[j*this.nr+i],radialWeight=i?r*this.dr:this.dr**2/8;
        const v=q*radialWeight*this.dy,w=v*r*r;
        mass+=v;impulse+=w;center+=w*y;max=Math.max(max,q);
        if(y<-1.5)tail+=v;if(i===0)axis=Math.max(axis,q);
      }
      return {mass,impulse,center:Math.abs(impulse)>1e-12?center/impulse:0,max,tailFraction:Math.abs(mass)>1e-12?tail/mass:0,axisMax:axis};
    }
    solve(iterations=this.iterations){
      const n=this.nr,m=this.ny,chi=this.chi,q=this.q,az=1/this.dy**2;
      const moments=this.diagnostics(),C=moments.impulse/4,yc=moments.center;
      for(let j=0;j<m;j++)for(let i=0;i<n;i++)if(i===n-1||j===0||j===m-1){
        chi[j*n+i]=C/Math.hypot(i*this.dr,this.ymin+j*this.dy-yc)**3;
      }
      let error=0;
      for(let pass=0;pass<iterations;pass++){
        error=0;
        for(let j=1;j<m-1;j++)for(let i=0;i<n-1;i++){
          const k=j*n+i,ap=this.ap[i],am=this.am[i];
          const candidate=(ap*chi[k+1]+(i?am*chi[k-1]:0)+az*(chi[k-n]+chi[k+n])+q[k])/(ap+am+2*az);
          const delta=1.65*(candidate-chi[k]);chi[k]+=delta;error=Math.max(error,Math.abs(delta));
        }
        if(error<2e-7)break;
      }
      this.solveError=error;
      // 用同一个流函数构造单元面通量，使离散体积通量严格相消。
      const corner=(i,j)=>{
        if(i<0)return 0;
        const r=(i+.5)*this.dr,y=this.ymin+(j+.5)*this.dy;
        return r*r*(this.sample(chi,r,y)-this.frameSpeed/2);
      };
      for(let j=0;j<m;j++)for(let i=0;i<n;i++){
        const k=j*n+i;
        this.fluxR[k]=-(corner(i,j)-corner(i,j-1));
        this.fluxY[k]=corner(i,j)-corner(i-1,j);
      }
      for(let j=0;j<m;j++)for(let i=0;i<n;i++){
        const k=j*n+i,r=i*this.dr,jlo=Math.max(0,j-1),jhi=Math.min(m-1,j+1),ilo=Math.max(0,i-1),ihi=Math.min(n-1,i+1);
        this.ur[k]=-r*(chi[jhi*n+i]-chi[jlo*n+i])/((jhi-jlo)*this.dy);
        this.uy[k]=2*chi[k]+r*(chi[j*n+ihi]-chi[j*n+ilo])/((ihi-ilo)*this.dr)-this.frameSpeed;
      }
    }
    transport(source,target,dt){
      const n=this.nr,m=this.ny,sr=this.slopeR,sy=this.slopeY;
      const limiter=(a,b)=>a*b<=0?0:Math.sign(a)*Math.min(2*Math.abs(a),2*Math.abs(b),Math.abs(a+b)/2);
      for(let j=1;j<m-1;j++)for(let i=0;i<n-1;i++){
        const k=j*n+i;
        sr[k]=i?limiter(source[k]-source[k-1],source[k+1]-source[k]):0;
        sy[k]=limiter(source[k]-source[k-n],source[k+n]-source[k]);
      }
      const radial=(i,j)=>{
        if(i<0)return 0;
        const k=j*n+i,f=this.fluxR[k];
        return f*(f>=0?source[k]+sr[k]/2:source[k+1]-sr[k+1]/2);
      };
      const axial=(i,j)=>{
        const k=j*n+i,f=this.fluxY[k];
        return f*(f>=0?source[k]+sy[k]/2:source[k+n]-sy[k+n]/2);
      };
      target.fill(0);
      for(let j=1;j<m-1;j++)for(let i=0;i<n-1;i++){
        const k=j*n+i,volume=(i?i*this.dr**2:this.dr**2/8)*this.dy;
        target[k]=source[k]-dt*(radial(i,j)-radial(i-1,j)+axial(i,j)-axial(i,j-1))/volume;
      }
    }
    advance(dt=.025){
      let remaining=dt;
      while(remaining>1e-10){
        let rate=1;
        for(let j=1;j<this.ny-1;j++)for(let i=0;i<this.nr-1;i++){
          const k=j*this.nr+i,volume=(i?i*this.dr**2:this.dr**2/8)*this.dy;
          const outgoing=Math.max(0,this.fluxR[k])+(i?Math.max(0,-this.fluxR[k-1]):0)+Math.max(0,this.fluxY[k])+Math.max(0,-this.fluxY[k-this.nr]);
          rate=Math.max(rate,outgoing/volume);
        }
        const step=Math.min(remaining,.42/rate);
        this.transport(this.q,this.forward,step);
        const old=this.q;this.q=this.forward;this.solve();
        this.transport(this.q,this.next,step);
        for(let k=0;k<this.q.length;k++)this.next[k]=.5*(old[k]+this.next[k]);
        this.q=this.next;this.next=old;
        this.solve();this.time+=step;remaining-=step;
      }
    }
  }
  if(typeof module!=='undefined'&&module.exports)module.exports=VortexEvolution;else root.VortexEvolution=VortexEvolution;
})(typeof globalThis!=='undefined'?globalThis:this);
