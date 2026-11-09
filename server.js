require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { v4: uuidv4 } = require('uuid');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET || 'chave_temporaria_mudar_producao';

// ==================== CONEXÃO POSTGRESQL ====================
const pool = new Pool({
  host: process.env.DB_HOST || 'localhost',
  port: Number(process.env.DB_PORTA || 5432),
  database: process.env.DB_NOME || 'brasvegas',
  user: process.env.DB_USUARIO || 'postgres',
  password: process.env.DB_SENHA || '',
  ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false
});

// Testa conexão
pool.connect()
  .then(() => console.log('✅ CONECTADO AO POSTGRESQL COM SUCESSO!'))
  .catch(e => console.log('⚠️  SEM CONEXÃO — Crie o banco e configure .env:', e.message));

// ==================== VERIFICA LICENÇA ====================
const LICENCA_ATIVA = !!(process.env.MF_LICENCA_NUMERO && process.env.MF_API_CHAVE);

if (!LICENCA_ATIVA) {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  ⚠️  LICENÇA NÃO CONFIGURADA — MODO DEMONSTRAÇÃO      ║
║  Preencha .env com dados da licença do MF/SPA          ║
╚══════════════════════════════════════════════════════╝`);
} else {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  ✅ LICENÇA ATIVA — Operação autorizada               ║
║  Número: ${process.env.MF_LICENCA_NUMERO}             ║
╚══════════════════════════════════════════════════════╝`);
}

// ==================== CRIA TABELAS SE NÃO EXISTIREM ====================
async function criarTabelas() {
  await pool.query(`
    CREATE TABLE IF NOT EXISTS usuarios (
      id TEXT PRIMARY KEY,
      nome_completo TEXT NOT NULL,
      cpf TEXT UNIQUE NOT NULL,
      data_nascimento DATE NOT NULL,
      email TEXT UNIQUE NOT NULL,
      telefone TEXT,
      senha TEXT NOT NULL,
      saldo NUMERIC DEFAULT 0,
      status TEXT DEFAULT 'ativo',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS transacoes (
      id TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL REFERENCES usuarios(id),
      tipo TEXT NOT NULL,
      valor NUMERIC NOT NULL,
      saldo_anterior NUMERIC,
      saldo_posterior NUMERIC,
      status TEXT DEFAULT 'pendente',
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );

    CREATE TABLE IF NOT EXISTS apostas (
      id TEXT PRIMARY KEY,
      usuario_id TEXT NOT NULL REFERENCES usuarios(id),
      jogo TEXT NOT NULL,
      tipo_aposta TEXT NOT NULL,
      valor NUMERIC NOT NULL,
      resultado TEXT,
      ganhou INTEGER,
      valor_premio NUMERIC DEFAULT 0,
      created_at TIMESTAMP DEFAULT CURRENT_TIMESTAMP
    );
  `);
  console.log('✅ Tabelas verificadas/criadas!');
}
criarTabelas().catch(e => console.log('⚠️  Tabelas: precisa criar banco primeiro:', e.message));

// ==================== MIDDLEWARES ====================
app.use(cors());
app.use(express.json());
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const token = req.headers.authorization?.split(' ')[1];
  if (!token) return res.status(401).json({ erro: 'Faça login' });
  try {
    const d = jwt.verify(token, JWT_SECRET);
    req.usuarioId = d.id;
    next();
  } catch {
    return res.status(401).json({ erro: 'Token inválido' });
  }
}

// ==================== ROTAS ====================
app.get('/api/status-licenca', (req, res) => {
  res.json({
    licencaAtiva: LICENCA_ATIVA,
    numeroLicenca: process.env.MF_LICENCA_NUMERO || 'NÃO CONFIGURADA',
    razaoSocial: process.env.MF_RAZAO_SOCIAL || 'NÃO CONFIGURADA',
    cnpj: process.env.MF_CNPJ_OPERADOR || 'NÃO CONFIGURADA',
    ambiente: LICENCA_ATIVA ? 'PRODUÇÃO' : 'DEMONSTRAÇÃO'
  });
});

app.post('/api/cadastro', async (req, res) => {
  try {
    const { nomeCompleto, cpf, dataNascimento, email, telefone, senha } = req.body;
    if (!nomeCompleto || !cpf || !dataNascimento || !email || !senha)
      return res.json({ erro: 'Preencha todos os campos' });

    const nasc = new Date(dataNascimento);
    const idade = new Date().getFullYear() - nasc.getFullYear() -
      ((new Date().getMonth() < nasc.getMonth() ||
        (new Date().getMonth() === nasc.getMonth() && new Date().getDate() < nasc.getDate())) ? 1 : 0);
    if (idade < 18) return res.json({ erro: 'É preciso ter 18 anos ou mais' });

    const senhaHash = await bcrypt.hash(senha, 12);
    const id = uuidv4();
    const cpfLimpo = cpf.replace(/\D/g, '');

    await pool.query(
      `INSERT INTO usuarios (id, nome_completo, cpf, data_nascimento, email, telefone, senha)
       VALUES ($1, $2, $3, $4, $5, $6, $7)`,
      [id, nomeCompleto, cpfLimpo, dataNascimento, email, telefone, senhaHash]
    );

    res.json({ sucesso: true, mensagem: 'Cadastro realizado!' });
  } catch (e) {
    if (e.code === '23505') return res.json({ erro: 'CPF ou E-mail já cadastrado' });
    res.json({ erro: 'Erro no cadastro: ' + e.message });
  }
});

app.post('/api/login', async (req, res) => {
  const { email, senha } = req.body;
  const { rows } = await pool.query('SELECT * FROM usuarios WHERE email = $1', [email]);
  const user = rows[0];
  if (!user) return res.json({ erro: 'Usuário não encontrado' });
  if (user.status !== 'ativo') return res.json({ erro: 'Conta inativa' });
  if (!await bcrypt.compare(senha, user.senha)) return res.json({ erro: 'Senha incorreta' });

  const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '24h' });
  res.json({
    sucesso: true, token,
    usuario: { id: user.id, nome: user.nome_completo, email: user.email, saldo: Number(user.saldo) }
  });
});

app.get('/api/usuario', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT id, nome_completo, cpf, email, saldo FROM usuarios WHERE id = $1', [req.usuarioId]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado' });
  res.json({ ...rows[0], saldo: Number(rows[0].saldo) });
});

app.post('/api/deposito', auth, async (req, res) => {
  const { valor } = req.body;
  if (!valor || valor <= 0) return res.json({ erro: 'Valor inválido' });

  const usuarioAntes = await pool.query('SELECT saldo FROM usuarios WHERE id = $1', [req.usuarioId]);
  const saldoAntes = Number(usuarioAntes.rows[0].saldo);
  const saldoDepois = saldoAntes + Number(valor);

  await pool.query('UPDATE usuarios SET saldo = $1 WHERE id = $2', [saldoDepois, req.usuarioId]);
  await pool.query(
    `INSERT INTO transacoes (id, usuario_id, tipo, valor, saldo_anterior, saldo_posterior, status)
     VALUES ($1, $2, 'deposito', $3, $4, $5, 'concluido')`,
    [uuidv4(), req.usuarioId, valor, saldoAntes, saldoDepois]
  );

  res.json({ sucesso: true, valor: Number(valor), saldoAtual: saldoDepois });
});

app.post('/api/roleta/apostar', auth, async (req, res) => {
  const { tipoAposta, valor, numeroEscolhido } = req.body;
  if (!valor || valor <= 0) return res.json({ erro: 'Valor inválido' });

  const usuarioAntes = await pool.query('SELECT saldo FROM usuarios WHERE id = $1', [req.usuarioId]);
  const saldoAntes = Number(usuarioAntes.rows[0].saldo);
  if (valor > saldoAntes) return res.json({ erro: 'Saldo insuficiente' });

  // Deduz valor da aposta
  await pool.query('UPDATE usuarios SET saldo = saldo - $1 WHERE id = $2', [valor, req.usuarioId]);

  // Sorteia número
  const numeroSorteado = Math.floor(Math.random() * 37);
  const cores = {}; cores[0] = 'verde';
  for (let i = 1; i <= 36; i++) cores[i] = i % 2 === 1 ? 'vermelho' : 'preto';
  const corSorteada = cores[numeroSorteado];

  let ganhou = false, valorGanho = 0;
  if (tipoAposta === corSorteada) {
    ganhou = true;
    valorGanho = valor * (tipoAposta === 'verde' ? 36 : 2);
  }
  if (tipoAposta === 'numero' && parseInt(numeroEscolhido) === numeroSorteado) {
    ganhou = true;
    valorGanho = valor * 36;
  }

  // Credita prêmio se ganhou
  if (ganhou) {
    await pool.query('UPDATE usuarios SET saldo = saldo + $1 WHERE id = $2', [valorGanho, req.usuarioId]);
  }

  // Registra aposta
  await pool.query(
    `INSERT INTO apostas (id, usuario_id, jogo, tipo_aposta, valor, resultado, ganhou, valor_premio)
     VALUES ($1, $2, 'roleta', $3, $4, $5, $6, $7)`,
    [uuidv4(), req.usuarioId, tipoAposta, valor, `${numeroSorteado}-${corSorteada}`, ganhou ? 1 : 0, valorGanho]
  );

  const saldoFinalQuery = await pool.query('SELECT saldo FROM usuarios WHERE id = $1', [req.usuarioId]);
  const saldoFinal = Number(saldoFinalQuery.rows[0].saldo);

  res.json({
    sucesso: true, numero: numeroSorteado, cor: corSorteada,
    ganhou, valorGanho, saldo: saldoFinal
  });
});

app.get('/', (req, res) => res.sendFile(path.join(__dirname, 'public', 'index.html')));

app.listen(PORT, () => {
  console.log(`
╔══════════════════════════════════════════════════════╗
║  🎰 BRASVEGAS — SERVIDOR INICIADO                    ║
║  🌐 http://localhost:${PORT}                              ║
║  🗄️  BANCO: PostgreSQL                                ║
╚══════════════════════════════════════════════════════╝`);
});
