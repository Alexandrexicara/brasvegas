require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { randomInt } = require('crypto');
const path = require('path');
const fs = require('fs');
const https = require('https');
const { randomBytes } = require('crypto');
const gameEngine = require('./game-engine');

const app = express();
const PORT = Number(process.env.PORT || 3000);
const JWT_SECRET = process.env.JWT_SECRET;
const DATABASE_URL = process.env.DATABASE_URL;
const TAXA_PLATAFORMA = 10;
const APOSTAS_REAIS_HABILITADAS = process.env.APOSTAS_REAIS_HABILITADAS === 'true';

if (!JWT_SECRET || JWT_SECRET.length < 32) {
  console.error('JWT_SECRET ausente ou fraco. Configure uma chave aleatória com pelo menos 32 caracteres.');
  process.exit(1);
}
if (!DATABASE_URL) {
  console.error('DATABASE_URL não configurada. Cadastre a URL do Neon nas variáveis secretas do serviço.');
  process.exit(1);
}

const pool = new Pool({
  connectionString: DATABASE_URL,
  ssl: { rejectUnauthorized: false },
  max: Number(process.env.DB_POOL_MAX || 10),
  idleTimeoutMillis: 30000,
  connectionTimeoutMillis: 10000
});

app.disable('x-powered-by');
app.use(cors({ origin: (process.env.CORS_ORIGINS || '').split(',').filter(Boolean), credentials: false }));
app.use(express.json({ limit: '100kb' }));
app.use(express.static(path.join(__dirname, 'public')));

let sicoobTokenCache = null;
function sicoobConfigured() {
  return !!(process.env.SICOOB_CLIENT_ID && process.env.SICOOB_CLIENT_SECRET &&
    process.env.SICOOB_CERT_PATH && process.env.SICOOB_KEY_PATH && process.env.SICOOB_PIX_KEY);
}
function sicoobRequest(url, options = {}, body = null) {
  return new Promise((resolve, reject) => {
    const cert = fs.readFileSync(process.env.SICOOB_CERT_PATH);
    const key = fs.readFileSync(process.env.SICOOB_KEY_PATH);
    const data = body ? Buffer.from(typeof body === 'string' ? body : JSON.stringify(body)) : null;
    const req = https.request(url, {
      method: options.method || 'GET',
      cert, key,
      headers: { ...(options.headers || {}), ...(data ? { 'Content-Length': data.length } : {}) },
      timeout: 15000
    }, response => {
      let raw = '';
      response.setEncoding('utf8');
      response.on('data', chunk => raw += chunk);
      response.on('end', () => {
        let parsed = {};
        try { parsed = raw ? JSON.parse(raw) : {}; } catch { parsed = { raw }; }
        if (response.statusCode < 200 || response.statusCode >= 300) {
          const err = new Error(parsed.detail || parsed.title || parsed.message || ('Sicoob HTTP ' + response.statusCode));
          err.statusCode = response.statusCode; return reject(err);
        }
        resolve(parsed);
      });
    });
    req.on('timeout', () => req.destroy(new Error('Tempo esgotado na comunicação com Sicoob.')));
    req.on('error', reject);
    if (data) req.write(data);
    req.end();
  });
}
async function obterTokenSicoob() {
  if (!sicoobConfigured()) throw new Error('Integração Sicoob ainda não configurada: faltam credenciais e certificado mTLS.');
  if (sicoobTokenCache && sicoobTokenCache.expiresAt > Date.now() + 30000) return sicoobTokenCache.token;
  const authUrl = process.env.SICOOB_AUTH_URL || 'https://apis.sisbr.com.br/cooperado/pix/token';
  const form = new URLSearchParams({
    grant_type: 'client_credentials',
    client_id: process.env.SICOOB_CLIENT_ID,
    client_secret: process.env.SICOOB_CLIENT_SECRET,
    scope: process.env.SICOOB_SCOPE || 'cob.write cob.read'
  }).toString();
  const result = await sicoobRequest(authUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/x-www-form-urlencoded' }
  }, form);
  if (!result.access_token) throw new Error('Sicoob não retornou token de acesso.');
  sicoobTokenCache = { token: result.access_token, expiresAt: Date.now() + (Number(result.expires_in || 300) * 1000) };
  return sicoobTokenCache.token;
}
async function chamarApiPixSicoob(endpoint, method = 'GET', body = null) {
  const token = await obterTokenSicoob();
  const base = (process.env.SICOOB_API_URL || 'https://apis.sisbr.com.br/cooperado/pix/api/v2').replace(/\/$/, '');
  return sicoobRequest(base + endpoint, {
    method,
    headers: { Authorization: 'Bearer ' + token, client_id: process.env.SICOOB_CLIENT_ID, Accept: 'application/json', ...(body ? { 'Content-Type':'application/json' } : {}) }
  }, body);
}

function auth(req, res, next) {
  const header = req.headers.authorization || '';
  const token = header.startsWith('Bearer ') ? header.slice(7) : '';
  if (!token) return res.status(401).json({ erro: 'Faça login.' });
  try {
    const decoded = jwt.verify(token, JWT_SECRET);
    req.usuarioId = decoded.id;
    next();
  } catch {
    return res.status(401).json({ erro: 'Sessão inválida ou expirada.' });
  }
}
function selecaoPublica(s) {
  if (s && Array.isArray(s.player) && Array.isArray(s.dealer)) return { player:s.player, dealer:s.status==='done'?s.dealer:[s.dealer[0]], status:s.status, playerTotal:gameEngine.blackjackTotal(s.player), dealerTotal:s.status==='done'?gameEngine.blackjackTotal(s.dealer):null, outcome:s.status==='done'?s.outcome:null };
  if (s && Array.isArray(s.hand)) return { hand:s.hand, status:s.status, rank:s.rank || null };
  return s;
}
function canonicalJson(value) { if (Array.isArray(value)) return '[' + value.map(canonicalJson).join(',') + ']'; if (value && typeof value === 'object') return '{' + Object.keys(value).sort().map(k => JSON.stringify(k) + ':' + canonicalJson(value[k])).join(',') + '}'; return JSON.stringify(value); }
function dinheiro(v) {
  const n = Number(v);
  return Number.isFinite(n) && n > 0 && n <= 1000000 ? Math.round(n * 100) / 100 : null;
}
function apostasReaisBloqueadas(res) {
  if (!APOSTAS_REAIS_HABILITADAS) {
    res.status(503).json({ erro: 'Apostas com valor real estão bloqueadas até a validação jurídica e a liberação formal dos pagamentos.' });
    return true;
  }
  return false;
}

app.get('/api/health', async (_req, res) => {
  try {
    await pool.query('SELECT 1');
    res.json({ ok: true, banco: 'conectado', apostasReais: APOSTAS_REAIS_HABILITADAS });
  } catch (e) {
    res.status(503).json({ ok: false, banco: 'indisponível' });
  }
});

app.get('/api/configuracao', (_req, res) => {
  res.json({ taxaPlataforma: TAXA_PLATAFORMA, jogos: ['roleta','blackjack','bacara','caca-niqueis','craps','dados','frutas','parede-sorte','poquer'], apostasReaisHabilitadas: APOSTAS_REAIS_HABILITADAS });
});

app.post('/api/cadastro', async (req, res) => {
  const { nomeCompleto, cpf, dataNascimento, email, telefone, senha } = req.body || {};
  if (!nomeCompleto || !cpf || !dataNascimento || !email || !senha || String(senha).length < 8)
    return res.status(400).json({ erro: 'Informe todos os dados e uma senha com pelo menos 8 caracteres.' });
  const nascimento = new Date(dataNascimento + 'T12:00:00');
  if (Number.isNaN(nascimento.getTime())) return res.status(400).json({ erro: 'Data de nascimento inválida.' });
  let idade = new Date().getFullYear() - nascimento.getFullYear();
  const hoje = new Date();
  if (hoje < new Date(hoje.getFullYear(), nascimento.getMonth(), nascimento.getDate())) idade--;
  if (idade < 18) return res.status(403).json({ erro: 'É preciso ter 18 anos ou mais.' });
  const cpfLimpo = String(cpf).replace(/\D/g, '');
  if (cpfLimpo.length !== 11) return res.status(400).json({ erro: 'CPF inválido.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const senhaHash = await bcrypt.hash(senha, 12);
    const id = require('crypto').randomUUID();
    await client.query(
      'INSERT INTO usuarios(id,nome_completo,cpf,data_nascimento,email,telefone,senha) VALUES($1,$2,$3,$4,$5,$6,$7)',
      [id, nomeCompleto.trim(), cpfLimpo, dataNascimento, String(email).trim().toLowerCase(), telefone || null, senhaHash]
    );
    await client.query('INSERT INTO carteiras(usuario_id) VALUES($1)', [id]);
    await client.query('COMMIT');
    res.status(201).json({ sucesso: true, mensagem: 'Cadastro realizado. Faça login.' });
  } catch (e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({ erro: 'CPF ou e-mail já cadastrado.' });
    console.error('Cadastro:', e.message);
    res.status(500).json({ erro: 'Não foi possível concluir o cadastro.' });
  } finally { client.release(); }
});

app.post('/api/login', async (req, res) => {
  try {
    const { email, senha } = req.body || {};
    const { rows } = await pool.query('SELECT id,nome_completo,email,senha,status FROM usuarios WHERE lower(email)=lower($1)', [email || '']);
    const user = rows[0];
    if (!user || user.status !== 'ativo' || !await bcrypt.compare(senha || '', user.senha))
      return res.status(401).json({ erro: 'E-mail ou senha incorretos.' });
    const token = jwt.sign({ id: user.id }, JWT_SECRET, { expiresIn: '12h' });
    const wallet = await pool.query('SELECT saldo_disponivel,saldo_reservado FROM carteiras WHERE usuario_id=$1', [user.id]);
    res.json({ sucesso: true, token, usuario: { id:user.id, nome:user.nome_completo, email:user.email, saldo:Number(wallet.rows[0]?.saldo_disponivel || 0) } });
  } catch (e) {
    console.error('Login:', e.message);
    res.status(500).json({ erro: 'Falha ao entrar.' });
  }
});

app.get('/api/usuario', auth, async (req, res) => {
  const { rows } = await pool.query(
    'SELECT u.id,u.nome_completo,u.email,c.saldo_disponivel,c.saldo_reservado FROM usuarios u JOIN carteiras c ON c.usuario_id=u.id WHERE u.id=$1',
    [req.usuarioId]
  );
  if (!rows[0]) return res.status(404).json({ erro: 'Usuário não encontrado.' });
  res.json({ id:rows[0].id, nome_completo:rows[0].nome_completo, email:rows[0].email, saldo:Number(rows[0].saldo_disponivel), saldoReservado:Number(rows[0].saldo_reservado) });
});

app.post('/api/pix/cobrancas', auth, async (req, res) => {
  if (!APOSTAS_REAIS_HABILITADAS) return res.status(503).json({ erro:'Compra de fichas com dinheiro real permanece bloqueada até liberação jurídica e bancária.' });
  const valor = dinheiro(req.body?.valor);
  if (!valor || valor < 1) return res.status(400).json({ erro:'Informe um valor válido a partir de R$ 1,00.' });
  const client = await pool.connect();
  try {
    const txid = randomBytes(16).toString('hex');
    const cobranca = await chamarApiPixSicoob('/cob/' + txid, 'PUT', {
      calendario: { expiracao: 3600 },
      valor: { original: valor.toFixed(2) },
      chave: process.env.SICOOB_PIX_KEY,
      solicitacaoPagador: 'Compra de fichas BrasVegas'
    });
    let pixCopiaECola = cobranca.pixCopiaECola || cobranca.payload || null;
    if (!pixCopiaECola && cobranca.loc?.id) {
      const loc = await chamarApiPixSicoob('/loc/' + encodeURIComponent(cobranca.loc.id));
      pixCopiaECola = loc.payload || loc.pixCopiaECola || null;
    }
    const saved = await client.query(
      "INSERT INTO cobrancas_pix(usuario_id,provedor,referencia_provedor,txid,valor,status,copia_cola) VALUES($1,'sicoob',$2,$3,$4,'pendente',$5) RETURNING id",
      [req.usuarioId,txid,txid,valor,pixCopiaECola]
    );
    res.status(201).json({ sucesso:true, cobrancaId:saved.rows[0].id, txid, valor, status:cobranca.status || 'ATIVA', pixCopiaECola, expiracaoSegundos:3600 });
  } catch (e) {
    console.error('Sicoob criar cobrança:',e.message);
    res.status(502).json({ erro:'Não foi possível criar a cobrança Pix no Sicoob. Verifique a habilitação da API e as credenciais.' });
  } finally { client.release(); }
});

app.post('/api/pix/cobrancas/:id/confirmar', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    const c = await client.query("SELECT * FROM cobrancas_pix WHERE id=$1 AND usuario_id=$2 AND provedor='sicoob' FOR UPDATE", [req.params.id,req.usuarioId]);
    if (!c.rows[0]) return res.status(404).json({ erro:'Cobrança não encontrada.' });
    if (c.rows[0].status === 'paga') return res.json({ sucesso:true, confirmado:true, mensagem:'Pix já confirmado anteriormente.' });
    const banco = await chamarApiPixSicoob('/cob/' + encodeURIComponent(c.rows[0].txid));
    if (banco.status !== 'CONCLUIDA') return res.status(202).json({ sucesso:false, confirmado:false, status:banco.status || 'PENDENTE', mensagem:'O Sicoob ainda não confirmou o pagamento.' });
    const valorBanco = Number(banco.valor?.original);
    if (!Number.isFinite(valorBanco) || Math.abs(valorBanco - Number(c.rows[0].valor)) > 0.001 || banco.txid !== c.rows[0].txid)
      return res.status(409).json({ erro:'Os dados da cobrança retornados pelo banco não conferem.' });
    await client.query('BEGIN');
    const locked = await client.query("SELECT * FROM cobrancas_pix WHERE id=$1 FOR UPDATE", [req.params.id]);
    if (locked.rows[0].status !== 'paga') {
      const w = await client.query('SELECT * FROM carteiras WHERE usuario_id=$1 FOR UPDATE', [req.usuarioId]);
      const antes = Number(w.rows[0].saldo_disponivel), reservado = Number(w.rows[0].saldo_reservado), amount = Number(locked.rows[0].valor);
      await client.query('UPDATE carteiras SET saldo_disponivel=saldo_disponivel+$1,updated_at=NOW() WHERE id=$2', [amount,w.rows[0].id]);
      await client.query("INSERT INTO lancamentos_carteira(carteira_id,usuario_id,tipo,valor,saldo_disponivel_antes,saldo_disponivel_depois,saldo_reservado_antes,saldo_reservado_depois,referencia_tipo,referencia_id,chave_idempotencia,descricao) VALUES($1,$2,'pix_credito',$3,$4,$5,$6,$7,'pix',$8,$9,'Crédito confirmado por consulta autenticada ao Sicoob')", [w.rows[0].id,req.usuarioId,amount,antes,antes+amount,reservado,reservado,locked.rows[0].id,'pix:'+locked.rows[0].txid]);
      await client.query("UPDATE cobrancas_pix SET status='paga',pago_em=NOW() WHERE id=$1", [req.params.id]);
    }
    await client.query('COMMIT');
    const saldo = await client.query('SELECT saldo_disponivel FROM carteiras WHERE usuario_id=$1',[req.usuarioId]);
    res.json({ sucesso:true, confirmado:true, saldo:Number(saldo.rows[0].saldo_disponivel) });
  } catch (e) {
    await client.query('ROLLBACK');
    console.error('Sicoob confirmar cobrança:',e.message);
    res.status(502).json({ erro:'Não foi possível confirmar o Pix com o Sicoob neste momento.' });
  } finally { client.release(); }
});

app.get('/api/jogos', async (_req, res) => {
  const { rows } = await pool.query('SELECT codigo,nome,modalidade,ativo,participacao_aberta,taxa_plataforma_percentual FROM jogos WHERE ativo=true ORDER BY nome');
  res.json(rows);
});

app.get('/api/jogos/:codigo/rodada-atual', auth, async (req, res) => {
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const jogo = await client.query('SELECT id,codigo,nome FROM jogos WHERE codigo=$1 AND ativo=true FOR SHARE', [req.params.codigo]);
    if (!jogo.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({ erro:'Jogo não encontrado.' }); }
    const j = jogo.rows[0];
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))', ['brasvegas-round:'+j.id]);
    let rodada = await client.query("SELECT id,numero,status,total_apostado,taxa_total,premio_disponivel,inicio_em FROM rodadas WHERE jogo_id=$1 AND status='aberta' ORDER BY numero DESC LIMIT 1", [j.id]);
    if (!rodada.rows[0]) {
      const carry = await client.query("SELECT COALESCE(SUM(premio_disponivel),0) AS total FROM rodadas WHERE jogo_id=$1 AND status='encerrada'", [j.id]);
      const numero = await client.query('SELECT COALESCE(MAX(numero),0)+1 AS n FROM rodadas WHERE jogo_id=$1', [j.id]);
      rodada = await client.query("INSERT INTO rodadas(jogo_id,numero,status,premio_disponivel) VALUES($1,$2,'aberta',$3) RETURNING id,numero,status,total_apostado,taxa_total,premio_disponivel,inicio_em", [j.id, numero.rows[0].n, carry.rows[0].total]);
      if (Number(carry.rows[0].total)>0) await client.query("UPDATE rodadas SET premio_disponivel=0 WHERE jogo_id=$1 AND status='encerrada'", [j.id]);
    }
    await client.query('COMMIT');
    res.json({ jogo:j, rodada:rodada.rows[0], taxaPlataformaPercentual:TAXA_PLATAFORMA });
  } catch(e) {
    await client.query('ROLLBACK');
    console.error('Abrir rodada:',e.message);
    res.status(500).json({erro:'Não foi possível abrir a rodada.'});
  } finally { client.release(); }
});

app.get('/api/rodadas/:id',auth,async(req,res)=>{
  try{
    const q=await pool.query(
      "SELECT r.id,r.numero,r.status,r.resultado,r.total_apostado,r.taxa_total,r.premio_disponivel,r.inicio_em,r.encerrada_em,a.id AS aposta_id,a.status AS aposta_status,a.premio_recebido,a.selecao FROM rodadas r LEFT JOIN apostas a ON a.rodada_id=r.id AND a.usuario_id=$2 WHERE r.id=$1 ORDER BY a.created_at DESC LIMIT 1",
      [req.params.id,req.usuarioId]
    );
    if(!q.rows[0])return res.status(404).json({erro:'Rodada não encontrada.'});
    const row=q.rows[0];
    res.json({id:row.id,numero:row.numero,status:row.status,resultado:(row.status==='paga'||row.status==='encerrada')?row.resultado:null,totalApostado:Number(row.total_apostado),taxaTotal:Number(row.taxa_total),premioDisponivel:Number(row.premio_disponivel),inicioEm:row.inicio_em,encerradaEm:row.encerrada_em,aposta:row.aposta_id?{id:row.aposta_id,status:row.aposta_status,premioRecebido:Number(row.premio_recebido),selecao:selecaoPublica(row.selecao)}:null});
  }catch(e){console.error('Consultar rodada:',e.message);res.status(500).json({erro:'Não foi possível consultar a rodada.'});}
});

app.post('/api/rodadas/:id/apostas', auth, async (req, res) => {
  if (apostasReaisBloqueadas(res)) return;
  const valor = dinheiro(req.body?.valor);
  let selecao = req.body?.selecao;
  if (!valor || !selecao || typeof selecao !== 'object') return res.status(400).json({ erro: 'Valor ou seleção inválida.' });
  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const rodada = await client.query("SELECT r.*,j.codigo FROM rodadas r JOIN jogos j ON j.id=r.jogo_id WHERE r.id=$1 FOR UPDATE", [req.params.id]);
    if (!rodada.rows[0] || rodada.rows[0].status !== 'aberta') throw new Error('Rodada encerrada. Atualize o jogo.');
    if (!gameEngine.validateBetSelection(rodada.rows[0].codigo, selecao)) throw new Error('Seleção inválida para as regras deste jogo.');
    const wallet = await client.query('SELECT * FROM carteiras WHERE usuario_id=$1 FOR UPDATE', [req.usuarioId]);
    if (!wallet.rows[0] || Number(wallet.rows[0].saldo_disponivel) < valor) throw new Error('Saldo insuficiente.');
    const taxa = Math.round(valor * TAXA_PLATAFORMA) / 100;
    const premio = Math.round((valor - taxa) * 100) / 100;
    const antes = Number(wallet.rows[0].saldo_disponivel), reservado = Number(wallet.rows[0].saldo_reservado);
    await client.query('UPDATE carteiras SET saldo_disponivel=saldo_disponivel-$1,saldo_reservado=saldo_reservado+$1,updated_at=NOW() WHERE id=$2', [valor,wallet.rows[0].id]);
    const bet = await client.query(
      "INSERT INTO apostas(rodada_id,usuario_id,selecao,valor,taxa_plataforma,valor_para_premio,status) VALUES($1,$2,$3,$4,$5,$6,'reservada') RETURNING id",
      [req.params.id,req.usuarioId,selecao,valor,taxa,premio]
    );
    let gameState=null;
    if(rodada.rows[0].codigo==='blackjack') gameState=gameEngine.startBlackjackGame();
    if(rodada.rows[0].codigo==='poquer') {
      const count=await client.query('SELECT COUNT(*)::int AS total FROM apostas WHERE rodada_id=$1 AND status=\'reservada\'',[req.params.id]);
      if(count.rows[0].total>5)throw new Error('Mesa de pôquer completa. Máximo de 5 jogadores por rodada.');
      const roundState=await client.query('SELECT resultado FROM rodadas WHERE id=$1 FOR UPDATE',[req.params.id]);
      const shoe=Array.isArray(roundState.rows[0].resultado?.shoe)?roundState.rows[0].resultado.shoe:gameEngine.shuffle(gameEngine.deck());
      gameState=gameEngine.startPokerGame(shoe);
      await client.query('UPDATE rodadas SET resultado=$1 WHERE id=$2',[{shoe:gameState.deck},req.params.id]);
    }
    if(gameState){selecao={...selecao,...gameState};await client.query('UPDATE apostas SET selecao=$1 WHERE id=$2',[selecao,bet.rows[0].id]);}
    await client.query('UPDATE rodadas SET total_apostado=total_apostado+$1,taxa_total=taxa_total+$2,premio_disponivel=premio_disponivel+$3 WHERE id=$4', [valor,taxa,premio,req.params.id]);
    await client.query(
      "INSERT INTO lancamentos_carteira(carteira_id,usuario_id,tipo,valor,saldo_disponivel_antes,saldo_disponivel_depois,saldo_reservado_antes,saldo_reservado_depois,referencia_tipo,referencia_id,chave_idempotencia,descricao) VALUES($1,$2,'aposta_reserva',$3,$4,$5,$6,$7,'aposta',$8,$9,'Reserva de aposta; comissão de 10% contabilizada na rodada')",
      [wallet.rows[0].id,req.usuarioId,valor,antes,antes-valor,reservado,reservado+valor,bet.rows[0].id, 'bet:'+bet.rows[0].id]
    );
    await client.query('INSERT INTO comissoes_plataforma(rodada_id,aposta_id,valor,percentual) VALUES($1,$2,$3,10)', [req.params.id,bet.rows[0].id,taxa]);
    const contaAntes = await client.query('SELECT saldo_comissoes FROM carteira_plataforma WHERE id=1 FOR UPDATE');
    const saldoComissaoAntes = Number(contaAntes.rows[0]?.saldo_comissoes || 0);
    const contaDepois = await client.query('UPDATE carteira_plataforma SET saldo_comissoes=saldo_comissoes+$1,atualizado_em=NOW() WHERE id=1 RETURNING saldo_comissoes', [taxa]);
    await client.query(
      "INSERT INTO movimentos_plataforma(tipo,aposta_id,valor,saldo_antes,saldo_depois,descricao) VALUES('comissao_aposta',$1,$2,$3,$4,'Comissão de 10% da aposta')",
      [bet.rows[0].id,taxa,saldoComissaoAntes,Number(contaDepois.rows[0].saldo_comissoes)]
    );
    await client.query('COMMIT');
    res.status(201).json({ sucesso:true, apostaId:bet.rows[0].id, valor, taxaPercentual:10, valorReservadoParaPremio:premio, gameState:gameState?selecaoPublica(selecao):null, mensagem:'Aposta registrada na rodada compartilhada.' });
  } catch (e) {
    await client.query('ROLLBACK');
    res.status(400).json({ erro:e.message || 'Não foi possível registrar a aposta.' });
  } finally { client.release(); }
});

// Encerramento protegido: somente serviço administrativo com segredo configurado pode publicar resultado.
app.post('/api/blackjack/:apostaId/acao',auth,async(req,res)=>{
  const action=req.body?.acao;
  if(!['hit','stand'].includes(action))return res.status(400).json({erro:'Ação inválida.'});
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const q=await client.query("SELECT a.id,a.selecao FROM apostas a JOIN rodadas r ON r.id=a.rodada_id JOIN jogos j ON j.id=r.jogo_id WHERE a.id=$1 AND a.usuario_id=$2 AND a.status='reservada' AND r.status='aberta' AND j.codigo='blackjack' FOR UPDATE OF a",[req.params.apostaId,req.usuarioId]);
    if(!q.rows[0])throw new Error('Mão de blackjack não encontrada ou já encerrada.');
    const state=gameEngine.blackjackAction(q.rows[0].selecao,action);
    await client.query('UPDATE apostas SET selecao=$1 WHERE id=$2',[{...q.rows[0].selecao,...state},req.params.apostaId]);
    await client.query('COMMIT');
    res.json({sucesso:true,gameState:selecaoPublica(state)});
  }catch(e){await client.query('ROLLBACK');res.status(400).json({erro:e.message||'Não foi possível jogar a mão.'});}
  finally{client.release();}
});

app.post('/api/poquer/:apostaId/trocar',auth,async(req,res)=>{
  const indices=req.body?.indices;
  const client=await pool.connect();
  try{
    await client.query('BEGIN');
    const q=await client.query("SELECT a.id,a.rodada_id,a.selecao,r.resultado FROM apostas a JOIN rodadas r ON r.id=a.rodada_id JOIN jogos j ON j.id=r.jogo_id WHERE a.id=$1 AND a.usuario_id=$2 AND a.status='reservada' AND r.status='aberta' AND j.codigo='poquer' FOR UPDATE OF a,r",[req.params.apostaId,req.usuarioId]);
    if(!q.rows[0])throw new Error('Mão de pôquer não encontrada ou já encerrada.');
    const shoe=Array.isArray(q.rows[0].resultado?.shoe)?q.rows[0].resultado.shoe:[];
    const draw=gameEngine.drawPokerCards(q.rows[0].selecao,indices||[],shoe);
    const state=draw.state;
    await client.query('UPDATE apostas SET selecao=$1 WHERE id=$2',[{...q.rows[0].selecao,...state},req.params.apostaId]);
    await client.query('UPDATE rodadas SET resultado=$1 WHERE id=$2',[{shoe:draw.remainingDeck},q.rows[0].rodada_id]);
    await client.query('COMMIT');
    res.json({sucesso:true,gameState:selecaoPublica(state)});
  }catch(e){await client.query('ROLLBACK');res.status(400).json({erro:e.message||'Não foi possível trocar as cartas.'});}
  finally{client.release();}
});

async function liquidarRodadaPorId(rodadaId) {
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const r=await client.query("SELECT r.*,j.codigo FROM rodadas r JOIN jogos j ON j.id=r.jogo_id WHERE r.id=$1 FOR UPDATE",[rodadaId]);
    if(!r.rows[0]||r.rows[0].status!=='aberta'){await client.query('ROLLBACK');return {ignorada:true};}
    const apostas=await client.query("SELECT * FROM apostas WHERE rodada_id=$1 AND status='reservada' ORDER BY created_at,id FOR UPDATE",[rodadaId]);
    if(!apostas.rowCount){await client.query('ROLLBACK');return {vazia:true};}
    const apuracao=gameEngine.resolveRound(r.rows[0].codigo,apostas.rows);
    const vencedoras=apostas.rows.filter(a=>apuracao.winnerIds.includes(a.id));
    const premioCentavos=Math.round(Number(r.rows[0].premio_disponivel)*100);
    const pesoTotal=vencedoras.reduce((s,a)=>s+Math.round(Number(a.valor_para_premio)*100),0);
    const pagamentos=new Map();let distribuido=0;
    vencedoras.forEach((a,i)=>{
      const cents=i===vencedoras.length-1?premioCentavos-distribuido:Math.floor(premioCentavos*Math.round(Number(a.valor_para_premio)*100)/pesoTotal);
      pagamentos.set(a.id,cents);distribuido+=cents;
    });
    for(const a of apostas.rows){
      const w=await client.query('SELECT * FROM carteiras WHERE usuario_id=$1 FOR UPDATE',[a.usuario_id]);
      if(!w.rows[0])throw new Error('Carteira do participante não encontrada.');
      const disp=Number(w.rows[0].saldo_disponivel),reserv=Number(w.rows[0].saldo_reservado),aposta=Number(a.valor);
      const pagamento=pagamentos.has(a.id)?pagamentos.get(a.id)/100:0;
      await client.query('UPDATE carteiras SET saldo_disponivel=saldo_disponivel+$1,saldo_reservado=saldo_reservado-$2,updated_at=NOW() WHERE id=$3',[pagamento,aposta,w.rows[0].id]);
      await client.query(
        "INSERT INTO lancamentos_carteira(carteira_id,usuario_id,tipo,valor,saldo_disponivel_antes,saldo_disponivel_depois,saldo_reservado_antes,saldo_reservado_depois,referencia_tipo,referencia_id,chave_idempotencia,descricao) VALUES($1,$2,$3,$4,$5,$6,$7,$8,'rodada',$9,$10,$11)",
        [w.rows[0].id,a.usuario_id,pagamento>0?'premio_credito':'aposta_liquidada',pagamento>0?pagamento:aposta,disp,disp+pagamento,reserv,reserv-aposta,rodadaId,(pagamento>0?'payout:':'loss:')+a.id,pagamento>0?'Prêmio da rodada compartilhada':'Liquidação de aposta perdedora']
      );
      await client.query("UPDATE apostas SET status=$1,premio_recebido=$2 WHERE id=$3",[pagamento>0?'paga':'perdedora',pagamento,a.id]);
    }
    const resultadoSalvo={...apuracao,apuradoEm:new Date().toISOString(),regra:'resultado gerado no servidor com crypto.randomInt'};
    const statusFinal=vencedoras.length?'paga':'encerrada';
    await client.query("UPDATE rodadas SET status=$1,resultado=$2,encerrada_em=NOW(),premio_disponivel=$3 WHERE id=$4",[statusFinal,resultadoSalvo,vencedoras.length?0:Number(r.rows[0].premio_disponivel),rodadaId]);
    await client.query('COMMIT');
    return {jogo:r.rows[0].codigo,apostas:apostas.rowCount,vencedoras:vencedoras.length,premioDistribuido:vencedoras.length>0,resultado:resultadoSalvo};
  }catch(e){await client.query('ROLLBACK');throw e;}finally{client.release();}
}

app.post('/api/admin/rodadas/:id/encerrar',async(req,res)=>{
  const adminToken=process.env.ADMIN_API_TOKEN;
  if(!adminToken||req.headers['x-admin-token']!==adminToken)return res.status(403).json({erro:'Acesso administrativo negado.'});
  try{const resultado=await liquidarRodadaPorId(req.params.id);res.json({sucesso:true,...resultado});}
  catch(e){console.error('Liquidar rodada:',e.message);res.status(400).json({erro:e.message||'Falha ao liquidar rodada.'});}
});

app.get('/api/admin/financeiro', async (req, res) => {
  const adminToken = process.env.ADMIN_API_TOKEN;
  if (!adminToken || req.headers['x-admin-token'] !== adminToken) return res.status(403).json({ erro:'Acesso administrativo negado.' });
  try {
    const conta = await pool.query('SELECT saldo_comissoes,atualizado_em FROM carteira_plataforma WHERE id=1');
    const hoje = await pool.query("SELECT COALESCE(SUM(valor),0) AS total FROM movimentos_plataforma WHERE tipo='comissao_aposta' AND created_at >= date_trunc('day',NOW())");
    const acumulado = await pool.query("SELECT COALESCE(SUM(valor),0) AS total FROM movimentos_plataforma WHERE tipo='comissao_aposta'");
    res.json({ saldoComissoes:Number(conta.rows[0]?.saldo_comissoes || 0), comissoesHoje:Number(hoje.rows[0].total), comissoesAcumuladas:Number(acumulado.rows[0].total), atualizadoEm:conta.rows[0]?.atualizado_em || null });
  } catch (e) {
    res.status(500).json({ erro:'Não foi possível consultar o financeiro.' });
  }
});

// Crédito manual removido: somente webhook/consulta autenticada do Sicoob poderá confirmar um Pix.
app.post('/api/deposito', auth, (_req, res) => res.status(410).json({ erro:'Crédito direto desativado. As fichas só serão liberadas após confirmação do Pix pelo servidor.' }));
app.post('/api/roleta/apostar', auth, (_req, res) => res.status(410).json({ erro:'A roleta agora utiliza rodadas compartilhadas. Atualize o aplicativo para apostar na rodada atual.' }));

app.get('/', (_req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));
app.use((err,_req,res,_next)=>{ console.error(err); res.status(500).json({erro:'Erro interno.'}); });
pool.query('SELECT 1').then(()=>console.log('PostgreSQL/Neon conectado')).catch(e=>console.error('Falha Neon:',e.message));
const DURACAO_RODADA_SEGUNDOS=Math.max(15,Number(process.env.DURACAO_RODADA_SEGUNDOS||30));
setInterval(async()=>{
  try{
    const expiradas=await pool.query("SELECT id FROM rodadas WHERE status='aberta' AND inicio_em < NOW()-($1 * INTERVAL '1 second') AND EXISTS(SELECT 1 FROM apostas a WHERE a.rodada_id=rodadas.id AND a.status='reservada') ORDER BY inicio_em LIMIT 20",[DURACAO_RODADA_SEGUNDOS]);
    for(const rodada of expiradas.rows){
      try{await liquidarRodadaPorId(rodada.id);}catch(e){console.error('Liquidação automática:',rodada.id,e.message);}
    }
  }catch(e){console.error('Agendador de rodadas:',e.message);}
},5000).unref();
app.listen(PORT,()=>console.log('BrasVegas API iniciado na porta '+PORT));
