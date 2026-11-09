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
function crapsResult() {
  const first=rollDice(), sum=first[0]+first[1];
  if(sum===7||sum===11) return {rolls:[first],outcome:'win',point:null};
  if(sum===2||sum===3||sum===12) return {rolls:[first],outcome:'lose',point:null};
  const rolls=[first],point=sum;
  for(let i=0;i<1000;i++) {
    const r=rollDice(); rolls.push(r); const s=r[0]+r[1];
    if(s===point) return {rolls,outcome:'win',point};
    if(s===7) return {rolls,outcome:'lose',point};
  }
  throw new Error('Limite de lançamentos excedido.');
}
function diceResult() { const dice=rollDice(); return {dice,sum:dice[0]+dice[1]}; }
function slotResult(symbols,paytable) {
  if(!Array.isArray(symbols)||symbols.length!==3||!symbols.length) throw new Error('Configuração de símbolos inválida.');
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
function dealBaccarat() {
  const cards=shuffle(deck());
  const player=[cards.pop(),cards.pop()],banker=[cards.pop(),cards.pop()];
  let p=baccaratTotal(player),b=baccaratTotal(banker);
  if(p<8&&b<8) {
    if(p<=5) player.push(cards.pop());
    p=baccaratTotal(player);
    if(b<=2 || (b===3&&p!==8) || (b===4&&p>=2&&p<=7) || (b===5&&p>=4&&p<=7) || (b===6&&p>=6&&p<=7)) banker.push(cards.pop());
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

module.exports={pick,shuffle,deck,blackjackTotal,baccaratTotal,pokerRank,comparePoker,rouletteResult,validateRouletteBet,rollDice,crapsResult,diceResult,slotResult,wallResult,dealBlackjack,dealBaccarat,makeFairCommitment,verifyFairCommitment};
