(function(){
'use strict';
let ctx=null,enabled=localStorage.getItem('brasvegas-audio')!=='off',master=.22;
function wake(){if(!enabled)return null;const AC=window.AudioContext||window.webkitAudioContext;if(!AC)return null;if(!ctx)ctx=new AC();if(ctx.state==='suspended')ctx.resume();return ctx}
function tone(freq,dur,type='sine',vol=.12,when=0,endFreq=null){const c=wake();if(!c)return;const t=c.currentTime+when,o=c.createOscillator(),g=c.createGain();o.type=type;o.frequency.setValueAtTime(freq,t);if(endFreq)o.frequency.exponentialRampToValueAtTime(Math.max(1,endFreq),t+dur);g.gain.setValueAtTime(.0001,t);g.gain.exponentialRampToValueAtTime(Math.max(.0002,vol*master),t+.012);g.gain.exponentialRampToValueAtTime(.0001,t+dur);o.connect(g);g.connect(c.destination);o.start(t);o.stop(t+dur+.03)}
function noise(dur=.12,vol=.12,filter=1200){const c=wake();if(!c)return;const n=Math.floor(c.sampleRate*dur),b=c.createBuffer(1,n,c.sampleRate),a=b.getChannelData(0);for(let i=0;i<n;i++)a[i]=(Math.random()*2-1)*(1-i/n);const s=c.createBufferSource(),f=c.createBiquadFilter(),g=c.createGain();s.buffer=b;f.type='lowpass';f.frequency.value=filter;g.gain.value=vol*master;s.connect(f);f.connect(g);g.connect(c.destination);s.start()}
const sounds={
click(){tone(620,.045,'square',.06)},chip(){tone(1200,.07,'triangle',.09);tone(1750,.08,'sine',.07,.035)},
card(){noise(.075,.10,2400);tone(480,.055,'triangle',.045,.03)},shuffle(){noise(.28,.10,1700);noise(.18,.07,2600,.12)},
dice(){noise(.42,.16,1800);for(let i=0;i<4;i++)tone(180+Math.random()*180,.07,'triangle',.10,i*.085,90)},
spin(){for(let i=0;i<9;i++)tone(280+i*27,.055,'square',.045,i*.085,180+i*14)},
slot(){for(let i=0;i<6;i++)tone(220+i*75,.07,'sawtooth',.045,i*.09,160+i*35)},
win(){[523,659,784,1047].forEach((n,i)=>tone(n,.22,'triangle',.13,i*.12))},
lose(){[330,260,190].forEach((n,i)=>tone(n,.18,'sine',.08,i*.13))},
plinko(){noise(.055,.10,2400);tone(900,.04,'sine',.045)},
pool(){tone(165,.075,'sine',.17);tone(520,.035,'triangle',.07,.018);},
pocket(){tone(210,.2,'sine',.11,0,65);noise(.16,.09,700,.03)}
};
function play(name){if(sounds[name])sounds[name]()}
function detect(el){if(!el||!enabled)return;const s=((el.innerText||el.getAttribute('aria-label')||el.title||'')+'').toLowerCase();if(/lançar|rolar.*dado|jogar.*dado/.test(s))play('dice');else if(/girar|roleta|spin/.test(s))play('spin');else if(/distribuir|pedir carta|nova mão|comprar carta|embaralhar|trocar cartas/.test(s))play('card');else if(/slot|caça|girar rolos|colheita/.test(s))play('slot');else if(/plinko|soltar|lançar moeda/.test(s))play('plinko');else if(/ficha|apostar|aposta/.test(s))play('chip');else play('click')}
document.addEventListener('click',e=>{const el=e.target.closest('button,[role=button],.aposta,.ficha-aposta');if(el&&!el.matches('[data-audio-toggle]'))detect(el)},true);
document.addEventListener('brasvegas:sound',e=>play(e.detail),false);
window.BrasVegasAudio={play,setEnabled(v){enabled=!!v;localStorage.setItem('brasvegas-audio',enabled?'on':'off');if(enabled)wake()},get enabled(){return enabled}};
document.addEventListener('DOMContentLoaded',()=>{const b=document.createElement('button');b.type='button';b.dataset.audioToggle='';b.setAttribute('aria-label','Ativar ou desativar efeitos sonoros');b.textContent=enabled?'🔊 SOM':'🔇 SOM';b.style.cssText='position:fixed;right:14px;bottom:14px;z-index:9999;border:1px solid #d5b36a;border-radius:30px;padding:10px 15px;background:#17120d;color:#f4d58b;font-weight:800;box-shadow:0 4px 16px #0008';b.onclick=()=>{enabled=!enabled;localStorage.setItem('brasvegas-audio',enabled?'on':'off');b.textContent=enabled?'🔊 SOM':'🔇 SOM';if(enabled)wake()};document.body.appendChild(b)});
})();