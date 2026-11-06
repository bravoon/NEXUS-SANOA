/** Decisão do botão "voltar" do sistema (puro, sem Phaser: testável em Node). */
const CENAS_DE_JOGO = ['Cozinha', 'Forno', 'Confeitar'];

/** O que o botão "voltar" do sistema faz na cena ativa (puro, testável). */
export function acaoVoltar(cenasAtivas: readonly string[]): { tipo: 'pausar'; cena: string } | { tipo: 'continuar' } | { tipo: 'menu' } | { tipo: 'sair' } {
  if (cenasAtivas.includes('Pausa')) return { tipo: 'continuar' };
  const jogo = cenasAtivas.find((c) => CENAS_DE_JOGO.includes(c));
  if (jogo) return { tipo: 'pausar', cena: jogo };
  if (cenasAtivas.includes('Menu')) return { tipo: 'sair' };
  return { tipo: 'menu' };
}
