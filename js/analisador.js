// Orquestra a análise: lê o ZIP, extrai texto/OCR e classifica cada documento.

import * as extrator from "./extrator.js";
import { lerZip, EXT_SUPORTADAS } from "./zipLeitor.js";
import { classificarConteudo, aplicarFallbackPasta } from "./classificador.js";
import { normalizar, semExtensao, nomeDoCaminho } from "./util.js";

const MIN_CHARS_TEXTO = 40;        // abaixo disso o PDF é tratado como escaneado
const CHARS_OCR_CONFIAVEL = 150;   // OCR com este tamanho: a orientação provavelmente está certa
const ROTACOES = [0, 90, 270, 180];

/** Analisa um documento e preenche tipo, confianca, metodo e observacao. */
export async function analisarDocumento(doc, cfg, tipos, ocr) {
  const nome = semExtensao(nomeDoCaminho(doc.origem));
  let texto = "";

  if (doc.ignorar) {
    doc.observacao = "Pasta ignorada (não analisado)";
    return;
  }

  if (!EXT_SUPORTADAS.has(doc.ext)) {
    doc.observacao = `Formato '${doc.ext || "sem extensão"}' não suportado`;
    return;
  }

  if (doc.ext === ".pdf") {
    try {
      texto = await extrator.textoPdf(doc.dados);
    } catch (e) {
      doc.observacao = e instanceof extrator.SenhaPDF ? "PDF protegido por senha" : `Falha ao ler o PDF: ${e.message || e}`;
      return;
    }
    if (texto.trim().length >= MIN_CHARS_TEXTO) doc.metodoTexto = "texto";
  }

  let cls = classificarConteudo(texto, nome, doc.pastaOrigem, tipos, false);

  if (cls.tipo === null) {
    const ocrOk = await ocr.garantir();
    if (ocrOk) {
      try {
        const imagens = await extrator.renderizarPaginas(doc.dados, doc.ext, cfg.ocr.paginasPdf, cfg.ocr.dpi);
        for (const rot of ROTACOES) {
          const textoOcr = await ocr.ler(imagens, rot);
          const c = classificarConteudo(textoOcr, nome, doc.pastaOrigem, tipos, true);
          if (rot === 0) { doc.texto = textoOcr; doc.metodoTexto = "ocr"; }
          if (c.tipo) { cls = c; doc.texto = textoOcr; doc.metodoTexto = "ocr"; break; }
          if (rot === 0 && normalizar(textoOcr).length >= CHARS_OCR_CONFIAVEL) { cls = c; break; }
        }
      } catch (e) {
        if (e instanceof extrator.SenhaPDF) { doc.observacao = "PDF protegido por senha"; return; }
        cls = { ...cls, observacao: `Falha no OCR: ${(e && e.message) || e}` };
      }
    } else if (doc.metodoTexto !== "texto") {
      cls = { ...cls, observacao: `Sem texto legível e OCR indisponível (${ocr.motivo})` };
    }
  }
  if (!doc.texto) doc.texto = texto;

  cls = aplicarFallbackPasta(cls, doc.pastaOrigem, cfg.fallbackPorPasta);
  doc.tipo = cls.tipo;
  doc.confianca = cls.confianca;
  doc.metodo = cls.metodo;
  doc.observacao = cls.observacao;
}

/**
 * Lê o ZIP e analisa todos os documentos, um de cada vez.
 * progresso(i, total, nomeDoArquivo) é chamado antes de cada documento.
 */
export async function processarZip(arquivo, cfg, tipos, ocr, progresso) {
  const nomeBase = arquivo.name.replace(/\.[^.]+$/, "");
  const { cliente, docs } = await lerZip(arquivo, nomeBase, cfg);
  const total = docs.length;
  for (let i = 0; i < total; i++) {
    if (progresso) progresso(i, total, docs[i].origem);
    await analisarDocumento(docs[i], cfg, tipos, ocr);
    await new Promise((r) => setTimeout(r, 0)); // deixa a tela atualizar a barra de progresso
  }
  if (progresso) progresso(total, total, "concluído");
  return { cliente, docs };
}
