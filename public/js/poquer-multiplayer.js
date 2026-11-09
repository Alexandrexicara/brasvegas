'use strict';
(()=>{
 const token=localStorage.getItem('brasvegas-token')||'';
 const amount=document.getElementById('a'),balance=document.getElementById('s'),handEl=document.getElementById('mao'),result=document.getElementById('res');
 const drawBtn=document.getElementById('trocar'),newBtn=document.getElementById('nova');
 let betId=null,roundId=null,hand=[],status='idle',busy=false;
 const api=async(url,options={})=>{
  const response=await fetch('/api'+url,{...options,headers:{...(options.headers||{}),'Authorization':'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})}});
  const data=await response.json().catch(()=>({erro:'Resposta inválida do servidor.'}));
  if(!response.ok)throw new Error(data.erro||'Falha no servidor.');
  return data;
 };
 const value=c=>({v:c.rank,n:c.suit});
 function render(){
  handEl.innerHTML='';
  hand.forEach((c,i)=>{
   const el=document.createElement('div'),v=value(c);
   el.className='carta '+(['♥','♦'].includes(v.n)?'vm':'');
   el.innerHTML='<div>'+v.v+v.n+'</div><div style="font-size:28px;text-align:center">'+v.n+'</div>';
   el.addEventListener('click',()=>{if(status!=='draw')return;el.classList.toggle('selecionada');});
   handEl.appendChild(el);
  });
 }
 async function refreshBalance(){
  const user=await api('/usuario');
  balance.textContent=Number(user.saldo).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 }
 async function newHand(){
  if(busy)return;
  if(!token){result.textContent='Faça login para jogar.';return;}
  const value=Number(amount.value);
  if(!Number.isFinite(value)||value<=0){result.textContent='Informe uma aposta válida.';return;}
  busy=true;newBtn.disabled=true;drawBtn.disabled=true;
  try{
   const current=await api('/jogos/poquer/rodada-atual');
   const bet=await api('/rodadas/'+current.rodada.id+'/apostas',{method:'POST',body:JSON.stringify({valor:value,selecao:{type:'draw'}})});
   betId=bet.apostaId;roundId=current.rodada.id;hand=bet.gameState.hand;status=bet.gameState.status;
   render();result.textContent='Mão distribuída pelo servidor. Selecione as cartas que deseja trocar.';
   await refreshBalance();drawBtn.disabled=false;
  }catch(e){result.textContent=e.message;newBtn.disabled=false;}
  finally{busy=false;}
 }
 async function draw(){
  if(busy||!betId||status!=='draw')return;
  const indices=[...handEl.children].map((el,i)=>el.classList.contains('selecionada')?i:-1).filter(i=>i>=0);
  busy=true;drawBtn.disabled=true;newBtn.disabled=true;
  try{
   const data=await api('/poquer/'+betId+'/trocar',{method:'POST',body:JSON.stringify({indices})});
   hand=data.gameState.hand;status=data.gameState.status;render();
   result.textContent='Sua mão: '+(data.gameState.rank?.name||'avaliada')+'. Aguardando o encerramento da rodada.';
   let final=null;
   for(let i=0;i<25;i++){
    await new Promise(resolve=>setTimeout(resolve,2000));
    const state=await api('/rodadas/'+roundId);
    if(state.status==='paga'||state.status==='encerrada'){final=state;break;}
   }
   if(final){
    const detail=final.resultado?.byBetId?.[betId];
    result.textContent=(final.aposta?.status==='paga'?'VOCÊ VENCEU A MESA · ':'RODADA ENCERRADA · ')+(detail?.rank?.name||'mão apurada')+' · Prêmio R$ '+Number(final.aposta?.premioRecebido||0).toFixed(2);
    await refreshBalance();newBtn.disabled=false;
   }else result.textContent+=' Resultado será atualizado quando a rodada encerrar.';
  }catch(e){result.textContent=e.message;drawBtn.disabled=false;newBtn.disabled=false;}
  finally{busy=false;}
 }
 newBtn.addEventListener('click',newHand);drawBtn.addEventListener('click',draw);
 if(!token)result.textContent='Faça login para acessar o pôquer multiplayer.';
 refreshBalance().catch(()=>{});
})();