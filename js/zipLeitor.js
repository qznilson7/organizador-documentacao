// Leitura do ZIP enviado pelo usuário (usa a biblioteca JSZip, carregada no index.html).

import { normalizar, extensao, nomeDoCaminho } from "./util.js";

// Só formatos que o navegador consegue desenhar para o OCR.
export const EXT_SUPORTADAS = new Set([".pdf", ".jpg", ".jpeg", ".png", ".bmp", ".webp"]);
const LIXO = new Set([".ds_store", "thumbs.db", "desktop.ini"]);

export class ErroZip extends Error {}

// ZIPs antigos do Windows gravam nomes acentuados em cp850 (sem marcar UTF-8).
const CP850_ALTO =
  "ÇüéâäàåçêëèïîìÄÅ" + "ÉæÆôöòûùÿÖÜø£Ø×ƒ" + "áíóúñÑªº¿®¬½¼¡«»" + "░▒▓│┤ÁÂÀ©╣║╗╝¢¥┐" +
  "└┴┬├─┼ãÃ╚╔╩╦╠═╬¤" + "ðÐÊËÈıÍÎÏ┘┌█▄¦Ì▀" + "ÓßÔÒõÕµþÞÚÛÙýÝ¯´" + "­±‗¾¶§÷¸°¨·¹³²■ ";

function decodificarNome(bytes) {
  const u8 = bytes instanceof Uint8Array ? bytes : Uint8Array.from(bytes);
  try {
    return new TextDecoder("utf-8", { fatal: true }).decode(u8);
  } catch {
    let s = "";
    for (const b of u8) s += b < 128 ? String.fromCharCode(b) : CP850_ALTO[b - 128];
    return s;
  }
}

/** Descobre se o arquivo veio de 'docs pessoais', 'docs terreno' ou 'NF'. */
export function detectarPasta(componentes) {
  for (const c of componentes) {
    const n = normalizar(c);
    if (n.includes("pessoa")) return "pessoais";
    if (n.includes("terreno")) return "terreno";
    if (/^(nf|nota)/.test(n)) return "nf"; // "NF", "NFs", "nf`s - cliente", "Notas fiscais"
  }
  return null;
}

/**
 * Lê o ZIP. Retorna { cliente, docs }.
 * nomeBase = nome do ZIP sem extensão (usado se o ZIP não tiver uma pasta raiz única).
 */
export async function lerZip(arquivo, nomeBase, cfg) {
  let zip;
  try {
    zip = await JSZip.loadAsync(await arquivo.arrayBuffer(), { decodeFileName: decodificarNome });
  } catch {
    throw new ErroZip("O arquivo enviado não é um ZIP válido (ou está corrompido).");
  }

  const entradas = [];
  zip.forEach((caminho, entry) => {
    if (entry.dir) return;
    const partes = caminho.replace(/\\/g, "/").split("/").filter((p) => p !== "" && p !== ".");
    if (!partes.length || partes.includes("..") || partes[0] === "__MACOSX") return;
    const base = partes[partes.length - 1];
    if (LIXO.has(base.toLowerCase()) || base.startsWith("~$") || base.startsWith("._")) return;
    entradas.push({ entry, partes });
  });

  if (!entradas.length) throw new ErroZip("O ZIP não contém nenhum arquivo.");
  if (entradas.length > cfg.limites.maxArquivos) {
    throw new ErroZip(`O ZIP tem ${entradas.length} arquivos; o limite é ${cfg.limites.maxArquivos}.`);
  }

  // O nome do cliente é o nome do ZIP. Se tudo está dentro de UMA pasta (ex.: "2026"), ela é só a raiz:
  // não conta como subpasta de origem.
  const topos = new Set(entradas.map((e) => e.partes[0]));
  const raizUnica =
    topos.size === 1 &&
    entradas.every((e) => e.partes.length > 1) &&
    detectarPasta([[...topos][0]]) === null &&
    normalizar([...topos][0]) !== normalizar(cfg.pastaIgnorada.nome);
  const cliente = nomeBase;
  const nomePastaIgnorada = normalizar(cfg.pastaIgnorada.nome);

  const limiteBytes = cfg.limites.maxMbTotal * 1024 * 1024;
  let total = 0;
  const docs = [];
  for (const { entry, partes } of entradas) {
    const dados = await entry.async("arraybuffer");
    total += dados.byteLength;
    if (total > limiteBytes) throw new ErroZip(`O conteúdo do ZIP passa de ${cfg.limites.maxMbTotal} MB.`);
    const subpastas = raizUnica ? partes.slice(1, -1) : partes.slice(0, -1);
    docs.push({
      origem: partes.join("/"),
      dados,
      ext: extensao(nomeDoCaminho(partes.join("/"))),
      pastaOrigem: detectarPasta(subpastas),
      ignorar: subpastas.some((c) => normalizar(c) === nomePastaIgnorada), // ex.: "docs finais"
      texto: "",
      metodoTexto: "nenhum",
      tipo: null,
      confianca: 0,
      metodo: "nenhum",
      observacao: "",
      destinoPasta: "",
      destinoNome: "",
    });
  }
  return { cliente, docs };
}
