// Análise ASSISTIDA de matrícula de imóvel, 100% no navegador.
// Separa os registros (R-1, AV-2...), interpreta vendas e áreas e SUGERE os donos atuais, apontando página e ato.
// É um apoio para conferência: não substitui a leitura da matrícula.

import { normalizar, semAcentos } from "./util.js";
import { numeroBr, formatarHa } from "./areas.js";

const MARGEM = 0.0002;

/* ------------------------------------------------------------------ texto */

/** Tira cabeçalhos repetidos, o carimbo da certidão e junta palavras quebradas no fim da linha. */
function limparPagina(texto) {
  let t = semAcentos(texto || "").replace(/\r/g, "");
  const certidao = t.search(/servico de registro de imoveis|certifico que/i);
  if (certidao >= 0) t = t.slice(0, certidao);
  t = t.split("\n")
    .filter((l) => !/cnm\s*:|digitalizado com camscanner|segue no verso|^\W*segue\W*$|^\W*continuacao\W*$/i.test(l))
    .join("\n");
  return t.replace(/([A-Za-z])-[ \t]*\n[ \t]*([a-z])/g, "$1$2");
}

/* ------------------------------------------------------------------ áreas */

const EXTENSO = /(\d{1,4})\)?\s*hectares?[\s\S]{0,40}?(\d{1,2})\)?\s*ares[\s\S]{0,60}?(\d{1,2})\)?\s*centiares/i;
const M2 = "(\\d{1,3}(?:\\.\\d{3})+(?:,\\s?\\d+)?|\\d+(?:,\\s?\\d+)?)\\s*m\\s*2(?!\\d)";
const HA = "(\\d{1,4}(?:,\\s?\\d{1,4})?)\\s*(?:ha\\b|has\\b|hectares?\\b)";

function achar(texto, prefixo) {
  const emM2 = texto.match(new RegExp(prefixo + M2, "i"));
  const emHa = texto.match(new RegExp(prefixo + HA, "i"));
  const escolha = [emM2 && { m: emM2, divisor: 10000, unidade: "m2" }, emHa && { m: emHa, divisor: 1, unidade: "ha" }]
    .filter(Boolean)
    .sort((a, b) => a.m.index - b.m.index)[0];
  if (!escolha) return null;
  const n = numeroBr(escolha.m[1]);
  return n === null ? null : { ha: n / escolha.divisor, escrito: `${escolha.m[1]} ${escolha.unidade}` };
}

function porExtenso(texto) {
  const m = texto.match(EXTENSO);
  if (!m) return null;
  return { ha: Number(m[1]) + Number(m[2]) / 100 + Number(m[3]) / 10000, escrito: m[0].replace(/\s+/g, " ") };
}

/** Área do imóvel na abertura da matrícula. */
export function areaDoImovel(texto) {
  return porExtenso(texto) || achar(texto, "com\\s+(?:a\\s+)?area\\s+(?:total\\s+)?de\\s+") || achar(texto, "area\\s+(?:total\\s+)?de\\s+");
}

/**
 * Área citada dentro de um registro (venda, desmembramento...). Só aceita área apresentada como tal
 * ("área de", "parte de"...), para não confundir com módulos e outros números do cadastro.
 */
export function areaDoAto(texto) {
  return achar(texto, "area\\s+(?:total\\s+)?de\\s+") || porExtenso(texto)
    || achar(texto, "(?:parte|fracao)\\s+de\\s+") || achar(texto, "correspondente\\s+a\\s+");
}

/* ------------------------------------------------------------------ nomes */

const PALAVRA = "[A-Z][A-Za-z']+";
const NOME = `${PALAVRA}(?:\\s+(?:(?:da|de|do|das|dos|DA|DE|DO|DAS|DOS)\\s+)?${PALAVRA}){0,6}`;
const COM_TRATAMENTO = new RegExp(`\\b(?:SRTA|SRA|SR|Srta|Sra|Sr|srta|sra|sr|Senhora|Senhor|senhora|senhor)\\b\\.?\\s*(${NOME})`, "g");
const QUALIFICADO = /\b([A-Z][A-Z']+(?:\s+(?:(?:DE|DA|DO|DAS|DOS)\s+)?[A-Z][A-Z']+){1,6})\s*,\s*(?:brasileir|ja qualificad|retro qualificad)/g;
const NAO_SAO_NOMES = new Set(["adquirente", "adquirentes", "transmitente", "transmitentes", "proprietario", "proprietarios", "titulo", "oficial"]);

function nomeBonito(nome) {
  return nome.toLowerCase().replace(/\s+/g, " ").trim().split(" ")
    .map((p) => (["de", "da", "do", "das", "dos", "e"].includes(p) ? p : p.charAt(0).toUpperCase() + p.slice(1)))
    .join(" ");
}

/** Pessoas citadas no trecho: [{ nome, posicao, conjuge }]. Ignora tabeliães e oficiais. */
export function pessoasNoTrecho(trecho) {
  const achados = [];
  for (const regex of [COM_TRATAMENTO, QUALIFICADO]) {
    for (const m of trecho.matchAll(regex)) {
      const posicao = m.index + m[0].indexOf(m[1]);
      const antes = normalizar(trecho.slice(Math.max(0, m.index - 60), m.index));
      const depoisDeVirgulaArtigo = /,\s*(o|a|ao)$/.test(antes);
      if (!depoisDeVirgulaArtigo && /(tabeli\w*|\btab\b\.?|oficial|escrevent\w*|notari\w*)[^;]{0,45}$/.test(antes)) continue;
      const nome = nomeBonito(m[1]);
      if (nome.split(" ").length < 2 || NAO_SAO_NOMES.has(normalizar(nome.split(" ")[0]))) continue;
      const conjuge = /(mulher|esposa|conjuge|marido|esposo|casad[oa] com)[^,;]{0,12}$/.test(antes);
      if (!achados.some((p) => mesmaPessoa(p.nome, nome))) achados.push({ nome, posicao, conjuge });
    }
  }
  return achados.sort((a, b) => a.posicao - b.posicao);
}

export function mesmaPessoa(a, b) {
  const tokens = (s) => normalizar(s).split(" ").filter((p) => p.length > 2 && !["das", "dos"].includes(p));
  const x = tokens(a);
  const y = tokens(b);
  if (x.join(" ") === y.join(" ")) return true;
  return x.length > 1 && y.length > 1 && x[0] === y[0] && x.filter((p) => y.includes(p)).length >= 2;
}

/* ------------------------------------------------------------------ registros */

const TRANSFERENCIA = /compra e venda|\bvendeu\b|\bvenderam\b|\badquirentes?\b|\btransmitentes?\b|doacao|\bdoou\b|\bdoaram\b|partilha|inventario|adjudica|permuta|arrematacao|usucapiao|dacao em pagamento|\bcoube/;
const CANCELAMENTO = /cancelamento|\bbaixa\b|\bcancelad/;
const ONUS = /hipotec|alienacao fiduciaria|\bpenhor|cedula (?:rural|de credito|de produto)|usufruto|servidao|arresto|indisponibilidade|caucao/;
const AREA = /(ficou|passou|transferid[oa]|matriculad[oa])[^.;]{0,60}\bmat(?:ricula)?\b|desmembr|desdobr|unificacao|remanescente|retificacao/;

export const ROTULOS = {
  transferencia: "Transferência de propriedade",
  onus: "Ônus / garantia",
  cancelamento: "Cancelamento / baixa",
  area: "Alteração de área",
  outro: "Outro (não interpretado)",
};

function classificarAto(norm) {
  if (CANCELAMENTO.test(norm) && !TRANSFERENCIA.test(norm)) return "cancelamento";
  if (TRANSFERENCIA.test(norm)) return "transferencia";
  if (ONUS.test(norm)) return "onus";
  if (AREA.test(norm)) return "area";
  return "outro";
}

/** Trecho que vem depois de um rótulo ("ADQUIRENTE:") até o próximo rótulo. */
function secao(texto, rotulo) {
  const m = texto.match(rotulo);
  if (!m) return null;
  const inicio = m.index + m[0].length;
  const resto = texto.slice(inicio);
  const fim = resto.search(/\b(?:adquirentes?|transmitentes?|titulo|forma d[oe] titulo|valor|condicoes|imposto)\b\s*:/i);
  return { inicio, texto: fim >= 0 ? resto.slice(0, fim) : resto };
}

/** Quem transfere e quem recebe, com a posição de cada nome dentro do registro. */
function partes(texto) {
  const adq = secao(texto, /adquirentes?\s*:/i);
  const tra = secao(texto, /transmitentes?\s*:/i);
  if (adq || tra) {
    const ler = (s) => (s ? pessoasNoTrecho(s.texto).map((p) => ({ ...p, posicao: p.posicao + s.inicio })) : []);
    return { adquirentes: ler(adq), transmitentes: ler(tra) };
  }
  const verbo = texto.match(/\b(venderam|vendeu|doaram|doou|transmitiram|transmitiu|coube|couberam|adjudicad[oa])\b/i);
  const pessoas = pessoasNoTrecho(texto);
  if (!verbo) return { adquirentes: [], transmitentes: [], semVerbo: true };
  return {
    transmitentes: pessoas.filter((p) => p.posicao < verbo.index),
    adquirentes: pessoas.filter((p) => p.posicao > verbo.index),
  };
}

const CABECALHO = /^[^A-Za-z0-9\n]{0,6}(R|AV)\s*[.\-]?\s*([\dIl]{1,3})\s*[-\/]\s*(\d[\d.,]{1,8})/gim;

function separarAtos(texto) {
  const marcas = [];
  let ultimo = 0;
  for (const m of texto.matchAll(CABECALHO)) {
    const numero = Number(m[2].replace(/[Il]/gi, "1"));
    if (numero <= ultimo) continue; // é só uma citação de um registro anterior
    ultimo = numero;
    marcas.push({ indice: m.index, codigo: `${m[1].toUpperCase()}-${numero}` });
  }
  return marcas.map((a, i) => ({
    codigo: a.codigo,
    indice: a.indice,
    texto: texto.slice(a.indice, i + 1 < marcas.length ? marcas[i + 1].indice : texto.length).trim(),
  }));
}

/* ------------------------------------------------------------------ análise */

/**
 * paginas: [{ numero, texto, ocr }] na ordem da matrícula.
 * Retorna { matricula, areaInicial, areaAtual, donos, atos, avisos }.
 * donos: [{ nome, hectares|null, pagina, ato, trecho, destaques }]
 */
export function analisarMatricula(paginas) {
  let texto = "";
  const inicios = [];
  for (const p of paginas) {
    inicios.push({ indice: texto.length, numero: p.numero });
    texto += `${limparPagina(p.texto)}\n`;
  }
  const paginaDe = (indice) => {
    let numero = inicios.length ? inicios[0].numero : 1;
    for (const i of inicios) if (i.indice <= indice) numero = i.numero;
    return numero;
  };

  const avisos = [];
  const matricula = ((texto.match(/matricula\s*n[o0.\s:]{0,4}\s*(\d[\d.]{1,8})/i) || [])[1] || "").replace(/\D/g, "");
  const separados = separarAtos(texto);
  const abertura = separados.length ? texto.slice(0, separados[0].indice) : texto;

  const inicial = areaDoImovel(abertura);
  const areaInicial = inicial ? inicial.ha : null;
  if (areaInicial === null) avisos.push("Não consegui ler a área do imóvel na abertura da matrícula");
  let areaAtual = areaInicial;

  // proprietários da abertura
  let donos = [];
  const blocoDonos = abertura.match(/proprietari[oa]s?\s*:([\s\S]{0,1500}?)(?:registro anterior|$)/i);
  if (blocoDonos) {
    const inicioBloco = blocoDonos.index + blocoDonos[0].indexOf(blocoDonos[1]);
    const titulares = pessoasNoTrecho(blocoDonos[1]).filter((p) => !p.conjuge);
    donos = titulares.map((p) => ({
      nome: p.nome,
      hectares: titulares.length === 1 ? areaInicial : null,
      pagina: paginaDe(inicioBloco + p.posicao),
      ato: "Abertura",
      trecho: blocoDonos[0].trim(),
      destaques: [p.nome],
    }));
  }
  if (!donos.length) avisos.push("Não identifiquei o proprietário na abertura da matrícula");

  const atos = [];
  const onusAbertos = [];
  for (const a of separados) {
    const norm = normalizar(a.texto);
    const tipo = classificarAto(norm);
    const area = areaDoAto(a.texto);
    const ato = {
      codigo: a.codigo, tipo, pagina: paginaDe(a.indice), trecho: a.texto,
      areaHa: tipo === "transferencia" || tipo === "area" ? (area ? area.ha : null) : null,
      transmitentes: [], adquirentes: [], destaques: area ? [area.escrito.split(" ")[0]] : [],
    };
    atos.push(ato);
    const onde = `${a.codigo} (pág. ${ato.pagina})`;

    if (/parte ideal|fracao ideal|\bavos\b|meacao/.test(norm)) avisos.push(`${onde} cita parte ideal ou fração: confira a divisão`);

    if (tipo === "transferencia") {
      const p = partes(a.texto);
      const compradores = p.adquirentes.filter((x) => !x.conjuge);
      const vendedores = p.transmitentes.filter((x) => !x.conjuge);
      ato.transmitentes = vendedores.map((x) => x.nome);
      ato.adquirentes = compradores.map((x) => x.nome);
      ato.destaques.push(...ato.transmitentes, ...ato.adquirentes);
      if (!compradores.length) {
        avisos.push(`${onde}: transferência sem comprador identificado. Confira`);
        continue;
      }
      const atuais = donos.filter((d) => vendedores.some((v) => mesmaPessoa(v.nome, d.nome)));
      if (!atuais.length) avisos.push(`${onde}: quem transfere não aparece como dono. Confira`);
      if (ato.areaHa === null) avisos.push(`${onde}: área não citada; considerei tudo o que quem transferiu tinha`);

      // área transferida: a citada no ato; sem citação, tudo o que os vendedores tinham
      let quantidade = ato.areaHa;
      if (quantidade === null && atuais.length && atuais.every((d) => d.hectares !== null)) {
        quantidade = atuais.reduce((s, d) => s + d.hectares, 0);
      }
      for (const d of atuais) {
        if (ato.areaHa === null) d.hectares = 0;
        else if (d.hectares !== null && atuais.length === 1) d.hectares -= ato.areaHa;
        else d.hectares = null;
      }
      donos = donos.filter((d) => d.hectares === null || d.hectares > MARGEM);

      if (compradores.length > 1) avisos.push(`${onde}: mais de um comprador. Informe a parte de cada um`);
      for (const c of compradores) {
        const parte = compradores.length === 1 ? quantidade : null;
        const registro = { pagina: paginaDe(a.indice + c.posicao), ato: a.codigo, trecho: a.texto, destaques: [c.nome, ...ato.destaques] };
        const existente = donos.find((d) => mesmaPessoa(d.nome, c.nome));
        if (existente) {
          existente.hectares = existente.hectares === null || parte === null ? null : existente.hectares + parte;
          Object.assign(existente, registro);
        } else {
          donos.push({ nome: c.nome, hectares: parte, ...registro });
        }
      }
    } else if (tipo === "area") {
      const saiu = /(ficou|passou|transferid[oa]|desmembrad[oa])[^;]{0,80}\bmat/.test(norm) && !/remanescente/.test(norm);
      if (saiu && ato.areaHa !== null) {
        const destino = ((norm.match(/\bmat(?:ricula)?\.?\s*(?:no?\.?\s*)?(\d[\d.]{1,8})/) || [])[1] || "").replace(/\.+$/, "");
        if (areaAtual !== null) areaAtual -= ato.areaHa;
        let dono = donos.find((d) => d.hectares !== null && Math.abs(d.hectares - ato.areaHa) <= MARGEM);
        if (!dono && donos.length === 1) dono = donos[0];
        if (dono && dono.hectares !== null) dono.hectares -= ato.areaHa;
        else avisos.push(`${onde}: saiu área, mas não sei de qual dono. Confira`);
        donos = donos.filter((d) => d.hectares === null || d.hectares > MARGEM);
        avisos.push(`${onde}: ${formatarHa(ato.areaHa)} ha saíram desta matrícula${destino ? ` para a matrícula ${destino}` : ""}`);
      } else {
        avisos.push(`${onde}: alteração de área que precisa de conferência manual`);
      }
    } else if (tipo === "onus") {
      onusAbertos.push(onde);
    } else if (tipo === "cancelamento") {
      avisos.push(`${onde}: há um cancelamento/baixa. Veja a qual registro se refere`);
    } else {
      avisos.push(`${onde}: registro não interpretado. Leia o trecho`);
    }
  }

  if (!atos.length) avisos.push("Nenhum registro (R-1, AV-2...) foi reconhecido. Confira o texto lido");
  if (onusAbertos.length) avisos.push(`Há ônus ou garantia registrados em ${onusAbertos.join(", ")}: confira se já houve baixa`);
  if (donos.some((d) => d.hectares === null)) avisos.push("Há dono sem área definida: preencha os hectares");
  const soma = donos.reduce((s, d) => s + (d.hectares || 0), 0);
  if (areaAtual !== null && donos.length && donos.every((d) => d.hectares !== null) && Math.abs(soma - areaAtual) > MARGEM) {
    avisos.push(`A soma dos donos (${formatarHa(soma)} ha) não bate com a área da matrícula (${formatarHa(areaAtual)} ha)`);
  }
  if (paginas.some((p) => p.ocr)) avisos.push("Páginas lidas por OCR: confira nomes e números no documento");

  const arredondar = (n) => (n === null ? null : Math.round(n * 10000) / 10000);
  return {
    matricula,
    areaInicial: arredondar(areaInicial),
    areaAtual: arredondar(areaAtual),
    donos: donos.map((d) => ({ ...d, hectares: arredondar(d.hectares) })),
    atos,
    avisos,
  };
}
