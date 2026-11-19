// Duplicados: remove só os IDÊNTICOS (mesmo conteúdo, byte a byte) e avisa dos PARECIDOS.

import { normalizar } from "./util.js";

function prioridade(a, b) {
  return (b.tipo ? 1 : 0) - (a.tipo ? 1 : 0) || b.confianca - a.confianca || a.origem.localeCompare(b.origem);
}

/**
 * Marca d.removido = true nas cópias idênticas (mesmo d.hash) que não vão para o ZIP final.
 * - Arquivos de pasta ignorada (docs finais) nunca são tocados: se existir uma cópia lá, as de fora são removidas.
 * - Caso contrário, mantém a melhor cópia (com tipo identificado, maior confiança, ordem do caminho).
 * Modifica os objetos recebidos (passe cópias). Preenche também d.duplicadoDe.
 */
export function marcarDuplicados(docs) {
  const grupos = new Map();
  for (const d of docs) {
    d.removido = false;
    d.duplicadoDe = "";
    if (!d.hash || !d.dados || d.dados.byteLength === 0) continue;
    if (!grupos.has(d.hash)) grupos.set(d.hash, []);
    grupos.get(d.hash).push(d);
  }
  for (const grupo of grupos.values()) {
    if (grupo.length < 2) continue;
    const finais = grupo.filter((d) => d.ignorar);
    const outros = grupo.filter((d) => !d.ignorar);
    if (!outros.length) continue;
    const manter = finais.length ? finais[0] : [...outros].sort(prioridade)[0];
    for (const d of outros) {
      if (d !== manter) {
        d.removido = true;
        d.duplicadoDe = manter.origem;
      }
    }
  }
}

function palavrasDe(texto) {
  return new Set(normalizar(texto || "").split(/[^a-z0-9]+/).filter((p) => p.length >= 3));
}

function jaccard(a, b) {
  let comum = 0;
  for (const p of a) if (b.has(p)) comum += 1;
  const uniao = a.size + b.size - comum;
  return uniao ? comum / uniao : 0;
}

/**
 * Pares de documentos do MESMO tipo (e mesma pessoa/detalhe) com textos muito parecidos, mas não idênticos.
 * Retorna [{ a, b, similaridade }] (origens). Só avisa; nada é removido.
 */
export function acharParecidos(docs, minimo = 0.85) {
  const candidatos = docs.filter((d) => !d.ignorar && !d.removido && d.tipo);
  const porTipo = new Map();
  for (const d of candidatos) {
    if (!porTipo.has(d.tipo)) porTipo.set(d.tipo, []);
    porTipo.get(d.tipo).push(d);
  }
  const pares = [];
  for (const grupo of porTipo.values()) {
    const palavras = grupo.map((d) => palavrasDe(d.texto));
    for (let i = 0; i < grupo.length; i++) {
      for (let j = i + 1; j < grupo.length; j++) {
        if (palavras[i].size < 30 || palavras[j].size < 30) continue; // texto curto demais para comparar
        const a = grupo[i];
        const b = grupo[j];
        if (a.hash && a.hash === b.hash) continue;
        if (a.detalhe && b.detalhe && a.detalhe !== b.detalhe) continue; // pessoas/notas diferentes
        const s = jaccard(palavras[i], palavras[j]);
        if (s >= minimo) pares.push({ a: a.origem, b: b.origem, similaridade: s });
      }
    }
  }
  return pares.sort((x, y) => y.similaridade - x.similaridade);
}
