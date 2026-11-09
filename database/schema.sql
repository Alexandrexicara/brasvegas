-- BrasVegas PostgreSQL schema (Neon)
-- Apostas reais ficam desabilitadas por padrão na aplicação.
CREATE TABLE IF NOT EXISTS usuarios (
  id TEXT PRIMARY KEY,
  nome_completo TEXT NOT NULL,
  cpf TEXT UNIQUE NOT NULL,
  data_nascimento DATE NOT NULL,
  email TEXT UNIQUE NOT NULL,
  telefone TEXT,
  senha TEXT NOT NULL,
  saldo NUMERIC(14,2) NOT NULL DEFAULT 0,
  status TEXT NOT NULL DEFAULT 'ativo',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS carteiras (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id TEXT NOT NULL UNIQUE REFERENCES usuarios(id),
  saldo_disponivel NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (saldo_disponivel >= 0),
  saldo_reservado NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (saldo_reservado >= 0),
  moeda CHAR(3) NOT NULL DEFAULT 'BRL',
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS lancamentos_carteira (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  carteira_id UUID NOT NULL REFERENCES carteiras(id),
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  tipo TEXT NOT NULL CHECK (tipo IN ('pix_credito','aposta_reserva','aposta_devolucao','aposta_liquidada','premio_credito','saque_debito','taxa_plataforma','ajuste_admin')),
  valor NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  saldo_disponivel_antes NUMERIC(14,2) NOT NULL,
  saldo_disponivel_depois NUMERIC(14,2) NOT NULL,
  saldo_reservado_antes NUMERIC(14,2) NOT NULL,
  saldo_reservado_depois NUMERIC(14,2) NOT NULL,
  referencia_tipo TEXT,
  referencia_id UUID,
  chave_idempotencia TEXT UNIQUE,
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS jogos (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  codigo TEXT NOT NULL UNIQUE,
  nome TEXT NOT NULL,
  modalidade TEXT NOT NULL DEFAULT 'cassino' CHECK (modalidade IN ('cassino','habilidade')),
  ativo BOOLEAN NOT NULL DEFAULT TRUE,
  participacao_aberta BOOLEAN NOT NULL DEFAULT TRUE,
  taxa_plataforma_percentual NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (taxa_plataforma_percentual BETWEEN 0 AND 100),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS rodadas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jogo_id UUID NOT NULL REFERENCES jogos(id),
  numero BIGINT NOT NULL,
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','encerrada','apurando','paga','cancelada')),
  inicio_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  encerrada_em TIMESTAMPTZ,
  resultado JSONB,
  total_apostado NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (total_apostado >= 0),
  taxa_total NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (taxa_total >= 0),
  premio_disponivel NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (premio_disponivel >= 0),
  UNIQUE (jogo_id,numero)
);
CREATE TABLE IF NOT EXISTS apostas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rodada_id UUID NOT NULL REFERENCES rodadas(id),
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  selecao JSONB NOT NULL,
  valor NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  taxa_plataforma NUMERIC(14,2) NOT NULL CHECK (taxa_plataforma >= 0),
  valor_para_premio NUMERIC(14,2) NOT NULL CHECK (valor_para_premio >= 0),
  status TEXT NOT NULL DEFAULT 'reservada' CHECK (status IN ('reservada','ganhadora','perdedora','devolvida','paga')),
  premio_recebido NUMERIC(14,2) NOT NULL DEFAULT 0 CHECK (premio_recebido >= 0),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE INDEX IF NOT EXISTS idx_rodadas_jogo_status ON rodadas(jogo_id,status);
CREATE INDEX IF NOT EXISTS idx_apostas_rodada ON apostas(rodada_id);
CREATE INDEX IF NOT EXISTS idx_apostas_usuario_data ON apostas(usuario_id,created_at DESC);
CREATE INDEX IF NOT EXISTS idx_lancamentos_usuario_data ON lancamentos_carteira(usuario_id,created_at DESC);
CREATE TABLE IF NOT EXISTS comissoes_plataforma (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  rodada_id UUID NOT NULL REFERENCES rodadas(id),
  aposta_id UUID NOT NULL UNIQUE REFERENCES apostas(id),
  valor NUMERIC(14,2) NOT NULL CHECK (valor >= 0),
  percentual NUMERIC(5,2) NOT NULL DEFAULT 10.00 CHECK (percentual = 10.00),
  status TEXT NOT NULL DEFAULT 'acumulada' CHECK (status IN ('acumulada','transferida','estornada')),
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS carteira_plataforma (
  id SMALLINT PRIMARY KEY DEFAULT 1 CHECK (id=1),
  saldo_comissoes NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (saldo_comissoes>=0),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO carteira_plataforma(id) VALUES(1) ON CONFLICT(id) DO NOTHING;
CREATE TABLE IF NOT EXISTS movimentos_plataforma (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tipo TEXT NOT NULL CHECK (tipo IN ('comissao_aposta','estorno_comissao','saque_comissao','ajuste')),
  aposta_id UUID UNIQUE REFERENCES apostas(id),
  valor NUMERIC(14,2) NOT NULL CHECK (valor>=0),
  saldo_antes NUMERIC(16,2) NOT NULL,
  saldo_depois NUMERIC(16,2) NOT NULL,
  descricao TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS cobrancas_pix (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  provedor TEXT NOT NULL DEFAULT 'sicoob',
  referencia_provedor TEXT UNIQUE,
  txid TEXT UNIQUE,
  valor NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  status TEXT NOT NULL DEFAULT 'criada' CHECK (status IN ('criada','pendente','paga','expirada','cancelada','falhou')),
  copia_cola TEXT,
  qr_code_base64 TEXT,
  pago_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS eventos_webhook_pagamento (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  provedor TEXT NOT NULL,
  evento_id TEXT NOT NULL,
  payload JSONB NOT NULL,
  processado_em TIMESTAMPTZ,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  UNIQUE(provedor,evento_id)
);
CREATE TABLE IF NOT EXISTS saques (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  usuario_id TEXT NOT NULL REFERENCES usuarios(id),
  valor NUMERIC(14,2) NOT NULL CHECK (valor > 0),
  chave_pix TEXT NOT NULL,
  status TEXT NOT NULL DEFAULT 'solicitado' CHECK (status IN ('solicitado','em_analise','aprovado','pago','recusado','falhou')),
  referencia_provedor TEXT UNIQUE,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  atualizado_em TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
CREATE TABLE IF NOT EXISTS auditoria (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  ator_usuario_id TEXT REFERENCES usuarios(id),
  acao TEXT NOT NULL,
  entidade TEXT NOT NULL,
  entidade_id TEXT,
  detalhes JSONB NOT NULL DEFAULT '{}'::jsonb,
  ip INET,
  created_at TIMESTAMPTZ NOT NULL DEFAULT NOW()
);
INSERT INTO jogos(codigo,nome,modalidade,participacao_aberta) VALUES
 ('roleta','Roleta','cassino',TRUE),
 ('blackjack','Blackjack','cassino',TRUE),
 ('bacara','Bacará','cassino',TRUE),
 ('caca-niqueis','Caça-níqueis','cassino',TRUE),
 ('craps','Craps','cassino',TRUE),
 ('dados','Dados','cassino',TRUE),
 ('frutas','Frutas','cassino',TRUE),
 ('parede-sorte','Parede da Sorte','cassino',TRUE),
 ('poquer','Pôquer','cassino',TRUE),
 ('sinuca','Sinuca / Bilhar Multiplayer','habilidade',TRUE)
ON CONFLICT(codigo) DO NOTHING;
