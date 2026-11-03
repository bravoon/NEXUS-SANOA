# Plataformas

Um único código (TypeScript + Phaser, em `src/`) roda em todas as plataformas. Só
`src/plataforma/Plataforma.ts` sabe onde o jogo está e trata as diferenças.

| Plataforma | Como | Gerado por |
|---|---|---|
| **Navegador** (desktop, celular, tablet) | build web estático (`dist/`) em qualquer hospedagem HTTPS | `npm run build` |
| **PWA instalável** (Android, iOS, Windows, macOS, ChromeOS) | o mesmo build + manifesto + service worker; joga **offline** | `npm run build` |
| **Android** (APK/AAB) | Capacitor 7 (WebView nativo), paisagem, tela cheia imersiva, botão voltar | CI `android` / Android Studio |
| **iOS / iPadOS** | Capacitor 7 (WKWebView, Swift Package Manager), paisagem, sem barra de status | CI `ios` (simulador) / Xcode |
| **Windows** (instalador + portátil) | Electron 37 | CI `desktop` / `npm run desktop:pacote` |
| **macOS** (dmg) | Electron 37 | CI `desktop` |
| **Linux** (AppImage) | Electron 37 | CI `desktop` / `npm run desktop:pacote` |

O CI (`.github/workflows/meu-bolinho.yml`) roda os testes e gera todos os pacotes a cada push; baixe-os
em *Actions → (execução) → Artifacts*.

## Comportamento por plataforma

- **Botão voltar (Android) / Esc (desktop)**: na partida, pausa; na pausa, continua; nas telas de menu,
  volta ao início; no início, sai do app. Nunca sai no meio de uma receita.
- **Tela cheia e paisagem**: apps nativos já abrem assim; no navegador do celular, o primeiro toque pede
  tela cheia e trava em paisagem (onde o navegador permite; no Safari do iPhone, use "Adicionar à Tela
  de Início" para jogar em tela cheia). F11 no desktop.
- **Segundo plano**: o som para quando o app sai de foco e volta quando retorna; o jogo pausa sozinho.
- **Dados** (galeria, preferências, progresso): `localStorage` de cada plataforma, só no aparelho.

## Fluidez

- Arte vetorial assada em texturas (`src/utils/CacheGrafico.ts`): estática desenhada uma vez; o que muda
  é redesenhado só quando muda. CPU de renderização por quadro: ~1 ms (antes ~11–13 ms).
- Qualidade adaptativa (`src/utils/Qualidade.ts`): se o aparelho ficar abaixo de 40 fps por 3 s, o
  jogo reduz partículas e efeitos (nunca a jogabilidade). `?qualidade=leve` força o modo leve.
- Download: ~390 KB comprimidos; o PWA guarda tudo em cache após a primeira visita.

## Comandos

```bash
npm run dev               # navegador, com recarga automática
npm run build             # dist/ (web + PWA)
npm run desktop           # abre o app de desktop (Electron) com o build atual
npm run desktop:pacote    # gera o instalador do sistema atual em release/
npm run android:sync      # copia o build para android/ (abra em Android Studio: npx cap open android)
npm run ios:sync          # copia o build para ios/ (em um Mac: npx cap open ios)
npm run icones            # regenera os ícones a partir da arte do jogo (requer Playwright)
```

## Publicar nas lojas (o que falta e precisa ser seu)

- **Google Play**: troque `appId` em `capacitor.config.ts` (e o pacote Java) pelo seu, crie uma chave de
  assinatura e gere um AAB (`./gradlew bundleRelease`). Jogos infantis precisam declarar o público na
  *Família* do Play Console.
- **App Store**: conta Apple Developer, assinatura em Xcode; a categoria Kids exige não ter anúncios nem
  links externos (o jogo já atende).
- **Windows/macOS**: sem certificado de assinatura os sistemas mostram aviso ao instalar; para distribuir,
  configure os certificados no electron-builder (variáveis `CSC_LINK`/`CSC_KEY_PASSWORD`).
