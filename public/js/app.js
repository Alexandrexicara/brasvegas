const API_BASE = 'https://brasvegas.onrender.com/api';
let token = localStorage.getItem('brasvegas-token') || '';
let usuario = JSON.parse(localStorage.getItem('brasvegas-user') || 'null');
let apostaEscolhida = null;

function mostrarAviso(mensagem, tipo = 'info', detalhe = '') {
  let area = document.getElementById('avisos-brasvegas');
  if (!area) {
    area = document.createElement('div');
    area.id = 'avisos-brasvegas';
    area.className = 'avisos-brasvegas';
    area.setAttribute('role', 'status');
    area.setAttribute('aria-live', 'polite');
    document.body.appendChild(area);
  }
  const aviso = document.createElement('div');
  aviso.className = 'aviso-brasvegas aviso-' + tipo;
  const titulo = document.createElement('strong');
  titulo.textContent = tipo === 'erro' ? '⚠️ Atenção' : tipo === 'sucesso' ? '✅ Tudo certo' : 'ℹ️ Dica';
  const texto = document.createElement('span');
  texto.textContent = mensagem;
  aviso.append(titulo, texto);
  if (detalhe) {
    const ajuda = document.createElement('small');
    ajuda.textContent = detalhe;
    aviso.appendChild(ajuda);
  }
  area.appendChild(aviso);
  window.setTimeout(() => aviso.classList.add('aviso-visivel'), 20);
  window.setTimeout(() => {
    aviso.classList.remove('aviso-visivel');
    window.setTimeout(() => aviso.remove(), 250);
  }, tipo === 'erro' ? 7000 : 4500);
}

function limparErros() {
  document.querySelectorAll('.campo-erro').forEach(el => el.classList.remove('campo-erro'));
  document.querySelectorAll('.mensagem-campo-erro').forEach(el => el.remove());
}

function erroCampo(id, mensagem, orientacao) {
  const campo = document.getElementById(id);
  if (campo) {
    campo.classList.add('campo-erro');
    const ajuda = document.createElement('small');
    ajuda.className = 'mensagem-campo-erro';
    ajuda.textContent = mensagem;
    campo.insertAdjacentElement('afterend', ajuda);
    campo.focus();
  }
  mostrarAviso(mensagem, 'erro', orientacao || 'Confira este campo e tente novamente.');
  return false;
}

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
  if (saldoEl && usuario) saldoEl.textContent = Number(usuario.saldo || 0).toLocaleString('pt-BR', { minimumFractionDigits: 2 });
}

async function lerResposta(res) {
  const dados = await res.json().catch(() => ({}));
  if (!res.ok) throw new Error(dados.erro || dados.mensagem || 'O servidor não conseguiu concluir a solicitação (HTTP ' + res.status + ').');
  if (dados.erro) throw new Error(dados.erro);
  return dados;
}

function explicarErro(erro) {
  const msg = erro?.message || 'Ocorreu um erro inesperado.';
  if (/Failed to fetch|NetworkError|fetch/i.test(msg)) return 'Não foi possível conectar ao servidor. Verifique sua internet e tente novamente. Se continuar, aguarde o serviço carregar.';
  if (/CPF ou E-mail já cadastrado/i.test(msg)) return 'Este CPF ou e-mail já está cadastrado. Entre na sua conta ou use outro cadastro.';
  if (/18 anos/i.test(msg)) return 'O cadastro exige idade mínima de 18 anos. Confira sua data de nascimento.';
  if (/senha incorreta/i.test(msg)) return 'A senha não confere. Verifique se digitou corretamente e tente novamente.';
  if (/usuário não encontrado/i.test(msg)) return 'Não encontramos uma conta com esse e-mail. Confira o endereço ou faça seu cadastro.';
  if (/saldo insuficiente/i.test(msg)) return 'Seu saldo não cobre esse valor. Reduza o valor ou confira seu saldo disponível.';
  return msg;
}

async function fazerLogin() {
  limparErros();
  const emailCampo = document.getElementById('email-login');
  const senhaCampo = document.getElementById('senha-login');
  const email = emailCampo?.value.trim();
  const senha = senhaCampo?.value;
  if (!email) return erroCampo('email-login', 'Informe seu e-mail.', 'Digite o e-mail usado no cadastro.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erroCampo('email-login', 'O formato do e-mail parece inválido.', 'Exemplo: nome@provedor.com');
  if (!senha) return erroCampo('senha-login', 'Informe sua senha.', 'Digite a senha criada no cadastro.');
  const botao = document.querySelector('button[onclick="fazerLogin()"]');
  if (botao) { botao.disabled = true; botao.textContent = 'ENTRANDO...'; }
  try {
    const res = await fetch(`${API_BASE}/login`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ email, senha })
    });
    const d = await lerResposta(res);
    if (!d.sucesso) throw new Error(d.mensagem || 'Não foi possível entrar.');
    salvarSessao(d.token, d.usuario);
    mostrarAviso('Login realizado. Estamos abrindo seu salão de jogos.', 'sucesso');
    window.location.href = 'salao.html';
  } catch (erro) {
    mostrarAviso(explicarErro(erro), 'erro', 'Confira os dados informados. Se esqueceu a senha, será necessário recuperar o acesso.');
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = 'ENTRAR'; }
  }
}

async function fazerCadastro() {
  limparErros();
  const nome = document.getElementById('nome-completo')?.value.trim();
  const cpf = document.getElementById('cpf')?.value.trim();
  const nasc = document.getElementById('data-nascimento')?.value;
  const email = document.getElementById('email-cadastro')?.value.trim();
  const tel = document.getElementById('telefone')?.value.trim();
  const senha = document.getElementById('senha-cadastro')?.value;
  if (!nome) return erroCampo('nome-completo', 'Informe seu nome completo.', 'Preencha com seu nome e sobrenome.');
  if (nome.split(/\s+/).length < 2) return erroCampo('nome-completo', 'Digite nome e sobrenome.', 'O cadastro precisa do nome completo.');
  if (!cpf) return erroCampo('cpf', 'Informe seu CPF.', 'Digite os 11 números do CPF, sem precisar colocar pontos ou traço.');
  if (cpf.replace(/\D/g, '').length !== 11) return erroCampo('cpf', 'O CPF precisa ter 11 números.', 'Confira os números digitados.');
  if (!nasc) return erroCampo('data-nascimento', 'Informe sua data de nascimento.', 'Selecione dia, mês e ano.');
  if (!email) return erroCampo('email-cadastro', 'O e-mail não foi informado.', 'Preencha o e-mail para receber informações e acessar sua conta.');
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return erroCampo('email-cadastro', 'O formato do e-mail parece inválido.', 'Exemplo: nome@provedor.com');
  if (!senha) return erroCampo('senha-cadastro', 'Crie uma senha.', 'Escolha uma senha para proteger sua conta.');
  if (senha.length < 8) return erroCampo('senha-cadastro', 'Sua senha está muito curta.', 'Use pelo menos 8 caracteres.');
  const dataNasc = new Date(nasc + 'T00:00:00');
  if (Number.isNaN(dataNasc.getTime()) || dataNasc >= new Date()) return erroCampo('data-nascimento', 'A data de nascimento não é válida.', 'Selecione uma data anterior a hoje.');
  const botao = document.querySelector('.auth-container button[onclick="fazerCadastro()"]');
  if (botao) { botao.disabled = true; botao.textContent = 'ENVIANDO...'; }
  try {
    const res = await fetch(`${API_BASE}/cadastro`, {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ nomeCompleto: nome, cpf: cpf.replace(/\D/g, ''), dataNascimento: nasc, email, telefone: tel, senha })
    });
    const d = await lerResposta(res);
    if (!d.sucesso) throw new Error(d.mensagem || 'Não foi possível concluir o cadastro.');
    mostrarAviso('Cadastro realizado com sucesso! Agora entre usando seu e-mail e senha.', 'sucesso');
    window.setTimeout(() => window.location.href = 'login.html', 1400);
  } catch (erro) {
    mostrarAviso(explicarErro(erro), 'erro', 'Confira os campos destacados. Se o aviso disser que o cadastro já existe, faça login.');
  } finally {
    if (botao) { botao.disabled = false; botao.textContent = 'CADASTRAR'; }
  }
}

function sair() {
  localStorage.removeItem('brasvegas-token');
  localStorage.removeItem('brasvegas-user');
  token = ''; usuario = null;
  window.location.href = 'index.html';
}

async function carregarSaldo() {
  if (!token) return;
  try {
    const res = await fetch(`${API_BASE}/usuario`, { headers: { 'Authorization': token } });
    const d = await lerResposta(res);
    if (usuario) usuario.saldo = d.saldo;
    atualizarInterface();
  } catch (erro) {
    mostrarAviso(explicarErro(erro), 'erro', 'Entre novamente se sua sessão tiver expirado.');
  }
}

function selecionarAposta(tipo) {
  apostaEscolhida = tipo;
  const el = document.getElementById('tipo-aposta');
  if (el) {
    const nomes = { vermelho: '🔴 VERMELHO', preto: '⚫ PRETO', verde: '🟢 VERDE', numero: '🔢 NÚMERO' };
    el.textContent = 'Aposta: ' + (nomes[tipo] || tipo);
  }
}

async function girarRoleta() {
  if (!token) return mostrarAviso('Você ainda não entrou na sua conta.', 'erro', 'Faça login antes de acessar uma aposta.');
  if (!apostaEscolhida) return mostrarAviso('Você ainda não escolheu uma opção.', 'erro', 'Selecione vermelho, preto, verde ou número antes de girar.');
  const valorCampo = document.getElementById('valor-aposta');
  const valor = Number(valorCampo?.value);
  const numero = document.getElementById('numero-escolhido')?.value;
  if (!valorCampo?.value || !Number.isFinite(valor) || valor <= 0) return mostrarAviso('Informe um valor válido para a aposta.', 'erro', 'Digite um valor maior que zero.');
  if (apostaEscolhida === 'numero' && (numero === '' || Number(numero) < 0 || Number(numero) > 36)) return mostrarAviso('Escolha um número entre 0 e 36.', 'erro', 'Confira o campo de número escolhido.');
  const roleta = document.getElementById('roleta');
  if (roleta) roleta.classList.add('girando');
  window.setTimeout(async () => {
    try {
      const res = await fetch(`${API_BASE}/roleta/apostar`, {
        method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': token },
        body: JSON.stringify({ tipoAposta: apostaEscolhida, valor, numeroEscolhido: numero })
      });
      const d = await lerResposta(res);
      const resEl = document.getElementById('resultado');
      if (resEl) {
        resEl.style.display = 'block';
        resEl.textContent = '';
        const linha1 = document.createElement('p');
        linha1.textContent = 'Sorteado: ' + d.numero + ' — ' + String(d.cor).toUpperCase();
        const linha2 = document.createElement('p');
        linha2.textContent = d.ganhou ? '✅ GANHOU! +R$ ' + Number(d.valorGanho).toFixed(2) : '❌ Não foi desta vez.';
        const linha3 = document.createElement('p');
        linha3.textContent = 'Saldo: R$ ' + Number(d.saldo).toFixed(2);
        resEl.append(linha1, linha2, linha3);
      }
      if (usuario) usuario.saldo = d.saldo;
      atualizarInterface();
      mostrarAviso(d.ganhou ? 'Parabéns! A rodada foi concluída com prêmio.' : 'Rodada concluída. Consulte seu saldo e tente novamente quando quiser.', d.ganhou ? 'sucesso' : 'info');
    } catch (erro) {
      mostrarAviso(explicarErro(erro), 'erro', 'Confira seu saldo e sua conexão antes de tentar novamente.');
    } finally {
      if (roleta) roleta.classList.remove('girando');
    }
  }, 4000);
}

async function confirmarDeposito() {
  if (!token) return mostrarAviso('Entre na sua conta antes de continuar.', 'erro', 'Faça login para acessar esta área.');
  const campo = document.getElementById('valor-deposito');
  const valor = Number(campo?.value);
  if (!campo?.value || !Number.isFinite(valor) || valor <= 0) return mostrarAviso('Informe um valor de depósito maior que zero.', 'erro', 'Digite o valor no campo indicado.');
  try {
    const res = await fetch(`${API_BASE}/deposito`, {
      method: 'POST', headers: { 'Content-Type': 'application/json', 'Authorization': token },
      body: JSON.stringify({ valor })
    });
    const d = await lerResposta(res);
    mostrarAviso('Créditos de treinamento adicionados: R$ ' + Number(d.saldoAtual).toFixed(2) + '.', 'sucesso', 'Este saldo é apenas para testes e não tem valor financeiro.');
    fecharModalDeposito();
    carregarSaldo();
  } catch (erro) {
    mostrarAviso(explicarErro(erro), 'erro', 'Confira o valor e sua conexão.');
  }
}

function abrirModalDeposito() { document.getElementById('modal-deposito')?.classList.add('aberto'); }
function fecharModalDeposito() { document.getElementById('modal-deposito')?.classList.remove('aberto'); }
function abrirModalSaque() { document.getElementById('modal-saque')?.classList.add('aberto'); }
function fecharModalSaque() { document.getElementById('modal-saque')?.classList.remove('aberto'); }

document.addEventListener('DOMContentLoaded', () => {
  atualizarInterface();
  if (token && window.location.pathname.includes('index.html')) window.location.href = 'salao.html';
  if (window.location.pathname.includes('salao.html')) {
    if (!token) mostrarAviso('Você não está conectado.', 'erro', 'Entre com seu e-mail e senha para acessar o salão.');
    else carregarSaldo();
  }
});
