'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const { scoreRoundPlacements, resolveMatch } = require('../game-engine/competition');

test('pontuação por rodada usa 3, 2 e 1 pontos', () => {
  assert.deepEqual(scoreRoundPlacements(['a','b','c','d']), {a:3,b:2,c:1,d:0});
});
test('empate numa colocação divide os pontos ocupados', () => {
  assert.deepEqual(scoreRoundPlacements([{tiedPlayerIds:['a','b']},'c']), {a:2.5,b:2.5,c:1});
});
test('partida exige cinco rodadas e define um único maior pontuador', () => {
  const rounds = [
    {a:3,b:2,c:1},{a:2,b:3,c:1},{a:3,b:1,c:2},
    {a:2,b:3,c:1},{a:3,b:2,c:1}
  ];
  const result = resolveMatch(rounds, 100);
  assert.deepEqual(result.winnerIds, ['a']);
  assert.deepEqual(result.prizeShares, {a:100});
});
test('somente empate na pontuação final divide o prêmio', () => {
  const rounds = Array.from({length:5}, () => ({a:3,b:3,c:1}));
  const result = resolveMatch(rounds, 10.01);
  assert.deepEqual(result.winnerIds, ['a','b']);
  assert.deepEqual(result.prizeShares, {a:5.01,b:5});
  assert.equal(result.tied, true);
});
test('não distribui prêmio para segundo ou terceiro colocado', () => {
  const result = resolveMatch(Array.from({length:5}, () => ({a:3,b:2,c:1})), 90);
  assert.deepEqual(Object.keys(result.prizeShares), ['a']);
});
