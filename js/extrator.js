// Extração de texto: texto nativo de PDF (pdf.js) e OCR no navegador (Tesseract.js).
// As bibliotecas pdfjsLib e Tesseract são carregadas pelo index.html.

const LADO_MAX_IMAGEM = 2400;
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

function novoCanvas(largura, altura) {
  const c = document.createElement("canvas");
  c.width = Math.max(1, Math.round(largura));
  c.height = Math.max(1, Math.round(altura));
  return c;
}

/** Converte PDF (primeiras páginas) ou imagem em canvas prontos para OCR. */
export async function renderizarPaginas(dados, ext, maxPaginas, dpi) {
  if (ext === ".pdf") {
    const pdf = await abrirPdf(dados);
    try {
      const canvases = [];
      for (let i = 1; i <= Math.min(pdf.numPages, maxPaginas); i++) {
        const pagina = await pdf.getPage(i);
        const base = pagina.getViewport({ scale: 1 });
        let escala = dpi / 72;
        const maior = Math.max(base.width, base.height) * escala;
        if (maior > LADO_MAX_PAGINA_PDF) escala *= LADO_MAX_PAGINA_PDF / maior;
        const viewport = pagina.getViewport({ scale: escala });
        const canvas = novoCanvas(viewport.width, viewport.height);
        await pagina.render({ canvasContext: canvas.getContext("2d"), viewport }).promise;
        canvases.push(canvas);
        pagina.cleanup();
      }
      return canvases;
    } finally {
      await pdf.destroy();
    }
  }

  const bitmap = await createImageBitmap(new Blob([dados]), { imageOrientation: "from-image" });
  const reducao = Math.min(1, LADO_MAX_IMAGEM / Math.max(bitmap.width, bitmap.height));
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

  async ler(canvases, rotacao = 0) {
    const partes = [];
    for (const c of canvases) {
      const r = await this.worker.recognize(rotacionar(c, rotacao));
      partes.push(r.data.text);
    }
    return partes.join("\n");
  }
}
