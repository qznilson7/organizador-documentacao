// Classificação de documentos por palavras-chave (regras em config/tipos.js).

import { normalizar, escapeRegex } from "./util.js";

const PESOS = { forte: 3, medio: 2, fraco: 1 };
const PENALIDADE_EXCLUI = 3;
const BONUS_APELIDO = 2;
const BONUS_PASTA = 0.5;
export const LIMIAR_ACEITE = 3;      // pontos mínimos para aceitar um tipo
export const MARGEM_MINIMA = 1;      // vantagem mínima sobre o 2º colocado
const PONTOS_CONFIANCA_TOTAL = 6;
const TOLERANCIA_FUZZY = 0.12;       // 12% de erros de letra (OCR) no termo
const MAX_CHARS_FUZZY = 6000;

function compilarTermo(bruto, peso) {
  if (bruto instanceof RegExp) {
    const flags = bruto.flags.includes("i") ? bruto.flags : bruto.flags + "i";
    return { texto: bruto.source, regex: new RegExp(bruto.source, flags.replace("g", "")), peso, fuzzy: false };
  }
  const norm = normalizar(bruto);
  return {
    texto: norm,
    regex: new RegExp("(?<![a-z0-9])" + escapeRegex(norm) + "(?![a-z0-9])"),
    peso,
    fuzzy: norm.length >= 10 && norm.includes(" "),
  };
}

/** Converte config/tipos.js em estruturas prontas para busca. */
export function compilarTipos(bruto) {
  const tipos = {};
  for (const [chave, d] of Object.entries(bruto || {})) {
    const termos = [];
    for (const [nivel, peso] of Object.entries(PESOS)) {
      for (const t of (d.palavras && d.palavras[nivel]) || []) termos.push(compilarTermo(t, peso));
    }
    tipos[chave] = {
      chave,
      nomeArquivo: d.nomeArquivo || chave,
      descricao: d.descricao || chave,
      pasta: d.pasta || "",
      apelidos: new Set((d.apelidos || []).map(normalizar)),
      termos,
      exclui: (d.exclui || []).map((t) => compilarTermo(t, PENALIDADE_EXCLUI)),
    };
  }
  return tipos;
}

/** Existe no texto um trecho parecido com `padrao` (tolera pequenos erros de OCR)? */
export function contemAproximado(padrao, texto, tolerancia = TOLERANCIA_FUZZY) {
  const m = padrao.length;
  const maxDist = Math.floor(m * tolerancia);
  if (maxDist < 1 || !texto) return false;
  let prev = new Uint16Array(m + 1);
  let cur = new Uint16Array(m + 1);
  for (let i = 0; i <= m; i++) prev[i] = i;
  for (let j = 0; j < texto.length; j++) {
    const c = texto.charCodeAt(j);
    cur[0] = 0; // o trecho pode começar em qualquer posição do texto
    for (let i = 1; i <= m; i++) {
      const custo = padrao.charCodeAt(i - 1) === c ? 0 : 1;
      cur[i] = Math.min(prev[i - 1] + custo, prev[i] + 1, cur[i - 1] + 1);
    }
    if (cur[m] <= maxDist) return true;
    const t = prev; prev = cur; cur = t;
  }
  return false;
}

function pontuar(textoNorm, tokensNome, pastaOrigem, tipo, usarFuzzy) {
  const trecho = textoNorm.slice(0, MAX_CHARS_FUZZY);
  let pontos = 0;
  for (const termo of tipo.termos) {
    if (termo.regex.test(textoNorm)) pontos += termo.peso;
    else if (usarFuzzy && termo.fuzzy && contemAproximado(termo.texto, trecho)) pontos += termo.peso * 0.8;
  }
  for (const termo of tipo.exclui) {
    if (termo.regex.test(textoNorm)) pontos -= termo.peso;
  }
  for (const a of tipo.apelidos) {
    if (tokensNome.has(a)) { pontos += BONUS_APELIDO; break; }
  }
  if (pastaOrigem && pastaOrigem === tipo.pasta) pontos += BONUS_PASTA;
  return pontos;
}

/**
 * Decide o tipo pelo texto (e, de apoio, pelo nome do arquivo e pasta de origem).
 * usarFuzzy: ligar só para texto vindo de OCR (texto nativo de PDF é exato).
 */
export function classificarConteudo(texto, nomeArquivo, pastaOrigem, tipos, usarFuzzy = false) {
  const textoNorm = normalizar(texto);
  const tokensNome = new Set(normalizar(nomeArquivo).split(/[^a-z0-9]+/).filter(Boolean));
  const ranking = Object.values(tipos)
    .map((t) => [t.chave, pontuar(textoNorm, tokensNome, pastaOrigem, t, usarFuzzy)])
    .sort((a, b) => b[1] - a[1]);

  if (!ranking.length || ranking[0][1] < LIMIAR_ACEITE) {
    return { tipo: null, confianca: 0, metodo: "nenhum", observacao: "Tipo não reconhecido" };
  }
  const [topo, pontos] = ranking[0];
  const [segundoChave, segundo] = ranking[1] || [null, 0];
  if (pontos - segundo < MARGEM_MINIMA) {
    return { tipo: null, confianca: 0, metodo: "nenhum", observacao: `Ambíguo entre ${topo} e ${segundoChave}` };
  }
  return { tipo: topo, confianca: Math.min(1, pontos / PONTOS_CONFIANCA_TOTAL), metodo: "conteudo", observacao: "" };
}

/** Se nada foi reconhecido, usa a pasta de origem (ex.: tudo na pasta NF é NF). */
export function aplicarFallbackPasta(cls, pastaOrigem, fallback) {
  if (cls.tipo === null && pastaOrigem && fallback && fallback[pastaOrigem]) {
    return {
      tipo: fallback[pastaOrigem],
      confianca: 0.4,
      metodo: "pasta",
      observacao: "Classificado pela pasta de origem",
    };
  }
  return cls;
}
