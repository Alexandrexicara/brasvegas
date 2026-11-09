'use strict';
(()=>{
 const code=location.pathname.split('/').pop().replace('.html','');
 const token=localStorage.getItem('brasvegas-token')||'';
 const input=document.getElementById('a');
 const button=document.getElementById('btn');
 const result=document.getElementById('res');
 const balance=document.getElementById('s');
 let busy=false;
 const api=async(url,options={})=>{
  const response=await fetch('/api'+url,{...options,headers:{...(options.headers||{}),'Authorization':'Bearer '+token,...(options.body?{'Content-Type':'application/json'}:{})}});
  const data=await response.json().catch(()=>({erro:'Resposta inválida do servidor.'}));
  if(!response.ok)throw new Error(data.erro||'Falha na comunicação com o servidor.');
  return data;
 };
 const selection=()=>{
  if(code==='bacara'){
   const active=document.querySelector('#apJogador.ativa,#apBanco.ativa,#apEmpate.ativa');
   return {tipo:active?.id==='apBanco'?'banco':active?.id==='apEmpate'?'empate':'jogador'};
  }
  if(code==='craps'||code==='dados'){
   const noPass=document.getElementById('apNaoPassar');
   return {tipo:noPass?.classList.contains('ativa')?'naopassar':'passar'};
  }
  if(code==='caca-niqueis'||code==='frutas')return {type:'spin'};
  if(code==='parede-sorte')return {type:'drop'};
  return null;
 };
 const renderState=(gameCode,perBet)=>{
  if(!perBet)return 'Resultado recebido.';
  if(gameCode==='bacara')return 'Jogador '+perBet.playerTotal+' × Banco '+perBet.bankerTotal+' — '+perBet.winner;
  if(gameCode==='craps'||gameCode==='dados')return 'Dados: '+perBet.rolls.map(x=>x.join(' + ')).join(' → ');
  if(gameCode==='caca-niqueis'||gameCode==='frutas')return perBet.symbols.join(' | ')+' — multiplicador '+perBet.multiplier+'x';
  if(gameCode==='parede-sorte')return 'Multiplicador: '+perBet.multiplier+'x';
  return JSON.stringify(perBet);
 };
 async function carregarSaldo(){
  if(!token)return;
  const user=await api('/usuario');
  if(balance)balance.textContent=Number(user.saldo).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
 };
 async function jogar(){
  if(busy)return;
  if(!token){result.textContent='Faça login para jogar.';return;}
  const value=Number(input?.value);
  if(!Number.isFinite(value)||value<=0){result.textContent='Informe uma aposta válida.';return;}
  busy=true;if(button)button.disabled=true;
  try{
   const current=await api('/jogos/'+code+'/rodada-atual');
   const bet=await api('/rodadas/'+current.rodada.id+'/apostas',{method:'POST',body:JSON.stringify({valor:value,selecao:selection()})});
   result.textContent='Aposta registrada na rodada '+current.rodada.numero+'. Aguardando resultado...';
   let final=null;
   for(let i=0;i<25;i++){
    await new Promise(resolve=>setTimeout(resolve,2000));
    const state=await api('/rodadas/'+current.rodada.id);
    if(state.status==='paga'||state.status==='encerrada'){final=state;break;}
   }
   if(!final){result.textContent='Aposta confirmada. Resultado será atualizado quando a rodada encerrar.';return;}
   const detail=final.resultado?.byBetId?.[bet.apostaId]||final.resultado?.result?.porAposta?.[bet.apostaId]||final.resultado?.result;
   const won=final.aposta?.status==='paga';
   result.textContent=(won?'VOCÊ GANHOU · ':'VOCÊ NÃO GANHOU · ')+renderState(code,detail)+' · Prêmio: R$ '+Number(final.aposta?.premioRecebido||0).toFixed(2);
   await carregarSaldo();
  }catch(error){result.textContent=error.message;}
  finally{busy=false;if(button)button.disabled=false;}
 };
 document.querySelectorAll('#apJogador,#apBanco,#apEmpate,#apPassar,#apNaoPassar').forEach(el=>el.addEventListener('click',()=>{
  document.querySelectorAll('#apJogador,#apBanco,#apEmpate,#apPassar,#apNaoPassar').forEach(x=>x.classList.remove('ativa'));el.classList.add('ativa');
 }));
 if(button)button.addEventListener('click',jogar);
 if(result&&!token)result.textContent='Faça login para acessar as rodadas multiplayer.';
 carregarSaldo().catch(()=>{});
})();