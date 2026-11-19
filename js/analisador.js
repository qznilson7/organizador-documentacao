// Orquestra a análise: lê o ZIP, extrai texto/OCR e classifica cada documento.
// O tipo vem do CONTEÚDO do arquivo (texto do PDF ou OCR); o nome original só dá uma ajuda pequena.

import * as extrator from "./extrator.js";
import { lerZip, EXT_SUPORTADAS } from "./zipLeitor.js";
import { classificarConteudo, aplicarFallbackPasta } from "./classificador.js";
import { semExtensao, nomeDoCaminho, sha256Hex } from "./util.js";

const MIN_CHARS_TEXTO = 40;        // abaixo disso o PDF é tratado como escaneado
const CHARS_OCR_BOM = 150;         // leitura com este tamanho e confiança alta: a orientação está certa
const CONFIANCA_OCR_BOA = 75;      // confiança média do Tesseract (0 a 100)
const ROTACOES = [0, 90, 270, 180];

/**
 * Lê as imagens com OCR e tenta classificar. Estratégia:
 *  1) página inteira em cada rotação (para quando um tipo é reconhecido);
 *  2) se nenhuma serviu, texto esparso (modo 11) na rotação mais legível;
 *  3) por último, junta os dois textos e tenta de novo.
 * Retorna { cls, texto, confianca }.
 */
async function lerComOcr(imagens, nome, doc, tipos, ocr) {
  const classificar = (t) => classificarConteudo(t, nome, doc.pastaOrigem, tipos, true);
  const tentativas = [];

  for (const rot of ROTACOES) {
    const leitura = await ocr.ler(imagens, rot, "3");
    const cls = classificar(leitura.texto);
    tentativas.push({ rot, ...leitura, cls });
    if (cls.tipo) return { cls, texto: leitura.texto, confianca: leitura.confianca };
    // leitura boa na posição normal: só não é um tipo conhecido, não adianta girar
    if (rot === 0 && leitura.confianca >= CONFIANCA_OCR_BOA && leitura.texto.length >= CHARS_OCR_BOM) break;
  }

  const melhor = [...tentativas].sort((a, b) => b.confianca - a.confianca)[0];
  const esparso = await ocr.ler(imagens, melhor.rot, "11");
  const clsEsparso = classificar(esparso.texto);
  if (clsEsparso.tipo) return { cls: clsEsparso, texto: esparso.texto, confianca: esparso.confianca };

  const junto = `${melhor.texto}\n${esparso.texto}`;
  const clsJunto = classificar(junto);
  const texto = `${melhor.texto}\n\n--- leitura em modo esparso ---\n${esparso.texto}`;
  return { cls: clsJunto.tipo ? clsJunto : melhor.cls, texto, confianca: melhor.confianca };
}

/** Analisa um documento e preenche tipo, confianca, metodo, observacao e texto. */
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
        const r = await lerComOcr(imagens, nome, doc, tipos, ocr);
        cls = r.cls;
        doc.texto = r.texto;
        doc.metodoTexto = "ocr";
        doc.ocrConfianca = Math.round(r.confianca);
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
    docs[i].hash = await sha256Hex(docs[i].dados); // para achar duplicados idênticos
    await analisarDocumento(docs[i], cfg, tipos, ocr);
    await new Promise((r) => setTimeout(r, 0)); // deixa a tela atualizar a barra de progresso
  }
  if (progresso) progresso(total, total, "concluído");
  return { cliente, docs };
}
