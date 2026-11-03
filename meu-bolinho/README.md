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

## Status: Milestone 2 (fluxo completo de uma receita, formas geométricas)

Receita `Bolo Fofinho` (`src/data/recipes/fofinho.json`), do ingrediente ao bolo decorado:

| Cena | Etapas |
|---|---|
| Cozinha | despejar farinha, açúcar e leite (+ fermento no Confeiteiro) · quebrar 2 ovos · mexer · untar a forma · despejar a massa |
| Forno | colocar a forma · fechar a porta · girar o timer · bolo cresce (20 s) · abrir · luva · retirar · desenformar |
| Confeitar | cobertura · confeitos, morangos, velas, granulado (sacudir) · desfazer · Pronto! |
| Resultado | foto do bolo decorado |

Também: menu, seleção de receita e dificuldade, pausa protegida (segurar ⏸ 2 s), mascote com falas,
modo debug (tecla **D**) em todas as cenas.

### Como testar à mão

1. `npm run dev` → **Jogar** → escolha **Fácil** (1 estrela) ou **Confeiteiro** (2 estrelas) → toque no bolo.
2. **Despejar**: arraste o recipiente que balança até acima da tigela; ele trava na horizontal e o
   dedo para a **direita** inclina (abaixo de 25° nada sai). O medidor tem a faixa-alvo verde.
   Passou da faixa → colher até a tigela e depois ao pratinho. Ingrediente fora de ordem é rejeitado.
3. **Ovos**: arraste um ovo da caixa até a beirada da tigela e solte; toque nele duas vezes
   (1º trinca, 2º abre). No Confeiteiro pode cair casca: retire com a colher.
4. **Mexer**: gire o dedo dentro da tigela (linha reta, vai e vem e dedo parado não contam).
5. **Untar**: passe o dedo por toda a forma; o metal sem manteiga fica cinza. A barra mostra a meta.
6. **Despejar a massa**: arraste a tigela (à esquerda) até acima da forma e mova o dedo para a
   direita para inclinar, até a tigela ficar quase vazia.
7. **Forno**: leve a forma para dentro, toque na porta para fechar, gire o botão uma volta. Espere o
   apito, toque na porta para abrir, leve a luva até a forma e arraste a forma até a bancada.
   Tente pegar a forma sem luva: "Cuidado, está quente!".
8. **Desenformar**: leve o prato até a forma e puxe para baixo, rápido (devagar não vale).
9. **Decorar**: cubra o bolo com o dedo; depois arraste enfeites da bandeja e sacuda o pote de
   granulado sobre o bolo. ↶ desfaz. **Pronto!** mostra o resultado.
10. Tecla **D** em qualquer cena: colisores, FSM, vazão, voltas, grade de cobertura (verde/vermelho),
    fase do forno, velocidade do swipe, enfeites. Em dev, 3 toques rápidos no canto superior
    esquerdo também alternam o debug no celular.

Adicione `?debug` à URL do build para expor `window.__jogo` (inspeção e testes de ponta a ponta).
