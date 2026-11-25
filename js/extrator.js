// Extração de texto: texto nativo de PDF (pdf.js) e OCR no navegador (Tesseract.js).
// As bibliotecas pdfjsLib e Tesseract são carregadas pela página HTML.

import { montarLinhas } from "./util.js";

const LADO_MAX_IMAGEM = 2400;
const LADO_MIN_IMAGEM = 1500;
const LADO_AMPLIADO = 2000;
const MAX_PAGINAS_TEXTO = 5;
const LADO_MAX_PAGINA_PDF = 3500;

export class SenhaPDF extends Error {}

// Bibliotecas copiadas para a pasta lib/ (funciona sem CDN). Caminhos absolutos a partir deste arquivo.
const LIB = new URL("../lib/", import.meta.url);

if (typeof pdfjsLib !== "undefined") {
  pdfjsLib.GlobalWorkerOptions.workerSrc = new URL("pdfjs/pdf.worker.min.js", LIB).href;
}

async function abrirPdf(dados) {
  if (typeof pdfjsLib === "undefined") throw new Error("pdf.js não carregou (verifique a internet)");
  // O pdf.js "consome" o buffer; passamos uma cópia para manter o original.
  const tarefa = pdfjsLib.getDocument({ data: new Uint8Array(dados.slice(0)) });
  try {
    return await tarefa.promise;
  } catch (e) {
    if (e && e.name === "PasswordException") throw new SenhaPDF();
    throw e;
  }
}

/** Texto nativo (selecionável) das primeiras páginas do PDF. */
export async function textoPdf(dados, maxPaginas = MAX_PAGINAS_TEXTO) {
  const pdf = await abrirPdf(dados);
  try {
    const n = Math.min(pdf.numPages, maxPaginas);
    const partes = [];
    for (let i = 1; i <= n; i++) {
      const pagina = await pdf.getPage(i);
      const conteudo = await pagina.getTextContent();
      partes.push(conteudo.items.map((it) => it.str + (it.hasEOL ? "\n" : " ")).join(""));
      pagina.cleanup();
    }
    return partes.join("\n");
  } finally {
    await pdf.destroy();
  }
}

/** Como textoPdf, mas remontando as linhas pela posição na página (usado para ler tabelas). */
export async function textoPdfLayout(dados, maxPaginas = MAX_PAGINAS_TEXTO) {
  const pdf = await abrirPdf(dados);
  try {
    const partes = [];
    for (let i = 1; i <= Math.min(pdf.numPages, maxPaginas); i++) {
      const pagina = await pdf.getPage(i);
      const conteudo = await pagina.getTextContent();
      partes.push(montarLinhas(conteudo.items));
      pagina.cleanup();
    }
    return partes.join("\n");
  } finally {
    await pdf.destroy();
  }
}

function novoCanvas(largura, altura) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(largura));
  c.height = Math.max(1, Math.round(altura));
  return c;
}

async function desenharPagina(pagina, dpi) {
  const base = pagina.getViewport({ scale: 1 });
  let escala = dpi / 72;
  const maior = Math.max(base.width, base.height) * escala;
  if (maior > LADO_MAX_PAGINA_PDF) escala *= LADO_MAX_PAGINA_PDF / maior;
  const viewport = pagina.getViewport({ scale: escala });
  const canvas = novoCanvas(viewport.width, viewport.height);
  await pagina.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
  return canvas;
}

/**
 * Percorre um PDF página por página (sem desenhar todas de uma vez, para não estourar a memória).
 * aoPagina({ numero, total, texto, desenhar }) — `desenhar()` devolve o canvas da página.
 * Retorna quantas páginas o arquivo tem.
 */
export async function percorrerPdf(dados, maxPaginas, dpi, aoPagina) {
  const pdf = await abrirPdf(dados);
  try {
    const total = Math.min(pdf.numPages, maxPaginas);
    for (let i = 1; i <= total; i++) {
      const pagina = await pdf.getPage(i);
      const conteudo = await pagina.getTextContent();
      await aoPagina({ numero: i, total, texto: montarLinhas(conteudo.items), desenhar: () => desenharPagina(pagina, dpi) });
      pagina.cleanup();
    }
    return pdf.numPages;
  } finally {
    await pdf.destroy();
  }
}

/** Converte PDF (primeiras páginas) ou imagem em canvas prontos para OCR. */
export async function renderizarPaginas(dados, ext, maxPaginas, dpi) {
  if (ext === ".pdf") {
    const pdf = await abrirPdf(dados);
    try {
      const canvases = [];
      for (let i = 1; i <= Math.min(pdf.numPages, maxPaginas); i++) {
        const pagina = await pdf.getPage(i);
        canvases.push(await desenharPagina(pagina, dpi));
        pagina.cleanup();
      }
      return canvases;
    } finally {
      await pdf.destroy();
    }
  }

  const bitmap = await createImageBitmap(new Blob([dados]), { imageOrientation: "from-image" });
  const maior = Math.max(bitmap.width, bitmap.height);
  // foto grande: reduz; imagem pequena (ex.: recorte de CNH): amplia, porque o OCR erra letras minúsculas
  const alvo = maior > LADO_MAX_IMAGEM ? LADO_MAX_IMAGEM : maior < LADO_MIN_IMAGEM ? LADO_AMPLIADO : maior;
  const reducao = alvo / maior;
  const canvas = novoCanvas(bitmap.width * reducao, bitmap.height * reducao);
  const ctx = canvas.getContext("2d");
  ctx.fillStyle = "#ffffff"; // PNG com transparência vira fundo branco
  ctx.fillRect(0, 0, canvas.width, canvas.height);
  ctx.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
  bitmap.close();
  return [canvas];
}

/** Gira o canvas no sentido horário (90, 180 ou 270 graus). */
export function rotacionar(canvas, graus) {
  if (!graus) return canvas;
  const lateral = graus % 180 !== 0;
  const r = novoCanvas(lateral ? canvas.height : canvas.width, lateral ? canvas.width : canvas.height);
  const ctx = r.getContext("2d");
  ctx.translate(r.width / 2, r.height / 2);
  ctx.rotate((graus * Math.PI) / 180);
  ctx.drawImage(canvas, -canvas.width / 2, -canvas.height / 2);
  return r;
}

/**
 * Prepara a imagem para o OCR: tons de cinza e contraste esticado (1% mais escuro vira preto,
 * 1% mais claro vira branco). Ajuda em fotos e scans cinzentos ou com pouca luz.
 */
export function preparar(canvas) {
  const w = canvas.width;
  const h = canvas.height;
  const img = canvas.getContext("2d").getImageData(0, 0, w, h);
  const d = img.data;
  const hist = new Uint32Array(256);
  for (let i = 0; i < d.length; i += 4) {
    const g = ((d[i] * 299 + d[i + 1] * 587 + d[i + 2] * 114) / 1000) | 0;
    d[i] = g;
    hist[g] += 1;
  }
  const total = w * h;
  let lo = 0;
  let acum = 0;
  while (lo < 255 && acum + hist[lo] < total * 0.01) acum += hist[lo++];
  let hi = 255;
  acum = 0;
  while (hi > 0 && acum + hist[hi] < total * 0.01) acum += hist[hi--];
  const faixa = hi - lo;
  for (let i = 0; i < d.length; i += 4) {
    let v = d[i];
    if (faixa >= 20) v = Math.max(0, Math.min(255, ((v - lo) * 255) / faixa));
    d[i] = d[i + 1] = d[i + 2] = v;
    d[i + 3] = 255;
  }
  const saida = novoCanvas(w, h);
  saida.getContext("2d").putImageData(img, 0, 0);
  return saida;
}

/** Envolve o Tesseract.js. O worker só é criado na primeira vez que o OCR é preciso. */
export class OCR {
  constructor(idioma = "por", aoProgresso = null) {
    this.idioma = idioma;
    this.aoProgresso = aoProgresso; // (mensagem: string) => void
    this.disponivel = null;         // null = ainda não tentou
    this.motivo = "";
    this.worker = null;
    this._promessa = null;
  }

  /** Prepara o OCR (baixa o idioma na 1ª vez). Retorna true/false. */
  garantir() {
    if (!this._promessa) this._promessa = this._iniciar();
    return this._promessa;
  }

  async _iniciar() {
    if (typeof Tesseract === "undefined") {
      this.disponivel = false;
      this.motivo = "biblioteca Tesseract.js não carregou (sem internet?)";
      return false;
    }
    try {
      this.worker = await Tesseract.createWorker(this.idioma, 1, {
        workerPath: new URL("tesseract/worker.min.js", LIB).href,
        corePath: new URL("tesseract/core/", LIB).href,
        langPath: new URL("tesseract/lang/", LIB).href, // procura por.traineddata.gz nesta pasta
        logger: (m) => {
          if (!this.aoProgresso || !m || !m.status) return;
          const pct = typeof m.progress === "number" ? ` ${Math.round(m.progress * 100)}%` : "";
          this.aoProgresso(`OCR: ${m.status}${pct}`);
        },
      });
      this.disponivel = true;
    } catch (e) {
      this.disponivel = false;
      this.motivo = `falha ao iniciar o OCR: ${(e && e.message) || e}`;
    }
    return this.disponivel;
  }

  /**
   * Lê as imagens. psm "3" = página inteira (padrão); "11" = texto esparso (melhor para cartões como a CNH).
   * Retorna { texto, confianca } (confiança média do Tesseract, 0 a 100).
   */
  async ler(canvases, rotacao = 0, psm = "3") {
    await this.worker.setParameters({ tessedit_pageseg_mode: psm });
    const partes = [];
    const confs = [];
    for (const c of canvases) {
      const r = await this.worker.recognize(preparar(rotacionar(c, rotacao)));
      partes.push(r.data.text);
      confs.push(r.data.confidence);
    }
    const confianca = confs.length ? confs.reduce((a, b) => a + b, 0) / confs.length : 0;
    return { texto: partes.join("\n"), confianca };
  }
}
