# BrasVegas

Plataforma de jogos multiplayer com backend Node.js/Express e PostgreSQL (Neon).

## Jogos

- Roleta: resultado compartilhado por rodada.
- Bacará: uma mão compartilhada com regra correta de terceira carta.
- Blackjack: cartas distribuídas pelo servidor; ações pedir/parar validadas no servidor.
- Pôquer de cinco cartas: baralho único por mesa, até cinco jogadores, troca de cartas no servidor.
- Craps e Dados: lançamentos gerados no servidor e apostas pass/don't pass ou seleções de soma.
- Caça-níqueis e Frutas: resultados individuais gerados no servidor.
- Parede da Sorte: percurso aleatório gerado no servidor.
- Sinuca/Bilhar: mesa multiplayer de 2 jogadores ou 4 em duplas; tacadas, colisões, faltas e vencedor calculados no servidor.

## Carteiras e rodadas

- Cada aposta separa 10% para a taxa da plataforma e 90% para o prêmio da rodada.
- Os vencedores dividem o prêmio proporcionalmente ao valor de suas apostas vencedoras.
- Rodadas sem vencedores carregam o prêmio para a próxima rodada do mesmo jogo e modo.
- O modo de treino usa fichas virtuais, sem valor monetário, com saldo inicial de 1.000 fichas e recarga gratuita quando o saldo fica abaixo de 10.
- O modo real permanece bloqueado por padrão. Não habilite dinheiro real sem integração bancária, autorização do provedor e revisão jurídica.

## Configuração

Copie `.env.example` para `.env` e configure:

- `DATABASE_URL`: conexão PostgreSQL/Neon.
- `JWT_SECRET`: segredo aleatório com pelo menos 32 caracteres.
- `ADMIN_API_TOKEN`: segredo administrativo forte.
- `APOSTAS_REAIS_HABILITADAS=false`: mantém o modo de treino.
- `DURACAO_RODADA_SEGUNDOS=30`: duração das rodadas de cassino.
- `CORS_ORIGINS`: origens autorizadas, separadas por vírgula.
- Variáveis `SICOOB_*`: somente quando a integração Pix for aprovada e configurada.

## Executar

```bash
npm ci
npm test
npm start
```

O servidor usa a pasta `public/` para as telas e `game-engine/` para as regras de jogo.

## Segurança e produção

Os resultados dos jogos de cassino são gerados no servidor com o módulo criptográfico do Node.js; o navegador não escolhe os resultados. As tacadas de sinuca também são simuladas no servidor. As operações de carteira são transacionais no PostgreSQL.

A integração Sicoob ainda depende de credenciais/certificado válidos e aprovação bancária. O Pix de saída para saques não está implementado. Apostas reais ficam desabilitadas até concluir essas etapas.
