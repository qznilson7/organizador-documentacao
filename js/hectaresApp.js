// Interface da página "Calcular hectares" (hectares.html).

import { configuracoes as cfg } from "../config/configuracoes.js";
import { tipos as tiposBrutos } from "../config/tipos.js";
import { compilarTipos } from "./classificador.js";
import { OCR } from "./extrator.js";
import { lerArquivoArea } from "./areasLeitura.js";
import { MODOS, consolidar, numeroBr, formatarHa } from "./areas.js";
import { csvDeLinhas } from "./relatorio.js";
import { $, criar, baixar, ligarEnvio } from "./dom.js";
import { iniciarMatricula } from "./matriculaApp.js";

const tipos = compilarTipos(tiposBrutos);
const ocr = new OCR(cfg.ocr.idioma, (msg) => {
  $("lendo-ocr").textContent = msg;
  $("mat-lendo-ocr").textContent = msg;
});
const trava = { ocupado: false }; // uma leitura por vez (o OCR é compartilhado)

const POSSES = { proprias: "Áreas próprias", arrendadas: "Áreas arrendadas" };
const TITULOS = { total: "Arraste os ITRs ou CCIRs", consolidada: "Arraste os CARs" };

const estado = {
  modo: "total",           // total | consolidada | matricula
  posse: "proprias",       // proprias | arrendadas
  listas: new Map(),       // "modo|posse" -> documentos lidos
  linhas: new Map(),       // id -> <tr>
  proximoId: 1,
};

function lista(modo = estado.modo, posse = estado.posse) {
  const chave = `${modo}|${posse}`;
  if (!estado.listas.has(chave)) estado.listas.set(chave, []);
  return estado.listas.get(chave);
}

/** Documento do tipo errado para o cálculo escolhido: não pode ser somado. */
function recusado(item) {
  return item.resultado.erro === MODOS[item.modo].recusa;
}

/* ---------------------------------------------------------------- tabela */

function textoLido(item) {
  const como = item.metodoTexto === "ocr" ? "OCR" : item.metodoTexto === "texto" ? "texto do PDF" : "nenhuma";
  const corpo = (item.texto || "").trim();
  return `Leitura: ${como}\n\n${corpo ? corpo.slice(0, 8000) : "(nenhum texto lido)"}`;
}

function adicionarLinha(item) {
  const tr = criar("tr");

  const tdSomar = criar("td");
  const caixa = criar("input");
  caixa.type = "checkbox";
  caixa.setAttribute("aria-label", `Somar ${item.arquivo}`);
  caixa.addEventListener("change", () => { item.somarManual = caixa.checked; atualizar(); });
  tdSomar.append(caixa);

  const tdArea = criar("td");
  const campo = criar("input", "area");
  campo.type = "text";
  campo.inputMode = "decimal";
  campo.setAttribute("aria-label", `Área em hectares de ${item.arquivo}`);
  campo.disabled = recusado(item);
  campo.addEventListener("input", () => {
    const valor = campo.value.trim();
    const numero = valor ? numeroBr(valor) : null;
    campo.classList.toggle("invalido", valor !== "" && numero === null);
    item.areaManual = numero;
    // leitura que falhou (senha, formato etc.): quem digita a área quer somar
    if (item.resultado.erro && numero !== null) item.somarManual = true;
    atualizar();
  });
  tdArea.append(campo);

  const tdAcoes = criar("td", "botoes");
  const ver = criar("button", "botao pequeno", "ver texto");
  ver.type = "button";
  const remover = criar("button", "botao pequeno", "remover");
  remover.type = "button";
  tdAcoes.append(ver, remover);

  tr.append(tdSomar, criar("td", "origem", item.arquivo), criar("td", "imovel", item.resultado.imovel || "-"),
    tdArea, criar("td", "pessoas"), criar("td", "obs"), tdAcoes);

  const trTexto = criar("tr", "texto-linha");
  trTexto.hidden = true;
  const celula = criar("td");
  celula.colSpan = 7;
  celula.append(criar("pre", "", textoLido(item)));
  trTexto.append(celula);

  ver.addEventListener("click", () => {
    trTexto.hidden = !trTexto.hidden;
    ver.textContent = trTexto.hidden ? "ver texto" : "fechar";
  });
  remover.addEventListener("click", () => {
    const atual = lista();
    const i = atual.indexOf(item);
    if (i >= 0) atual.splice(i, 1);
    montarTabela();
    atualizar();
  });

  $("linhas").append(tr, trTexto);
  estado.linhas.set(item.id, tr);
}

function montarTabela() {
  $("linhas").replaceChildren();
  estado.linhas.clear();
  for (const item of lista()) adicionarLinha(item);
}

function celulaPessoas(i) {
  if (!i.resultado.pessoas.length) return [criar("div", "", "-")];
  return i.resultado.pessoas.map((p) => {
    if (p.percentual === null || p.percentual === undefined) return criar("div", "", p.nome);
    const parte = i.area === null ? "-" : `${formatarHa((i.area * p.percentual) / 100)} ha`;
    return criar("div", "", `${p.nome} (${formatarHa(p.percentual)}%): ${parte}`);
  });
}

function situacao(i) {
  const partes = [...i.situacao];
  if (i.areaManual !== undefined && i.areaManual !== null && i.areaManual !== i.resultado.area) {
    partes.push("Área corrigida manualmente");
  }
  if (!partes.length) partes.push(i.somar ? "Lido" : "Não somado");
  return partes.join(" · ");
}

/* ---------------------------------------------------------------- totais */

function atualizar() {
  const c = consolidar(lista());
  for (const i of c.itens) {
    const tr = estado.linhas.get(i.id);
    if (!tr) continue;
    tr.classList.toggle("nao-soma", !i.somar);
    const caixa = tr.querySelector('input[type="checkbox"]');
    caixa.checked = i.somar;
    caixa.disabled = i.area === null || recusado(i);
    const campo = tr.querySelector("input.area");
    if (document.activeElement !== campo) {
      campo.value = i.area === null ? "" : formatarHa(i.area);
      campo.classList.remove("invalido");
    }
    tr.querySelector(".pessoas").replaceChildren(...celulaPessoas(i));
    tr.querySelector(".obs").textContent = situacao(i);
  }

  $("resultado").hidden = c.itens.length === 0;
  $("dropzone").classList.toggle("compacta", c.itens.length > 0);
  $("avisos").replaceChildren(...c.avisos.map((a) => criar("div", "aviso-linha", a)));

  $("por-pessoa").hidden = c.porPessoa.length === 0;
  $("por-pessoa").querySelector("tbody").replaceChildren(...c.porPessoa.map((p) => {
    const tr = criar("tr");
    tr.append(criar("td", "", p.nome), criar("td", "", `${formatarHa(p.hectares)} ha`));
    return tr;
  }));

  if (estado.modo === "matricula") return;
  const qual = estado.modo === "total" ? "área total" : "área consolidada";
  let geral = 0;
  for (const [posse, rotulo] of Object.entries(POSSES)) {
    const total = consolidar(lista(estado.modo, posse)).total;
    geral += total;
    const caixa = $(`m-${posse}`);
    caixa.querySelector("span").textContent = `${rotulo}, ${qual}`;
    caixa.querySelector("strong").textContent = formatarHa(total);
    caixa.classList.toggle("ativa", posse === estado.posse);
  }
  $("soma-geral").textContent = formatarHa(geral);
}

function mostrar() {
  for (const [atributo, valor] of [["modo", estado.modo], ["posse", estado.posse]]) {
    for (const b of document.querySelectorAll(`[data-${atributo}]`)) {
      const ativo = b.dataset[atributo] === valor;
      b.classList.toggle("ativo", ativo);
      b.setAttribute("aria-pressed", String(ativo));
    }
  }
  const matricula = estado.modo === "matricula";
  $("matricula").hidden = !matricula;
  $("calculo").hidden = matricula;
  $("bloco-posse").hidden = matricula;
  $("msg").textContent = "";
  if (matricula) return;
  const posse = estado.posse === "proprias" ? "próprias" : "arrendadas";
  $("dz-titulo").textContent = `${TITULOS[estado.modo]} das áreas ${posse}`;
  $("col-area").textContent = estado.modo === "total" ? "Área total (ha)" : "Consolidada (ha)";
  montarTabela();
  atualizar();
}

/* ---------------------------------------------------------------- leitura */

async function receber(arquivos) {
  if (!arquivos.length || estado.modo === "matricula") return;
  if (trava.ocupado) {
    $("msg").textContent = "Aguarde terminar a leitura atual.";
    return;
  }
  trava.ocupado = true;
  const modo = estado.modo;
  const destino = lista(); // a lista escolhida no momento do envio
  $("msg").textContent = "";
  $("lendo").hidden = false;
  try {
    for (let i = 0; i < arquivos.length; i++) {
      $("barra").value = (i / arquivos.length) * 100;
      $("lendo-texto").textContent = `Lendo ${i + 1} de ${arquivos.length}: ${arquivos[i].name}`;
      $("lendo-ocr").textContent = "";
      const lido = await lerArquivoArea(arquivos[i], modo, cfg, tipos, ocr);
      const item = { ...lido, modo, id: estado.proximoId++ };
      destino.push(item);
      if (estado.modo !== "matricula") {
        if (destino === lista()) adicionarLinha(item);
        atualizar();
      }
      await new Promise((r) => setTimeout(r, 0)); // deixa a tela atualizar
    }
  } finally {
    $("lendo").hidden = true;
    trava.ocupado = false;
  }
}

/* ---------------------------------------------------------------- relatório */

function gerarRelatorio() {
  const modo = estado.modo;
  const calculo = MODOS[modo].rotulo;
  const linhas = [["Cálculo", "Tipo de área", "Arquivo", "Documento", "Imóvel", "Área (ha)", "Somado", "Proprietários / titulares", "Situação"]];
  const totais = [];
  const titulares = [];
  let geral = 0;
  let quantidade = 0;
  for (const [posse, rotulo] of Object.entries(POSSES)) {
    const c = consolidar(lista(modo, posse));
    quantidade += c.itens.length;
    geral += c.total;
    totais.push([rotulo, formatarHa(c.total)]);
    for (const p of c.porPessoa) titulares.push([rotulo, p.nome, formatarHa(p.hectares)]);
    for (const i of c.itens) {
      linhas.push([
        calculo, rotulo, i.arquivo, i.resultado.tipo, i.resultado.imovel,
        i.area === null ? "" : formatarHa(i.area), i.somar ? "Sim" : "Não",
        celulaPessoas(i).map((d) => d.textContent).join(" | "), situacao(i),
      ]);
    }
  }
  if (!quantidade) {
    $("msg").textContent = "Envie os documentos antes de baixar o relatório.";
    return;
  }
  linhas.push([], ["Totais (ha)"], ...totais, ["Soma das duas", formatarHa(geral)]);
  if (titulares.length) linhas.push([], ["Hectares por titular"], ...titulares);
  baixar(csvDeLinhas(linhas), `hectares - ${modo === "total" ? "area total" : "area consolidada"}.csv`);
}

async function copiarTotal() {
  const total = formatarHa(consolidar(lista()).total);
  try {
    await navigator.clipboard.writeText(total);
    $("msg").textContent = `Copiado: ${total} ha (${POSSES[estado.posse].toLowerCase()}).`;
  } catch {
    $("msg").textContent = `Não foi possível copiar. Total: ${total} ha.`;
  }
}

/* ---------------------------------------------------------------- eventos */

function ligarEventos() {
  for (const b of document.querySelectorAll("[data-modo]")) {
    b.addEventListener("click", () => { estado.modo = b.dataset.modo; mostrar(); });
  }
  for (const b of document.querySelectorAll("[data-posse]")) {
    b.addEventListener("click", () => { estado.posse = b.dataset.posse; mostrar(); });
  }

  ligarEnvio($("dropzone"), $("arquivos"), receber);
  // soltar fora da área não deve fazer o navegador abrir o arquivo
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());

  $("limpar").addEventListener("click", () => {
    if (trava.ocupado) { $("msg").textContent = "Aguarde terminar a leitura atual."; return; }
    lista().length = 0;
    montarTabela();
    atualizar();
  });
  $("relatorio").addEventListener("click", gerarRelatorio);
  $("copiar").addEventListener("click", copiarTotal);
}

ligarEventos();
iniciarMatricula(cfg, ocr, trava);
mostrar();
