// Lê um arquivo (PDF ou foto) enviado na página de hectares: texto do PDF ou OCR, depois analisa a área.

import * as extrator from "./extrator.js";
import { analisarArea, combinarLeituras, resultadoComErro } from "./areas.js";
import { EXT_SUPORTADAS } from "./zipLeitor.js";
import { extensao, sha256Hex } from "./util.js";

const MIN_CHARS_TEXTO = 40;
const MAX_PAGINAS_OCR = 4;           // no CAR a área consolidada costuma estar na página 2
const OUTRAS_ROTACOES = [90, 270, 180];

/** Tem o que precisa: área lida de um documento confirmado, ou certeza de que é o documento errado. */
function resolvido(r) {
  return !!r.erro || (r.tipoConfirmado && r.area !== null);
}

async function lerTextoPdf(dados, nome, modo, tipos) {
  let melhor = null;
  for (const ler of [extrator.textoPdfLayout, extrator.textoPdf]) {
    const texto = await ler(dados);
    if (texto.trim().length < MIN_CHARS_TEXTO) continue;
    const resultado = analisarArea(texto, nome, modo, tipos, false);
    if (!melhor || resolvido(resultado)) melhor = { resultado, texto };
    if (resolvido(resultado)) break;
  }
  return melhor;
}

async function lerImagem(dados, ext, nome, modo, cfg, tipos, ocr) {
  const imagens = await extrator.renderizarPaginas(dados, ext, MAX_PAGINAS_OCR, cfg.ocr.dpi);
  const analisar = async (rotacao, psm) => {
    const leitura = await ocr.ler(imagens, rotacao, psm);
    return { texto: leitura.texto, resultado: analisarArea(leitura.texto, nome, modo, tipos, true) };
  };

  // Duas leituras (página inteira e bloco/tabela): se os números divergirem, o usuário é avisado.
  let a = await analisar(0, "3");
  let b = await analisar(0, "6");
  if (!a.resultado.tipo && !b.resultado.tipo) {
    for (const rotacao of OUTRAS_ROTACOES) {
      const tentativa = await analisar(rotacao, "3");
      if (tentativa.resultado.tipo) {
        a = tentativa;
        b = await analisar(rotacao, "6");
        break;
      }
    }
  }
  const resultado = combinarLeituras(a.resultado, b.resultado);
  if (!resultado.erro && resultado.area !== null) resultado.avisos.push("Lido por OCR: confira o valor no documento");
  return { resultado, texto: `${a.texto}\n\n--- segunda leitura ---\n${b.texto}` };
}

/* ------------------------------------------------------------------ matrícula */

const MAX_PAGINAS_MATRICULA = 40;
const MIN_CHARS_PAGINA_TEXTO = 800;   // menos que isso: a página é imagem (só tem carimbos em texto)
const CONFIANCA_MINIMA_ORIENTACAO = 45;

async function ocrDaPagina(canvases, ocr) {
  let melhor = await ocr.ler(canvases, 0, "3");
  if (melhor.confianca < CONFIANCA_MINIMA_ORIENTACAO) { // página pode estar deitada ou de ponta-cabeça
    for (const rotacao of OUTRAS_ROTACOES) {
      const tentativa = await ocr.ler(canvases, rotacao, "3");
      if (tentativa.confianca > melhor.confianca) melhor = tentativa;
    }
  }
  return melhor.texto;
}

/**
 * Lê todas as páginas da matrícula (um PDF ou várias fotos, em ordem de nome).
 * aoProgresso(mensagem). Retorna { paginas: [{ numero, texto, ocr, arquivo }], problemas: [] }.
 */
export async function lerPaginasMatricula(arquivos, cfg, ocr, aoProgresso) {
  const paginas = [];
  const problemas = [];
  const ordenados = [...arquivos].sort((a, b) => a.name.localeCompare(b.name, "pt-BR", { numeric: true }));
  const adicionar = (texto, usouOcr, arquivo) => paginas.push({ numero: paginas.length + 1, texto, ocr: usouOcr, arquivo });

  for (const arquivo of ordenados) {
    const ext = extensao(arquivo.name);
    if (!EXT_SUPORTADAS.has(ext)) {
      problemas.push(`${arquivo.name}: formato não suportado (envie PDF ou foto)`);
      continue;
    }
    try {
      const dados = await arquivo.arrayBuffer();
      if (ext === ".pdf") {
        const total = await extrator.percorrerPdf(dados, MAX_PAGINAS_MATRICULA, cfg.ocr.dpi, async (p) => {
          if (aoProgresso) aoProgresso(`${arquivo.name}: página ${p.numero} de ${p.total}`);
          if (p.texto.trim().length >= MIN_CHARS_PAGINA_TEXTO) adicionar(p.texto, false, arquivo.name);
          else if (await ocr.garantir()) adicionar(await ocrDaPagina([await p.desenhar()], ocr), true, arquivo.name);
          else {
            adicionar(p.texto, false, arquivo.name);
            problemas.push(`${arquivo.name}, página ${p.numero}: OCR indisponível (${ocr.motivo})`);
          }
          await new Promise((r) => setTimeout(r, 0));
        });
        if (total > MAX_PAGINAS_MATRICULA) problemas.push(`${arquivo.name}: só li as primeiras ${MAX_PAGINAS_MATRICULA} páginas`);
      } else {
        if (aoProgresso) aoProgresso(`${arquivo.name}: lendo a foto`);
        if (!(await ocr.garantir())) {
          problemas.push(`${arquivo.name}: OCR indisponível (${ocr.motivo})`);
          continue;
        }
        const imagens = await extrator.renderizarPaginas(dados, ext, 1, cfg.ocr.dpi);
        adicionar(await ocrDaPagina(imagens, ocr), true, arquivo.name);
      }
    } catch (e) {
      problemas.push(e instanceof extrator.SenhaPDF
        ? `${arquivo.name}: PDF protegido por senha`
        : `${arquivo.name}: falha ao ler (${(e && e.message) || e})`);
    }
  }
  return { paginas, problemas };
}

/**
 * arquivo: File do navegador. modo: "total" | "consolidada".
 * Retorna { arquivo, hash, resultado, texto, metodoTexto } (formato usado por areas.consolidar).
 */
export async function lerArquivoArea(arquivo, modo, cfg, tipos, ocr) {
  const nome = arquivo.name;
  const ext = extensao(nome);
  const saida = { arquivo: nome, hash: "", resultado: null, texto: "", metodoTexto: "nenhum" };

  if (!EXT_SUPORTADAS.has(ext)) {
    saida.resultado = resultadoComErro(`Formato '${ext || "sem extensão"}' não suportado: envie PDF ou foto`);
    return saida;
  }

  try {
    const dados = await arquivo.arrayBuffer();
    saida.hash = await sha256Hex(dados);

    let nativo = null;
    if (ext === ".pdf") nativo = await lerTextoPdf(dados, nome, modo, tipos);
    if (nativo && resolvido(nativo.resultado)) {
      return { ...saida, ...nativo, metodoTexto: "texto" };
    }

    if (await ocr.garantir()) {
      const porOcr = await lerImagem(dados, ext, nome, modo, cfg, tipos, ocr);
      // se o OCR não melhorou o que o texto do PDF já tinha, fica o texto
      if (!nativo || resolvido(porOcr.resultado) || porOcr.resultado.area !== null) {
        return { ...saida, ...porOcr, metodoTexto: "ocr" };
      }
    }
    if (nativo) return { ...saida, ...nativo, metodoTexto: "texto" };
    saida.resultado = resultadoComErro(`Sem texto legível e OCR indisponível (${ocr.motivo})`);
  } catch (e) {
    saida.resultado = resultadoComErro(
      e instanceof extrator.SenhaPDF ? "PDF protegido por senha" : `Falha ao ler o arquivo: ${(e && e.message) || e}`,
    );
  }
  return saida;
}
