'use strict';
const test=require('node:test');
const assert=require('node:assert/strict');
const g=require('../game-engine');
test('baralho tem 52 cartas únicas',()=>{const d=g.deck();assert.equal(d.length,52);assert.equal(new Set(d.map(c=>c.rank+c.suit)).size,52);});
test('embaralhamento preserva todas as cartas',()=>{const d=g.shuffle(g.deck());assert.equal(d.length,52);assert.equal(new Set(d.map(c=>c.rank+c.suit)).size,52);});
test('blackjack trata ás como 1 quando estoura',()=>assert.equal(g.blackjackTotal([{rank:'A'},{rank:'K'},{rank:'9'}]),20));
test('bacará calcula módulo dez',()=>assert.equal(g.baccaratTotal([{rank:'K'},{rank:'9'},{rank:'7'}]),6));
test('pôquer reconhece sequência baixa A-2-3-4-5',()=>assert.equal(g.pokerRank([{rank:'A',suit:'♠'},{rank:'2',suit:'♥'},{rank:'3',suit:'♦'},{rank:'4',suit:'♣'},{rank:'5',suit:'♠'}]).name,'straight'));
test('pôquer compara mãos e desempata',()=>assert.equal(g.comparePoker([{rank:'A',suit:'♠'},{rank:'A',suit:'♥'},{rank:'K',suit:'♦'},{rank:'8',suit:'♣'},{rank:'2',suit:'♠'}],[{rank:'K',suit:'♠'},{rank:'K',suit:'♥'},{rank:'Q',suit:'♦'},{rank:'8',suit:'♣'},{rank:'2',suit:'♠'}]),1));
test('roleta sempre retorna 0-36 e cor consistente',()=>{for(let i=0;i<500;i++){const r=g.rouletteResult();assert.ok(r.number>=0&&r.number<=36);assert.equal(r.color,r.number===0?'green':new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]).has(r.number)?'red':'black');}});
test('dados somam os dois valores',()=>{for(let i=0;i<100;i++){const r=g.diceResult();assert.equal(r.sum,r.dice[0]+r.dice[1]);assert.ok(r.dice.every(n=>n>=1&&n<=6));}});
test('aposta da roleta valida tipo e limites',()=>{assert.equal(g.validateRouletteBet({type:'number',number:37},{number:37,color:'black'}),false);assert.equal(g.validateRouletteBet({type:'red'},{number:1,color:'red'}),true);});
test('compromisso criptográfico pode ser verificado',()=>{const c=g.makeFairCommitment('seed-teste');assert.equal(g.verifyFairCommitment('seed-teste',c.commitment),true);assert.equal(g.verifyFairCommitment('seed-falso',c.commitment),false);});
test('caça-níqueis respeita a tabela de pagamento',()=>{const r=g.slotResult(['X'],{X:10});assert.deepEqual(r,{symbols:['X','X','X'],multiplier:10});});
test('parede da sorte devolve saída válida',()=>{const r=g.wallResult([1,2,5,10,25,50,100,500]);assert.ok(r.slot>=0&&r.slot<8);assert.equal(r.multiplier,[1,2,5,10,25,50,100,500][r.slot]);});
test('blackjack e bacará distribuem mãos válidas',()=>{const b=g.dealBlackjack(),c=g.dealBaccarat();assert.equal(b.player.length,2);assert.equal(c.player.length>=2,true);assert.ok(c.playerTotal>=0&&c.playerTotal<=9);});

test('bacará aplica corretamente a regra de compra do banqueiro',()=>{
 assert.equal(g.bankerShouldDraw(6,null),false);
 assert.equal(g.bankerShouldDraw(5,null),true);
 assert.equal(g.bankerShouldDraw(3,8),false);
 assert.equal(g.bankerShouldDraw(3,7),true);
 assert.equal(g.bankerShouldDraw(6,6),true);
 assert.equal(g.bankerShouldDraw(6,5),false);
});

test('caça-níqueis aceita catálogo de seis símbolos',()=>{const r=g.slotResult(['🍒','🍋','🍊','🍇','💎','⭐'],{'🍒':10,'🍋':15,'🍊':20,'🍇':30,'💎':50,'⭐':100});assert.equal(r.symbols.length,3);assert.ok(r.symbols.every(s=>['🍒','🍋','🍊','🍇','💎','⭐'].includes(s)));});
test('craps resolve corretamente as apostas pass e dont pass',()=>{
 const pass=g.crapsResult('pass'),dont=g.crapsResult('dont_pass');
 assert.ok(['win','lose','push'].includes(pass.outcome));
 assert.ok(['win','lose','push'].includes(dont.outcome));
 assert.equal(pass.betType,'pass');assert.equal(dont.betType,'dont_pass');
});
test('apostas de dados validam soma e duplas',()=>{
 assert.equal(g.evaluateDiceBet({type:'sum',value:7},{dice:[3,4],sum:7}),true);
 assert.equal(g.evaluateDiceBet({type:'doubles'},{dice:[4,4],sum:8}),true);
 assert.equal(g.evaluateDiceBet({type:'sum',value:13},{dice:[6,6],sum:12}),false);
});

test('valida seleções por jogo sem aceitar valores fora das regras',()=>{
 assert.equal(g.validateBetSelection('roleta',{tipo:'numero',numero:36}),true);
 assert.equal(g.validateBetSelection('roleta',{tipo:'numero',numero:37}),false);
 assert.equal(g.validateBetSelection('bacara',{tipo:'empate'}),true);
 assert.equal(g.validateBetSelection('craps',{tipo:'naopassar'}),true);
 assert.equal(g.validateBetSelection('dados',{type:'sum',value:'7'}),true);
 assert.equal(g.validateBetSelection('blackjack',{actions:['hit','stand']}),true);
 assert.equal(g.validateBetSelection('blackjack',{actions:['hack']}),false);
 assert.equal(g.validateBetSelection('poquer',{type:'draw'}),true);
 assert.equal(g.validateBetSelection('frutas',{type:'spin'}),true);
 assert.equal(g.validateBetSelection('parede-sorte',{type:'drop'}),true);
});
test('resolução de rodada gera resultado para os nove jogos',()=>{
 const samples={
  roleta:[{id:'r1',selecao:{tipo:'vermelho'}}],
  bacara:[{id:'b1',selecao:{tipo:'jogador'}}],
  craps:[{id:'c1',selecao:{tipo:'passar'}}],
  dados:[{id:'d1',selecao:{type:'sum',value:7}}],
  blackjack:[{id:'bj1',selecao:{actions:['stand']}}],
  poquer:[{id:'p1',selecao:{type:'draw'}}],
  'caca-niqueis':[{id:'s1',selecao:{type:'spin'}}],
  frutas:[{id:'f1',selecao:{type:'spin'}}],
  'parede-sorte':[{id:'w1',selecao:{type:'drop'}}]
 };
 for(const [code,bets] of Object.entries(samples)){
  const result=g.resolveRound(code,bets);
  assert.ok(result.result);
  assert.ok(Array.isArray(result.winnerIds));
  assert.ok(result.byBetId);
 }
});
test('bacará e blackjack geram cartas de baralho válido',()=>{
 const b=g.dealBaccarat(),bj=g.resolveBlackjackTable([{id:'x',selecao:{actions:['stand']}}]);
 assert.ok(b.player.length>=2&&b.banker.length>=2);
 assert.equal(bj.byBetId.x.player.length>=2,true);
 assert.equal(bj.byBetId.x.dealer.length>=2,true);
});

test('pôquer distribui cartas sem repetição usando um único baralho compartilhado',()=>{
 const shoe=g.shuffle(g.deck());
 const a=g.startPokerGame(shoe),b=g.startPokerGame(a.deck);
 const all=[...a.hand,...b.hand];
 assert.equal(all.length,10);
 assert.equal(new Set(all.map(c=>c.rank+c.suit)).size,10);
 const draw=g.drawPokerCards(a,[0,2],b.deck);
 assert.equal(draw.state.status,'done');
 assert.equal(draw.state.hand.length,5);
 assert.equal(draw.remainingDeck.length,40);
});
test('blackjack aceita hit e stand e encerra a mão no servidor',()=>{
 let state=g.startBlackjackGame();
 if(state.status==='playing')state=g.blackjackAction(state,'stand');
 assert.equal(state.status,'done');
 assert.ok(['win','lose','push','bust','blackjack'].includes(state.outcome));
 assert.ok(state.playerTotal>=0&&state.dealerTotal>=0);
});

test('sinuca cria mesas 1x1 e em duplas com lugares definidos',()=>{
 const two=g.startBilliardsGame(2,[{betId:'a',userId:'u1'},{betId:'b',userId:'u2'}]);
 assert.equal(two.status,'playing');assert.equal(two.players.length,2);assert.equal(two.players[0].team,0);assert.equal(two.players[1].team,1);
 const four=g.startBilliardsGame(4,[{betId:'a'},{betId:'b'},{betId:'c'},{betId:'d'}]);
 assert.deepEqual(four.players.map(p=>p.team),[0,1,0,1]);
 assert.equal(four.balls.length,16);
});
test('sinuca calcula a tacada no servidor e alterna turno quando não encaçapa',()=>{
 const state=g.startBilliardsGame(2,[{betId:'a',userId:'u1'},{betId:'b',userId:'u2'}]);
 const next=g.simulateBilliardsShot(state,'a',0,40);
 assert.equal(next.shotNumber,1);
 assert.ok(next.lastShot);
 assert.ok([0,1].includes(next.turn));
 assert.equal(next.balls.length,16);
});
test('sinuca rejeita tacada fora da vez e seleções inválidas',()=>{
 const state=g.startBilliardsGame(2,[{betId:'a'},{betId:'b'}]);
 assert.throws(()=>g.simulateBilliardsShot(state,'b',0,50),/vez/);
 assert.equal(g.validateBetSelection('sinuca',{type:'join',format:2}),true);
 assert.equal(g.validateBetSelection('sinuca',{type:'join',format:3}),false);
});
