-- Partidas competitivas: cinco rodadas por partida, um ganhador final (empate divide).
CREATE TABLE IF NOT EXISTS partidas (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  jogo_id UUID NOT NULL REFERENCES jogos(id),
  modo TEXT NOT NULL CHECK (modo IN ('treino','real')),
  numero BIGINT NOT NULL,
  total_rodadas SMALLINT NOT NULL DEFAULT 5 CHECK (total_rodadas = 5),
  rodada_atual SMALLINT NOT NULL DEFAULT 1 CHECK (rodada_atual BETWEEN 1 AND 5),
  status TEXT NOT NULL DEFAULT 'aberta' CHECK (status IN ('aberta','finalizada','cancelada')),
  premio_total NUMERIC(16,2) NOT NULL DEFAULT 0 CHECK (premio_total >= 0),
  pontuacao_final JSONB NOT NULL DEFAULT '{}'::jsonb,
  ganhadores_finais JSONB NOT NULL DEFAULT '{}'::jsonb,
  criada_em TIMESTAMPTZ NOT NULL DEFAULT NOW(),
  encerrada_em TIMESTAMPTZ,
  UNIQUE (jogo_id, modo, numero)
);
ALTER TABLE rodadas ADD COLUMN IF NOT EXISTS partida_id UUID REFERENCES partidas(id);
ALTER TABLE rodadas ADD COLUMN IF NOT EXISTS numero_na_partida SMALLINT;
CREATE INDEX IF NOT EXISTS idx_partidas_jogo_status ON partidas(jogo_id,modo,status);
CREATE INDEX IF NOT EXISTS idx_rodadas_partida ON rodadas(partida_id,numero_na_partida);

CREATE UNIQUE INDEX IF NOT EXISTS idx_rodadas_partida_numero ON rodadas(partida_id,numero_na_partida) WHERE partida_id IS NOT NULL;
