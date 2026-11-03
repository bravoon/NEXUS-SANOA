# Critérios de aceite — evidências

Como verificar tudo: `npm test` (unitários, Node) e `npm run e2e` (navegador; ver cabeçalho de
`tests/e2e/aceite.cjs`). Situação no fim do Milestone 4: **todos os itens abaixo passam**.

| Critério da especificação | Evidência automatizada | Onde |
|---|---|---|
| Nenhuma etapa avança sem input contínuo (soltar no meio para o progresso) | Cada controlador tem teste "ZERO AUTO-COMPLETE"; receita completa testa "soltar no meio" em **toda etapa de toda receita**, nos dois modos; no navegador, soltar o pote no meio mantém o nível 3 s depois | `tests/steps*.test.ts`, `tests/receitaCompleta.test.ts`, e2e "Critério 1" |
| Regra arquitetural: etapas não usam tweens nem timers | Teste varre `src/systems/steps` e falha se encontrar tweens/setTimeout/delayedCall | `tests/steps.test.ts` |
| Mexer em linha reta ou tocar parado não conta voltas | Acumulador: linha reta, linha pelo centro, tremor, vai e vem, saltos, muito lento = 0; navegador: linha reta + dedo parado = 0 | `tests/angularAccumulator.test.ts`, e2e "Critério 2" |
| Despejar fora da tigela não altera o nível | `bicoSobreBoca` e `quantidadeDespejada` com bico fora = 0; navegador: inclinar o pote longe da tigela | `tests/pourFlow.test.ts`, e2e "Critério 3" |
| Forma não pode ser retirada do forno sem luva | `OvenStep.pegarForma` → `quente`; navegador mostra "Cuidado, está quente!" e a forma fica | `tests/stepsM2.test.ts`, e2e "Critério 4" |
| Receita nova funciona adicionando apenas um JSON | Todas as receitas da pasta são jogadas do início ao fim nos 2 modos; uma receita inventada dentro do teste também; o Bolo de Chocolate entrou só com dados | `tests/receitaCompleta.test.ts`, `tests/recipeLoader.test.ts`, `src/data/recipes/chocolate.json` |
| Receita JSON incoerente não trava o jogo | Validação de ordem (massa só depois de ingredientes, forno só com massa na forma etc.): a receita fica indisponível com mensagem clara | `tests/recipeLoader.test.ts` |
| Forno: 15–25 s de verdade | O cozimento e as dicas usam o relógio do sistema; medido no navegador a 6 fps: 25,0 s para uma receita de 25 s | `scenes/FornoScene.ts`, `scenes/CenaEtapas.ts` |
| Testes: acumulador angular, vazão por ângulo, cobertura, transições da FSM | 15 + 12 + 7 + 10 testes dedicados | `tests/angularAccumulator`, `pourFlow`, `coverage`, `recipeFsm` |
| Modo debug (tecla D): colisores, voltas, vazão, % de cobertura | Navegador: D liga o overlay com FSM e voltas; em cada cena mostra também zonas, bico, vazão, grade de cobertura, fase do forno, nível de dica | e2e "Critério 6" |
| Dificuldade por arquivo de configuração | `difficulty.json` (ingredientes 4/7, voltas 5/10, tolerância ±20%/±8%, casca não/sim, cobertura 80%/90%); limites testados | `src/data/difficulty.json`, `tests/recipeLoader.test.ts` |
| Dicas progressivas sem punição; mão-fantasma nunca executa a ação | HintTimer 6/12/20 s; navegador: nada é despejado durante a demonstração; tocar apaga | `tests/audioDicas.test.ts`, e2e "Dicas progressivas" |
| Narração em fila, sem sobreposição | FilaNarracao: nunca 2 simultâneas, sem eco, prioridade | `tests/audioDicas.test.ts` |
| Galeria e progresso em localStorage, sem quebrar | Limite de 30 bolos, cota cheia, dado corrompido, storage bloqueado; navegador: bolo salvo e sobrevive ao recarregar | `tests/galeria.test.ts`, e2e "Galeria e progresso" |
| Alvos de toque ≥ 64 px, acessível a daltonismo | Layout testado para 1–8 potes; cada ingrediente tem forma única (não depende de cor) | `tests/layout.test.ts`, `tests/recipeLoader.test.ts` |
| Sem backend, sem coleta de dados, sem anúncios, sem compras | Nenhuma chamada de rede no código (só arquivos do próprio build); dados só no localStorage | revisão de código, `src/systems/save` |

## Desempenho

| Meta | Situação |
|---|---|
| Build inicial < 8 MB | **~1,6 MB** em disco (≈ 390 KB gzip: Phaser 340 KB + jogo 46 KB). Sons sintetizados, arte gerada no Boot. |
| Carregamento < 4 s em 4G | ≈ 390 KB gzip ≈ < 1 s de download em 4G típico; sem vozes gravadas ainda (cada MP3 de 64 kbps ≈ 25–40 KB). |
| Pool de partículas ≤ 300 | Emissores com `maxAliveParticles` (despejo 300, poeira 60, vapor 20). |
| 60 fps em Android intermediário | **Não medido** em aparelho real (o ambiente de teste não tem GPU: ~20–40 fps em software). Medidas tomadas: Graphics só redesenham quando o estado muda; cenários são texturas; pincel reaproveitado. Recomendo medir num aparelho real antes do lançamento. |
