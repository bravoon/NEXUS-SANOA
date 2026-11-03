// Gera docs/ROTEIRO_NARRACAO.md a partir de src/data/falas.json (roteiro para gravar as vozes).
import { readFileSync, writeFileSync } from 'node:fs';
const falas = JSON.parse(readFileSync(new URL('../src/data/falas.json', import.meta.url), 'utf8'));
const linhas = Object.entries(falas).map(([id, texto]) => `| \`${id}\` | \`${id}.mp3\` | ${texto} |`);
const md = `# Roteiro de narração (pt-BR)

Gerado por \`npm run roteiro\` a partir de \`src/data/falas.json\` — não edite à mão.

**Como gravar:** uma frase por arquivo, voz alegre e calma de personagem (o mascote Bolinho), ritmo
pausado para crianças de 4 a 8 anos. Exporte em **MP3 mono, 64 kbps, 44,1 kHz**, sem silêncio
longo no início/fim, normalizado em −16 LUFS. Salve em \`src/assets/voz/<arquivo>\`: o jogo carrega
automaticamente cada arquivo que existir; as falas sem arquivo usam a voz pt-BR do sistema
(ou só o balão de texto).

Total: ${linhas.length} falas.

| id | arquivo | texto |
|---|---|---|
${linhas.join('\n')}
`;
writeFileSync(new URL('../docs/ROTEIRO_NARRACAO.md', import.meta.url), md);
console.log(`docs/ROTEIRO_NARRACAO.md: ${linhas.length} falas`);
