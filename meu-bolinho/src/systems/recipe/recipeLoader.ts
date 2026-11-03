/**
 * Valida o JSON de uma receita e a resolve para uma dificuldade.
 *
 * Mesclagem: etapaFinal = { ...difficulty[nivel], ...etapa }.
 * Etapas com "apenas": "<nivel>" só existem nesse nível.
 * Adicionar uma receita nova = adicionar um JSON; nenhum código muda.
 */
import { CONFIG_DESPEJAR_MASSA, CONFIG_FORNO } from '../../config/gameplay';
import {
  DESENHOS_GLACE,
  DIFICULDADES,
  TIPOS_ETAPA,
  type DesenhoGlace,
  type Dificuldade,
  type EtapaJson,
  type EtapaResolvida,
  type IngredienteDef,
  type ParametrosDificuldade,
  type ReceitaJson,
  type ReceitaResolvida,
  type TipoEtapa,
} from './recipeTypes';

/** Ingrediente implícito da etapa de ovos (conta para o limite de ingredientes). */
export const ITEM_OVO = 'ovo';

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
const ehCor = (v: unknown): boolean => typeof v === 'string' && /^#[0-9a-fA-F]{6}$/.test(v);

/** Valida a estrutura bruta (vinda de JSON) e devolve uma ReceitaJson tipada. */
export function validarReceita(bruto: unknown): ReceitaJson {
  if (!ehObjeto(bruto)) throw new ErroReceita('?', 'não é um objeto');
  const id = bruto['id'];
  if (typeof id !== 'string' || id.length === 0) throw new ErroReceita('?', '"id" ausente');
  if (typeof bruto['nome'] !== 'string') throw new ErroReceita(id, '"nome" ausente');
  if (!ehCor(bruto['corMassa'])) throw new ErroReceita(id, '"corMassa" deve ser #RRGGBB');
  const etapas = bruto['etapas'];
  if (!Array.isArray(etapas) || etapas.length === 0) throw new ErroReceita(id, '"etapas" vazio');

  etapas.forEach((e: unknown, i) => {
    if (!ehObjeto(e)) throw new ErroReceita(id, `etapa ${i} não é objeto`);
    const tipo = e['tipo'] as TipoEtapa;
    if (!TIPOS_ETAPA.includes(tipo)) {
      throw new ErroReceita(id, `etapa ${i}: tipo desconhecido "${String(e['tipo'])}"`);
    }
    if (e['apenas'] !== undefined && !DIFICULDADES.includes(e['apenas'] as Dificuldade)) {
      throw new ErroReceita(id, `etapa ${i}: "apenas" inválido`);
    }
    for (const campo of ['quantidade', 'tolerancia', 'voltas', 'cobertura', 'tempoSegundos', 'restanteMax', 'batidas'] as const) {
      const v = e[campo];
      if (v !== undefined && (typeof v !== 'number' || !(v > 0))) {
        throw new ErroReceita(id, `etapa ${i}: "${campo}" deve ser número > 0`);
      }
    }
    for (const campo of ['cobertura', 'restanteMax', 'tolerancia'] as const) {
      const v = e[campo];
      if (typeof v === 'number' && v > 1) throw new ErroReceita(id, `etapa ${i}: "${campo}" deve ser ≤ 1`);
    }
    for (const campo of ['corCobertura', 'corRecheio', 'corGlace'] as const) {
      if (e[campo] !== undefined && !ehCor(e[campo])) throw new ErroReceita(id, `etapa ${i}: "${campo}" deve ser #RRGGBB`);
    }
    if (e['glace'] !== undefined && !DESENHOS_GLACE.includes(e['glace'] as DesenhoGlace)) {
      throw new ErroReceita(id, `etapa ${i}: "glace" deve ser um de ${DESENHOS_GLACE.join(', ')}`);
    }
    switch (tipo) {
      case 'despejar':
        if (typeof e['item'] !== 'string') throw new ErroReceita(id, `etapa ${i}: "item" ausente`);
        if (typeof e['quantidade'] !== 'number') throw new ErroReceita(id, `etapa ${i}: "quantidade" ausente`);
        break;
      case 'quebrar_ovo':
        if (!Number.isInteger(e['quantidade'])) throw new ErroReceita(id, `etapa ${i}: "quantidade" de ovos deve ser inteira`);
        break;
      case 'forno': {
        const t = e['tempoSegundos'];
        if (typeof t === 'number' && (t < CONFIG_FORNO.tempoMinSeg || t > CONFIG_FORNO.tempoMaxSeg)) {
          throw new ErroReceita(id, `etapa ${i}: "tempoSegundos" deve estar entre ${CONFIG_FORNO.tempoMinSeg} e ${CONFIG_FORNO.tempoMaxSeg}`);
        }
        break;
      }
      default:
        break;
    }
  });

  return bruto as unknown as ReceitaJson;
}

/**
 * Regras de coerência da sequência (num dos modos): cada etapa precisa do que as anteriores
 * produziram. Uma receita incoerente fica indisponível com mensagem clara, em vez de travar o jogo.
 */
function validarOrdem(id: string, etapas: EtapaResolvida[]): void {
  const vistos = new Set<string>();
  const exigir = (i: number, tipo: string, algum: string[], motivo: string) => {
    if (!algum.some((t) => vistos.has(t))) throw new ErroReceita(id, `etapa ${i} (${tipo}): ${motivo}`);
  };
  etapas.forEach((e, i) => {
    switch (e.tipo) {
      case 'mexer':
      case 'despejar_massa':
        exigir(i, e.tipo, ['despejar', 'quebrar_ovo'], 'a tigela ainda está vazia');
        break;
      case 'forno':
        exigir(i, e.tipo, ['despejar_massa'], 'não há massa na forma');
        break;
      case 'desenformar':
        exigir(i, e.tipo, ['forno'], 'o bolo ainda não foi assado');
        break;
      case 'decorar':
      case 'rechear':
        exigir(i, e.tipo, ['desenformar'], 'o bolo ainda está na forma');
        break;
      case 'bater':
        exigir(i, e.tipo, ['despejar', 'quebrar_ovo'], 'a tigela ainda está vazia');
        break;
      default:
        break;
    }
    vistos.add(e.tipo);
  });
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
      case 'quebrar_ovo':
        return { tipo: 'quebrar_ovo', quantidade: e.quantidade ?? 1, cascaDeOvo: padrao.cascaDeOvo };
      case 'mexer':
        return { tipo: 'mexer', voltas: e.voltas ?? padrao.voltas };
      case 'untar':
        return { tipo: 'untar', cobertura: e.cobertura ?? padrao.cobertura };
      case 'despejar_massa':
        return { tipo: 'despejar_massa', restanteMax: e.restanteMax ?? CONFIG_DESPEJAR_MASSA.restanteMax };
      case 'forno':
        return { tipo: 'forno', tempoSegundos: e.tempoSegundos ?? CONFIG_FORNO.tempoPadraoSeg };
      case 'desenformar':
        return { tipo: 'desenformar' };
      case 'bater':
        return { tipo: 'bater', batidas: e.batidas ?? padrao.batidas };
      case 'rechear':
        return { tipo: 'rechear', cobertura: e.cobertura ?? padrao.cobertura, corRecheio: e.corRecheio ?? '#E57373' };
      case 'decorar':
        return {
          tipo: 'decorar',
          cobertura: e.cobertura ?? padrao.cobertura,
          corCobertura: e.corCobertura ?? '#5A3220',
          glace: e.glace
            ? { desenho: e.glace as DesenhoGlace, cor: e.corGlace ?? '#FFFFFF', tracado: padrao.tracado, tolerancia: padrao.toleranciaGlace }
            : null,
        };
    }
  });

  validarOrdem(receita.id, etapas);

  const recipientes = [...new Set(etapas.flatMap((e) => (e.tipo === 'despejar' ? [e.item] : [])))];
  const unicos = [...new Set(etapas.flatMap((e) => (e.tipo === 'despejar' ? [e.item] : e.tipo === 'quebrar_ovo' ? [ITEM_OVO] : [])))];
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
    recipientes,
  };
}
