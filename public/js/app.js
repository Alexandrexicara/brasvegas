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
      resEl.innerHTML = `<p><strong>APOSTA REGISTRADA</strong></p>
        <p>Rodada #${rodadaData.rodada.numero}</p>
        <p>Taxa da plataforma: 10%</p>
        <p>Valor reservado para o prêmio: R$ ${Number(d.valorReservadoParaPremio).toFixed(2)}</p>
        <p>O resultado será publicado quando a rodada for encerrada.</p>`;
    }
    await carregarSaldo();
  } catch (e) {
    alert(e.message);
  } finally {
    if (roleta) roleta.classList.remove('girando');
  }
}

async function confirmarDeposito() {
  const valor = Number(document.getElementById('valor-deposito')?.value);
  if (!valor || valor <= 0) return alert('Valor inválido!');
  const res = await fetch(`${API_BASE}/deposito`, {
    method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': token },
    body: JSON.stringify({ valor })
  });
  const d = await res.json();
  if (d.erro) return alert(d.erro);
  alert(`✅ Depósito de R$ ${valor.toFixed(2)}! Saldo: R$ ${d.saldoAtual.toFixed(2)}`);
  fecharModalDeposito(); carregarSaldo();
}

function abrirModalDeposito() { document.getElementById('modal-deposito')?.classList.add('aberto'); }
function fecharModalDeposito() { document.getElementById('modal-deposito')?.classList.remove('aberto'); }
function abrirModalSaque() { document.getElementById('modal-saque')?.classList.add('aberto'); }
function fecharModalSaque() { document.getElementById('modal-saque')?.classList.remove('aberto'); }

document.addEventListener('DOMContentLoaded', () => {
  atualizarInterface();
  if (token && window.location.pathname.includes('index.html')) window.location.href='salao.html';
});
