require('dotenv').config();
const express = require('express');
const cors = require('cors');
const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const { Pool } = require('pg');
const { randomUUID, randomInt } = require('crypto');
const path = require('path');

const app = express();
const PORT = process.env.PORT || 3000;
const JWT_SECRET = process.env.JWT_SECRET;
if (!JWT_SECRET) console.error('ERRO: JWT_SECRET não configurado no Render.');

const pool = new Pool({
  host: process.env.DB_HOST,
  port: Number(process.env.DB_PORTA || 5432),
  database: process.env.DB_NOME || 'neondb',
  user: process.env.DB_USUARIO,
  password: process.env.DB_SENHA,
  ssl: process.env.DB_HOST ? { rejectUnauthorized: false } : false,
  max: 5, idleTimeoutMillis: 30000, connectionTimeoutMillis: 10000, keepAlive: true
});
pool.on('error', e => console.error('Pool PostgreSQL:', e.message));

const LICENCA_ATIVA = Boolean(process.env.MF_LICENCA_NUMERO && process.env.MF_API_CHAVE);
app.use(cors());
app.use(express.json({ limit: '1mb' }));
app.use(express.static(path.join(__dirname, 'public')));

function auth(req, res, next) {
  const h = req.headers.authorization || '';
  const token = h.startsWith('Bearer ') ? h.slice(7).trim() : h.trim();
  if (!token) return res.status(401).json({ erro: 'Faça login' });
  try {
    const d = jwt.verify(token, JWT_SECRET);
    req.usuarioId = d.id;
    next();
  } catch { return res.status(401).json({ erro: 'Sessão inválida ou expirada. Entre novamente.' }); }
}

async function wallet(client, userId) {
  await client.query(
    'INSERT INTO carteiras (usuario_id) VALUES ($1) ON CONFLICT (usuario_id) DO NOTHING',
    [userId]
  );
  const r = await client.query(
    'SELECT id, saldo_disponivel, saldo_reservado, saldo_treino, moeda FROM carteiras WHERE usuario_id=$1 FOR UPDATE',
    [userId]
  );
  if (!r.rows[0]) throw new Error('Não foi possível abrir a carteira do usuário.');
  return r.rows[0];
}

async function audit(client, userId, action, entity, entityId, details, ip) {
  await client.query(
    'INSERT INTO auditoria (ator_usuario_id,acao,entidade,entidade_id,detalhes,ip) VALUES ($1,$2,$3,$4,$5::jsonb,$6)',
    [userId || null, action, entity, entityId || null, JSON.stringify(details || {}), ip || null]
  );
}

app.get('/api/status-licenca', (req, res) => res.json({
  licencaAtiva: LICENCA_ATIVA,
  numeroLicenca: process.env.MF_LICENCA_NUMERO || 'NÃO CONFIGURADA',
  razaoSocial: process.env.MF_RAZAO_SOCIAL || 'NÃO CONFIGURADA',
  cnpj: process.env.MF_CNPJ_OPERADOR || 'NÃO CONFIGURADA',
  ambiente: LICENCA_ATIVA ? 'LICENÇA CONFIGURADA' : 'DEMONSTRAÇÃO',
  modoJogos: 'TREINO',
  dinheiroRealHabilitado: false
}));

app.get('/api/health', async (req,res) => {
  try { await pool.query('SELECT 1'); res.json({ok:true,banco:'conectado',modo:'treino'}); }
  catch(e) { res.status(503).json({ok:false,banco:'indisponível'}); }
});

app.post('/api/cadastro', async (req,res) => {
  const { nomeCompleto, cpf, dataNascimento, email, telefone, senha } = req.body || {};
  if (!nomeCompleto || !cpf || !dataNascimento || !email || !senha)
    return res.status(400).json({erro:'Preencha todos os campos obrigatórios.'});
  const cpfLimpo = String(cpf).replace(/\D/g,'');
  if (cpfLimpo.length !== 11) return res.status(400).json({erro:'CPF inválido.'});
  const nascimento = new Date(dataNascimento + 'T00:00:00');
  if (!Number.isFinite(nascimento.getTime()) || nascimento >= new Date())
    return res.status(400).json({erro:'Data de nascimento inválida.'});
  let idade = new Date().getFullYear() - nascimento.getFullYear();
  const hoje = new Date();
  if (hoje.getMonth() < nascimento.getMonth() || (hoje.getMonth() === nascimento.getMonth() && hoje.getDate() < nascimento.getDate())) idade--;
  if (idade < 18) return res.status(400).json({erro:'É preciso ter 18 anos ou mais.'});
  if (String(senha).length < 8) return res.status(400).json({erro:'A senha precisa ter pelo menos 8 caracteres.'});

  const client = await pool.connect();
  try {
    await client.query('BEGIN');
    const id = randomUUID();
    const hash = await bcrypt.hash(senha,12);
    await client.query(
      'INSERT INTO usuarios (id,nome_completo,cpf,data_nascimento,email,telefone,senha) VALUES ($1,$2,$3,$4,$5,$6,$7)',
      [id,String(nomeCompleto).trim(),cpfLimpo,dataNascimento,String(email).trim().toLowerCase(),telefone || null,hash]
    );
    await wallet(client,id);
    await audit(client,id,'cadastro_criado','usuarios',id,{email:String(email).trim().toLowerCase()},req.ip);
    await client.query('COMMIT');
    res.status(201).json({sucesso:true,mensagem:'Cadastro realizado! A carteira de treino foi criada.'});
  } catch(e) {
    await client.query('ROLLBACK');
    if (e.code === '23505') return res.status(409).json({erro:'CPF ou e-mail já cadastrado.'});
    console.error('Cadastro:',e);
    res.status(500).json({erro:'Não foi possível concluir o cadastro.'});
  } finally { client.release(); }
});

app.post('/api/login', async (req,res) => {
  try {
    const email = String(req.body?.email || '').trim().toLowerCase();
    const senha = String(req.body?.senha || '');
    const q = await pool.query('SELECT id,nome_completo,email,senha,status,papel FROM usuarios WHERE lower(email)=lower($1)',[email]);
    const u=q.rows[0];
    if (!u) return res.status(401).json({erro:'Usuário não encontrado.'});
    if (u.status !== 'ativo') return res.status(403).json({erro:'Conta inativa.'});
    if (!await bcrypt.compare(senha,u.senha)) return res.status(401).json({erro:'Senha incorreta.'});
    const client=await pool.connect();
    let w;
    try { await client.query('BEGIN'); w=await wallet(client,u.id); await audit(client,u.id,'login_realizado','usuarios',u.id,{},req.ip); await client.query('COMMIT'); }
    catch(e) { await client.query('ROLLBACK'); throw e; } finally { client.release(); }
    const token=jwt.sign({id:u.id},JWT_SECRET,{expiresIn:'24h'});
    res.json({sucesso:true,token,usuario:{id:u.id,nome:u.nome_completo,email:u.email,saldo:Number(w.saldo_treino),papel:u.papel || 'usuario',modoTreino:true}});
  } catch(e) { console.error('Login:',e); res.status(500).json({erro:'Falha ao entrar. Tente novamente.'}); }
});

app.get('/api/usuario',auth,async(req,res)=>{
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const u=await client.query("SELECT id,nome_completo,cpf,email,papel,status FROM usuarios WHERE id=$1 AND status='ativo'",[req.usuarioId]);
    if(!u.rows[0]) { await client.query('ROLLBACK'); return res.status(404).json({erro:'Usuário não encontrado ou inativo.'}); }
    const w=await wallet(client,req.usuarioId);
    await client.query('COMMIT');
    res.json({...u.rows[0],saldo:Number(w.saldo_treino),saldoTreino:Number(w.saldo_treino),saldoDisponivel:Number(w.saldo_disponivel),saldoReservado:Number(w.saldo_reservado),admin:u.rows[0].papel==='admin',modoTreino:true});
  } catch(e) { await client.query('ROLLBACK'); console.error('Usuário:',e); res.status(500).json({erro:'Não foi possível carregar sua carteira.'}); }
  finally { client.release(); }
});

app.post('/api/deposito',auth,async(req,res)=>{
  const valor=Number(req.body?.valor);
  if(!Number.isFinite(valor) || valor<=0 || valor>100000) return res.status(400).json({erro:'Informe um valor de teste válido.'});
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const w=await wallet(client,req.usuarioId);
    const antes=Number(w.saldo_treino), depois=antes+valor;
    await client.query('UPDATE carteiras SET saldo_treino=$1,updated_at=now() WHERE id=$2',[depois,w.id]);
    await client.query(
      "INSERT INTO lancamentos_treino (usuario_id,tipo,valor,saldo_antes,saldo_depois,descricao) VALUES ($1,'credito_teste',$2,$3,$4,'Crédito exclusivamente para treinamento')",
      [req.usuarioId,valor,antes,depois]
    );
    await audit(client,req.usuarioId,'credito_treino','carteiras',w.id,{valor,saldoAntes:antes,saldoDepois:depois},req.ip);
    await client.query('COMMIT');
    res.json({sucesso:true,modoTreino:true,valor,saldoAtual:depois,mensagem:'Crédito de treinamento. Não é depósito financeiro.'});
  } catch(e) { await client.query('ROLLBACK'); console.error('Crédito treino:',e); res.status(500).json({erro:'Não foi possível adicionar créditos de treinamento.'}); }
  finally { client.release(); }
});

app.post('/api/roleta/apostar',auth,async(req,res)=>{
  const {tipoAposta,numeroEscolhido}=req.body || {};
  const valor=Number(req.body?.valor);
  const tipos=['vermelho','preto','verde','numero'];
  if(!tipos.includes(tipoAposta) || !Number.isFinite(valor) || valor<=0 || valor>100000)
    return res.status(400).json({erro:'Aposta inválida.'});
  const numeroPick=Number(numeroEscolhido);
  if(tipoAposta==='numero' && (!Number.isInteger(numeroPick) || numeroPick<0 || numeroPick>36))
    return res.status(400).json({erro:'Escolha um número entre 0 e 36.'});

  const vermelho=new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const numero=randomInt(0,37);
  const cor=numero===0?'verde':vermelho.has(numero)?'vermelho':'preto';
  const ganhou=tipoAposta===cor || (tipoAposta==='numero' && numeroPick===numero);
  const premio=ganhou ? valor*(tipoAposta==='numero'?36:tipoAposta==='verde'?36:2) : 0;
  const client=await pool.connect();
  try {
    await client.query('BEGIN');
    const uq=await client.query("SELECT papel FROM usuarios WHERE id=$1 AND status='ativo' FOR UPDATE",[req.usuarioId]);
    if(!uq.rows[0]) { await client.query('ROLLBACK'); return res.status(401).json({erro:'Conta inválida.'}); }
    const admin=uq.rows[0].papel==='admin';
    const w=await wallet(client,req.usuarioId);
    const antes=Number(w.saldo_treino);
    if(!admin && antes<valor) { await client.query('ROLLBACK'); return res.status(400).json({erro:'Saldo insuficiente.'}); }

    const game=await client.query("SELECT id FROM jogos WHERE codigo='roleta' AND ativo=true LIMIT 1");
    if(!game.rows[0]) throw new Error('Jogo roleta não cadastrado no Neon.');
    await client.query('SELECT pg_advisory_xact_lock(hashtext($1))',['brasvegas-roleta']);
    const nr=await client.query('SELECT COALESCE(MAX(numero),0)+1 AS numero FROM rodadas WHERE jogo_id=$1',[game.rows[0].id]);
    const round=await client.query(
      "INSERT INTO rodadas (jogo_id,numero,status,resultado,total_apostado,taxa_total,premio_disponivel,modo,encerrada_em) VALUES ($1,$2,'encerrada',$3::jsonb,$4,0,0,'treino',now()) RETURNING id",
      [game.rows[0].id,nr.rows[0].numero,JSON.stringify({numero,cor,tipoAposta,numeroEscolhido:tipoAposta==='numero'?numeroPick:null,ganhou}),valor]
    );
    const aposta=await client.query(
      "INSERT INTO apostas (rodada_id,usuario_id,selecao,valor,taxa_plataforma,valor_para_premio,status,premio_recebido) VALUES ($1,$2,$3::jsonb,$4,0,0,'concluida',$5) RETURNING id",
      [round.rows[0].id,req.usuarioId,JSON.stringify({tipo:tipoAposta,numero:tipoAposta==='numero'?numeroPick:null}),valor,premio]
    );
    let depois=antes;
    if(!admin) {
      depois=antes-valor+premio;
      await client.query('UPDATE carteiras SET saldo_treino=$1,updated_at=now() WHERE id=$2',[depois,w.id]);
      await client.query(
        "INSERT INTO lancamentos_treino (usuario_id,tipo,valor,saldo_antes,saldo_depois,referencia_id,descricao) VALUES ($1,'aposta',$2,$3,$4,$5,'Aposta de roleta em modo de treinamento')",
        [req.usuarioId,valor,antes,antes-valor,aposta.rows[0].id]
      );
      if(premio>0) await client.query(
        "INSERT INTO lancamentos_treino (usuario_id,tipo,valor,saldo_antes,saldo_depois,referencia_id,descricao) VALUES ($1,'premio',$2,$3,$4,$5,'Prêmio de roleta em modo de treinamento')",
        [req.usuarioId,premio,antes-valor,depois,aposta.rows[0].id]
      );
    }
    await audit(client,req.usuarioId,'aposta_roleta_treino','apostas',aposta.rows[0].id,{valor,numero,cor,ganhou,premio,admin},req.ip);
    await client.query('COMMIT');
    res.json({sucesso:true,modoTreino:true,numero,cor,ganhou,valorGanho:premio,saldo:depois,modoAdmin:admin});
  } catch(e) { await client.query('ROLLBACK'); console.error('Roleta:',e); res.status(500).json({erro:'Não foi possível concluir a rodada de treinamento.'}); }
  finally { client.release(); }
});

async function adminAuth(req,res,next) {
  try {
    const q=await pool.query("SELECT papel FROM usuarios WHERE id=$1 AND status='ativo'",[req.usuarioId]);
    if(q.rows[0]?.papel!=='admin') return res.status(403).json({erro:'Acesso restrito ao administrador.'});
    next();
  } catch(e) { res.status(500).json({erro:'Falha ao validar administrador.'}); }
}
app.get('/api/admin/resumo',auth,adminAuth,async(req,res)=>{
  try {
    const [u,t,a,g,ct]=await Promise.all([
      pool.query("SELECT COUNT(*)::int AS total,COUNT(*) FILTER(WHERE status='ativo')::int AS ativos FROM usuarios"),
      pool.query("SELECT COALESCE(SUM(valor),0)::numeric AS faturamento,COUNT(*)::int AS total FROM transacoes WHERE lower(tipo) IN ('deposito','pagamento') AND lower(COALESCE(status,'')) IN ('concluido','aprovado','pago')"),
      pool.query("SELECT COUNT(*)::int AS total,COALESCE(SUM(valor),0)::numeric AS volume,COALESCE(SUM(premio_recebido),0)::numeric AS premios FROM apostas"),
      pool.query("SELECT id,nome_completo,email,saldo,status,papel,created_at FROM usuarios ORDER BY created_at DESC LIMIT 100"),
      pool.query("SELECT COUNT(*)::int AS lancamentos_treino,COALESCE(SUM(valor) FILTER(WHERE tipo='credito_teste'),0)::numeric AS creditos_treino FROM lancamentos_treino")
    ]);
    res.json({usuarios:u.rows[0],financeiro:t.rows[0],apostas:a.rows[0],ultimosUsuarios:g.rows,treinamento:ct.rows[0],dinheiroRealHabilitado:false});
  } catch(e) { console.error('Resumo admin:',e); res.status(500).json({erro:'Não foi possível carregar o painel administrativo.'}); }
});
app.get('/admin',(req,res)=>res.sendFile(path.join(__dirname,'public','admin.html')));
app.get('/',(req,res)=>res.sendFile(path.join(__dirname,'public','index.html')));

pool.query('SELECT 1').then(()=>console.log('PostgreSQL conectado.')).catch(e=>console.error('Falha PostgreSQL:',e.message));
app.listen(PORT,()=>console.log('BRASVEGAS backend iniciado na porta '+PORT+' | modo de jogo: TREINO'));
