// Interface do botão "Analisar matrícula" (dentro de hectares.html).

import { $, criar, baixar, ligarEnvio } from "./dom.js";
import { lerPaginasMatricula } from "./areasLeitura.js";
import { analisarMatricula, ROTULOS } from "./matricula.js";
import { numeroBr, formatarHa } from "./areas.js";
import { csvDeLinhas } from "./relatorio.js";
import { escapeRegex, semAcentos } from "./util.js";

const MARGEM = 0.0002;
const MAX_TRECHO = 2000;

let resultado = null;     // saída de analisarMatricula
let donos = [];           // lista editável de proprietários
let paginasLidas = [];

/** Texto com nomes e áreas marcados. */
function destacar(texto, termos) {
  const caixa = criar("div", "trecho");
  const corte = texto.length > MAX_TRECHO ? `${texto.slice(0, MAX_TRECHO)} (...)` : texto;
  const padroes = (termos || [])
    .map((t) => semAcentos(String(t)).trim())
    .filter((t) => t.length > 2)
    .map((t) => t.split(/\s+/).map(escapeRegex).join("\\s+"));
  if (!padroes.length) {
    caixa.textContent = corte;
    return caixa;
  }
  const partes = corte.split(new RegExp(`(${padroes.join("|")})`, "gi"));
  partes.forEach((p, i) => caixa.append(i % 2 ? criar("mark", "", p) : document.createTextNode(p)));
  return caixa;
}

/** Linha + linha escondida com um trecho do documento, abertas por um botão. */
function comTrecho(tr, colunas, botao, trecho, destaques) {
  const trTexto = criar("tr", "texto-linha");
  trTexto.hidden = true;
  const celula = criar("td");
  celula.colSpan = colunas;
  celula.append(destacar(trecho, destaques));
  trTexto.append(celula);
  const rotulo = botao.textContent;
  botao.addEventListener("click", () => {
    trTexto.hidden = !trTexto.hidden;
    botao.textContent = trTexto.hidden ? rotulo : "fechar";
  });
  return [tr, trTexto];
}

function botaoPequeno(rotulo) {
  const b = criar("button", "botao pequeno", rotulo);
  b.type = "button";
  return b;
}

/* ---------------------------------------------------------------- proprietários */

function conferir() {
  const area = numeroBr($("mat-area").value.trim());
  const soma = donos.reduce((s, d) => s + (d.hectares || 0), 0);
  const caixa = $("mat-confere");
  if (!donos.length) {
    caixa.className = "status ressalvas";
    caixa.textContent = "Nenhum proprietário na lista: leia os registros e adicione.";
  } else if (donos.some((d) => d.hectares === null)) {
    caixa.className = "status ressalvas";
    caixa.textContent = "Preencha os hectares de todos os proprietários.";
  } else if (area === null) {
    caixa.className = "status ressalvas";
    caixa.textContent = `Soma dos proprietários: ${formatarHa(soma)} ha. Informe a área da matrícula para conferir.`;
  } else if (Math.abs(soma - area) <= MARGEM) {
    caixa.className = "status apto";
    caixa.textContent = `Confere: a soma dos proprietários é ${formatarHa(soma)} ha, igual à área da matrícula.`;
  } else {
    caixa.className = "status nao-apto";
    caixa.textContent = `Não confere: soma ${formatarHa(soma)} ha, área da matrícula ${formatarHa(area)} ha.`;
  }
}

function montarDonos() {
  const linhas = [];
  for (const dono of donos) {
    const tr = criar("tr");

    const nome = criar("input", "nome");
    nome.type = "text";
    nome.value = dono.nome;
    nome.setAttribute("aria-label", "Nome do proprietário");
    nome.addEventListener("input", () => { dono.nome = nome.value; });

    const area = criar("input", "area");
    area.type = "text";
    area.inputMode = "decimal";
    area.value = dono.hectares === null ? "" : formatarHa(dono.hectares);
    area.setAttribute("aria-label", `Hectares de ${dono.nome || "proprietário"}`);
    area.addEventListener("input", () => {
      const valor = area.value.trim();
      dono.hectares = valor ? numeroBr(valor) : null;
      area.classList.toggle("invalido", valor !== "" && dono.hectares === null);
      conferir();
    });

    const onde = criar("td", "onde", dono.pagina ? `Pág. ${dono.pagina}, ${dono.ato} ` : "Digitado ");
    const ver = botaoPequeno("ver trecho");
    if (dono.trecho) onde.append(ver);

    const remover = botaoPequeno("remover");
    remover.addEventListener("click", () => {
      donos = donos.filter((d) => d !== dono);
      montarDonos();
    });

    const tdNome = criar("td");
    tdNome.append(nome);
    const tdArea = criar("td");
    tdArea.append(area);
    const tdAcao = criar("td");
    tdAcao.append(remover);
    tr.append(tdNome, tdArea, onde, tdAcao);
    linhas.push(...comTrecho(tr, 4, ver, dono.trecho || "", dono.destaques));
  }
  $("mat-donos").replaceChildren(...linhas);
  conferir();
}

/* ---------------------------------------------------------------- resultado */

function dePara(ato) {
  if (ato.tipo !== "transferencia") return "-";
  const lista = (n) => (n.length ? n.join(", ") : "não identificado");
  return `${lista(ato.transmitentes)} → ${lista(ato.adquirentes)}`;
}

function mostrarResultado() {
  $("mat-numero").textContent = resultado.matricula ? `matrícula ${resultado.matricula}` : "";
  $("mat-area").value = resultado.areaAtual === null ? "" : formatarHa(resultado.areaAtual);
  $("mat-avisos").replaceChildren(...resultado.avisos.map((a) => criar("div", "aviso-linha", a)));

  const linhas = [];
  for (const ato of resultado.atos) {
    const tr = criar("tr");
    const ver = botaoPequeno("ver texto");
    const td = criar("td");
    td.append(ver);
    tr.append(
      criar("td", "", ato.codigo), criar("td", "", String(ato.pagina)), criar("td", "", ROTULOS[ato.tipo]),
      criar("td", "", dePara(ato)), criar("td", "", ato.areaHa === null ? "-" : `${formatarHa(ato.areaHa)} ha`), td,
    );
    linhas.push(...comTrecho(tr, 6, ver, ato.trecho, ato.destaques));
  }
  $("mat-atos").replaceChildren(...linhas);

  const textos = [];
  for (const p of paginasLidas) {
    textos.push(criar("h3", "", `Página ${p.numero} (${p.ocr ? "OCR" : "texto do PDF"}) - ${p.arquivo}`));
    textos.push(criar("pre", "texto-pagina", p.texto.trim() || "(nenhum texto lido)"));
  }
  $("mat-textos").replaceChildren(...textos);

  montarDonos();
  $("mat-zona").hidden = true;
  $("mat-resultado").hidden = false;
}

function novaMatricula() {
  resultado = null;
  donos = [];
  paginasLidas = [];
  $("mat-resultado").hidden = true;
  $("mat-zona").hidden = false;
  $("mat-msg").textContent = "";
  $("mat-erro").hidden = true;
}

/* ---------------------------------------------------------------- saída */

function resumo() {
  return donos.map((d) => {
    const area = d.hectares === null ? "? hectares" : `${formatarHa(d.hectares)} hectares`;
    const onde = d.pagina ? `Pág. ${d.pagina} (${d.ato})` : "digitado";
    return `${d.nome} - ${area} - ${onde}`;
  }).join("\n");
}

async function copiarResumo() {
  try {
    await navigator.clipboard.writeText(resumo());
    $("mat-msg").textContent = "Resumo copiado.";
  } catch {
    $("mat-msg").textContent = "Não foi possível copiar. Use o relatório CSV.";
  }
}

function baixarRelatorio() {
  const linhas = [["Proprietário", "Hectares", "Página", "Registro"]];
  for (const d of donos) linhas.push([d.nome, d.hectares === null ? "" : formatarHa(d.hectares), d.pagina || "", d.ato || ""]);
  linhas.push([], ["Área atual da matrícula (ha)", $("mat-area").value]);
  linhas.push([], ["Pontos de atenção"], ...resultado.avisos.map((a) => [a]));
  linhas.push([], ["Registro", "Página", "O que é", "De / para", "Área (ha)"]);
  for (const a of resultado.atos) {
    linhas.push([a.codigo, a.pagina, ROTULOS[a.tipo], dePara(a), a.areaHa === null ? "" : formatarHa(a.areaHa)]);
  }
  const numero = resultado.matricula || "sem numero";
  baixar(csvDeLinhas(linhas), `matricula ${numero} - analise.csv`);
}

/* ---------------------------------------------------------------- início */

/** cfg e ocr são os mesmos da página; trava = { ocupado } evita duas leituras ao mesmo tempo. */
export function iniciarMatricula(cfg, ocr, trava) {
  async function receber(arquivos) {
    if (!arquivos.length) return;
    $("mat-erro").hidden = true;
    if (trava.ocupado) {
      $("mat-erro").textContent = "Aguarde terminar a leitura atual.";
      $("mat-erro").hidden = false;
      return;
    }
    trava.ocupado = true;
    $("mat-zona").hidden = true;
    $("mat-lendo").hidden = false;
    $("mat-lendo-ocr").textContent = "";
    try {
      const { paginas, problemas } = await lerPaginasMatricula(arquivos, cfg, ocr, (m) => {
        $("mat-lendo-texto").textContent = m;
      });
      if (!paginas.length) throw new Error(problemas.join("; ") || "nenhuma página lida");
      paginasLidas = paginas;
      resultado = analisarMatricula(paginas);
      resultado.avisos = [...problemas, ...resultado.avisos];
      donos = resultado.donos.map((d) => ({ ...d }));
      mostrarResultado();
    } catch (e) {
      $("mat-erro").textContent = `Não foi possível analisar: ${(e && e.message) || e}`;
      $("mat-erro").hidden = false;
      $("mat-zona").hidden = false;
    } finally {
      $("mat-lendo").hidden = true;
      trava.ocupado = false;
    }
  }

  ligarEnvio($("mat-zona"), $("mat-arquivos"), receber);
  $("mat-area").addEventListener("input", conferir);
  $("mat-adicionar").addEventListener("click", () => {
    donos.push({ nome: "", hectares: null, pagina: "", ato: "digitado", trecho: "", destaques: [] });
    montarDonos();
  });
  $("mat-copiar").addEventListener("click", copiarResumo);
  $("mat-relatorio").addEventListener("click", baixarRelatorio);
  $("mat-nova").addEventListener("click", novaMatricula);
}
