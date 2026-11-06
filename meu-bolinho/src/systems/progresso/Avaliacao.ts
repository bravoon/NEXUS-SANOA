/**
 * Estrelas de uma receita (puro). Sem punição: terminar SEMPRE dá 1 estrela e libera a
 * próxima fase; as outras duas são bônus por capricho.
 *   ⭐ terminou o bolo
 *   ⭐ medidas certinhas: nenhum "colocou demais" precisou ser corrigido
 *   ⭐ bolo caprichado: cobertura quase completa (≥ 95%) e pelo menos 3 enfeites
 * Casca de ovo não tira estrela (é sorte, não descuido).
 */
export interface DadosAvaliacao {
  excessos: number;
  coberturaFinal: number;
  enfeites: number;
}

export interface Avaliacao {
  estrelas: 1 | 2 | 3;
  medidasCertinhas: boolean;
  boloCaprichado: boolean;
}

export const COBERTURA_CAPRICHO = 0.95;
export const ENFEITES_CAPRICHO = 3;

export function avaliar(d: DadosAvaliacao): Avaliacao {
  const medidasCertinhas = d.excessos === 0;
  const boloCaprichado = d.coberturaFinal >= COBERTURA_CAPRICHO && d.enfeites >= ENFEITES_CAPRICHO;
  return { estrelas: (1 + Number(medidasCertinhas) + Number(boloCaprichado)) as 1 | 2 | 3, medidasCertinhas, boloCaprichado };
}
