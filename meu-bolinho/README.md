# Meu Bolinho

Simulador de confeitaria infantil (4 a 8 anos) para navegador, desktop e celular, em paisagem.
A regra central é **ZERO AUTO-COMPLETE**: todo progresso é proporcional ao input da criança.
Se o dedo para, o progresso para.

- Arquitetura e diagramas da FSM: [`docs/ARQUITETURA.md`](docs/ARQUITETURA.md)
- Stack: Phaser 3.90 · TypeScript (strict) · Vite 6 · Vitest 3

## Rodar

```bash
cd meu-bolinho
npm install
npm run dev        # http://localhost:5173 (use --host para abrir no celular na mesma rede)
npm test           # testes unitários (Node, sem navegador)
npm run build      # typecheck + build de produção em dist/
```

## Status: Milestone 1 (protótipo com formas geométricas)

Implementado: arrastar, despejar (vazão por ângulo, medidor com faixa-alvo, excesso corrigido com
colher), mexer (acumulador angular, massa em 4 estágios), cartão da receita, mascote com falas,
rejeição de ingrediente fora de ordem, modo debug (tecla **D**) e aviso para girar o celular.

### Como testar à mão

1. `npm run dev`, escolha **Fácil** ou **Confeiteiro** (o Confeiteiro tem tolerância ±8%, 10 voltas e chocolate).
2. **Despejar**: arraste o recipiente que balança (o mesmo símbolo destacado no cartão) até acima
   da tigela. Ele para na horizontal; mova o dedo para a **direita** para inclinar. Abaixo de 25°
   nada sai. Acompanhe o medidor no recipiente: a faixa verde é o alvo.
   - Solte no meio: o nível congela (critério de aceite).
   - Incline com o bico fora da tigela (modo debug: ponto vermelho): nada cai.
   - Passe da faixa: o mascote avisa; leve a colher até a tigela e depois até o pratinho, repetindo até voltar à faixa, e solte.
   - Arraste um ingrediente fora de ordem até a tigela e solte: ele volta e o mascote indica o certo.
3. **Mexer**: gire o dedo dentro da tigela. Linha reta, vai e vem ou dedo parado não contam.
   A barra verde-clara mostra a meia volta "quase contando"; a barra verde, as voltas contadas.
4. Tecla **D**: colisores (zona de despejo em magenta, boca da tigela em ciano, anel do mexer em
   vermelho/verde), FSM, ângulo, vazão, quantidade despejada, voltas, ω e estágio da massa.
   Em dev, 3 toques rápidos no canto superior esquerdo também alternam o debug no celular.

Adicione `?debug` à URL do build para expor `window.__jogo` (inspeção e testes de ponta a ponta).
