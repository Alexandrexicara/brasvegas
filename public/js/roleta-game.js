(() => {
  const ordem = [0,32,15,19,4,21,2,25,17,34,6,27,13,36,11,30,8,23,10,5,24,16,33,1,20,14,31,9,22,18,29,7,28,12,35,3,26];
  const vermelhos = new Set([1,3,5,7,9,12,14,16,18,19,21,23,25,27,30,32,34,36]);
  const corNumero = n => n === 0 ? 'verde' : vermelhos.has(n) ? 'vermelho' : 'preto';
  const nomes = {vermelho:'Vermelho',preto:'Preto',verde:'Zero',numero:'Número'};
  const canvas = document.getElementById('roleta-canvas');
  if (!canvas) return;
  const ctx = canvas.getContext('2d');
  const tamanho = 760, centro = 380, passo = Math.PI * 2 / 37;
  const bola = document.getElementById('bola-roleta');
  const palco = document.querySelector('.aro-metal');
  const resultadoNumero = document.getElementById('numero-resultado');
  const resultadoCor = document.getElementById('cor-resultado');
  const historico = document.getElementById('historico-roleta');
  const botao = document.getElementById('btn-girar-roleta');
  let aposta = null, girando = false, anguloRoda = 0, historicoNumeros = [];

  function circulo(x,y,r,fill,stroke,width=1) {
    ctx.beginPath(); ctx.arc(x,y,r,0,Math.PI*2);
    if(fill){ctx.fillStyle=fill;ctx.fill();}
    if(stroke){ctx.lineWidth=width;ctx.strokeStyle=stroke;ctx.stroke();}
  }
  function desenharRoleta() {
    ctx.clearRect(0,0,tamanho,tamanho);
    // Corpo torneado de madeira e latão.
    circulo(centro,centro,374,'#24150b','#d5b46b',8);
    circulo(centro,centro,360,'#7b4a1e','#f5d98a',5);
    circulo(centro,centro,348,'#1a1009','#513016',7);
    circulo(centro,centro,337,'#b58a45','#f7dfa0',4);
    circulo(centro,centro,326,'#332014','#8d642d',5);
    // Faixa externa de marfim e canal da bola.
    circulo(centro,centro,316,'#e0c58d','#fff0bd',4);
    circulo(centro,centro,306,'#9b713a','#3b2410',3);
    circulo(centro,centro,296,'#17120d','#d5b46b',4);
    // Compartimentos numerados, ordem europeia real.
    ordem.forEach((n,i)=>{
      const inicio=-Math.PI/2-passo/2+i*passo;
      const fim=inicio+passo;
      const cor=n===0?'#087a43':vermelhos.has(n)?'#b51f27':'#17191b';
      ctx.beginPath();ctx.moveTo(centro,centro);ctx.arc(centro,centro,291,inicio,fim);ctx.closePath();
      ctx.fillStyle=cor;ctx.fill();ctx.lineWidth=2;ctx.strokeStyle='#d5b875';ctx.stroke();
      const ang=inicio+passo/2;
      const tx=centro+Math.cos(ang)*267, ty=centro+Math.sin(ang)*267;
      ctx.save();ctx.translate(tx,ty);ctx.rotate(ang+Math.PI/2);
      ctx.fillStyle='#fff5d8';ctx.font='bold 21px Georgia';ctx.textAlign='center';ctx.textBaseline='middle';ctx.shadowColor='#000';ctx.shadowBlur=3;ctx.fillText(String(n),0,0);ctx.restore();
      // Separadores de latão.
      const sx=centro+Math.cos(inicio)*291, sy=centro+Math.sin(inicio)*291;
      ctx.beginPath();ctx.moveTo(centro,centro);ctx.lineTo(sx,sy);ctx.strokeStyle='#f4d994';ctx.lineWidth=1.5;ctx.stroke();
    });
    // Anel de bolsos interno.
    circulo(centro,centro,222,'#b88b43','#f5d891',5);
    circulo(centro,centro,211,'#5c3c1d','#e6c77f',3);
    // Raios decorativos de madeira.
    for(let i=0;i<37;i++){
      const a=i*passo;
      ctx.beginPath();ctx.moveTo(centro+Math.cos(a)*205,centro+Math.sin(a)*205);ctx.lineTo(centro+Math.cos(a)*155,centro+Math.sin(a)*155);
      ctx.strokeStyle='#d1a65b';ctx.lineWidth=2;ctx.stroke();
    }
    circulo(centro,centro,157,'#805326','#e8c779',6);
    circulo(centro,centro,145,'#2b1b10','#a77a3a',4);
    // Roseta central e acabamento.
    for(let i=0;i<12;i++){const a=i*Math.PI/6;circulo(centro+Math.cos(a)*112,centro+Math.sin(a)*112,5,'#e7c879','#fff0bd',1);}
    circulo(centro,centro,96,'#9b6b2c','#f3d58e',5);
    circulo(centro,centro,82,'#2a1a0e','#c9a45b',5);
    circulo(centro,centro,65,'#7c4b1c','#edce83',4);
    circulo(centro,centro,52,'#2b1a0e','#b68b47',3);
    ctx.fillStyle='#f2d38a';ctx.textAlign='center';ctx.textBaseline='middle';ctx.font='bold 18px Georgia';ctx.fillText('BRAS',centro,centro-9);ctx.font='bold 15px Georgia';ctx.fillText('VEGAS',centro,centro+13);
    // Rebites externos.
    for(let i=0;i<24;i++){const a=i*Math.PI/12;circulo(centro+Math.cos(a)*347,centro+Math.sin(a)*347,5,'#f0d58f','#76501f',2);}
  }
  desenharRoleta();

  function posicionarBola(angulo,raio) {
    const x=50+Math.cos(angulo)*raio/palco.clientWidth*100;
    const y=50+Math.sin(angulo)*raio/palco.clientHeight*100;
    bola.style.left=x+'%';bola.style.top=y+'%';
  }
  posicionarBola(-Math.PI/2, palco.clientWidth*.405);
  window.addEventListener('resize',()=>{if(!girando)posicionarBola(-Math.PI/2,palco.clientWidth*.405);});

  window.selecionarAposta = function(tipo) {
    if(girando)return;
    aposta=tipo;
    document.querySelectorAll('.ficha-aposta').forEach(b=>b.classList.remove('selecionada'));
    const mapa={vermelho:0,preto:1,verde:2,numero:3};
    document.querySelectorAll('.ficha-aposta')[mapa[tipo]]?.classList.add('selecionada');
    const el=document.getElementById('tipo-aposta');
    const n=document.getElementById('numero-escolhido').value;
    el.textContent=tipo==='numero'?'Aposta selecionada: número '+n+' • 36x':'Aposta selecionada: '+nomes[tipo]+' • '+(tipo==='verde'?'36x':'2x');
    document.getElementById('campo-numero-label').style.opacity=tipo==='numero'?'1':'.55';
  };
  document.getElementById('numero-escolhido').addEventListener('change',()=>{
    if(aposta==='numero')document.getElementById('tipo-aposta').textContent='Aposta selecionada: número '+document.getElementById('numero-escolhido').value+' • 36x';
  });

  function animarAteResultado() {
    const inicio=performance.now(),duracao=7200,voltas=9;
    const indiceAlvo=ordem.indexOf(window.__resultadoRoleta.numero);
    const anguloCasa=indiceAlvo*360/37;
    const rotacaoAtual=anguloRoda;
    const voltasFinais=Math.ceil((rotacaoAtual+voltas*360-anguloCasa)/360);
    const destino=voltasFinais*360-anguloCasa;
    const bolaInicio=-Math.PI/2;
    const voltasBola=10;
    return new Promise(resolve=>{
      function frame(agora){
        const t=Math.min(1,(agora-inicio)/duracao);
        const ease=1-Math.pow(1-t,3.2);
        anguloRoda=rotacaoAtual+(destino-rotacaoAtual)*ease;
        canvas.style.transform='rotate('+anguloRoda+'deg)';
        // A bola percorre sua própria pista em sentido contrário, desacelera e cai na casa sorteada.
        const queda=Math.max(0,(t-.78)/.22);
        const angBola=bolaInicio-voltasBola*2*Math.PI*(1-Math.pow(1-t,2.5));
        const raioInicial=palco.clientWidth*.405;
        const raioFinal=palco.clientWidth*.322;
        const raio=raioInicial+(raioFinal-raioInicial)*Math.min(1,queda);
        posicionarBola(t>=1?-Math.PI/2:angBola,raio);
        if(t<1)requestAnimationFrame(frame);
        else {anguloRoda=((destino%360)+360)%360;posicionarBola(-Math.PI/2,raioFinal);resolve();}
      }
      requestAnimationFrame(frame);
    });
  }

  window.girarRoleta = async function() {
    if(girando)return;
    const token=localStorage.getItem('brasvegas-token')||'';
    if(!token){mostrarAviso('Você precisa entrar na sua conta.','erro','Faça login para jogar.');return;}
    if(!aposta){mostrarAviso('Escolha uma opção de aposta.','erro','Selecione vermelho, preto, zero ou número.');return;}
    const valorCampo=document.getElementById('valor-aposta');
    const valor=Number(valorCampo.value);
    const numero=Number(document.getElementById('numero-escolhido').value);
    if(!valorCampo.value||!Number.isFinite(valor)||valor<=0){mostrarAviso('Informe um valor válido.','erro','O valor precisa ser maior que zero.');return;}
    if(aposta==='numero'&&(!Number.isInteger(numero)||numero<0||numero>36)){mostrarAviso('Escolha um número de 0 a 36.','erro','Confira o número selecionado.');return;}
    girando=true;botao.disabled=true;botao.classList.add('em-giro');botao.querySelector('span').textContent='A BOLA ESTÁ GIRANDO...';
    resultadoCor.textContent='Aguardando a bola parar…';
    try{
      const resposta=await fetch('https://brasvegas.onrender.com/api/roleta/apostar',{
        method:'POST',headers:{'Content-Type':'application/json','Authorization':token},
        body:JSON.stringify({tipoAposta:aposta,valor,numeroEscolhido:String(numero)})
      });
      const dados=await resposta.json().catch(()=>({}));
      if(!resposta.ok||dados.erro||dados.sucesso===false)throw new Error(dados.erro||dados.mensagem||'Não foi possível concluir a aposta.');
      if(!Number.isInteger(Number(dados.numero))||Number(dados.numero)<0||Number(dados.numero)>36)throw new Error('O servidor retornou um resultado inválido.');
      window.__resultadoRoleta={...dados,numero:Number(dados.numero)};
      await animarAteResultado();
      const n=Number(dados.numero),cor=corNumero(n);
      resultadoNumero.textContent=String(n);
      resultadoNumero.className='numero-resultado '+(cor==='vermelho'?'numero-vermelho':cor==='preto'?'numero-preto':'numero-verde');
      resultadoCor.textContent=cor.toUpperCase()+(dados.ganhou?' • VOCÊ GANHOU':' • NÃO FOI DESTA VEZ');
      historicoNumeros.unshift(n);historicoNumeros=historicoNumeros.slice(0,10);
      historico.innerHTML='';
      historicoNumeros.forEach(num=>{const item=document.createElement('span');item.textContent=num;item.className='historico-'+corNumero(num);historico.appendChild(item);});
      const saldo=document.getElementById('mostrar-saldo');if(saldo)saldo.textContent=Number(dados.saldo||0).toLocaleString('pt-BR',{minimumFractionDigits:2,maximumFractionDigits:2});
      const usuario=JSON.parse(localStorage.getItem('brasvegas-user')||'null');if(usuario){usuario.saldo=Number(dados.saldo||0);localStorage.setItem('brasvegas-user',JSON.stringify(usuario));}
      const res=document.getElementById('resultado');if(res){res.style.display='block';res.textContent=dados.ganhou?'Você ganhou R$ '+Number(dados.valorGanho).toFixed(2):'A rodada terminou. Número '+n+' — '+cor+'.';}
      mostrarAviso(dados.ganhou?'Parabéns! Você ganhou R$ '+Number(dados.valorGanho).toFixed(2)+'.':'Resultado: '+n+' — '+cor+'. Consulte o saldo atualizado. ',dados.ganhou?'sucesso':'info');
    }catch(erro){
      mostrarAviso(erro.message||'Falha ao girar a roleta.','erro','Confira sua conexão e o saldo antes de tentar novamente.');
    }finally{
      girando=false;botao.disabled=false;botao.classList.remove('em-giro');botao.querySelector('span').textContent='GIRAR A ROLETA';
    }
  };
})();