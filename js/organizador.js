// Planeja nomes/pastas finais e gera o ZIP de saída (usa JSZip).

import { sanitizar, nomeDoCaminho, semExtensao } from "./util.js";

/** Caminho dentro do ZIP final: ignora partes vazias (pasta "" = raiz do cliente). */
function juntar(...partes) {
  return partes.filter(Boolean).join("/");
}

/**
 * Devolve cópias dos documentos com destinoPasta e destinoNome preenchidos.
 * Documentos de pasta ignorada (ex.: "docs finais") mantêm o nome original e, se
 * cfg.pastaIgnorada.incluirNoZip for false, ficam sem destino (não vão para o ZIP).
 */
export function planejar(docs, cfg, tipos, cliente) {
  const ocupados = new Set();
  const saida = [];
  const ordenados = [...docs].sort((a, b) => {
    const x = a.origem.toLowerCase();
    const y = b.origem.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });

  for (const d of ordenados) {
    let pasta, base;
    const t = d.tipo ? tipos[d.tipo] : null;
    if (d.ignorar) {
      pasta = cfg.pastas.finais;
      base = sanitizar(semExtensao(nomeDoCaminho(d.origem)));
    } else if (t) {
      pasta = cfg.pastas[t.pasta] ?? "";
      base = sanitizar(cfg.padraoNome.split("{tipo}").join(t.nomeArquivo).split("{cliente}").join(cliente));
    } else {
      pasta = cfg.pastas.revisar;
      base = sanitizar(semExtensao(nomeDoCaminho(d.origem)));
    }

    let nome = `${base}${d.ext}`;
    let n = 1;
    while (ocupados.has(`${pasta.toLowerCase()}|${nome.toLowerCase()}`)) {
      n += 1;
      nome = `${base} (${n})${d.ext}`;
    }
    ocupados.add(`${pasta.toLowerCase()}|${nome.toLowerCase()}`);
    saida.push({ ...d, destinoPasta: pasta, destinoNome: nome });
  }
  return saida;
}

/** Texto "pasta/arquivo" para exibir (arquivos na raiz aparecem só com o nome). */
export function caminhoDestino(d) {
  return juntar(d.destinoPasta, d.destinoNome);
}

export function arvoreTexto(planejados, cliente) {
  const porPasta = {};
  for (const d of planejados) (porPasta[d.destinoPasta] = porPasta[d.destinoPasta] || []).push(d);
  const linhas = [`${sanitizar(cliente)}/`];
  const pastas = Object.keys(porPasta).sort();
  for (const pasta of pastas) {
    const recuo = pasta ? "    " : "  ";
    if (pasta) linhas.push(`  ${pasta}/`);
    const itens = porPasta[pasta].sort((a, b) => a.destinoNome.toLowerCase().localeCompare(b.destinoNome.toLowerCase()));
    for (const d of itens) linhas.push(`${recuo}${d.destinoNome}    <- ${d.origem}`);
  }
  return linhas.join("\n");
}

/**
 * Gera o ZIP final (Blob): Cliente/docs pessoais, docs terreno, NF (se houver),
 * _REVISAR (se houver) e docs finais (se houver e estiver configurado para incluir).
 */
export async function gerarZip(planejados, cfg, cliente) {
  const raiz = sanitizar(cliente);
  const incluirFinais = cfg.pastaIgnorada ? cfg.pastaIgnorada.incluirNoZip : true;
  const itens = planejados.filter((d) => !(d.ignorar && !incluirFinais));
  const usadas = new Set(itens.map((d) => d.destinoPasta));

  const pastas = [cfg.pastas.pessoais, cfg.pastas.terreno];
  for (const extra of [cfg.pastas.nf, cfg.pastas.revisar, cfg.pastas.finais]) {
    if (usadas.has(extra)) pastas.push(extra);
  }

  const zip = new JSZip();
  for (const p of pastas) zip.folder(juntar(raiz, p));
  for (const d of itens) zip.file(juntar(raiz, d.destinoPasta, d.destinoNome), d.dados);
  return zip.generateAsync({ type: "blob", compression: "DEFLATE" });
}
