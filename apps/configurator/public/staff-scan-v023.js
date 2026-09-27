const QR_SIZE=33,DATA_CODEWORDS=80,ECC_CODEWORDS=20,ALPHANUMERIC='0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZ $%*+-./:';

const parseWorkshopScanPayload=(value)=>{
  const payload=String(value||'').trim().toUpperCase();
  const match=/^SLS:WORKSHOP:1:([A-Z0-9_-]{3,96}):(REV-[A-Z0-9_-]{3,96})$/u.exec(payload);
  if(!match) throw new Error('Invalid workshop scan payload.');
  return {requestId:match[1],revisionId:match[2],payload};
};

const gfMultiply=(x,y)=>{let z=0;for(let i=7;i>=0;i-=1){z=(z<<1)^((z>>>7)*0x11d);if(((y>>>i)&1)!==0)z^=x;}return z&255;};
const rsGenerator=(degree)=>{const result=new Array(degree).fill(0);result[degree-1]=1;let root=1;for(let i=0;i<degree;i+=1){for(let j=0;j<result.length;j+=1){result[j]=gfMultiply(result[j],root);if(j+1<result.length)result[j]^=result[j+1];}root=gfMultiply(root,2);}return result;};
const rsRemainder=(data,degree)=>{const divisor=rsGenerator(degree),result=new Array(degree).fill(0);for(const byte of data){const factor=byte^result.shift();result.push(0);for(let i=0;i<result.length;i+=1)result[i]^=gfMultiply(divisor[i],factor);}return result;};
const appendBits=(target,value,length)=>{for(let i=length-1;i>=0;i-=1)target.push((value>>>i)&1);};
const encodeAlphanumeric=(payload)=>{
  if(payload.length>114)throw new Error('Workshop scan payload is too long for the local QR encoder.');
  for(const ch of payload)if(!ALPHANUMERIC.includes(ch))throw new Error('Workshop payload contains unsupported QR characters.');
  const bits=[];appendBits(bits,2,4);appendBits(bits,payload.length,9);
  for(let i=0;i<payload.length;i+=2){const a=ALPHANUMERIC.indexOf(payload[i]);if(i+1<payload.length)appendBits(bits,a*45+ALPHANUMERIC.indexOf(payload[i+1]),11);else appendBits(bits,a,6);}
  const capacity=DATA_CODEWORDS*8;appendBits(bits,0,Math.min(4,capacity-bits.length));while(bits.length%8)bits.push(0);
  const data=[];for(let i=0;i<bits.length;i+=8){let value=0;for(let j=0;j<8;j+=1)value=(value<<1)|bits[i+j];data.push(value);}
  let pad=0;while(data.length<DATA_CODEWORDS){data.push(pad%2===0?0xec:0x11);pad+=1;}return data;
};
const setFn=(matrix,reserved,x,y,dark)=>{if(x<0||y<0||x>=QR_SIZE||y>=QR_SIZE)return;matrix[y][x]=dark;reserved[y][x]=true;};
const drawFinder=(m,r,x,y)=>{for(let dy=-1;dy<=7;dy+=1)for(let dx=-1;dx<=7;dx+=1){const inside=dx>=0&&dx<=6&&dy>=0&&dy<=6;const dark=inside&&(dx===0||dx===6||dy===0||dy===6||(dx>=2&&dx<=4&&dy>=2&&dy<=4));setFn(m,r,x+dx,y+dy,dark);}};
const drawAlignment=(m,r,cx,cy)=>{for(let dy=-2;dy<=2;dy+=1)for(let dx=-2;dx<=2;dx+=1)setFn(m,r,cx+dx,cy+dy,Math.max(Math.abs(dx),Math.abs(dy))!==1);};
const drawFormat=(m,r)=>{const bits=0x77c4,get=(i)=>((bits>>>i)&1)!==0;for(let i=0;i<=5;i+=1)setFn(m,r,8,i,get(i));setFn(m,r,8,7,get(6));setFn(m,r,8,8,get(7));setFn(m,r,7,8,get(8));for(let i=9;i<15;i+=1)setFn(m,r,14-i,8,get(i));for(let i=0;i<8;i+=1)setFn(m,r,QR_SIZE-1-i,8,get(i));for(let i=8;i<15;i+=1)setFn(m,r,8,QR_SIZE-15+i,get(i));setFn(m,r,8,QR_SIZE-8,true);};
const qrMatrix=(payloadInput)=>{
  const payload=parseWorkshopScanPayload(payloadInput).payload,data=encodeAlphanumeric(payload),codewords=[...data,...rsRemainder(data,ECC_CODEWORDS)];
  const matrix=Array.from({length:QR_SIZE},()=>Array(QR_SIZE).fill(false)),reserved=Array.from({length:QR_SIZE},()=>Array(QR_SIZE).fill(false));
  drawFinder(matrix,reserved,0,0);drawFinder(matrix,reserved,QR_SIZE-7,0);drawFinder(matrix,reserved,0,QR_SIZE-7);
  for(let i=8;i<QR_SIZE-8;i+=1){setFn(matrix,reserved,i,6,i%2===0);setFn(matrix,reserved,6,i,i%2===0);}
  drawAlignment(matrix,reserved,26,26);drawFormat(matrix,reserved);
  const bits=[];for(const codeword of codewords)appendBits(bits,codeword,8);
  let bitIndex=0,up=true;
  for(let right=QR_SIZE-1;right>=1;right-=2){if(right===6)right-=1;for(let vertical=0;vertical<QR_SIZE;vertical+=1){const y=up?QR_SIZE-1-vertical:vertical;for(let off=0;off<2;off+=1){const x=right-off;if(reserved[y][x])continue;let dark=bitIndex<bits.length?bits[bitIndex]===1:false;bitIndex+=1;if((x+y)%2===0)dark=!dark;matrix[y][x]=dark;}}up=!up;}
  return matrix;
};
const qrSvg=(payload,scale=3,quiet=4)=>{const matrix=qrMatrix(payload),size=matrix.length,dimension=(size+quiet*2)*scale,rects=[];for(let y=0;y<size;y+=1)for(let x=0;x<size;x+=1)if(matrix[y][x])rects.push('<rect x="'+((x+quiet)*scale)+'" y="'+((y+quiet)*scale)+'" width="'+scale+'" height="'+scale+'"/>');return '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 '+dimension+' '+dimension+'" role="img" aria-label="Workshop QR code"><rect width="100%" height="100%" fill="#fff"/><g fill="#000">'+rects.join('')+'</g></svg>';};

export function createWorkshopScanV023({el,state,openOrder}){
  let stream=null,scanTimer=0;
  const stopCamera=()=>{
    if(scanTimer)clearTimeout(scanTimer);scanTimer=0;
    if(stream){for(const track of stream.getTracks())track.stop();stream=null;}
    const dialog=el('scanCameraDialog');if(dialog&&dialog.open)dialog.close();
    const video=el('scanVideo');if(video)video.srcObject=null;
  };
  const verifyCurrent=(ref)=>{
    const packet=state.workshopPacket;
    if(!packet)return 'Order opened. No released workshop packet is available yet.';
    return packet.revisionId===ref.revisionId
      ? 'Matched active workshop revision '+ref.revisionId+'.'
      : 'Revision mismatch: scan '+ref.revisionId+' · active '+(packet.revisionId||'unknown')+'. Review before production work.';
  };
  const lookup=async(value)=>{
    const status=el('scanState');
    try{
      const ref=parseWorkshopScanPayload(value);
      status.textContent='Opening '+ref.requestId+'…';
      await openOrder(ref.requestId);
      status.textContent=verifyCurrent(ref);
      el('scanLookup').value=ref.payload;
      return true;
    }catch(error){
      status.textContent=error&&error.message?error.message:'Could not open scanned workshop build.';
      return false;
    }
  };
  const startCamera=async()=>{
    const status=el('scanState');
    if(!('BarcodeDetector'in window)){status.textContent='Camera QR scanning is not supported in this browser. Use a USB scanner or paste the payload.';return;}
    try{
      const formats=await window.BarcodeDetector.getSupportedFormats();
      if(!formats.includes('qr_code')){status.textContent='This browser cannot decode QR codes. Use a USB scanner or paste the payload.';return;}
      const detector=new window.BarcodeDetector({formats:['qr_code']});
      stream=await navigator.mediaDevices.getUserMedia({video:{facingMode:{ideal:'environment'}},audio:false});
      const dialog=el('scanCameraDialog'),video=el('scanVideo');video.srcObject=stream;await video.play();dialog.showModal();status.textContent='Camera scanner active.';
      const tick=async()=>{
        if(!stream)return;
        try{
          const codes=await detector.detect(video);
          const raw=codes.find((code)=>code&&code.rawValue)?.rawValue;
          if(raw){stopCamera();await lookup(raw);return;}
        }catch{}
        scanTimer=window.setTimeout(tick,260);
      };
      tick();
    }catch(error){
      stopCamera();
      status.textContent=error&&error.message?error.message:'Camera scanner could not start.';
    }
  };
  const render=(packet)=>{
    const root=el('workshopQr');
    if(!root)return;
    root.replaceChildren();
    if(!packet||!packet.scanPayload){root.hidden=true;return;}
    const wrap=document.createElement('div');wrap.className='workshop-qr-code';wrap.innerHTML=qrSvg(packet.scanPayload,3);
    const meta=document.createElement('div');meta.className='workshop-qr-meta';
    const strong=document.createElement('strong');strong.textContent='Scan workshop packet';
    const code=document.createElement('code');code.textContent=packet.scanPayload;
    const copy=document.createElement('button');copy.type='button';copy.className='secondary';copy.textContent='Copy scan payload';
    copy.addEventListener('click',async()=>{try{await navigator.clipboard.writeText(packet.scanPayload);el('scanState').textContent='Workshop scan payload copied.';}catch{el('scanState').textContent='Clipboard unavailable. Select the payload text manually.';}});
    meta.append(strong,code,copy);root.append(wrap,meta);root.hidden=false;
  };
  el('scanCameraClose').addEventListener('click',stopCamera);
  el('scanCameraDialog').addEventListener('close',stopCamera);
  return {lookup,render,qrSvg,stopCamera,startCamera};
}
