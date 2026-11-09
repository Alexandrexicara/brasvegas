'use strict';
(()=>{
 const token=localStorage.getItem('brasvegas-token')||'';
 const amount=document.getElementById('aposta'),balance=document.getElementById('saldo'),result=document.getElementById('res');
 const playerCards=document.getElementById('cartas-jogador'),dealerCards=document.getElementById('cartas-banca');
 const playerTotal=document.getElementById('pontos-jogador'),dealerTotal=document.getElementById('pontos-banca');
 const newBtn=document.getElementById('btn-nova'),hitBtn=document.getElementById('btn-pedir'),standBtn=document.getElementById('btn-parar');
 let betId=null,roundId=null,busy=false,finished=false;
 const api=async(url,options={})=>{
  const response=await fetch('/api'+url,{...options,headers:{...(options.headers||{}),'Authorization':'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})}});
  const data=await response.json().catch(()=>({erro:'Resposta inválida do servidor.'}));
  if(!response.ok)throw new Error(data.erro||'Falha no servidor.');
  return data;
 };
 const card=c=>({v:c.rank,n:c.suit,cor:['♥','♦'].includes(c.suit)?'vermelho':'preto'});
 function paint(container,cards,hideHole=false){
  container.innerHTML='';
  cards.forEach((raw,i)=>{
   const c=card(raw),el=document.createElement('div');
   el.className='carta '+(c.cor==='vermelho'?'vermelho':'preto');
   if(hideHole&&i===1){el.className='carta costa';el.textContent='🂠';}
   else el.innerHTML='<div>'+c.v+c.n+'</div><div class="texto">'+c.n+'</div><div class="valor-carta">'+c.v+c.n+'</div>';
   container.appendChild(el);
  });
 }
 async function refreshBalance(){
  const user=await api('/usuario');
  balance.textContent=Number(user.modoJogo==='treino'?user.saldoTreino:user.saldo).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
  if(user.modoJogo==='treino'&&!document.getElementById('modo-treino-label')){const label=document.createElement('small');label.id='modo-treino-label';label.textContent=' · FICHAS DE TREINO';balance.insertAdjacentElement('afterend',label);}
 }
 function showState(state){
  paint(playerCards,state.player||[]);
  paint(dealerCards,state.dealer||[],state.status==='playing');
  playerTotal.textContent='('+Number(state.playerTotal||0)+')';
  dealerTotal.textContent=state.status==='done'?'('+Number(state.dealerTotal||0)+')':'(?)';
  finished=state.status==='done';
  hitBtn.disabled=finished;standBtn.disabled=finished;
  if(finished)result.textContent=state.outcome==='win'||state.outcome==='blackjack'?'Mão vencida! Aguardando apuração da rodada.':state.outcome==='push'?'Empate na mão. Aguardando apuração.':'Mão perdida. Aguardando apuração.';
 }
 async function newHand(){
  if(busy)return;
  if(!token){result.textContent='Faça login para jogar.';return;}
  const value=Number(amount.value);
  if(!Number.isFinite(value)||value<=0){result.textContent='Informe uma aposta válida.';return;}
  busy=true;newBtn.disabled=true;hitBtn.disabled=true;standBtn.disabled=true;
  try{
   const current=await api('/jogos/blackjack/rodada-atual');
   const bet=await api('/rodadas/'+current.rodada.id+'/apostas',{method:'POST',body:JSON.stringify({valor:value,selecao:{actions:[]}})});
   betId=bet.apostaId;roundId=current.rodada.id;
   showState(bet.gameState);
   if(!finished){result.textContent=(current.modoJogo==='treino'?'MODO TREINO · fichas virtuais sem valor monetário. ':'')+'Sua mão foi distribuída pelo servidor. Escolha pedir ou parar.';}
   await refreshBalance();
   }catch(e){
   result.textContent=e.message;newBtn.disabled=false;
   if(e.message.includes('Saldo de treino insuficiente')){
    const refill=document.createElement('button');refill.textContent='RECARREGAR FICHAS DE TREINO';
    refill.onclick=async()=>{try{await api('/treino/recarregar',{method:'POST',body:JSON.stringify({})});await refreshBalance();result.textContent='Fichas de treino recarregadas. Jogue novamente.';}catch(x){result.textContent=x.message;}};
    result.appendChild(document.createElement('br'));result.appendChild(refill);
   }
  }
  finally{busy=false;}
 }
 async function action(acao){
  if(busy||!betId||finished)return;
  busy=true;hitBtn.disabled=true;standBtn.disabled=true;
  try{
   const data=await api('/blackjack/'+betId+'/acao',{method:'POST',body:JSON.stringify({acao})});
   showState(data.gameState);
   if(finished)await settle();
   else{hitBtn.disabled=false;standBtn.disabled=false;}
  }catch(e){result.textContent=e.message;hitBtn.disabled=false;standBtn.disabled=false;}
  finally{busy=false;}
 }
 async function settle(){
  let final=null;
  for(let i=0;i<25;i++){
   await new Promise(resolve=>setTimeout(resolve,2000));
   const state=await api('/rodadas/'+roundId);
   if(state.status==='paga'||state.status==='encerrada'){final=state;break;}
  }
  if(final){
   const detail=final.resultado?.byBetId?.[betId];
   result.textContent=(final.modo==='treino'?'MODO TREINO · ':'')+(final.aposta?.status==='paga'?'VOCÊ GANHOU · ':'RODADA ENCERRADA · ')+(detail?.outcome||'resultado apurado')+' · Prêmio R$ '+Number(final.aposta?.premioRecebido||0).toFixed(2);
   await refreshBalance();
  }else result.textContent+=' Resultado da rodada será atualizado quando encerrar.';
  newBtn.disabled=false;
 }
 newBtn.addEventListener('click',newHand);
 hitBtn.addEventListener('click',()=>action('hit'));
 standBtn.addEventListener('click',()=>action('stand'));
 if(!token)result.textContent='Faça login para acessar o blackjack multiplayer.';
 refreshBalance().catch(()=>{});
})();