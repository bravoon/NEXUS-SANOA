# Roteiro de narração (pt-BR)

Gerado por `npm run roteiro` a partir de `src/data/falas.json` — não edite à mão.

**Como gravar:** uma frase por arquivo, voz alegre e calma de personagem (o mascote Bolinho), ritmo
pausado para crianças de 4 a 8 anos. Exporte em **MP3 mono, 64 kbps, 44,1 kHz**, sem silêncio
longo no início/fim, normalizado em −16 LUFS. Salve em `src/assets/voz/<arquivo>`: o jogo carrega
automaticamente cada arquivo que existir; as falas sem arquivo usam a voz pt-BR do sistema
(ou só o balão de texto).

Total: 85 falas.

| id | arquivo | texto |
|---|---|---|
| `boas_vindas` | `boas_vindas.mp3` | Oi! Eu sou o Bolinho. Vamos fazer um bolo juntos? |
| `escolher_receita` | `escolher_receita.mp3` | Escolha o seu bolo! |
| `despejar.farinha` | `despejar.farinha.mp3` | Agora a farinha! Leve até a tigela e incline. |
| `despejar.acucar` | `despejar.acucar.mp3` | Agora o açúcar! Leve até a tigela e incline. |
| `despejar.leite` | `despejar.leite.mp3` | Agora o leite! Leve até a tigela e incline. |
| `despejar.chocolate_po` | `despejar.chocolate_po.mp3` | Agora o chocolate! Leve até a tigela e incline. |
| `despejar.fermento` | `despejar.fermento.mp3` | Agora o fermento! Só um pouquinho. |
| `despejar.manteiga` | `despejar.manteiga.mp3` | Agora a manteiga derretida! Só um pouquinho. |
| `despejar.suco_laranja` | `despejar.suco_laranja.mp3` | Agora o suco de laranja! Leve até a tigela e incline. |
| `despejar.cenoura` | `despejar.cenoura.mp3` | Agora a cenoura raladinha! Leve até a tigela e incline. |
| `despejar.dica` | `despejar.dica.mp3` | Pegue o pote que está balançando, leve até em cima da tigela e mova o dedo para o lado, devagar, para virar. |
| `rejeicao.farinha` | `rejeicao.farinha.mp3` | Ainda não! Agora é a vez da farinha. |
| `rejeicao.acucar` | `rejeicao.acucar.mp3` | Ainda não! Agora é a vez do açúcar. |
| `rejeicao.leite` | `rejeicao.leite.mp3` | Ainda não! Agora é a vez do leite. |
| `rejeicao.chocolate_po` | `rejeicao.chocolate_po.mp3` | Ainda não! Agora é a vez do chocolate. |
| `rejeicao.fermento` | `rejeicao.fermento.mp3` | Ainda não! Agora é a vez do fermento. |
| `rejeicao.manteiga` | `rejeicao.manteiga.mp3` | Ainda não! Agora é a vez da manteiga. |
| `rejeicao.suco_laranja` | `rejeicao.suco_laranja.mp3` | Ainda não! Agora é a vez do suco de laranja. |
| `rejeicao.cenoura` | `rejeicao.cenoura.mp3` | Ainda não! Agora é a vez da cenoura. |
| `rejeicao.generica` | `rejeicao.generica.mp3` | Esse agora não! |
| `excesso` | `excesso.mp3` | Opa, colocou demais! Tire um pouco com a colher. |
| `excesso.ok` | `excesso.ok.mp3` | Isso! Agora está certinho. Pode soltar a colher. |
| `excesso.dica` | `excesso.dica.mp3` | Pegue a colher, coloque dentro da tigela e depois leve até o pratinho. |
| `ovo.inicio` | `ovo.inicio.mp3` | Leve o ovo até a beirada da tigela e dê dois toquinhos nele! |
| `ovo.na_borda` | `ovo.na_borda.mp3` | Agora dê dois toquinhos no ovo! |
| `ovo.outro` | `ovo.outro.mp3` | Isso! Agora o outro ovo. |
| `ovo.dica` | `ovo.dica.mp3` | Arraste o ovo até a beirada da tigela. Depois toque nele duas vezes: toc, toc! |
| `casca` | `casca.mp3` | Caiu casquinha! Pegue com a colher. |
| `casca.ok` | `casca.ok.mp3` | Sem casquinha! Pode soltar a colher. |
| `mexer.inicio` | `mexer.inicio.mp3` | Hora de mexer! Gire o dedo dentro da tigela. |
| `mexer.dica` | `mexer.dica.mp3` | Encoste o dedo na massa e faça rodinhas, sem parar, como se estivesse desenhando um círculo. |
| `bater.inicio` | `bater.inicio.mp3` | Vamos bater as claras! Pegue o batedor e balance rápido, de um lado para o outro. |
| `bater.dica` | `bater.dica.mp3` | Encoste o batedor na tigela e faça vai e vem bem rápido, como se estivesse abanando. |
| `bater.ok` | `bater.ok.mp3` | Olha que nuvem fofinha! |
| `untar.inicio` | `untar.inicio.mp3` | Passe manteiga na forma toda, com o dedo! |
| `untar.dica` | `untar.dica.mp3` | Esfregue o dedo na forma, de um lado para o outro, até ela ficar toda amarelinha. |
| `massa.inicio` | `massa.inicio.mp3` | Leve a tigela até a forma e incline. Despeje tudo! |
| `massa.dica` | `massa.dica.mp3` | Pegue a tigela, leve para cima da forma e mova o dedo para o lado para virar. |
| `forno.colocar` | `forno.colocar.mp3` | Coloque a forma dentro do forno! |
| `forno.fechar` | `forno.fechar.mp3` | Agora feche a porta do forno. |
| `forno.timer` | `forno.timer.mp3` | Agora gire o botão uma volta inteira! |
| `forno.ligado` | `forno.ligado.mp3` | Forno ligado! Veja o bolo crescer. |
| `forno.apitou` | `forno.apitou.mp3` | O bolo ficou pronto! Abra a porta e use a luva. |
| `forno.abriu_sem_luva` | `forno.abriu_sem_luva.mp3` | Use a luva para pegar a forma! |
| `forno.abriu_com_luva` | `forno.abriu_com_luva.mp3` | Pegue a forma e leve até a bancada. |
| `forno.luva_abrir` | `forno.luva_abrir.mp3` | Luva no lugar! Agora abra a porta. |
| `forno.luva_pegar` | `forno.luva_pegar.mp3` | Luva no lugar! Pegue a forma. |
| `forno.primeiro_abrir` | `forno.primeiro_abrir.mp3` | Primeiro abra a porta! |
| `forno.quente` | `forno.quente.mp3` | Cuidado, está quente! Use a luva. |
| `forno.dica_colocar` | `forno.dica_colocar.mp3` | Arraste a forma até dentro do forno. |
| `forno.dica_fechar` | `forno.dica_fechar.mp3` | Toque na porta do forno para fechar. |
| `forno.dica_timer` | `forno.dica_timer.mp3` | Encoste no botão redondo e gire o dedo em volta dele, uma volta inteira. |
| `forno.dica_abrir` | `forno.dica_abrir.mp3` | Toque na porta para abrir o forno. |
| `forno.dica_luva` | `forno.dica_luva.mp3` | Arraste a luva azul até a forma. |
| `forno.dica_retirar` | `forno.dica_retirar.mp3` | Arraste a forma para fora do forno, até a bancada. |
| `desenformar.prato` | `desenformar.prato.mp3` | Coloque o prato em cima da forma. |
| `desenformar.puxar` | `desenformar.puxar.mp3` | Agora puxe para baixo, rapidinho! |
| `desenformar.lento` | `desenformar.lento.mp3` | Mais rápido! Puxe para baixo. |
| `desenformar.curto` | `desenformar.curto.mp3` | Puxe bem para baixo! |
| `desenformar.ok` | `desenformar.ok.mp3` | Uau, saiu inteirinho! |
| `desenformar.dica_prato` | `desenformar.dica_prato.mp3` | Arraste o prato até em cima da forma. |
| `desenformar.dica_puxar` | `desenformar.dica_puxar.mp3` | Encoste no prato e puxe o dedo para baixo, bem rápido, como um escorregador. |
| `decorar.cobertura` | `decorar.cobertura.mp3` | Passe a cobertura no bolo todo! |
| `decorar.liberado` | `decorar.liberado.mp3` | Que lindo! Agora enfeite do seu jeito. Quando acabar, toque em Pronto! |
| `decorar.cheio` | `decorar.cheio.mp3` | O bolo já está cheio de enfeites! |
| `decorar.dica_cobertura` | `decorar.dica_cobertura.mp3` | Esfregue o dedo em cima do bolo até ele ficar todo coberto. |
| `decorar.dica_enfeites` | `decorar.dica_enfeites.mp3` | Arraste os enfeites até o bolo. Para o granulado, segure o pote e sacuda! |
| `rechear.inicio` | `rechear.inicio.mp3` | Vamos rechear! Espalhe o recheio em toda a camada de baixo. |
| `rechear.camada` | `rechear.camada.mp3` | Agora coloque a camada de cima, bem no meio. |
| `rechear.longe` | `rechear.longe.mp3` | Quase! Solte a camada bem em cima do bolo. |
| `rechear.ok` | `rechear.ok.mp3` | Que bolo recheado! |
| `rechear.dica_recheio` | `rechear.dica_recheio.mp3` | Esfregue o dedo em cima da camada até o recheio cobrir tudo. |
| `rechear.dica_camada` | `rechear.dica_camada.mp3` | Arraste a camada de cima e solte em cima do recheio. |
| `glace.inicio` | `glace.inicio.mp3` | Agora escreva com glacê! Siga os pontinhos com o dedo. |
| `glace.dica` | `glace.dica.mp3` | Encoste o dedo nos pontinhos e vá seguindo o desenho, devagar. |
| `glace.ok` | `glace.ok.mp3` | Que desenho lindo! |
| `elogio.1` | `elogio.1.mp3` | Muito bem! |
| `elogio.2` | `elogio.2.mp3` | Isso aí! |
| `elogio.3` | `elogio.3.mp3` | Que capricho! |
| `resultado` | `resultado.mp3` | Seu bolo ficou lindo! Parabéns, confeiteiro! |
| `estrela.medidas` | `estrela.medidas.mp3` | Medidas certinhas! Ganhou mais uma estrela. |
| `estrela.capricho` | `estrela.capricho.mp3` | Bolo caprichado! Ganhou mais uma estrela. |
| `fase.liberada` | `fase.liberada.mp3` | Oba! Uma fase nova foi liberada! |
| `trilha.escolher` | `trilha.escolher.mp3` | Escolha uma fase no caminho! |
| `trilha.trancada` | `trilha.trancada.mp3` | Essa fase ainda está trancada. Termine a anterior para abrir! |
