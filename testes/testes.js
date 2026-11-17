// Testes simples sem bibliotecas: abra testes/index.html por um servidor local.

import { configuracoes as cfg } from "../config/configuracoes.js";
import { tipos as tiposBrutos } from "../config/tipos.js";
import { compilarTipos, classificarConteudo, aplicarFallbackPasta, contemAproximado } from "../js/classificador.js";
import { bancos } from "../config/bancos.js";
import { planejar, caminhoDestino } from "../js/organizador.js";
import { validar } from "../js/validador.js";
import { normalizar, sanitizar } from "../js/util.js";
import { detectarPasta } from "../js/zipLeitor.js";

const tipos = compilarTipos(tiposBrutos);
const resultados = [];

function teste(nome, fn) {
  try { fn(); resultados.push({ nome, ok: true }); }
  catch (e) { resultados.push({ nome, ok: false, erro: e.message }); }
}
function igual(real, esperado, rotulo = "") {
  if (real !== esperado) throw new Error(`${rotulo} esperado "${esperado}", veio "${real}"`);
}
function classificar(texto, nome = "arquivo", pasta = null) {
  return classificarConteudo(texto, nome, pasta, tipos, false);
}

teste("normalizar tira acentos e espaços", () => {
  igual(normalizar("  Certidão   de CASAMENTO "), "certidao de casamento");
});

teste("sanitizar remove caracteres inválidos", () => {
  igual(sanitizar('a/b:c*?.pdf. '), "a_b_c__.pdf");
});

teste("RG pelo conteúdo", () => {
  const c = classificar("REPUBLICA FEDERATIVA DO BRASIL REGISTRO GERAL Secretaria de Seguranca Publica Data de expedicao 01/01/2020 Filiacao Maria", "scan001", "pessoais");
  igual(c.tipo, "RG");
});

teste("CPF não vira RG nem CNH", () => {
  igual(classificar("Comprovante de inscricao no CPF Cadastro de Pessoas Fisicas Situacao cadastral REGULAR").tipo, "CPF");
});

teste("conta de energia é comprovante de residência", () => {
  igual(classificar("CPFL Energia Conta de energia eletrica Unidade consumidora 12345 kWh consumo vencimento 10/10").tipo, "COMPROVANTE_RESIDENCIA");
});

teste("CAR pelo conteúdo", () => {
  igual(classificar("CADASTRO AMBIENTAL RURAL Recibo de inscricao do imovel rural no CAR Reserva legal Modulos fiscais").tipo, "CAR");
});

teste("CAR pelo código de inscrição (regex)", () => {
  igual(classificar("SP-3550308-F2E4.1C7B.9A3D.4E6F.8B2A.1D5C.7E9F.3A0B Reserva legal").tipo, "CAR");
});

teste("CCIR não é confundido com CAR", () => {
  igual(classificar("Certificado de Cadastro de Imovel Rural - CCIR INCRA Modulo rural").tipo, "CCIR");
});

teste("nota fiscal DANFE", () => {
  igual(classificar("DANFE Documento Auxiliar da Nota Fiscal Eletronica Natureza da operacao: VENDA").tipo, "NF");
});

teste("conta de energia com 'nota fiscal' não vira NF", () => {
  const c = classificar("Nota Fiscal Fatura de Energia Eletrica Unidade consumidora 123 kWh consumo vencimento chave de acesso");
  igual(c.tipo, "COMPROVANTE_RESIDENCIA");
});

teste("texto desconhecido fica sem tipo", () => {
  igual(classificar("texto qualquer sem relacao nenhuma", "outro", "terreno").tipo, null);
});

teste("fallback pela pasta NF", () => {
  const c = aplicarFallbackPasta(classificar("documento sem palavras conhecidas", "nota2", "nf"), "nf", cfg.fallbackPorPasta);
  igual(c.tipo, "NF");
  igual(c.metodo, "pasta");
});

teste("apelido no nome do arquivo ajuda", () => {
  igual(classificar("registro geral", "RG frente").tipo, "RG");
});

teste("fuzzy tolera erros de OCR", () => {
  igual(contemAproximado("cadastro ambiental rural", "cadastr0 ambiental rura1 recibo"), true);
  igual(contemAproximado("cadastro ambiental rural", "nota fiscal de venda"), false);
});

teste("OCR com erros ainda classifica (fuzzy ligado)", () => {
  const c = classificarConteudo("CADASTR0 AMBIENTAL RURAL Recibo de inscricao do imovel rural", "x", null, tipos, true);
  igual(c.tipo, "CAR");
});

teste("detectar pasta de origem", () => {
  igual(detectarPasta(["docs pessoais"]), "pessoais");
  igual(detectarPasta(["Docs Terreno"]), "terreno");
  igual(detectarPasta(["NF"]), "nf");
  igual(detectarPasta(["Notas Fiscais"]), "nf");
  igual(detectarPasta(["outra"]), null);
});

function doc(origem, tipo, confianca = 1) {
  return { origem, ext: ".pdf", tipo, confianca, metodo: "conteudo", observacao: "", dados: new ArrayBuffer(0), destinoPasta: "", destinoNome: "" };
}

teste("nomes, pastas e duplicados", () => {
  const plano = planejar(
    [doc("a/scan1.pdf", "RG"), doc("a/scan2.pdf", "NF"), doc("a/scan3.pdf", "NF"), doc("a/outro.pdf", null)],
    cfg, tipos, "Joao",
  );
  const nomes = plano.map((d) => `${d.destinoPasta}/${d.destinoNome}`).sort();
  igual(nomes.join("|"), ["NF/NF (2).pdf", "NF/NF.pdf", "_REVISAR/outro.pdf", "docs pessoais/RG.pdf"].sort().join("|"));
});

const banco = {
  nome: "Banco Teste",
  obrigatorios: [["RG", "CNH"], "CPF", ["MATRICULA", "CONTRATO_ARRENDAMENTO"]],
  opcionais: ["NF"],
};

teste("validação: falta documento = NÃO APTO", () => {
  const plano = planejar([doc("a.pdf", "RG"), doc("b.pdf", "CPF")], cfg, tipos, "Joao");
  const r = validar(plano, banco, tipos);
  igual(r.status, "NÃO APTO");
  igual(r.pendencias.length, 1);
});

teste("validação: alternativas e ressalvas", () => {
  const plano = planejar([doc("a.pdf", "CNH"), doc("b.pdf", "CPF"), doc("c.pdf", "CONTRATO_ARRENDAMENTO"), doc("d.pdf", null)], cfg, tipos, "Joao");
  const r = validar(plano, banco, tipos);
  igual(r.status, "APTO COM RESSALVAS");
  igual(r.pendencias.length, 0);
});

teste("validação: tudo certo = APTO", () => {
  const plano = planejar([doc("a.pdf", "RG"), doc("b.pdf", "CPF"), doc("c.pdf", "MATRICULA")], cfg, tipos, "Joao");
  igual(validar(plano, banco, tipos).status, "APTO");
});

teste("validação: baixa confiança vira ressalva", () => {
  const plano = planejar([doc("a.pdf", "RG", 0.3), doc("b.pdf", "CPF"), doc("c.pdf", "MATRICULA")], cfg, tipos, "Joao");
  igual(validar(plano, banco, tipos).status, "APTO COM RESSALVAS");
});

/* ---- documentos dos checklists DLL e Tarken (textos baseados em documentos reais, sem dados pessoais) ---- */
const TEXTO_CND = "MINISTERIO DA FAZENDA Secretaria da Receita Federal do Brasil Procuradoria-Geral da Fazenda Nacional CERTIDAO NEGATIVA DE DEBITOS RELATIVOS AOS TRIBUTOS FEDERAIS E A DIVIDA ATIVA DA UNIAO Nome: FULANO CPF: 000";
const TEXTO_ITR = TEXTO_CND.replace("DA UNIAO", "DA UNIAO DE IMOVEL RURAL CIB: 1.715.490-1 Nome do Imovel: SITIO X Area total (em hectares): 9,3 Contribuinte:");

teste("CND de pessoa fisica", () => {
  igual(classificar(TEXTO_CND, "cnd - fulano", "pessoais").tipo, "CND");
});

teste("certidão do ITR não vira CND (mesmo título)", () => {
  igual(classificar(TEXTO_ITR, "itr - mat 1", "terreno").tipo, "ITR");
});

teste("extrato do CAF", () => {
  igual(classificar("Ministerio do Desenvolvimento Agrario Cadastro Nacional da Agricultura Familiar EXTRATO COMPLETO DA UNIDADE FAMILIAR DE PRODUCAO AGRARIA - CAF No UFPA Enquadramento PRONAF Condicao Comodatario", "caf", "pessoais").tipo, "CAF");
});

teste("termo de autorização SCR / BACEN", () => {
  igual(classificar("TERMO DE AUTORIZACAO SCR Ao assinar este Termo voce autoriza o Banco de Lage Landen a acessar suas informacoes no Sistema de Informacoes de Creditos (SCR) ou BACEN", "bacen").tipo, "TERMO_BACEN");
});

teste("pedido / proposta da revenda", () => {
  igual(classificar("DEPARTAMENTO COMERCIAL - ORCAMENTO / PEDIDO / PROPOSTA PEDIDO-CARTA-PROPOSTA TOTAL DO PEDIDO Validade da proposta Consultor de Vendas Condicoes de Pagamento", "pedido").tipo, "PEDIDO");
});

teste("pasta 'nf`s - cliente' é reconhecida como NF", () => {
  igual(detectarPasta(["nf`s - cliente"]), "nf");
});

teste("pedido fica na raiz e docs finais ficam intactos", () => {
  const finais = { ...doc("docs finais/ccb.pdf", null), ignorar: true };
  const plano = planejar([doc("pedido.pdf", "PEDIDO"), finais], cfg, tipos, "Joao");
  const mapa = Object.fromEntries(plano.map((d) => [d.origem, caminhoDestino(d)]));
  igual(mapa["pedido.pdf"], "PEDIDO.pdf");
  igual(mapa["docs finais/ccb.pdf"], "docs finais/ccb.pdf");
});

teste("validação ignora documentos de docs finais", () => {
  const plano = planejar([{ ...doc("docs finais/x.pdf", "CPF"), ignorar: true }], cfg, tipos, "Joao");
  igual(validar(plano, { nome: "T", obrigatorios: ["CPF"] }, tipos).status, "NÃO APTO");
});

teste("bancos só citam tipos que existem", () => {
  for (const [k, b] of Object.entries(bancos)) {
    for (const item of [...b.obrigatorios, ...(b.opcionais || [])]) {
      for (const t of [].concat(item)) if (!tipos[t]) throw new Error(`${k}: o tipo ${t} não existe em config/tipos.js`);
    }
  }
});

teste("todo tipo usa uma pasta configurada", () => {
  for (const t of Object.values(tipos)) {
    if (!(t.pasta in cfg.pastas)) throw new Error(`${t.chave}: pasta '${t.pasta}' não existe em configuracoes.js`);
  }
});

/* ---- saída ---- */
const falhas = resultados.filter((r) => !r.ok);
const resumo = document.getElementById("resumo");
resumo.textContent = falhas.length
  ? `${falhas.length} de ${resultados.length} teste(s) falharam`
  : `Todos os ${resultados.length} testes passaram`;
resumo.className = falhas.length ? "falha" : "ok";
const lista = document.getElementById("lista");
for (const r of resultados) {
  const li = document.createElement("li");
  li.className = r.ok ? "ok" : "falha";
  li.textContent = `${r.ok ? "OK    " : "FALHA "} ${r.nome}${r.ok ? "" : " -> " + r.erro}`;
  lista.append(li);
}
