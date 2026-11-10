'use strict';

const ROUNDS_PER_MATCH = 5;

/**
 * Cada jogador que venceu a rodada recebe 1 ponto.
 * Se a rodada terminar empatada, cada jogador empatado recebe 1 ponto.
 * A pontuação é por usuário, não por aposta, para impedir pontos duplicados.
 */
function scoreRoundWinners(bets, winnerBetIds) {
  if (!Array.isArray(bets) || !Array.isArray(winnerBetIds)) {
    throw new Error('Dados inválidos para pontuar a rodada.');
  }
  const winners = new Set(winnerBetIds);
  const points = {};
  for (const bet of bets) {
    if (winners.has(bet.id)) points[String(bet.usuario_id)] = 1;
  }
  return points;
}

/**
 * Soma a pontuação das cinco rodadas. Só o maior total recebe o prêmio.
 * Se houver empate no maior total, divide igualmente, com ajuste de centavos.
 */
function resolveMatch(roundScores, prizeAmount) {
  if (!Array.isArray(roundScores) || roundScores.length !== ROUNDS_PER_MATCH) {
    throw new Error('A partida precisa ter exatamente cinco rodadas concluídas.');
  }
  const prizeCents = Math.round(Number(prizeAmount) * 100);
  if (!Number.isSafeInteger(prizeCents) || prizeCents < 0) {
    throw new Error('Prêmio acumulado inválido.');
  }
  const totals = {};
  for (const scores of roundScores) {
    if (!scores || typeof scores !== 'object' || Array.isArray(scores)) {
      throw new Error('Pontuação de rodada inválida.');
    }
    for (const [id, points] of Object.entries(scores)) {
      if (!Number.isFinite(Number(points)) || Number(points) < 0) {
        throw new Error('Pontuação inválida para jogador.');
      }
      totals[id] = (totals[id] || 0) + Number(points);
    }
  }
  const entries = Object.entries(totals);
  if (!entries.length) throw new Error('Partida sem jogadores pontuados.');
  const highest = Math.max(...entries.map(([, points]) => points));
  const winnerIds = entries.filter(([, points]) => points === highest).map(([id]) => id).sort();
  const shares = {};
  const base = Math.floor(prizeCents / winnerIds.length);
  let remainder = prizeCents - base * winnerIds.length;
  for (const id of winnerIds) shares[id] = (base + (remainder-- > 0 ? 1 : 0)) / 100;
  return {
    rounds: ROUNDS_PER_MATCH,
    points: totals,
    highestPoints: highest,
    winnerIds,
    tied: winnerIds.length > 1,
    prizeAmount: prizeCents / 100,
    prizeShares: shares
  };
}

module.exports = { ROUNDS_PER_MATCH, scoreRoundWinners, resolveMatch };
