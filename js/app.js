// Interface: liga a tela (index.html) ao núcleo.

import { configuracoes as cfg } from "../config/configuracoes.js";
import { tipos as tiposBrutos } from "../config/tipos.js";
import { bancos } from "../config/bancos.js";
import { culturas } from "../config/culturas.js";
import { compilarTipos } from "./classificador.js";
import { processarZip } from "./analisador.js";
import { ErroZip } from "./zipLeitor.js";
import { OCR } from "./extrator.js";
import { extrairPessoa, extrairNota } from "./extracao.js";
import { marcarDuplicados, acharParecidos } from "./duplicados.js";
import { planejar, arvoreTexto, gerarZip, caminhoDestino } from "./organizador.js";
import { validar } from "./validador.js";
import { csvBlob, resumoBlob } from "./relatorio.js";
import { sanitizar } from "./util.js";

const $ = (id) => document.getElementById(id);
const tipos = compilarTipos(tiposBrutos);
const ocr = new OCR(cfg.ocr.idioma, (msg) => { $("proc-ocr").textContent = msg; });

const estado = {
  docs: [],                  // resultado automático da análise
  manual: new Map(),         // origem -> tipo escolhido pelo usuário (ou null)
  detalheManual: new Map(),  // origem -> nome da pessoa / detalhe da nota digitado pelo usuário
  cacheDetalhe: new Map(),   // "origem|tipo" -> detalhe lido do documento
  plano: [],                 // documentos com destino calculado
  parecidos: [],             // pares de possíveis duplicados
  res: null,                 // resultado da validação
  linhas: new Map(),         // origem -> <tr>
  ocupado: false,
};

/* ---------------------------------------------------------------- utilidades de tela */

function criar(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

function mostrarErro(msg) {
  const caixa = $("erro");
  caixa.textContent = msg;
  caixa.hidden = false;
}

function baixar(blob, nome) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

function atualizarStatusOcr() {
  const e = $("ocr-status");
  if (ocr.disponivel === true) e.textContent = `OCR ativo (idioma: ${ocr.idioma}).`;
  else if (ocr.disponivel === false) e.textContent = `OCR indisponível: ${ocr.motivo}. Só PDFs com texto selecionável foram lidos.`;
}

/* ---------------------------------------------------------------- banco */

function iniciarBancos() {
  const sel = $("banco");
  for (const [chave, b] of Object.entries(bancos)) sel.append(new Option(b.nome, chave));
  mostrarResumoBanco();
  sel.addEventListener("change", () => {
    mostrarResumoBanco();
    if (!$("resultado").hidden) atualizar();
  });
}

function mostrarResumoBanco() {
  const b = bancos[$("banco").value];
  $("banco-resumo").textContent = b ? `${(b.obrigatorios || []).length} exigência(s) obrigatória(s).` : "";
  const lembretes = (b && b.lembretes) || [];
  $("lembretes").hidden = lembretes.length === 0;
  $("lembretes").querySelector("ul").replaceChildren(...lembretes.map((t) => criar("li", "", t)));
}

/* ---------------------------------------------------------------- dados lidos do conteúdo */

function usaDetalhe(tipoChave) {
  const t = tipoChave ? tipos[tipoChave] : null;
  return !!t && (!!t.pessoa || t.formato === "nota");
}

/** Nome da pessoa (RG, CNH...) ou "cultura - valor - ano" (NF) lido do documento. */
function detalheAuto(d) {
  if (!usaDetalhe(d.tipo)) return { detalhe: "", mes: "", aviso: "" };
  const chave = `${d.origem}|${d.tipo}`;
  if (estado.cacheDetalhe.has(chave)) return estado.cacheDetalhe.get(chave);
  const t = tipos[d.tipo];
  let r;
  if (t.formato === "nota") {
    const n = extrairNota(d.texto, d.origem, culturas);
    const avisos = [n.aviso];
    if (d.metodoTexto === "ocr") avisos.push("lido por OCR: confira o valor");
    r = { detalhe: n.detalhe, mes: n.mes, aviso: avisos.filter(Boolean).join("; ") };
  } else {
    const nome = extrairPessoa(d.texto, d.origem, t.pessoa);
    r = { detalhe: nome, mes: "", aviso: nome ? "" : "nome da pessoa não encontrado: preencha" };
  }
  estado.cacheDetalhe.set(chave, r);
  return r;
}

/* ---------------------------------------------------------------- tabela */

function preencherOpcoes(select, atual) {
  select.append(new Option("(não identificado)", ""));
  const grupos = { pessoais: "Docs pessoais", terreno: "Docs terreno", nf: "Notas fiscais", raiz: "Raiz da pasta do cliente" };
  for (const [pasta, rotulo] of Object.entries(grupos)) {
    const g = document.createElement("optgroup");
    g.label = rotulo;
    for (const t of Object.values(tipos)) {
      if (t.pasta === pasta) g.append(new Option(t.descricao, t.chave));
    }
    select.append(g);
  }
  select.value = atual || "";
}

function textoLido(doc) {
  const cab = [`Leitura: ${doc.metodoTexto === "ocr" ? "OCR" : doc.metodoTexto === "texto" ? "texto do PDF" : "nenhuma"}`];
  if (doc.ocrConfianca !== undefined) cab.push(`confiança média do OCR: ${doc.ocrConfianca}%`);
  const corpo = (doc.texto || "").trim();
  return `${cab.join(" | ")}\n\n${corpo ? corpo.slice(0, 6000) : "(nenhum texto lido)"}`;
}

function montarTabela() {
  const corpo = $("tabela").querySelector("tbody");
  corpo.replaceChildren();
  estado.linhas.clear();
  for (const doc of estado.docs) {
    const tr = criar("tr");
    tr.append(criar("td", "origem", doc.origem));

    const tdTipo = criar("td");
    const sel = criar("select");
    sel.setAttribute("aria-label", `Tipo de ${doc.origem}`);
    preencherOpcoes(sel, doc.tipo);
    if (doc.ignorar) {
      sel.replaceChildren(new Option("(pasta ignorada)", ""));
      sel.disabled = true;
      tr.classList.add("ignorado");
    }
    sel.addEventListener("change", () => {
      const valor = sel.value || null;
      if (valor === doc.tipo) estado.manual.delete(doc.origem);
      else estado.manual.set(doc.origem, valor);
      estado.detalheManual.delete(doc.origem); // outro tipo, outro detalhe
      atualizar();
    });
    tdTipo.append(sel);
    tr.append(tdTipo);

    const tdDet = criar("td");
    const inp = criar("input", "detalhe");
    inp.type = "text";
    inp.setAttribute("aria-label", `Pessoa ou detalhe de ${doc.origem}`);
    inp.addEventListener("input", () => {
      const auto = detalheAuto({ ...doc, tipo: estado.manual.has(doc.origem) ? estado.manual.get(doc.origem) : doc.tipo }).detalhe;
      if (inp.value === auto) estado.detalheManual.delete(doc.origem);
      else estado.detalheManual.set(doc.origem, inp.value);
      atualizar();
    });
    tdDet.append(inp);
    tr.append(tdDet);

    tr.append(criar("td", "novo"));
    tr.append(criar("td", "conf-celula"));
    tr.append(criar("td", "obs"));

    // "ver texto lido": mostra o que o sistema enxergou no arquivo
    const tdTxt = criar("td");
    const botaoTxt = criar("button", "botao pequeno", "ver");
    botaoTxt.type = "button";
    tdTxt.append(botaoTxt);
    tr.append(tdTxt);
    corpo.append(tr);

    const trTxt = criar("tr", "texto-linha");
    trTxt.hidden = true;
    const celula = criar("td");
    celula.colSpan = 7;
    celula.append(criar("pre", "", textoLido(doc)));
    trTxt.append(celula);
    corpo.append(trTxt);
    botaoTxt.addEventListener("click", () => {
      trTxt.hidden = !trTxt.hidden;
      botaoTxt.textContent = trTxt.hidden ? "ver" : "fechar";
    });

    estado.linhas.set(doc.origem, tr);
  }
}

function distintivoConfianca(d) {
  if (!d.tipo) return criar("span", "conf nenhuma", "-");
  if (d.metodo === "manual") return criar("span", "conf", "manual");
  const pct = `${Math.round(d.confianca * 100)}%`;
  return criar("span", d.confianca >= 0.7 ? "conf" : "conf media", pct);
}

/* ---------------------------------------------------------------- cálculo e exibição */

/** Documentos com as correções do usuário e com pessoa/detalhe, mês e aviso preenchidos (cópias). */
function docsFinais() {
  return estado.docs.map((d) => {
    let f = { ...d };
    if (estado.manual.has(d.origem)) {
      const tipo = estado.manual.get(d.origem);
      f = { ...f, tipo, confianca: tipo ? 1 : 0, metodo: tipo ? "manual" : "nenhum", observacao: "Ajustado manualmente" };
    }
    const info = detalheAuto(f);
    f.detalheAuto = info.detalhe;
    f.mes = info.mes;
    f.avisoDetalhe = info.aviso;
    f.detalheDigitado = estado.detalheManual.has(d.origem);
    f.detalhe = f.detalheDigitado ? estado.detalheManual.get(d.origem) : info.detalhe;
    return f;
  });
}

function atualizar() {
  const cliente = $("cliente").value.trim() || "Cliente";
  const finais = docsFinais();
  marcarDuplicados(finais);
  estado.parecidos = acharParecidos(finais, cfg.duplicados.similaridadeMinima);
  estado.plano = planejar(finais, cfg, tipos, cliente);
  estado.cliente = cliente;
  estado.res = validar(estado.plano, bancos[$("banco").value], tipos, cfg.limites.confiancaMinimaOk);

  const parecidoCom = new Map();
  for (const p of estado.parecidos) {
    const pct = Math.round(p.similaridade * 100);
    if (!parecidoCom.has(p.a)) parecidoCom.set(p.a, `${p.b} (${pct}%)`);
    if (!parecidoCom.has(p.b)) parecidoCom.set(p.b, `${p.a} (${pct}%)`);
  }

  for (const d of estado.plano) {
    const tr = estado.linhas.get(d.origem);
    if (!tr) continue;
    const precisaNome = usaDetalhe(d.tipo);
    tr.classList.toggle("revisar", !d.tipo && !d.ignorar && !d.removido);
    tr.classList.toggle("removido", !!d.removido);

    const inp = tr.querySelector("input.detalhe");
    inp.disabled = !precisaNome || !!d.removido;
    inp.placeholder = !precisaNome ? "" : tipos[d.tipo].formato === "nota" ? "cultura - r$ valor - ano" : "nome da pessoa";
    if (document.activeElement !== inp) inp.value = precisaNome ? d.detalhe : "";

    tr.querySelector(".novo").textContent = d.removido ? "(removido: duplicado)" : caminhoDestino(d);
    tr.querySelector(".conf-celula").replaceChildren(distintivoConfianca(d));

    const obs = [];
    if (d.observacao && !(d.tipo && d.observacao === "Tipo não reconhecido")) obs.push(d.observacao);
    if (precisaNome && !d.removido) {
      if (!d.detalhe) obs.push(d.avisoDetalhe || "preencha a coluna Pessoa / detalhe");
      else if (d.avisoDetalhe && !d.detalheDigitado) obs.push(d.avisoDetalhe);
    }
    if (d.removido) obs.push(`Idêntico a ${d.duplicadoDe}: não vai para o ZIP`);
    if (parecidoCom.has(d.origem)) obs.push(`Parecido com ${parecidoCom.get(d.origem)}: confira`);
    tr.querySelector(".obs").textContent = obs.join(" · ");
  }

  renderChips();
  renderDuplicados();
  renderValidacao();
  $("arvore").textContent = arvoreTexto(estado.plano, cliente);
}

function renderChips() {
  const analisados = estado.plano.filter((d) => !d.ignorar);
  const ignorados = estado.plano.length - analisados.length;
  const nao = analisados.filter((d) => !d.tipo && !d.removido).length;
  const removidos = analisados.filter((d) => d.removido).length;
  const semNome = analisados.filter((d) => usaDetalhe(d.tipo) && !d.removido && !d.detalhe).length;
  const chips = $("chips");
  chips.replaceChildren(
    criar("span", "chip", `${analisados.length} arquivo(s)`),
    criar("span", "chip", `${analisados.length - nao - removidos} identificado(s)`),
  );
  if (nao) chips.append(criar("span", "chip alerta", `${nao} para revisar`));
  if (semNome) chips.append(criar("span", "chip alerta", `${semNome} sem nome/detalhe`));
  if (removidos) chips.append(criar("span", "chip", `${removidos} duplicado(s) removido(s)`));
  if (ignorados) chips.append(criar("span", "chip", `${ignorados} em docs finais (não analisados)`));
}

function renderDuplicados() {
  const removidos = estado.plano.filter((d) => d.removido);
  const caixa = $("duplicados");
  const blocos = [];
  if (removidos.length) {
    const b = criar("div", "dup-bloco");
    b.append(criar("h3", "", "Duplicados idênticos (byte a byte) removidos do ZIP"));
    const ul = criar("ul");
    for (const d of removidos) ul.append(criar("li", "", `${d.origem}  (igual a ${d.duplicadoDe})`));
    b.append(ul);
    blocos.push(b);
  }
  if (estado.parecidos.length) {
    const b = criar("div", "dup-bloco aviso");
    b.append(criar("h3", "", "Possíveis duplicados: diferem em algo, nada foi removido. Confira"));
    const ul = criar("ul");
    for (const p of estado.parecidos) ul.append(criar("li", "", `${p.a}  e  ${p.b}  (${Math.round(p.similaridade * 100)}% parecidos)`));
    b.append(ul);
    blocos.push(b);
  }
  caixa.replaceChildren(...blocos);
}

function itemChecklist(item, opcional) {
  const li = criar("li", item.atendido ? "sim" : opcional ? "opc" : "nao");
  li.append(criar("span", "marca-item", item.atendido ? "✓" : opcional ? "–" : "✕"));
  const corpo = criar("div", "", item.descricao);
  if (item.encontrados.length) corpo.append(criar("small", "", item.encontrados.join(", ")));
  li.append(corpo);
  return li;
}

function renderValidacao() {
  const r = estado.res;
  const s = $("status");
  const banco = r.banco || "o banco";
  if (r.status === "APTO") {
    s.className = "status apto";
    s.textContent = `Apto para ${banco}`;
  } else if (r.status === "APTO COM RESSALVAS") {
    s.className = "status ressalvas";
    s.textContent = `Apto com ressalvas para ${banco}`;
  } else {
    s.className = "status nao-apto";
    s.textContent = `Não apto para ${banco}: ${r.pendencias.length} pendência(s)`;
  }
  $("lista-obrig").replaceChildren(...r.obrigatorios.map((i) => itemChecklist(i, false)));
  $("lista-opc").replaceChildren(...r.opcionais.map((i) => itemChecklist(i, true)));
  $("avisos").replaceChildren(...r.avisos.map((a) => criar("div", "aviso-linha", a)));
}

/* ---------------------------------------------------------------- fluxo principal */

async function tratarArquivo(arquivo) {
  if (!arquivo || estado.ocupado) return;
  $("erro").hidden = true;
  if (!/\.zip$/i.test(arquivo.name)) {
    mostrarErro("Envie um arquivo .zip com a pasta do cliente.");
    return;
  }

  estado.ocupado = true;
  $("envio").hidden = true;
  $("resultado").hidden = true;
  $("processando").hidden = false;
  $("barra").value = 0;
  $("proc-texto").textContent = "Lendo o ZIP...";
  $("proc-ocr").textContent = "";

  try {
    const { cliente, docs } = await processarZip(arquivo, cfg, tipos, ocr, (i, n, nome) => {
      $("barra").value = n ? (i / n) * 100 : 0;
      $("proc-texto").textContent = i < n ? `Analisando ${i + 1} de ${n}: ${nome}` : "Concluído";
    });
    estado.docs = docs;
    estado.manual.clear();
    estado.detalheManual.clear();
    estado.cacheDetalhe.clear();
    $("cliente").value = cliente;
    montarTabela();
    atualizar();
    $("processando").hidden = true;
    $("resultado").hidden = false;
  } catch (e) {
    $("processando").hidden = true;
    $("envio").hidden = false;
    mostrarErro(e instanceof ErroZip ? e.message : `Não foi possível processar o ZIP: ${(e && e.message) || e}`);
  } finally {
    estado.ocupado = false;
    atualizarStatusOcr();
  }
}

function novoCliente() {
  estado.docs = [];
  estado.manual.clear();
  estado.detalheManual.clear();
  estado.cacheDetalhe.clear();
  estado.plano = [];
  estado.parecidos = [];
  estado.linhas.clear();
  $("tabela").querySelector("tbody").replaceChildren();
  $("resultado").hidden = true;
  $("envio").hidden = false;
  $("erro").hidden = true;
}

function ligarEventos() {
  const zona = $("dropzone");
  const entrada = $("arquivo");

  entrada.addEventListener("click", (e) => e.stopPropagation());
  zona.addEventListener("click", () => entrada.click());
  zona.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); entrada.click(); }
  });
  entrada.addEventListener("change", () => {
    const arq = entrada.files[0];
    entrada.value = "";
    tratarArquivo(arq);
  });
  zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("sobre"); });
  zona.addEventListener("dragleave", () => zona.classList.remove("sobre"));
  zona.addEventListener("drop", (e) => {
    e.preventDefault();
    zona.classList.remove("sobre");
    tratarArquivo(e.dataTransfer.files[0]);
  });
  // Evita que soltar o arquivo fora da área faça o navegador abrir o ZIP
  window.addEventListener("dragover", (e) => e.preventDefault());
  window.addEventListener("drop", (e) => e.preventDefault());

  $("cliente").addEventListener("input", atualizar);
  $("novo").addEventListener("click", novoCliente);

  $("baixar-zip").addEventListener("click", async (e) => {
    const botao = e.currentTarget;
    const rotulo = botao.textContent;
    botao.disabled = true;
    botao.textContent = "Gerando ZIP...";
    try {
      baixar(await gerarZip(estado.plano, cfg, estado.cliente), `${sanitizar(estado.cliente)}.zip`);
    } catch (err) {
      window.alert(`Não foi possível gerar o ZIP: ${(err && err.message) || err}`);
    } finally {
      botao.disabled = false;
      botao.textContent = rotulo;
    }
  });
  $("baixar-csv").addEventListener("click", () =>
    baixar(csvBlob(estado.plano), `${sanitizar(estado.cliente)} - relatorio.csv`));
  $("baixar-resumo").addEventListener("click", () => {
    const extras = {
      removidos: estado.plano.filter((d) => d.removido).map((d) => ({ origem: d.origem, duplicadoDe: d.duplicadoDe })),
      parecidos: estado.parecidos,
    };
    baixar(resumoBlob(estado.cliente, estado.res, extras), `${sanitizar(estado.cliente)} - validacao.txt`);
  });
}

iniciarBancos();
ligarEventos();
