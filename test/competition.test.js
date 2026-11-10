'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreRoundWinners, resolveMatch } = require('../game-engine/competition');

test('cada vencedor da rodada recebe um ponto, sem duplicar por apostas', () => {
  const bets = [
    {id:'a1',usuario_id:'a'},{id:'a2',usuario_id:'a'},
    {id:'b1',usuario_id:'b'},{id:'c1',usuario_id:'c'}
  ];
  assert.deepEqual(scoreRoundWinners(bets,['a1','a2','b1']), {a:1,b:1});
});
test('partida de cinco rodadas paga somente ao maior pontuador', () => {
  const rounds = [{a:1},{b:1},{a:1},{a:1,c:1},{a:1}];
  const result = resolveMatch(rounds, 100);
  assert.deepEqual(result.winnerIds, ['a']);
  assert.deepEqual(result.prizeShares, {a:100});
  assert.equal(result.points.a,4);
});
test('somente empate na pontuação final divide igualmente o prêmio', () => {
  const rounds = [{a:1,b:1},{a:1},{b:1},{a:1,b:1},{c:1}];
  const result = resolveMatch(rounds, 10.01);
  assert.deepEqual(result.winnerIds, ['a','b']);
  assert.deepEqual(result.prizeShares, {a:5.01,b:5});
  assert.equal(result.tied, true);
});
test('segundo e terceiro lugares não recebem parte do prêmio', () => {
  const result = resolveMatch([{a:1,b:1,c:1},{a:1},{a:1},{a:1},{a:1}], 90);
  assert.deepEqual(Object.keys(result.prizeShares), ['a']);
});
test('recusa partida com menos ou mais de cinco rodadas', () => {
  assert.throws(() => resolveMatch([{a:1}], 10), /cinco rodadas/);
  assert.throws(() => resolveMatch(Array.from({length:6},()=>({a:1})), 10), /cinco rodadas/);
});
test('recusa valor de prêmio inválido', () => {
  assert.throws(() => resolveMatch(Array.from({length:5},()=>({a:1})), -1), /Prêmio/);
});
