// Extração de dados do CONTEÚDO dos documentos: nome da pessoa e dados da nota fiscal.
// Tudo é "melhor esforço": o resultado aparece na tela e o usuário pode corrigir.

import { normalizar, escapeRegex, semExtensao, nomeDoCaminho } from "./util.js";

/* ------------------------------------------------------------------ nome da pessoa */

const CONECTORES = new Set(["da", "de", "do", "das", "dos", "e"]);

// Palavras de rótulos de documentos: quando aparecem, o nome acabou.
const ROTULOS = new Set([
  "cpf", "cnpj", "doc", "documento", "identidade", "orgao", "org", "emissor", "data", "nascimento",
  "filiacao", "validade", "registro", "habilitacao", "categoria", "nacionalidade", "naturalidade",
  "local", "emissao", "assinatura", "portador", "uf", "rg", "sexo", "pai", "mae", "situacao",
  "cadastral", "nome", "sobrenome", "expedicao", "via", "numero", "cat", "acc", "permissao", "observacoes",
]);

// Palavras de nome de arquivo que NÃO são nome de pessoa.
const GENERICAS = new Set([
  "atual", "frente", "verso", "copia", "reconhecido", "reconhecida", "novo", "nova", "antigo", "antiga",
  "final", "scan", "scanner", "documento", "doc", "assinado", "assinada",
]);
// Relações (ex.: "esposa pedro"): não dá para saber de quem é o documento.
const RELACIONAIS = new Set(["esposa", "esposo", "marido", "mulher", "filho", "filha", "pai", "mae", "conjuge", "irmao", "irma", "socio"]);

function limparToken(tok) {
  return tok.replace(/[^A-Za-zÀ-ÿ']/g, "");
}

/** Lê um nome (2 a 7 palavras) no começo do trecho. Retorna "" se não parecer um nome. */
function lerNome(trecho, exigirMaiusculas) {
  const palavras = [];
  for (const bruto of trecho.split(/\s+/).filter(Boolean)) {
    if (/\d|[:;]/.test(bruto)) break;
    const t = limparToken(bruto);
    const n = normalizar(t);
    if (!n) break;
    if (ROTULOS.has(n)) break;
    if (CONECTORES.has(n)) {
      if (!palavras.length) break;
      palavras.push(t);
      continue;
    }
    if (n.length < 2) break;
    if (exigirMaiusculas && t !== t.toUpperCase()) break;
    palavras.push(t);
    if (palavras.length >= 7 || /[,.]$/.test(bruto)) break;
  }
  while (palavras.length && CONECTORES.has(normalizar(palavras[palavras.length - 1]))) palavras.pop();
  return palavras.length >= 2 ? palavras.join(" ") : "";
}

/** Procura "Nome: FULANO DE TAL" (qualquer caixa) ou "NOME" + linha seguinte em MAIÚSCULAS (CNH/RG). */
export function extrairPessoaConteudo(texto) {
  const comDoisPontos = /\bnome(?:\s+(?:completo|e\s+sobrenome|do\s+(?:contribuinte|titular|portador)))?\s*:\s*/gi;
  for (const m of texto.matchAll(comDoisPontos)) {
    const ini = m.index + m[0].length;
    const nome = lerNome(texto.slice(ini, ini + 120), false);
    if (nome) return nome;
  }
  const semDoisPontos = /\bnome(?:\s+e\s+sobrenome|\s+completo)?\s+/gi;
  for (const m of texto.matchAll(semDoisPontos)) {
    const ini = m.index + m[0].length;
    const nome = lerNome(texto.slice(ini, ini + 120), true);
    if (nome) return nome;
  }
  return "";
}

/** "cnh - pedro exemplo.pdf" -> "pedro exemplo". Retorna "" se não houver um nome claro. */
export function pessoaDoArquivo(nomeArquivo) {
  const stem = semExtensao(nomeDoCaminho(nomeArquivo));
  const partes = stem.split(/\s+-\s+/).map((s) => s.trim()).filter(Boolean);
  for (let i = partes.length - 1; i >= 1; i--) {
    const cand = partes[i];
    if (!/^[A-Za-zÀ-ÿ' ]+$/.test(cand)) continue;
    const palavras = normalizar(cand).split(" ");
    if (palavras.length > 5) continue;
    if (palavras.some((p) => RELACIONAIS.has(p))) return "";
    const uteis = palavras.filter((p) => !GENERICAS.has(p));
    if (uteis.length === palavras.length) return cand;
  }
  return "";
}

/**
 * Nome da pessoa dona do documento, já padronizado (minúsculas, sem acento).
 * modo "conteudo": tenta o texto e depois o nome do arquivo. modo "arquivo": só o nome do arquivo.
 */
export function extrairPessoa(texto, nomeArquivo, modo) {
  let nome = "";
  if (modo === "conteudo") nome = extrairPessoaConteudo(texto || "");
  if (!nome) nome = pessoaDoArquivo(nomeArquivo);
  return normalizar(nome);
}

/* ------------------------------------------------------------------ nota fiscal */

const NUM = "\\d{1,3}(?:\\.\\d{3})*,\\d{2}";

function paraNumero(s) {
  return parseFloat(s.replace(/\./g, "").replace(",", "."));
}

function acharCultura(norm, culturas) {
  let melhor = "";
  let melhorN = 0;
  let melhorPos = Infinity;
  for (const [nome, termos] of Object.entries(culturas || {})) {
    let n = 0;
    let primeiro = Infinity;
    for (const t of termos) {
      const re = new RegExp("(?<![a-z0-9])" + escapeRegex(normalizar(t)) + "(?![a-z0-9])", "g");
      for (const m of norm.matchAll(re)) {
        n += 1;
        primeiro = Math.min(primeiro, m.index);
      }
    }
    if (n > melhorN || (n === melhorN && n > 0 && primeiro < melhorPos)) {
      melhor = nome;
      melhorN = n;
      melhorPos = primeiro;
    }
  }
  return melhor;
}

/**
 * Lê cultura, valor total e data de emissão de uma nota fiscal.
 * Retorna { cultura, valor, ano, mes, detalhe, aviso }.
 * detalhe = "soja - r$ 100.000,00 - 2026" (vazio se faltar valor ou ano).
 */
export function extrairNota(texto, nomeArquivo, culturas) {
  const norm = normalizar(texto || "");
  const stem = normalizar(semExtensao(nomeDoCaminho(nomeArquivo)));
  const avisos = [];

  // valor: rótulo "valor total da nota" > valor no nome do arquivo > maior valor do documento
  let valor = "";
  for (const rotulo of ["valor total da nota", "total da nota", "valor total"]) {
    const m = norm.match(new RegExp(rotulo + "\\D{0,40}?(" + NUM + ")"));
    if (m) { valor = m[1]; break; }
  }
  if (!valor) {
    const m = stem.match(new RegExp("r\\$\\s*(" + NUM + ")"));
    if (m) valor = m[1];
  }
  if (!valor) {
    let max = -1;
    for (const m of norm.matchAll(new RegExp(NUM, "g"))) {
      const n = paraNumero(m[0]);
      if (n > max) { max = n; valor = m[0]; }
    }
    if (valor) avisos.push("valor estimado (maior valor do documento)");
  }

  // data de emissão
  let ano = "";
  let mes = "";
  const emi = norm.match(/data d[ae] emissao\D{0,30}?(\d{2})\/(\d{2})\/(\d{4})/) || norm.match(/emissao\D{0,30}?(\d{2})\/(\d{2})\/(\d{4})/);
  if (emi) {
    mes = emi[2]; ano = emi[3];
  } else {
    const iso = norm.match(/(20\d{2})-(\d{2})-\d{2}t/);
    if (iso) { ano = iso[1]; mes = iso[2]; }
  }
  if (!ano) {
    const d = norm.match(/(\d{2})\/(\d{2})\/(20\d{2})/);
    if (d) { mes = d[2]; ano = d[3]; avisos.push("data de emissão estimada"); }
  }
  if (!ano) {
    const f = stem.match(/(\d{2})-(20\d{2})/);
    if (f) { mes = f[1]; ano = f[2]; }
    else {
      const y = stem.match(/(20\d{2})/);
      if (y) ano = y[1];
    }
  }
  if (!/^(0[1-9]|1[0-2])$/.test(mes)) mes = "";

  const cultura = acharCultura(norm, culturas) || acharCultura(stem, culturas);
  if (!cultura) avisos.push("cultura não identificada");
  if (!valor) avisos.push("valor não lido");
  if (!ano) avisos.push("ano não lido");

  const detalhe = valor && ano ? `${cultura || "nf"} - r$ ${valor} - ${ano}` : "";
  return { cultura, valor, ano, mes, detalhe, aviso: avisos.join("; ") };
}
