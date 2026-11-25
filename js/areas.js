// Cálculo de hectares: área TOTAL em ITR/CCIR e área CONSOLIDADA no CAR.
// Só funções "puras" (recebem texto e devolvem dados), para poderem ser testadas sem arquivos.

import { normalizar, semAcentos, semExtensao, nomeDoCaminho } from "./util.js";
import { classificarConteudo } from "./classificador.js";

export const MODOS = {
  total: { aceitos: ["ITR", "CCIR"], rotulo: "Área total (ITR ou CCIR)", recusa: "Não é ITR nem CCIR: não somado" },
  consolidada: { aceitos: ["CAR"], rotulo: "Área consolidada (CAR)", recusa: "Não é CAR: não somado" },
};

const NUM = "\\d[\\d.]*(?:,\\d{1,4})?";                  // 9,3  |  1.234,5600  |  20
const NUM4 = "\\d[\\d.]*[,.]\\d{4}(?!\\d)";              // CCIR e CAR usam 4 casas decimais
const MARGEM = 0.00005;

/** "1.234,5600" -> 1234.56. Aceita também "23.1520" (OCR que troca a vírgula por ponto). */
export function numeroBr(s) {
  if (s === null || s === undefined) return null;
  let t = String(s).replace(/\s/g, "");
  if (!/^\d[\d.,]*$/.test(t)) return null;
  if (t.includes(",")) t = t.replace(/\./g, "").replace(",", ".");
  else if (!/^\d+\.\d{4}$/.test(t)) t = t.replace(/\./g, "");
  const n = Number(t);
  return Number.isFinite(n) ? n : null;
}

export function formatarHa(n) {
  return n.toLocaleString("pt-BR", { minimumFractionDigits: 2, maximumFractionDigits: 4 });
}

function primeiro(texto, regex) {
  const m = texto.match(regex);
  return m ? m[1].trim() : "";
}

function limparNome(s) {
  return String(s).replace(/[^A-Za-z' .-]/g, " ").replace(/\s+/g, " ").replace(/^[ .-]+|[ .-]+$/g, "");
}

function codigoCib(norm) {
  const bruto = primeiro(norm, /\bcib\b[^0-9]{0,40}?(\d[\d.\-]{6,11}\d)/).replace(/\D/g, "");
  return bruto.length === 8 ? `cib:${bruto}` : "";
}

/* ------------------------------------------------------------------ ITR */

function lerITR(norm, plano) {
  const area = numeroBr(primeiro(norm, new RegExp(
    "area total\\s*(?:do imovel\\s*)?\\(?\\s*(?:em )?(?:hectares|ha)\\s*\\)?\\s*:?\\s*(" + NUM + ")")));
  const contribuinte = limparNome(primeiro(plano, /contribuinte\s*:\s*([^\n]+?)\s*(?=\n|cpf|cnpj|$)/i));
  return {
    imovel: primeiro(plano, /nome do imovel\s*:\s*([^\n]+?)\s*(?=\n|municipio|$)/i),
    codigos: [codigoCib(norm)].filter(Boolean),
    area,
    pessoas: contribuinte ? [{ nome: contribuinte, percentual: null }] : [],
  };
}

/* ------------------------------------------------------------------ CCIR */

const CONDICAO = /\b(propriet|posseir|usufrut|nu[- ]?propriet|condomin|co-?propriet|herdeir|inventariant|arrendat|comodat|parceir|concession|enfiteut|meeir)/i;
const DOCUMENTO = /\d{3}\.\d{3}\.\d{3}-\d{2}|\d{2}\.\d{3}\.\d{3}\/\d{4}-\d{2}/g;

/** Quadro "Dados dos titulares": uma pessoa por CPF/CNPJ, com o percentual de detenção. */
function titularesCCIR(plano) {
  const ini = plano.search(/dados dos titulares/i);
  if (ini < 0) return [];
  const resto = plano.slice(ini);
  const fim = resto.search(/dados de controle/i);
  const bloco = fim > 0 ? resto.slice(0, fim) : resto.slice(0, 3000);
  const achados = [...bloco.matchAll(DOCUMENTO)];
  const pessoas = [];
  achados.forEach((m, i) => {
    const inicio = m.index + m[0].length;
    const trecho = bloco.slice(inicio, i + 1 < achados.length ? achados[i + 1].index : bloco.length);
    const percentuais = [...trecho.matchAll(/\b\d{1,3},\d{2}\b/g)];
    const ultimo = percentuais.length ? percentuais[percentuais.length - 1] : null;
    let corte = trecho.search(CONDICAO);
    if (corte < 1) corte = ultimo ? ultimo.index : trecho.length;
    const nome = limparNome(trecho.slice(0, corte));
    if (nome.length >= 3) pessoas.push({ nome, percentual: ultimo ? numeroBr(ultimo[0]) : null });
  });
  return pessoas;
}

function lerCCIR(norm, plano) {
  const area = numeroBr(primeiro(norm, new RegExp(
    "area total\\s*\\(\\s*ha\\s*\\)(?:(?!area do imovel).){0,160}?(" + NUM4 + ")")));
  const codigoImovel = (plano.match(/\b\d{3}\.\d{3}\.\d{3}\.\d{3}-\d\b/) || [""])[0].replace(/\D/g, "");

  const linhas = plano.split("\n");
  const rotulo = linhas.findIndex((l) => /denominacao do imovel/i.test(l));
  const imovel = rotulo >= 0 && linhas[rotulo + 1]
    ? limparNome(linhas[rotulo + 1].replace(/\b\d{3}\.\d{3}\.\d{3}\.\d{3}-\d\b/, ""))
    : "";

  let pessoas = titularesCCIR(plano);
  if (!pessoas.length) {
    // sem o quadro de titulares: usa o declarante (sem percentual)
    const dec = primeiro(plano, /dados do declarante[\s\S]{0,80}?cpf\/cnpj\s*\n?\s*([A-Za-z' .-]{3,80}?)\s*(?=\d)/i);
    if (dec) pessoas = [{ nome: limparNome(dec), percentual: null }];
  }
  return {
    imovel,
    codigos: [codigoImovel ? `imovel:${codigoImovel}` : "", codigoCib(norm)].filter(Boolean),
    area,
    pessoas,
  };
}

/* ------------------------------------------------------------------ CAR */

function lerCAR(norm, plano) {
  const area = numeroBr(primeiro(norm, new RegExp("area consolidada[^0-9]{0,30}?(" + NUM4 + ")")));
  const totais = [...norm.matchAll(new RegExp(
    "area total(?:\\s*\\(\\s*ha\\s*\\))?(?:\\s*do imovel(?: rural)?)?[^0-9]{0,20}?(" + NUM4 + ")", "g"))]
    .map((m) => numeroBr(m[1]))
    .filter((n) => n !== null);
  const cod = norm.match(/\b([a-z]{2})\s*-\s*(\d{7})\s*-\s*((?:[0-9a-f]{4}[.\s]?){8})/);
  const pessoas = [];
  for (const m of plano.matchAll(/(?:cpf|cnpj)\s*:?\s*[\d.\-/]{11,18}[\s|[\]]*nome\s*:?\s*([A-Za-z' .-]{3,80})/gi)) {
    const nome = limparNome(m[1].replace(/\s+(cpf|cnpj)\s*$/i, ""));
    if (nome.length >= 3 && !pessoas.some((p) => p.nome === nome)) pessoas.push({ nome, percentual: null });
  }
  return {
    imovel: limparNome(primeiro(plano, /nome do imovel rural\s*:\s*([^\n|]+)/i)),
    codigos: cod ? [`car:${cod[1]}${cod[2]}${cod[3].replace(/[^0-9a-f]/g, "")}`] : [],
    area,
    pessoas,
    totais,
  };
}

const LEITORES = { ITR: lerITR, CCIR: lerCCIR, CAR: lerCAR };

/** Resultado vazio com um motivo (arquivo recusado ou ilegível). */
export function resultadoComErro(erro, tipo = "") {
  return { tipo, tipoConfirmado: false, imovel: "", codigos: [], area: null, pessoas: [], avisos: [], erro };
}

/**
 * Analisa o texto de um documento no modo "total" ou "consolidada".
 * usarFuzzy: ligar para texto vindo de OCR.
 * Retorna { tipo, tipoConfirmado, imovel, codigos, area, pessoas, avisos, erro }.
 */
export function analisarArea(texto, nomeArquivo, modo, tipos, usarFuzzy = false) {
  const regra = MODOS[modo];
  const norm = normalizar(texto || "");
  const plano = semAcentos(texto || "");
  const nome = semExtensao(nomeDoCaminho(nomeArquivo || ""));
  const cls = classificarConteudo(texto || "", nome, null, tipos, usarFuzzy);

  if (cls.tipo && !regra.aceitos.includes(cls.tipo)) return resultadoComErro(regra.recusa, cls.tipo);

  let tipo = cls.tipo;
  let lido = tipo ? LEITORES[tipo](norm, plano) : null;
  const confirmado = !!tipo;
  if (!lido) {
    // tipo não reconhecido: tenta os leitores aceitos, mas o resultado não é somado sem conferência
    for (const t of regra.aceitos) {
      const tentativa = LEITORES[t](norm, plano);
      if (tentativa.area !== null) { tipo = t; lido = tentativa; break; }
    }
  }
  if (!lido) return { ...resultadoComErro(""), avisos: ["Documento não reconhecido: confira o arquivo"] };

  const { totais, ...dados } = lido;
  const avisos = [];
  if (!confirmado) avisos.push("Tipo do documento não confirmado: confira antes de somar");
  if (dados.area === null) avisos.push("Área não lida: digite o valor");
  if (tipo === "CAR" && totais && totais.length) {
    if (Math.max(...totais) - Math.min(...totais) > MARGEM) avisos.push("Área total diferente entre as páginas: confira");
    if (dados.area !== null && dados.area > Math.max(...totais) + MARGEM) avisos.push("Área consolidada maior que a total: confira");
  }
  if (tipo === "CCIR" && dados.pessoas.length && dados.pessoas.every((p) => p.percentual !== null)) {
    const soma = dados.pessoas.reduce((s, p) => s + p.percentual, 0);
    if (Math.abs(soma - 100) > 0.5) avisos.push(`Percentuais de detenção somam ${formatarHa(soma)}%, não 100%`);
  }
  return { tipo, tipoConfirmado: confirmado, ...dados, avisos, erro: "" };
}

/** Junta duas leituras OCR do mesmo arquivo, escolhe a melhor e avisa se as áreas divergirem. */
export function combinarLeituras(a, b) {
  const nota = (r) => (r.tipoConfirmado ? 4 : 0) + (r.area !== null ? 2 : 0) + (r.erro ? 1 : 0)
    - r.avisos.length * 0.5 + r.pessoas.length * 0.1;
  const [melhor, outro] = nota(a) >= nota(b) ? [a, b] : [b, a];
  const r = { ...melhor, avisos: [...melhor.avisos] };
  if (melhor.area !== null && outro.area !== null && Math.abs(melhor.area - outro.area) > MARGEM) {
    r.avisos.push(`Duas leituras diferentes (${formatarHa(melhor.area)} e ${formatarHa(outro.area)}): confira`);
  }
  if (!r.erro) {
    if (!r.pessoas.length && outro.pessoas.length) r.pessoas = outro.pessoas;
    if (!r.codigos.length) r.codigos = outro.codigos;
    if (!r.imovel) r.imovel = outro.imovel;
  }
  return r;
}

/**
 * Decide o que entra na soma e calcula os totais.
 * lista: [{ arquivo, hash, resultado, areaManual?, somarManual? }]
 *   areaManual: número digitado (ou null se o campo foi apagado); somarManual: caixa marcada/desmarcada.
 * Retorna { itens, total, porPessoa: [{nome, hectares}], avisos }.
 */
export function consolidar(lista) {
  const porHash = new Map();
  const porCodigo = new Map();
  const itens = lista.map((it) => {
    const r = it.resultado;
    const area = it.areaManual !== undefined ? it.areaManual : r.area;
    let repetidoDe = "";
    let motivo = "";
    if (it.hash && porHash.has(it.hash)) {
      repetidoDe = porHash.get(it.hash);
      motivo = `Arquivo repetido de ${repetidoDe}: não somado`;
    } else {
      const c = r.codigos.find((k) => porCodigo.has(k));
      if (c) {
        repetidoDe = porCodigo.get(c);
        motivo = `Mesmo imóvel de ${repetidoDe}: não somado`;
      }
    }
    if (!repetidoDe) {
      if (it.hash) porHash.set(it.hash, it.arquivo);
      if (area !== null && !r.erro) for (const k of r.codigos) porCodigo.set(k, it.arquivo);
    }

    let somar = area !== null && !r.erro && !repetidoDe && (r.tipoConfirmado || it.areaManual !== undefined);
    if (it.somarManual !== undefined) somar = it.somarManual && area !== null;

    const situacao = [r.erro, motivo, ...r.avisos].filter(Boolean)
      .filter((s) => !(it.areaManual !== undefined && s.startsWith("Área não lida")));
    return { ...it, area, somar, repetidoDe, situacao };
  });

  const somados = itens.filter((i) => i.somar);
  const total = somados.reduce((s, i) => s + i.area, 0);

  const pessoas = new Map();
  for (const i of somados) {
    for (const p of i.resultado.pessoas) {
      if (p.percentual === null || p.percentual === undefined) continue;
      const chave = normalizar(p.nome);
      const atual = pessoas.get(chave) || { nome: p.nome, hectares: 0 };
      atual.hectares += (i.area * p.percentual) / 100;
      pessoas.set(chave, atual);
    }
  }

  const avisos = [];
  const tiposSomados = new Set(somados.map((i) => i.resultado.tipo));
  if (tiposSomados.has("ITR") && tiposSomados.has("CCIR")) {
    avisos.push("Há ITR e CCIR somados juntos: confira se nenhum imóvel entrou duas vezes");
  }
  return { itens, total, porPessoa: [...pessoas.values()].sort((a, b) => b.hectares - a.hectares), avisos };
}
