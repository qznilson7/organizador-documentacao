// Verifica se o conjunto de documentos atende às exigências do banco escolhido.

function alternativas(item) {
  return Array.isArray(item) ? item.map(String) : [String(item)];
}

function avaliar(item, presentes, tipos, confiancaOk, avisos) {
  const alts = alternativas(item);
  for (const a of alts) {
    if (!tipos[a]) avisos.push(`Tipo '${a}' (config/bancos.js) não existe em config/tipos.js`);
  }
  const descricao = alts.map((a) => (tipos[a] ? tipos[a].descricao : a)).join(" OU ");
  const achados = alts.flatMap((a) => presentes[a] || []);
  return {
    descricao,
    atendido: achados.length > 0,
    encontrados: achados.map((d) => d.destinoNome || d.origem),
    baixaConfianca: achados.length > 0 && achados.every((d) => d.confianca < confiancaOk),
  };
}

/**
 * planejados: documentos já com tipo/destino. banco: item de config/bancos.js.
 * Retorna { banco, status, obrigatorios, opcionais, pendencias, avisos }.
 * status: "APTO" | "APTO COM RESSALVAS" | "NÃO APTO"
 */
export function validar(planejados, banco, tipos, confiancaOk = 0.5) {
  planejados = planejados.filter((d) => !d.ignorar); // "docs finais" não entra na validação
  const presentes = {};
  for (const d of planejados) {
    if (d.tipo) (presentes[d.tipo] = presentes[d.tipo] || []).push(d);
  }

  const avisos = [];
  const obrigatorios = (banco.obrigatorios || []).map((i) => avaliar(i, presentes, tipos, confiancaOk, avisos));
  const opcionais = (banco.opcionais || []).map((i) => avaliar(i, presentes, tipos, confiancaOk, avisos));

  const pendencias = obrigatorios.filter((i) => !i.atendido).map((i) => `Falta: ${i.descricao}`);

  // Duplicados idênticos (removidos do ZIP) continuam valendo para o checklist, mas não geram aviso de "não identificado".
  const naoIdent = planejados.filter((d) => !d.tipo && !d.removido);
  if (naoIdent.length) avisos.push(`${naoIdent.length} arquivo(s) não identificado(s) na pasta de revisão`);
  for (const i of obrigatorios) {
    if (i.atendido && i.baixaConfianca) avisos.push(`Baixa confiança na identificação de: ${i.descricao}. Confira.`);
  }

  let status = "APTO";
  if (pendencias.length) status = "NÃO APTO";
  else if (avisos.length) status = "APTO COM RESSALVAS";

  return { banco: banco.nome || "", status, obrigatorios, opcionais, pendencias, avisos };
}
