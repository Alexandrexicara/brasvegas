const API_BASE = '/api';
let token = localStorage.getItem('brasvegas-token') || '';
let usuario = JSON.parse(localStorage.getItem('brasvegas-user') || 'null');
let apostaEscolhida = null;

function salvarSessao(t, u) {
  token = t; usuario = u;
  localStorage.setItem('brasvegas-token', t);
  localStorage.setItem('brasvegas-user', JSON.stringify(u));
  atualizarInterface();
}

function atualizarInterface() {
  const saldoEl = document.getElementById('mostrar-saldo');
  if (saldoEl && usuario) saldoEl.textContent = Number(usuario.saldo||0).toLocaleString('pt-BR', {minimumFractionDigits:2});
}

async function fazerLogin() {
  const email = document.getElementById('email-login')?.value;
  const senha = document.getElementById('senha-login')?.value;
  if (!email || !senha) return alert('Preencha e-mail e senha');
  const res = await fetch(`${API_BASE}/login`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ email, senha })
  });
  const d = await res.json();
  if (d.erro) return alert(d.erro);
  if (d.sucesso) { salvarSessao(d.token, d.usuario); window.location.href='salao.html'; }
}

async function fazerCadastro() {
  const nome = document.getElementById('nome-completo')?.value;
  const cpf = document.getElementById('cpf')?.value;
  const nasc = document.getElementById('data-nascimento')?.value;
  const email = document.getElementById('email-cadastro')?.value;
  const tel = document.getElementById('telefone')?.value;
  const senha = document.getElementById('senha-cadastro')?.value;
  if (!nome||!cpf||!nasc||!email||!senha) return alert('Preencha todos os campos');
  const res = await fetch(`${API_BASE}/cadastro`, {
    method: 'POST', headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ nomeCompleto:nome, cpf, dataNascimento:nasc, email, telefone:tel, senha })
  });
  const d = await res.json();
  if (d.erro) return alert(d.erro);
  alert(d.mensagem+' — Faça login!'); window.location.href='login.html';
}

function sair() { localStorage.clear(); window.location.href='index.html'; }

async function carregarSaldo() {
  if (!token) return;
  const res = await fetch(`${API_BASE}/usuario`, { headers: { 'Authorization': 'Bearer ' + token } });
  const d = await res.json();
  if (typeof d.saldo === 'number' && usuario) { usuario.saldo = d.saldo; localStorage.setItem('brasvegas-user', JSON.stringify(usuario)); }
  atualizarInterface();
}

function selecionarAposta(tipo) {
  apostaEscolhida = tipo;
  const el = document.getElementById('tipo-aposta');
  if (el) {
    const nomes = { vermelho:'🔴 VERMELHO', preto:'⚫ PRETO', verde:'🟢 VERDE', numero:'🔢 NÚMERO' };
    el.textContent = 'Aposta: ' + nomes[tipo];
  }
}

async function girarRoleta() {
  if (!token) return alert('Faça login primeiro!');
  if (!apostaEscolhida) return alert('Escolha onde apostar!');
  const valor = Number(document.getElementById('valor-aposta')?.value);
  const numero = document.getElementById('numero-escolhido')?.value;
  if (!valor || valor <= 0) return alert('Valor inválido!');
  const selecao = apostaEscolhida === 'numero'
    ? { tipo: 'numero', numero: Number(numero) }
    : { tipo: apostaEscolhida };
  const roleta = document.getElementById('roleta');
  if (roleta) roleta.classList.add('girando');
  try {
    const rodadaRes = await fetch(`${API_BASE}/jogos/roleta/rodada-atual`, {
      headers: { 'Authorization': 'Bearer ' + token }
    });
    const rodadaData = await rodadaRes.json();
    if (!rodadaRes.ok) throw new Error(rodadaData.erro || 'Não foi possível abrir a rodada.');
    const apostaRes = await fetch(`${API_BASE}/rodadas/${rodadaData.rodada.id}/apostas`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
      body: JSON.stringify({ valor, selecao })
    });
    const d = await apostaRes.json();
    if (!apostaRes.ok) throw new Error(d.erro || 'Aposta não registrada.');
    const resEl = document.getElementById('resultado');
    if (resEl) {
      resEl.style.display = 'block';
      resEl.textContent = 'Aposta confirmada na rodada #' + rodadaData.rodada.numero + '. Aguardando o encerramento automático.';
    }
    let rodadaFinal=null;
    for(let tentativa=0;tentativa<25;tentativa++){
      await new Promise(resolve=>setTimeout(resolve,2000));
      const consulta=await fetch(`${API_BASE}/rodadas/${rodadaData.rodada.id}`,{headers:{'Authorization':'Bearer '+token}});
      const estado=await consulta.json();
      if(!consulta.ok)throw new Error(estado.erro||'Falha ao consultar resultado.');
      if(estado.status==='paga'||estado.status==='encerrada'){rodadaFinal=estado;break;}
    }
    if(resEl){
      if(!rodadaFinal)resEl.textContent='Aposta registrada. A rodada ainda está aberta; consulte novamente em instantes.';
      else{
        const ganhou=rodadaFinal.aposta?.status==='paga';
        const premio=Number(rodadaFinal.aposta?.premioRecebido||0);
        const sorteio=rodadaFinal.resultado?.result||{};
        resEl.innerHTML=`<p><strong>${ganhou?'VOCÊ GANHOU':'RODADA ENCERRADA'}</strong></p>
          <p>Resultado: ${sorteio.number??JSON.stringify(sorteio)}</p>
          <p>Seu prêmio: R$ ${premio.toFixed(2)}</p>`;
      }
    }
    await carregarSaldo();
  } catch (e) {
    alert(e.message);
  } finally {
    if (roleta) roleta.classList.remove('girando');
  }
}

async function confirmarDeposito() {
  if (!token) return alert('Faça login primeiro.');
  const pendente = localStorage.getItem('brasvegas-pix-pendente');
  if (pendente) {
    const res = await fetch(`${API_BASE}/pix/cobrancas/${pendente}/confirmar`, {
      method: 'POST', headers: { 'Authorization': 'Bearer ' + token }
    });
    const d = await res.json();
    if (!res.ok && res.status !== 202) return alert(d.erro || 'Não foi possível consultar o Pix.');
    if (!d.confirmado) return alert('O Sicoob ainda não confirmou o pagamento. Depois de pagar, toque novamente em Confirmar.');
    localStorage.removeItem('brasvegas-pix-pendente');
    alert('Pix confirmado pelo Sicoob! Suas fichas foram creditadas.');
    await carregarSaldo();
    fecharModalDeposito();
    return;
  }
  const valor = Number(document.getElementById('valor-deposito')?.value);
  if (!valor || valor < 1) return alert('Informe um valor a partir de R$ 1,00.');
  const res = await fetch(`${API_BASE}/pix/cobrancas`, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'Authorization': 'Bearer ' + token },
    body: JSON.stringify({ valor })
  });
  const d = await res.json();
  if (!res.ok) return alert(d.erro || 'Não foi possível gerar o Pix.');
  localStorage.setItem('brasvegas-pix-pendente', d.cobrancaId);
  if (d.pixCopiaECola && navigator.clipboard?.writeText) {
    try { await navigator.clipboard.writeText(d.pixCopiaECola); } catch (_) {}
  }
  alert('Cobrança Pix criada. ' + (d.pixCopiaECola ? 'O código Pix Copia e Cola foi copiado, se o navegador permitiu. ' : '') + 'Pague no aplicativo do seu banco e depois toque novamente em Confirmar para consultar o Sicoob.');
  if (d.pixCopiaECola) prompt('Pix Copia e Cola:', d.pixCopiaECola);
}

function abrirModalDeposito() { document.getElementById('modal-deposito')?.classList.add('aberto'); }
function fecharModalDeposito() { document.getElementById('modal-deposito')?.classList.remove('aberto'); }
function abrirModalSaque() { document.getElementById('modal-saque')?.classList.add('aberto'); }
function fecharModalSaque() { document.getElementById('modal-saque')?.classList.remove('aberto'); }

document.addEventListener('DOMContentLoaded', () => {
  atualizarInterface();
  if (token && window.location.pathname.includes('index.html')) window.location.href='salao.html';
});
