/**
 * Valida o JSON de uma receita e a resolve para uma dificuldade.
 *
 * Mesclagem: etapaFinal = { ...difficulty[nivel], ...etapa }.
 * Etapas com "apenas": "<nivel>" só existem nesse nível.
 * Adicionar uma receita nova = adicionar um JSON; nenhum código muda.
 */
import {
  DIFICULDADES,
  TIPOS_ETAPA,
  type Dificuldade,
  type EtapaJson,
  type EtapaResolvida,
  type IngredienteDef,
  type ParametrosDificuldade,
  type ReceitaJson,
  type ReceitaResolvida,
  type TipoEtapa,
} from './recipeTypes';

export class ErroReceita extends Error {
  constructor(
    public readonly receitaId: string,
    mensagem: string,
  ) {
    super(`[receita ${receitaId}] ${mensagem}`);
    this.name = 'ErroReceita';
  }
}

const ehObjeto = (v: unknown): v is Record<string, unknown> =>
  typeof v === 'object' && v !== null && !Array.isArray(v);

/** Valida a estrutura bruta (vinda de JSON) e devolve uma ReceitaJson tipada. */
export function validarReceita(bruto: unknown): ReceitaJson {
  if (!ehObjeto(bruto)) throw new ErroReceita('?', 'não é um objeto');
  const id = bruto['id'];
  if (typeof id !== 'string' || id.length === 0) throw new ErroReceita('?', '"id" ausente');
  if (typeof bruto['nome'] !== 'string') throw new ErroReceita(id, '"nome" ausente');
  if (typeof bruto['corMassa'] !== 'string' || !/^#[0-9a-fA-F]{6}$/.test(bruto['corMassa'])) {
    throw new ErroReceita(id, '"corMassa" deve ser #RRGGBB');
  }
  const etapas = bruto['etapas'];
  if (!Array.isArray(etapas) || etapas.length === 0) throw new ErroReceita(id, '"etapas" vazio');

  etapas.forEach((e: unknown, i) => {
    if (!ehObjeto(e)) throw new ErroReceita(id, `etapa ${i} não é objeto`);
    if (!TIPOS_ETAPA.includes(e['tipo'] as TipoEtapa)) {
      throw new ErroReceita(id, `etapa ${i}: tipo desconhecido "${String(e['tipo'])}"`);
    }
    if (e['apenas'] !== undefined && !DIFICULDADES.includes(e['apenas'] as Dificuldade)) {
      throw new ErroReceita(id, `etapa ${i}: "apenas" inválido`);
    }
    for (const campo of ['quantidade', 'tolerancia', 'voltas'] as const) {
      const v = e[campo];
      if (v !== undefined && (typeof v !== 'number' || !(v > 0))) {
        throw new ErroReceita(id, `etapa ${i}: "${campo}" deve ser número > 0`);
      }
    }
    if (e['tipo'] === 'despejar') {
      if (typeof e['item'] !== 'string') throw new ErroReceita(id, `etapa ${i}: "item" ausente`);
      if (typeof e['quantidade'] !== 'number') throw new ErroReceita(id, `etapa ${i}: "quantidade" ausente`);
    }
  });

  return bruto as unknown as ReceitaJson;
}

/** Resolve a receita para uma dificuldade, aplicando padrões e filtros. */
export function resolverReceita(
  receita: ReceitaJson,
  dificuldade: Dificuldade,
  tabela: Record<Dificuldade, ParametrosDificuldade>,
  ingredientes: Record<string, IngredienteDef>,
): ReceitaResolvida {
  const padrao = tabela[dificuldade];
  const etapasJson = receita.etapas.filter((e) => e.apenas === undefined || e.apenas === dificuldade);

  const etapas: EtapaResolvida[] = etapasJson.map((e: EtapaJson, i): EtapaResolvida => {
    switch (e.tipo as TipoEtapa) {
      case 'despejar': {
        const item = e.item as string;
        const def = ingredientes[item];
        if (!def) throw new ErroReceita(receita.id, `etapa ${i}: ingrediente "${item}" não existe`);
        return {
          tipo: 'despejar',
          item,
          alvo: e.alvo ?? 'tigela',
          quantidade: e.quantidade as number,
          tolerancia: e.tolerancia ?? padrao.tolerancia,
          material: def.material,
        };
      }
      case 'mexer':
        return { tipo: 'mexer', voltas: e.voltas ?? padrao.voltas };
    }
  });

  const lista = etapas.flatMap((e) => (e.tipo === 'despejar' ? [e.item] : []));
  const unicos = [...new Set(lista)];
  if (unicos.length > padrao.maxIngredientes) {
    throw new ErroReceita(
      receita.id,
      `${unicos.length} ingredientes excedem o máximo de ${padrao.maxIngredientes} em "${dificuldade}"`,
    );
  }

  return {
    id: receita.id,
    nome: receita.nome,
    corMassa: receita.corMassa,
    dificuldade,
    etapas,
    ingredientes: unicos,
  };
}
