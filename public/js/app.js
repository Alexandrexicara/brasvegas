const API_BASE = 'https://brasvegas.onrender.com/api';
let token = localStorage.getItem('brasvegas-token') || '';
let usuario = JSON.parse(localStorage.getItem('brasvegas-user') || 'null');
let apostaEscolhida = null;

function alternarVisibilidadeSenha(id, botao) {
  const campo = document.getElementById(id);
  if (!campo) return;
  const mostrar = campo.type === 'password';
  campo.type = mostrar ? 'text' : 'password';
  botao.textContent = mostrar ? '🙈' : '👁️';
  botao.setAttribute('aria-label', mostrar ? 'Ocultar senha' : 'Mostrar senha');
  botao.setAttribute('title', mostrar ? 'Ocultar senha' : 'Mostrar senha');
}

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
  const nome = document.getElementById('nome-completo')?.value.trim();
  const cpf = document.getElementById('cpf')?.value.trim();
  const nasc = document.getElementById('data-nascimento')?.value;
  const email = document.getElementById('email-cadastro')?.value.trim();
  const tel = document.getElementById('telefone')?.value.trim();
  const senha = document.getElementById('senha-cadastro')?.value;
  if (!nome||!cpf||!nasc||!email||!senha) return alert('Preencha todos os campos');
  const botao = document.querySelector('.auth-container button[onclick="fazerCadastro()"]');
  if (botao) { botao.disabled = true; botao.textContent = 'ENVIANDO...'; }
  try {
    const res = await fetch(`${API_BASE}/cadastro`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomeCompleto:nome, cpf, dataNascimento:nasc, email, telefone:tel, senha })
    });
    const d = await res.json().catch(() => ({}));
    if (!res.ok) throw new Error(d.erro || `Falha no servidor (HTTP ${res.status})`);
    if (d.erro) return alert(d.erro);
    if (!d.sucesso) throw new Error(d.mensagem || 'Não foi possível concluir o cadastro.');
    alert((d.mensagem || 'Cadastro realizado!')+' — Faça login!');
    window.location.href='login.html';
  } catch (erro) {
    alert('Não foi possível realizar o cadastro: ' + (erro.message || 'verifique sua conexão e tente novamente.'));
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = 'CADASTRAR'; }
  }
}

function sair() { localStorage.clear(); window.location.href='index.html'; }

async function carregarSaldo() {
  if (!token) return;
  const res = await fetch(`${API_BASE}/usuario`, { headers: { 'Authorization': token } });
  const d = await res.json();
  if (d.saldo && usuario) usuario.saldo = d.saldo;
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
  const roleta = document.getElementById('roleta');
  if (roleta) roleta.classList.add('girando');
  setTimeout(async () => {
    const res = await fetch(`${API_BASE}/roleta/apostar`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': token },
      body: JSON.stringify({ tipoAposta: apostaEscolhida, valor, numeroEscolhido: numero })
    });
    const d = await res.json();
    if (roleta) roleta.classList.remove('girando');
    if (d.erro) return alert(d.erro);
    const resEl = document.getElementById('resultado');
    if (resEl) {
      resEl.style.display='block';
      resEl.innerHTML = `<p>Sorteado: <strong>${d.numero} — ${d.cor.toUpperCase()}</strong></p>
        <p style="color:${d.ganhou?'#39ff14':'#e50914'}">${d.ganhou?'✅ GANHOU! +R$ '+d.valorGanho.toFixed(2):'❌ PERDEU'}</p>
        <p>Saldo: R$ ${d.saldo.toFixed(2)}</p>`;
    }
    if (usuario) usuario.saldo = d.saldo;
    atualizarInterface();
  }, 4000);
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
