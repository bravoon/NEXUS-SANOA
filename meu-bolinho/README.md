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

## Status: Mundo 3, a Padaria da Praça (24 fases; não é só bolo)

A trilha tem agora um terceiro mundo, que abre ao terminar a fase 16. As receitas dizem o que
produzem (`"produto"` no JSON: `bolo`, `torta`, `biscoito`, `brownie`, `cupcake`) e isso muda a
forma, o forno e o prato. Cada produto tem a própria assadeira e o próprio desenho, e a
cobertura, o polvilho e os enfeites só valem em cima dele.

| Fase | Receita | Novidade |
|---|---|---|
| 17 | Torta de Morango | **abrir a massa**: levar a bola de massa até a forma e passar o rolo |
| 18 | Biscoitos Amanteigados | **cortar biscoitos**: soltar o cortador em cima da massa, um por um |
| 19 | Brownie | **fatiar**: passar a faca de ponta a ponta, pelo meio |
| 20 | Cupcakes de Chocolate | assadeira de 6 forminhas |
| 21 | Torta de Limão | glacê em onda, fatiar |
| 22 | Biscoitos de Canela | cortar e polvilhar canela |
| 23 | Torta de Maçã | ralar maçã, polvilhar canela, fatiar |
| 24 | Torta Gigante da Padaria | quase tudo junto |

Zero auto-complete também aqui: a massa só abre com passadas do rolo em cima da forma (parado
ou tremendo não abre); cada biscoito fica exatamente onde a criança soltou o cortador (fora da
massa ou encostado em outro não corta), e os biscoitos que vão para o forno e para o prato são
esses mesmos; a faca só fatia se atravessar o doce pelo meio numa direção nova, e a foto da
galeria é tirada depois de fatiado.
Testes: `npm test` (263 unitários) e `npm run e2e:padaria`.

## Perfis de jogador e Mundo 2 (16 fases, 6 mecânicas de fase)

**Quem vai jogar?** Cada criança tem o próprio perfil (um bichinho + nome opcional, digitado
num teclado de letras grandes). Trilha, estrelas, galeria e progresso ficam separados por
perfil. É só neste aparelho: sem senha, sem e-mail, sem internet, sem coleta de dados. O menu
mostra quem está jogando (tocar troca de jogador). Os pais apagam perfis na área dos pais
(👤 Perfis → segurar a lixeira 2 s). Quem já jogava antes dos perfis não perde nada: o primeiro
perfil criado herda as estrelas e a galeria.

A trilha agora tem **2 mundos de 8 fases**. O Mundo 2 abre ao terminar a fase 8 (setas ◀ ▶ na
trilha).

| Fase | Receita (Mundo 2: Confeitaria da Vovó) | Novidade |
|---|---|---|
| 9 | Bolo de Fubá | **peneirar**: levar a peneira até a tigela e sacudir de lado a lado |
| 10 | Bolo de Mel | mel, glacê em onda |
| 11 | Bolo de Coco | **ralar**: esfregar o coco para cima e para baixo no ralador |
| 12 | Bolo Mármore | recheio de chocolate, glacê em círculo |
| 13 | Bolo de Limão | **polvilhar**: sacudir o polvilhador de açúcar em cima do bolo |
| 14 | Bolo de Maçã com Canela | ralar maçã, polvilhar canela |
| 15 | Bolo Floresta Negra | bater, peneirar, ralar chocolate, rechear, glacê, granulado |
| 16 | Bolo Gigante da Festa | todas as mecânicas juntas |

Também sem auto-complete: a peneira só solta farinha quando é sacudida em cima da tigela
(parada, longe ou arrastada reto = nada cai) e nunca passa da medida; o ralador só conta
passadas verticais na face dele; o polvilho só cai quando a criança sacode em cima do bolo, e
o "Pronto!" só aparece depois que o bolo foi polvilhado o bastante.
Testes: `npm test` (224 unitários) e `npm run e2e:mundo2` (perfis + mundo 2 no navegador).

## Trilha de fases (8 receitas, estrelas e 3 mecânicas novas)

Tocar **Jogar** abre a **Trilha do Confeiteiro**: 8 fases em sequência. Só a primeira começa
aberta; terminar uma fase (em qualquer modo) libera a próxima. Cada fase dá até 3 estrelas,
sem punição:

| ⭐ | Como ganha |
|---|---|
| 1ª | Terminar o bolo (já libera a próxima fase) |
| 2ª | Medidas certinhas: nenhum ingrediente passou da medida |
| 3ª | Bolo caprichado: cobertura ≥ 95% e pelo menos 3 enfeites |

| Fase | Receita | Novidade |
|---|---|---|
| 1 | Bolo Fofinho | o básico: despejar, mexer, forno, cobrir |
| 2 | Bolo de Chocolate | quebrar ovo, manteiga |
| 3 | Bolo de Laranja | suco de laranja |
| 4 | Pão de Ló Nuvem | **bater claras**: vai e vem rápido com o batedor (parar = espuma para) |
| 5 | Bolo de Morango | **rechear camadas**: espalhar o recheio e encaixar a camada de cima com o dedo |
| 6 | Bolo de Aniversário | **escrever com glacê**: seguir o desenho (estrela) com o saco de confeitar |
| 7 | Bolo de Cenoura | glacê em onda, cenoura |
| 8 | Bolo Arco-íris | as três mecânicas juntas (glacê de coração) |

As mecânicas novas seguem o ZERO AUTO-COMPLETE: o batedor só conta inversões rápidas e amplas
(linha reta ou dedo parado = 0); a camada fica onde a criança solta (perto o bastante assenta,
longe volta ao descanso — nunca é "puxada" para o centro); o glacê só pinta pontos do desenho
que o dedo realmente visitou (rabisco fora não conta). Na **área dos pais** há "Liberar todas
as fases da trilha". Testes: `npm test` (179 unitários) e `npm run e2e:fases` (navegador).

## Milestone 4 (segunda receita, Confeiteiro, galeria e testes) — completo

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

Também: menu, trilha de fases e escolha de dificuldade, pausa protegida (segurar ⏸ 2 s), mascote com falas,
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
