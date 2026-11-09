'use strict';
(()=>{
 const token=localStorage.getItem('brasvegas-token')||'';
 const canvas=document.getElementById('mesa'),ctx=canvas.getContext('2d');
 const format=document.getElementById('formato'),amount=document.getElementById('valor-aposta'),joinBtn=document.getElementById('entrar'),shootBtn=document.getElementById('tacada'),power=document.getElementById('forca');
 const message=document.getElementById('mensagem'),score=document.getElementById('placar');
 let roundId=null,myBetId=null,state=null,aim={x:800,y:280},polling=false,joining=false,shooting=false;
 const pockets=[[42,42],[500,36],[958,42],[42,518],[500,524],[958,518]];
 const colors={1:'#f4d03f',2:'#2471a3',3:'#c0392b',4:'#7d3c98',5:'#e67e22',6:'#16a085',7:'#922b21',9:'#f4d03f',10:'#2471a3',11:'#c0392b',12:'#7d3c98',13:'#e67e22',14:'#16a085',15:'#922b21'};
 const api=async(url,options={})=>{
  const response=await fetch('/api'+url,{...options,headers:{...(options.headers||{}),'Authorization':'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})}});
  const data=await response.json().catch(()=>({erro:'Resposta inválida do servidor.'}));
  if(!response.ok)throw new Error(data.erro||'Falha na comunicação com o servidor.');
  return data;
 };
 function drawBall(b){
  ctx.beginPath();ctx.arc(b.x,b.y,12,0,Math.PI*2);ctx.fillStyle=b.id===0?'#fff':b.id===8?'#050505':b.group==='solid'?colors[b.id]:'#f4f4f4';ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#ddd';ctx.stroke();
  if(b.group==='stripe'){ctx.save();ctx.beginPath();ctx.arc(b.x,b.y,11,0,Math.PI*2);ctx.clip();ctx.fillStyle=colors[b.id]||'#ddd';ctx.fillRect(b.x-12,b.y-5,24,10);ctx.restore();}
  if(b.id!==0){ctx.fillStyle=b.id===8?'white':'#111';ctx.font='10px Arial';ctx.textAlign='center';ctx.fillText(b.id,b.x,b.y+3);}
 }
 function render(){
  ctx.clearRect(0,0,1000,560);ctx.fillStyle='#07532e';ctx.fillRect(0,0,1000,560);
  ctx.strokeStyle='#9b7136';ctx.lineWidth=30;ctx.strokeRect(15,15,970,530);
  pockets.forEach(([x,y])=>{ctx.beginPath();ctx.arc(x,y,23,0,Math.PI*2);ctx.fillStyle='#020604';ctx.fill();});
  (state?.balls||[]).filter(b=>!b.pocketed).forEach(drawBall);
  const cue=state?.balls?.find(b=>b.id===0&&!b.pocketed);
  if(cue&&state.isMyTurn&&state.status==='playing'){
   const dx=aim.x-cue.x,dy=aim.y-cue.y,len=Math.hypot(dx,dy)||1;
   ctx.beginPath();ctx.moveTo(cue.x,cue.y);ctx.lineTo(cue.x+dx/len*150,cue.y+dy/len*150);
   ctx.strokeStyle='rgba(255,255,255,.85)';ctx.setLineDash([8,7]);ctx.lineWidth=2;ctx.stroke();ctx.setLineDash([]);
  }
  score.innerHTML='';
  (state?.players||[]).forEach((p,i)=>{
   const el=document.createElement('div');el.className='player'+(state.turn===i&&state.status==='playing'?' turn':'');
   const group=p.group==='solid'?'Lisas':p.group==='stripe'?'Listradas':'Grupo aberto';
   el.textContent=(state.format===4?'Jogador '+(i+1)+' · Dupla '+(p.team+1):'Jogador '+(i+1))+' · '+group+(state.turn===i?' · Vez':'');
   score.appendChild(el);
  });
  shootBtn.disabled=!(state?.isMyTurn&&state.status==='playing')||shooting;
 }
 function describe(){
  if(!state){message.textContent='Entre em uma mesa para começar.';return;}
  if(state.status==='waiting'){message.textContent='Aguardando jogadores: '+state.players.length+'/'+state.format+' lugares ocupados.';return;}
  if(state.status==='finished'){message.textContent='Partida encerrada. Dupla vencedora: '+(state.winnerTeam+1)+'.';return;}
  if(state.isMyTurn){message.textContent='É sua vez. Mire na mesa e escolha a força da tacada.';return;}
  message.textContent='Aguardando a tacada do próximo jogador.';
  if(state.lastShot?.foul)message.textContent+=' Última jogada: falta.';
 }
 async function refresh(){
  if(!roundId||polling)return;
  polling=true;
  try{
   state=await api('/sinuca/'+roundId+'/estado');
   myBetId=state.myBetId||myBetId;
   describe();render();
   if(state.status==='finished'){
    const final=await api('/rodadas/'+roundId);
    if(final.status==='paga'||final.status==='encerrada'){
     const won=final.aposta?.status==='paga';
     message.textContent=(won?'VOCÊ VENCEU! ':'Partida finalizada. ')+ 'Prêmio: '+(final.modo==='treino'?'fichas ':'R$ ')+Number(final.aposta?.premioRecebido||0).toFixed(2);
     joinBtn.disabled=false;shootBtn.disabled=true;
     return;
    }
   }
  }catch(e){
   if(String(e.message).includes('não encontrada')||String(e.message).includes('encerrada')){
    try{
     const final=await api('/rodadas/'+roundId);
     if(final.status==='paga'||final.status==='encerrada'){
      const won=final.aposta?.status==='paga';
      message.textContent=(won?'VOCÊ VENCEU! ':'Partida encerrada. ')+'Prêmio: '+(final.modo==='treino'?'fichas ':'R$ ')+Number(final.aposta?.premioRecebido||0).toFixed(2);
      shootBtn.disabled=true;joinBtn.disabled=false;return;
     }
    }catch(_){}
   }else message.textContent=e.message;
  }
  finally{polling=false;}
  setTimeout(refresh,1500);
 }
 async function resume(){
  if(!token){message.textContent='Faça login para jogar sinuca multiplayer.';joinBtn.disabled=true;return;}
  try{
   const current=await api('/jogos/sinuca/rodada-atual');roundId=current.rodada.id;document.getElementById('modo-sinuca').textContent=current.modoJogo==='treino'?'MODO TREINO · fichas virtuais sem valor monetário':'MODO REAL · saldo monetário';
   state=await api('/sinuca/'+roundId+'/estado');myBetId=state.myBetId||null;
   if(myBetId){if(current.modoJogo==='treino')message.textContent='MODO TREINO · fichas virtuais sem valor monetário. ';joinBtn.disabled=true;format.disabled=true;amount.disabled=true;describe();render();refresh();}
   else{describe();render();}
  }catch(e){message.textContent=e.message;}
 }
 async function join(){
  if(joining)return;
  if(!token){message.textContent='Faça login para jogar.';return;}
  joining=true;joinBtn.disabled=true;
  try{
   const current=await api('/jogos/sinuca/rodada-atual');roundId=current.rodada.id;
   const bet=await api('/rodadas/'+roundId+'/apostas',{method:'POST',body:JSON.stringify({valor:Number(amount.value),selecao:{type:'join',format:Number(format.value)}})});
   myBetId=bet.apostaId;state=bet.gameState;if(bet.modoJogo==='treino')message.textContent='MODO TREINO · fichas virtuais sem valor monetário. ';format.disabled=true;amount.disabled=true;
   describe();render();refresh();
   }catch(e){
   message.textContent=e.message;joinBtn.disabled=false;
   if(e.message.includes('Saldo de treino insuficiente')){
    const refill=document.createElement('button');refill.textContent='RECARREGAR FICHAS DE TREINO';
    refill.onclick=async()=>{try{await api('/treino/recarregar',{method:'POST',body:JSON.stringify({})});message.textContent='Fichas de treino recarregadas. Entre novamente na mesa.';}catch(x){message.textContent=x.message;}};
    message.appendChild(document.createElement('br'));message.appendChild(refill);
   }
  }
  finally{joining=false;}
 }
 async function shoot(){
  if(shooting||!state?.isMyTurn||state.status!=='playing')return;
  const cue=state.balls.find(b=>b.id===0&&!b.pocketed);if(!cue)return;
  shooting=true;shootBtn.disabled=true;
  try{
   const angle=Math.atan2(aim.y-cue.y,aim.x-cue.x);
   state=await api('/sinuca/'+roundId+'/tacada',{method:'POST',body:JSON.stringify({angle,power:Number(power.value)})});
   describe();render();
  }catch(e){message.textContent=e.message;}
  finally{shooting=false;render();setTimeout(refresh,500);}
 }
 canvas.addEventListener('pointermove',e=>{
  const r=canvas.getBoundingClientRect();aim={x:(e.clientX-r.left)*1000/r.width,y:(e.clientY-r.top)*560/r.height};render();
 });
 canvas.addEventListener('pointerdown',e=>{
  const r=canvas.getBoundingClientRect();aim={x:(e.clientX-r.left)*1000/r.width,y:(e.clientY-r.top)*560/r.height};render();
 });
 joinBtn.addEventListener('click',join);shootBtn.addEventListener('click',shoot);
 resume();
})();