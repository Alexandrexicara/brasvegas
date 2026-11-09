'use strict';

const { randomInt, randomBytes, createHash } = require('crypto');

const RED = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
const SUITS = ['♠','♥','♦','♣'];
const RANKS = ['2','3','4','5','6','7','8','9','10','J','Q','K','A'];
const RANK = Object.fromEntries(RANKS.map((v,i)=>[v,i+2]));

function pick(max) { return randomInt(max); }
function shuffle(items) {
  const a = [...items];
  for (let i=a.length-1;i>0;i--) { const j=pick(i+1); [a[i],a[j]]=[a[j],a[i]]; }
  return a;
}
function deck() { return SUITS.flatMap(s=>RANKS.map(r=>({rank:r,suit:s}))); }
function cardValue(card) { return card.rank==='A'?11:['K','Q','J'].includes(card.rank)?10:Number(card.rank); }
function blackjackTotal(hand) {
  let total=hand.reduce((s,c)=>s+cardValue(c),0), aces=hand.filter(c=>c.rank==='A').length;
  while(total>21 && aces-->0) total-=10;
  return total;
}
function baccaratTotal(hand) { return hand.reduce((s,c)=>s+(c.rank==='A'?1:['10','J','Q','K'].includes(c.rank)?0:Number(c.rank)),0)%10; }
function pokerRank(hand) {
  if (!Array.isArray(hand)||hand.length!==5) throw new Error('Pôquer exige exatamente cinco cartas.');
  const values=hand.map(c=>RANK[c.rank]).sort((a,b)=>b-a);
  const counts={}; values.forEach(v=>counts[v]=(counts[v]||0)+1);
  const groups=Object.entries(counts).map(([v,n])=>({v:Number(v),n})).sort((a,b)=>b.n-a.n||b.v-a.v);
  const flush=hand.every(c=>c.suit===hand[0].suit);
  const unique=[...new Set(values)].sort((a,b)=>a-b);
  const straight=unique.length===5 && (unique[4]-unique[0]===4 || unique.join(',')==='2,3,4,5,14');
  const high=unique.join(',')==='2,3,4,5,14'?5:Math.max(...values);
  if(flush&&straight&&high===14) return {name:'royal_flush',score:9,tiebreak:[14]};
  if(flush&&straight) return {name:'straight_flush',score:8,tiebreak:[high]};
  if(groups[0].n===4) return {name:'four_kind',score:7,tiebreak:groups.map(g=>g.v)};
  if(groups[0].n===3&&groups[1].n===2) return {name:'full_house',score:6,tiebreak:groups.map(g=>g.v)};
  if(flush) return {name:'flush',score:5,tiebreak:values};
  if(straight) return {name:'straight',score:4,tiebreak:[high]};
  if(groups[0].n===3) return {name:'three_kind',score:3,tiebreak:groups.map(g=>g.v)};
  if(groups[0].n===2&&groups[1].n===2) return {name:'two_pair',score:2,tiebreak:groups.map(g=>g.v)};
  if(groups[0].n===2) return {name:'pair',score:1,tiebreak:groups.map(g=>g.v)};
  return {name:'high_card',score:0,tiebreak:values};
}
function comparePoker(a,b) {
  const x=pokerRank(a),y=pokerRank(b);
  if(x.score!==y.score) return Math.sign(x.score-y.score);
  for(let i=0;i<Math.max(x.tiebreak.length,y.tiebreak.length);i++) {
    const d=(x.tiebreak[i]||0)-(y.tiebreak[i]||0); if(d) return Math.sign(d);
  }
  return 0;
}
function rouletteResult() {
  const n=pick(37);
  return {number:n,color:n===0?'green':RED.has(n)?'red':'black'};
}
function validateRouletteBet(bet,result) {
  if(!bet||typeof bet!=='object') return false;
  if(bet.type==='number') return Number.isInteger(bet.number)&&bet.number>=0&&bet.number<=36&&bet.number===result.number;
  if(bet.type==='red'||bet.type==='black'||bet.type==='green') return bet.type===result.color;
  return false;
}
function rollDice() { return [pick(6)+1,pick(6)+1]; }
function crapsResult(betType='pass') {
  if(!['pass','dont_pass'].includes(betType)) throw new Error('Aposta de craps inválida.');
  const first=rollDice(), sum=first[0]+first[1];
  if(betType==='pass') {
    if(sum===7||sum===11) return {rolls:[first],outcome:'win',point:null,betType};
    if(sum===2||sum===3||sum===12) return {rolls:[first],outcome:'lose',point:null,betType};
  } else {
    if(sum===2||sum===3) return {rolls:[first],outcome:'win',point:null,betType};
    if(sum===7||sum===11) return {rolls:[first],outcome:'lose',point:null,betType};
    if(sum===12) return {rolls:[first],outcome:'push',point:null,betType};
  }
  const rolls=[first],point=sum;
  for(let i=0;i<1000;i++) {
    const r=rollDice(); rolls.push(r); const total=r[0]+r[1];
    if(betType==='pass'&&total===point || betType==='dont_pass'&&total===7) return {rolls,outcome:'win',point,betType};
    if(betType==='pass'&&total===7 || betType==='dont_pass'&&total===point) return {rolls,outcome:'lose',point,betType};
  }
  throw new Error('Limite de lançamentos excedido.');
}
function diceResult() { const dice=rollDice(); return {dice,sum:dice[0]+dice[1]}; }
function evaluateDiceBet(selection,result) {
  if(!selection||typeof selection!=='object') return false;
  if(selection.type==='sum') return Number.isInteger(Number(selection.value))&&Number(selection.value)>=2&&Number(selection.value)<=12&&Number(selection.value)===result.sum;
  if(selection.type==='total_over') return Number.isInteger(Number(selection.value))&&Number(selection.value)>=2&&Number(selection.value)<=11&&result.sum>Number(selection.value);
  if(selection.type==='total_under') return Number.isInteger(Number(selection.value))&&Number(selection.value)>=3&&Number(selection.value)<=12&&result.sum<Number(selection.value);
  if(selection.type==='doubles') return result.dice[0]===result.dice[1];
  return false;
}
function slotResult(symbols,paytable) {
  if(!Array.isArray(symbols)||symbols.length<2||symbols.some(s=>typeof s!=='string'||!s)) throw new Error('Configuração de símbolos inválida.');
  const result=Array.from({length:3},()=>symbols[pick(symbols.length)]);
  const multiplier=result.every(s=>s===result[0])?Number(paytable[result[0]]||0):0;
  return {symbols:result,multiplier};
}
function wallResult(multipliers) {
  if(!Array.isArray(multipliers)||multipliers.length<2) throw new Error('Parede precisa de ao menos duas saídas.');
  const path=Array.from({length:10},()=>pick(2));
  const slot=Math.min(multipliers.length-1,path.reduce((a,b)=>a+b,0)* (multipliers.length-1)/10|0);
  return {path,slot,multiplier:Number(multipliers[slot])};
}
function dealBlackjack() {
  const cards=shuffle(deck());
  const player=[cards.pop(),cards.pop()],dealer=[cards.pop(),cards.pop()];
  return {player,dealer,playerTotal:blackjackTotal(player),dealerUp:dealer[0]};
}
function bankerShouldDraw(bankerTotal, playerThirdCardValue) {
  if (playerThirdCardValue === null) return bankerTotal <= 5;
  if (bankerTotal <= 2) return true;
  if (bankerTotal === 3) return playerThirdCardValue !== 8;
  if (bankerTotal === 4) return playerThirdCardValue >= 2 && playerThirdCardValue <= 7;
  if (bankerTotal === 5) return playerThirdCardValue >= 4 && playerThirdCardValue <= 7;
  if (bankerTotal === 6) return playerThirdCardValue === 6 || playerThirdCardValue === 7;
  return false;
}
function dealBaccarat() {
  const cards=shuffle(deck());
  const player=[cards.pop(),cards.pop()],banker=[cards.pop(),cards.pop()];
  let p=baccaratTotal(player),b=baccaratTotal(banker),playerThird=null;
  if(p<8&&b<8) {
    if(p<=5) { player.push(cards.pop()); playerThird=player[player.length-1].rank==='A'?1:['10','J','Q','K'].includes(player[player.length-1].rank)?0:Number(player[player.length-1].rank); }
    if(bankerShouldDraw(b,playerThird)) banker.push(cards.pop());
  }
  p=baccaratTotal(player);b=baccaratTotal(banker);
  return {player,banker,playerTotal:p,bankerTotal:b,winner:p===b?'tie':p>b?'player':'banker'};
}
function makeFairCommitment(serverSeed=randomBytes(32).toString('hex')) {
  return {serverSeed,commitment:createHash('sha256').update(serverSeed).digest('hex')};
}
function verifyFairCommitment(serverSeed,commitment) {
  return createHash('sha256').update(serverSeed).digest('hex')===commitment;
}


function rouletteBetWins(selection,result) {
  if (!selection || typeof selection !== 'object') return false;
  const type=selection.type||selection.tipo;
  const red=RED.has(result.number), black=result.number!==0&&!red;
  if(type==='number'||type==='numero') return Number(selection.number??selection.numero)===result.number;
  if(type==='red'||type==='vermelho') return red;
  if(type==='black'||type==='preto') return black;
  if(type==='green'||type==='verde') return result.number===0;
  if(type==='even'||type==='par') return result.number!==0&&result.number%2===0;
  if(type==='odd'||type==='impar') return result.number%2===1;
  if(type==='low') return result.number>=1&&result.number<=18;
  if(type==='high') return result.number>=19&&result.number<=36;
  if(type==='dozen') {const n=Number(selection.value);return Number.isInteger(n)&&n>=1&&n<=3&&result.number>=(n-1)*12+1&&result.number<=n*12;}
  if(type==='column') {const n=Number(selection.value);return Number.isInteger(n)&&n>=1&&n<=3&&result.number!==0&&result.number%3===(n%3);}
  return false;
}
function fruitResult() {
  const symbols=['🍎','🍋','🍇','🍊','🍓','⭐'];
  const paytable={'🍎':20,'🍋':15,'🍇':10,'🍊':8,'🍓':5,'⭐':50};
  return slotResult(symbols,paytable);
}
function playBlackjack(actions=[]) {
  const cards=shuffle(Array.from({length:6},()=>deck()).flat());
  const player=[cards.pop(),cards.pop()],dealer=[cards.pop(),cards.pop()];
  let actionIndex=0;
  while(actionIndex<Math.min(actions.length,10)) {
    const action=actions[actionIndex++];
    if(action==='stand') break;
    if(action==='hit') { player.push(cards.pop()); if(blackjackTotal(player)>=21) break; continue; }
    throw new Error('Ação de blackjack inválida.');
  }
  let playerTotal=blackjackTotal(player);
  if(playerTotal<=21) while(blackjackTotal(dealer)<17) dealer.push(cards.pop());
  const dealerTotal=blackjackTotal(dealer);
  let outcome='lose';
  if(playerTotal>21) outcome='bust';
  else if(dealerTotal>21||playerTotal>dealerTotal) outcome=player.length===2&&playerTotal===21?'blackjack':'win';
  else if(playerTotal===dealerTotal) outcome='push';
  return {player,dealer,playerTotal,dealerTotal,outcome};
}

function validateBetSelection(code,selection) {
  if(!selection||typeof selection!=='object'||Array.isArray(selection)) return false;
  const type=selection.type||selection.tipo;
  if(code==='roleta') {
    if(['red','black','green','vermelho','preto','verde','even','odd','par','impar','low','high'].includes(type)) return true;
    if(type==='number'||type==='numero') {const n=Number(selection.number??selection.numero);return Number.isInteger(n)&&n>=0&&n<=36;}
    if(type==='dozen'||type==='column') {const n=Number(selection.value);return Number.isInteger(n)&&n>=1&&n<=3;}
    return false;
  }
  if(code==='bacara') return ['player','banker','tie','jogador','banco','empate'].includes(type);
  if(code==='craps') return ['pass','dont_pass','passar','naopassar'].includes(type);
  if(code==='dados') return ['pass','dont_pass','passar','naopassar'].includes(type) || (type==='sum'&&Number.isInteger(Number(selection.value))&&Number(selection.value)>=2&&Number(selection.value)<=12) ||
    (type==='total_over'&&Number.isInteger(Number(selection.value))&&selection.value>=2&&selection.value<=11) ||
    (type==='total_under'&&Number.isInteger(Number(selection.value))&&selection.value>=3&&selection.value<=12) || type==='doubles';
  if(code==='blackjack') return Array.isArray(selection.actions)&&selection.actions.length<=10&&selection.actions.every(a=>a==='hit'||a==='stand');
  if(code==='poquer') return type==='draw'||type==='mao'||type==='hand';
  if(code==='caca-niqueis'||code==='frutas'||code==='parede-sorte') return type==='spin'||type==='girar'||type==='drop'||type==='lancar';
  return false;
}



function startBlackjackGame() {
  const cards=shuffle(Array.from({length:6},()=>deck()).flat());
  const state={player:[cards.pop(),cards.pop()],dealer:[cards.pop(),cards.pop()],deck:cards,status:'playing',outcome:null};
  if(blackjackTotal(state.player)===21) finishBlackjackState(state);
  return state;
}
function finishBlackjackState(state) {
  if(state.status==='done') return state;
  const playerTotal=blackjackTotal(state.player);
  if(playerTotal<=21) while(blackjackTotal(state.dealer)<17&&state.deck.length) state.dealer.push(state.deck.pop());
  const dealerTotal=blackjackTotal(state.dealer);
  if(playerTotal>21) state.outcome='bust';
  else if(playerTotal===21&&state.player.length===2&&dealerTotal!==21) state.outcome='blackjack';
  else if(dealerTotal>21||playerTotal>dealerTotal) state.outcome='win';
  else if(playerTotal===dealerTotal) state.outcome='push';
  else state.outcome='lose';
  state.status='done';state.playerTotal=playerTotal;state.dealerTotal=dealerTotal;
  return state;
}
function blackjackAction(state,action) {
  const next=JSON.parse(JSON.stringify(state));
  if(next.status!=='playing') throw new Error('Esta mão de blackjack já foi encerrada.');
  if(action==='hit') {
    if(!next.deck.length) throw new Error('Baralho sem cartas.');
    next.player.push(next.deck.pop());
    if(blackjackTotal(next.player)>=21) finishBlackjackState(next);
  } else if(action==='stand') finishBlackjackState(next);
  else throw new Error('Ação inválida. Use hit ou stand.');
  return next;
}
function startPokerGame(sharedDeck=null) {
  const cards=sharedDeck?[...sharedDeck]:shuffle(deck());
  if(cards.length<5)throw new Error('Não há cartas suficientes para iniciar outra mão nesta mesa.');
  return {hand:cards.splice(0,5),deck:cards,status:'draw'};
}
function drawPokerCards(state,indices=[],sharedDeck=null) {
  const next=JSON.parse(JSON.stringify(state));
  if(sharedDeck)next.deck=[...sharedDeck];
  if(next.status!=='draw') throw new Error('Esta mão de pôquer já foi encerrada.');
  if(!Array.isArray(indices)||indices.length>5||new Set(indices).size!==indices.length||indices.some(i=>!Number.isInteger(i)||i<0||i>4)) throw new Error('Seleção de cartas inválida.');
  for(const i of indices) {if(!next.deck.length)throw new Error('Baralho sem cartas.');next.hand[i]=next.deck.pop();}
  next.status='done';next.rank=pokerRank(next.hand);
  if(sharedDeck)return {state:{...next,deck:[]},remainingDeck:next.deck};
  return next;
}

function resolveBlackjackTable(bets) {
  const byBetId={}; const winnerIds=[];
  for(const b of bets) {
    let state=b.selecao?.player&&b.selecao?.dealer?JSON.parse(JSON.stringify(b.selecao)):startBlackjackGame();
    if(state.status!=='done') finishBlackjackState(state);
    const outcome=state.outcome;
    byBetId[b.id]={player:state.player,dealer:state.dealer,playerTotal:state.playerTotal??blackjackTotal(state.player),dealerTotal:state.dealerTotal??blackjackTotal(state.dealer),outcome};
    if(outcome==='win'||outcome==='blackjack') winnerIds.push(b.id);
  }
  return {result:{tipo:'blackjack',porAposta:byBetId},winnerIds,byBetId};
}

function resolveRound(code,bets) {
  if(!Array.isArray(bets)||bets.length===0) throw new Error('Rodada sem apostas.');
  const byBetId={}; let result; let winnerIds=[];
  const win=(b)=>winnerIds.push(b.id);
  if(code==='roleta') {
    result=rouletteResult(); bets.forEach(b=>{if(rouletteBetWins(b.selecao,result))win(b);});
  } else if(code==='bacara') {
    result=dealBaccarat();
    bets.forEach(b=>{const s=b.selecao?.type||b.selecao?.tipo;const chosen=s==='banker'||s==='banco'?'banker':s==='player'||s==='jogador'?'player':s==='tie'||s==='empate'?'tie':null;if(chosen===result.winner)win(b);});
  } else if(code==='craps') {
    const pass=crapsResult('pass'); result=pass;
    bets.forEach(b=>{const s=b.selecao?.type||b.selecao?.tipo;const betType=s==='dont_pass'||s==='naopassar'?'dont_pass':s==='pass'||s==='passar'?'pass':null;if(!betType) return;const firstSum=pass.rolls[0][0]+pass.rolls[0][1];const outcome=betType==='pass'?pass.outcome:(firstSum===12?'push':pass.outcome==='win'?'lose':'win');if(outcome==='win')win(b);});
  } else if(code==='dados') {
    if(bets.some(b=>['pass','dont_pass','passar','naopassar'].includes(b.selecao?.type||b.selecao?.tipo))) {
      const pass=crapsResult('pass');result=pass;
      bets.forEach(b=>{const s=b.selecao?.type||b.selecao?.tipo;const betType=s==='dont_pass'||s==='naopassar'?'dont_pass':'pass';const firstSum=pass.rolls[0][0]+pass.rolls[0][1];const outcome=betType==='pass'?pass.outcome:(firstSum===12?'push':pass.outcome==='win'?'lose':'win');if(outcome==='win')win(b);});
    } else {result=diceResult();bets.forEach(b=>{if(evaluateDiceBet(b.selecao,result))win(b);});}
  } else if(code==='caca-niqueis'||code==='frutas') {
    for(const b of bets){const r=code==='frutas'?fruitResult():slotResult(['🍒','🍋','🍊','🍇','💎','⭐'],{'🍒':10,'🍋':15,'🍊':20,'🍇':30,'💎':50,'⭐':100});byBetId[b.id]=r;if(r.multiplier>0)win(b);}
    result={tipo:'resultado_individual',porAposta:byBetId};
  } else if(code==='parede-sorte') {
    const multipliers=[1,2,5,10,25,50,100,500];let best=-Infinity;
    for(const b of bets){const r=wallResult(multipliers);byBetId[b.id]=r;if(r.multiplier>best){best=r.multiplier;winnerIds=[b.id];}else if(r.multiplier===best)winnerIds.push(b.id);}
    result={tipo:'parede_sorte',maiorMultiplicador:best,porAposta:byBetId};
  } else if(code==='blackjack') {
    const table=resolveBlackjackTable(bets);result=table.result;winnerIds=table.winnerIds;Object.assign(byBetId,table.byBetId);
  } else if(code==='poquer') {
    let best=null;
    for(const b of bets){const hand=Array.isArray(b.selecao?.hand)?b.selecao.hand:shuffle(deck()).slice(0,5),rank=pokerRank(hand);byBetId[b.id]={hand,rank};if(!best||comparePoker(hand,best.hand)>0){best={hand};winnerIds=[b.id];}else if(comparePoker(hand,best.hand)===0)winnerIds.push(b.id);}
    result={tipo:'poquer',porAposta:byBetId};
  } else throw new Error('Jogo sem motor de resultado: '+code);
  return {result,winnerIds,byBetId};
}

module.exports={pick,shuffle,deck,blackjackTotal,baccaratTotal,bankerShouldDraw,pokerRank,comparePoker,rouletteResult,validateRouletteBet,rollDice,crapsResult,diceResult,evaluateDiceBet,slotResult,wallResult,dealBlackjack,dealBaccarat,makeFairCommitment,verifyFairCommitment,rouletteBetWins,fruitResult,playBlackjack,validateBetSelection,resolveBlackjackTable,startBlackjackGame,blackjackAction,startPokerGame,drawPokerCards,resolveRound};
