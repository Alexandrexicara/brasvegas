'use strict';

const ROUNDS_PER_MATCH = 5;
const POINTS_BY_PLACE = [3, 2, 1];

/**
 * Recebe a classificação de UMA rodada (IDs em ordem de colocação).
 * Empates recebem a média dos pontos das posições ocupadas.
 * A premiação não acontece aqui: esta função só calcula pontos.
 */
function scoreRoundPlacements(placements) {
  if (!Array.isArray(placements) || placements.length === 0) {
    throw new Error('A classificação da rodada está vazia.');
  }
  const groups = placements.map(p => p && typeof p === 'object' && Array.isArray(p.tiedPlayerIds)
    ? [...new Set(p.tiedPlayerIds)]
    : [typeof p === 'string' ? p : p?.playerId]);
  const flatIds = groups.flat();
  if (flatIds.some(id => typeof id !== 'string' || !id.trim())) {
    throw new Error('Cada colocação precisa ter um playerId válido.');
  }
  const seen = new Set();
  for (const id of flatIds) {
    if (seen.has(id)) throw new Error('Jogador duplicado na classificação da rodada.');
    seen.add(id);
  }

  const scores = {};
  let position = 0;
  for (const group of groups) {
    const occupied = group.length;
    const points = POINTS_BY_PLACE.slice(position, position + occupied)
      .reduce((sum, value) => sum + value, 0) / occupied;
    for (const id of group) scores[id] = points;
    position += occupied;
  }
  return scores;
}

/**
 * Soma os pontos das cinco rodadas e retorna apenas o(s) maior(es)
 * pontuador(es). O valor do prêmio é dividido igualmente somente
 * quando houver empate na pontuação final, com ajuste de centavos.
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
  const winners = entries.filter(([, points]) => points === highest).map(([id]) => id).sort();
  const shares = {};
  const base = Math.floor(prizeCents / winners.length);
  let remainder = prizeCents - base * winners.length;
  for (const id of winners) {
    shares[id] = (base + (remainder-- > 0 ? 1 : 0)) / 100;
  }
  return {
    rounds: ROUNDS_PER_MATCH,
    points: totals,
    highestPoints: highest,
    winnerIds: winners,
    tied: winners.length > 1,
    prizeAmount: prizeCents / 100,
    prizeShares: shares
  };
}

module.exports = { ROUNDS_PER_MATCH, POINTS_BY_PLACE, scoreRoundPlacements, resolveMatch };
