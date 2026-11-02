/**
 * FSM da receita como reducer puro: proximo = transicao(estado, evento).
 *
 * Garantias (cobertas por testes):
 * - "concluida" só é alcançada por GESTO_FIM (a criança soltou o dedo) com a meta atingida,
 *   a partir de "em_gesto" ou "correcao". Nunca por tempo, nunca a partir de "aguardando".
 * - "correcao" só sai para "concluida" quando o erro foi corrigido (meta atingida no GESTO_FIM).
 * - Não existe estado de derrota.
 * - Transição inválida devolve o MESMO objeto de estado (fácil de detectar e ignorar).
 */

export type SubEstado =
  | 'carregar'
  | 'introducao'
  | 'aguardando'
  | 'em_gesto'
  | 'correcao'
  | 'concluida'
  | 'final';

export type TipoErro = 'excesso' | 'casca' | 'quente';

export interface EstadoReceita {
  readonly sub: SubEstado;
  readonly indice: number;
  readonly total: number;
  readonly erro: TipoErro | null;
}

export type EventoReceita =
  | { type: 'CARREGADA' }
  | { type: 'INICIAR' }
  | { type: 'GESTO_INICIO' }
  | { type: 'GESTO_FIM'; metaAtingida: boolean }
  | { type: 'ERRO'; erro: TipoErro }
  | { type: 'PROXIMA' };

export function estadoInicial(total: number): EstadoReceita {
  if (!(total > 0)) throw new Error('Receita precisa de ao menos uma etapa');
  return { sub: 'carregar', indice: 0, total, erro: null };
}

export function transicao(s: EstadoReceita, ev: EventoReceita): EstadoReceita {
  switch (s.sub) {
    case 'carregar':
      return ev.type === 'CARREGADA' ? { ...s, sub: 'introducao' } : s;

    case 'introducao':
      return ev.type === 'INICIAR' ? { ...s, sub: 'aguardando', indice: 0 } : s;

    case 'aguardando':
      if (ev.type === 'GESTO_INICIO') return { ...s, sub: 'em_gesto' };
      if (ev.type === 'ERRO') return { ...s, sub: 'correcao', erro: ev.erro };
      return s;

    case 'em_gesto':
      if (ev.type === 'GESTO_FIM') return { ...s, sub: ev.metaAtingida ? 'concluida' : 'aguardando' };
      if (ev.type === 'ERRO') return { ...s, sub: 'correcao', erro: ev.erro };
      return s;

    case 'correcao':
      // Gestos (ex.: retirar o excesso com a colher) acontecem DENTRO da correção.
      if (ev.type === 'GESTO_FIM' && ev.metaAtingida) return { ...s, sub: 'concluida', erro: null };
      if (ev.type === 'ERRO' && ev.erro !== s.erro) return { ...s, erro: ev.erro };
      return s;

    case 'concluida':
      if (ev.type !== 'PROXIMA') return s;
      return s.indice + 1 >= s.total
        ? { ...s, sub: 'final' }
        : { ...s, sub: 'aguardando', indice: s.indice + 1, erro: null };

    case 'final':
      return s;
  }
}

/** True se o evento produz mudança de estado. */
export function transicaoValida(s: EstadoReceita, ev: EventoReceita): boolean {
  return transicao(s, ev) !== s;
}
