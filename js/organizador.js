// Planeja nomes/pastas finais e gera o ZIP de saída (usa JSZip).

import { sanitizar, nomeDoCaminho, semExtensao, semAcentos } from "./util.js";

/** Caminho dentro do ZIP final: ignora partes vazias (pasta "" = raiz do cliente). */
function juntar(...partes) {
  return partes.filter(Boolean).join("/");
}

/** Minúsculas e sem acento, conforme cfg.nomes. */
export function padronizar(nome, cfg) {
  let n = String(nome);
  if (!cfg.nomes || cfg.nomes.semAcento !== false) n = semAcentos(n);
  if (!cfg.nomes || cfg.nomes.minusculas !== false) n = n.toLowerCase();
  return n;
}

/** Pasta e nome-base (sem extensão, sem número de duplicado) de um documento. */
function nomeBase(d, cfg, tipos, cliente) {
  const stem = semExtensao(nomeDoCaminho(d.origem));
  if (d.ignorar) return { pasta: cfg.pastas.finais, base: sanitizar(stem), nota: false }; // fica como está
  const t = d.tipo ? tipos[d.tipo] : null;
  if (!t) return { pasta: cfg.pastas.revisar, base: sanitizar(padronizar(stem, cfg)), nota: false };

  const nomeTipo = cfg.padraoNome.split("{tipo}").join(t.nomeArquivo).split("{cliente}").join(cliente);
  const detalhe = (d.detalhe || "").trim();
  let base = nomeTipo;
  if (t.formato === "nota") base = detalhe || nomeTipo;          // "soja - r$ 100.000,00 - 2026"
  else if (t.pessoa && detalhe) base = `${nomeTipo} - ${detalhe}`; // "cnh - nome da pessoa"
  return { pasta: cfg.pastas[t.pasta] ?? "", base: sanitizar(padronizar(base, cfg)), nota: t.formato === "nota" };
}

/**
 * Devolve cópias dos documentos com destinoPasta e destinoNome preenchidos.
 * - d.detalhe: nome da pessoa (RG, CNH...) ou "cultura - r$ valor - ano" (NF).
 * - d.mes: mês de emissão da NF; só entra no nome quando duas notas ficariam com o mesmo nome.
 * - d.removido: duplicado idêntico; não ganha nome nem vai para o ZIP.
 * - d.ignorar (docs finais): mantém o nome original.
 */
export function planejar(docs, cfg, tipos, cliente) {
  const ordenados = [...docs].sort((a, b) => {
    const x = a.origem.toLowerCase();
    const y = b.origem.toLowerCase();
    return x < y ? -1 : x > y ? 1 : 0;
  });

  const itens = ordenados.map((d) => ({ d, ...nomeBase(d, cfg, tipos, cliente) }));

  // Notas com o mesmo nome: acrescenta o mês (quando conhecido) em todas elas.
  const contagem = new Map();
  for (const it of itens) {
    if (it.nota && !it.d.removido) {
      const k = `${it.pasta}|${it.base}`.toLowerCase();
      contagem.set(k, (contagem.get(k) || 0) + 1);
    }
  }
  for (const it of itens) {
    if (it.nota && !it.d.removido && it.d.mes && contagem.get(`${it.pasta}|${it.base}`.toLowerCase()) > 1) {
      it.base = `${it.base} - ${it.d.mes}`;
    }
  }

  const ocupados = new Set();
  const saida = [];
  for (const it of itens) {
    const d = it.d;
    if (d.removido) {
      saida.push({ ...d, destinoPasta: "", destinoNome: "" });
      continue;
    }
    let nome = `${it.base}${d.ext}`;
    let n = 1;
    while (ocupados.has(`${it.pasta.toLowerCase()}|${nome.toLowerCase()}`)) {
      n += 1;
      nome = `${it.base} (${n})${d.ext}`;
    }
    ocupados.add(`${it.pasta.toLowerCase()}|${nome.toLowerCase()}`);
    saida.push({ ...d, destinoPasta: it.pasta, destinoNome: nome });
  }
  return saida;
}

/** Texto "pasta/arquivo" para exibir (raiz aparece só com o nome; duplicado removido, vazio). */
export function caminhoDestino(d) {
  return d.removido ? "" : juntar(d.destinoPasta, d.destinoNome);
}

export function arvoreTexto(planejados, cliente) {
  const porPasta = {};
  for (const d of planejados) {
    if (d.removido) continue;
    (porPasta[d.destinoPasta] = porPasta[d.destinoPasta] || []).push(d);
  }
  const linhas = [`${sanitizar(cliente)}/`];
  for (const pasta of Object.keys(porPasta).sort()) {
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
 * Duplicados idênticos (d.removido) ficam de fora.
 */
export async function gerarZip(planejados, cfg, cliente) {
  const raiz = sanitizar(cliente);
  const incluirFinais = cfg.pastaIgnorada ? cfg.pastaIgnorada.incluirNoZip : true;
  const itens = planejados.filter((d) => !d.removido && !(d.ignorar && !incluirFinais));
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
