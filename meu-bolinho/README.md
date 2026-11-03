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

## Status: Milestone 4 (segunda receita, Confeiteiro, galeria e testes) — completo

- Duas receitas: **Bolo Fofinho** e **Bolo de Chocolate**, cada uma nos modos Fácil e Confeiteiro.
- **Galeria** (botão ▦ no menu): todo bolo pronto é guardado com foto; toque para ampliar;
  segure a lixeira 2 s para apagar. Estrelas no cartão da receita mostram em que modo ela já
  foi feita.
- **Testes**: `npm test` (131 unitários) e `npm run e2e` (aceite no navegador). O mapa
  critério → evidência está em [`docs/ACEITE.md`](docs/ACEITE.md).

### Adicionar uma receita

1. Crie `src/data/recipes/<id>.json` (formato e campos em `docs/ARQUITETURA.md` §6).
2. Ingrediente novo? Adicione-o em `src/data/ingredients.json` (com símbolo de forma única) e as
   falas `despejar.<id>` e `rejeicao.<id>` em `src/data/falas.json`; rode `npm run roteiro`.
3. `npm test` valida a receita e a joga do início ao fim nos dois modos.

## Status: Milestone 3 (arte, animações, sons, narração e dicas)

- **Arte**: cenários da cozinha, do forno, do confeitar e do menu; sombras; mascote animado
  (respira, pisca, pula, se assusta, torce); recipientes com rótulo; vapor no forno; poeira de
  farinha; brilho nos enfeites. Tudo gerado por código (ver ARQUITETURA §13).
- **Sons**: efeitos e música sintetizados; sons contínuos proporcionais ao gesto.
- **Narração**: 62 falas em `src/data/falas.json`; grave os arquivos listados em
  `docs/ROTEIRO_NARRACAO.md` e coloque em `src/assets/voz/` — sem gravação, usa a voz pt-BR do
  sistema (se houver) ou só o balão.
- **Dicas**: 6 s parado → o item certo brilha no cartão e na mesa; 12 s → mão-fantasma mostra o
  gesto; 20 s → o mascote explica. Qualquer toque apaga.
- **Área dos pais**: no menu, segure o cadeado 2 s.

### Como testar o Milestone 3

1. `npm run dev`, toque em qualquer lugar (o navegador só libera o som após um toque).
2. Entre numa receita e **não toque em nada**: aos 6 s a ficha e o pote brilham, aos 12 s a mão
   mostra o gesto, aos 20 s o mascote explica. Toque na tela: tudo some.
3. Despeje, mexa e unte devagar e depressa: o volume do som acompanha o seu gesto e para quando
   você para.
4. No menu, segure o cadeado 2 s: mude volumes, desligue a narração, recarregue a página — fica salvo.
5. Tecla **D** mostra também o nível de dica e o tempo parado.

## Milestone 2 (fluxo completo de uma receita)

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
