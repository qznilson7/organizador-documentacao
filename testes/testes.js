// Testes simples sem bibliotecas: abra testes/index.html por um servidor local.

import { configuracoes as cfg } from "../config/configuracoes.js";
import { tipos as tiposBrutos } from "../config/tipos.js";
import { compilarTipos, classificarConteudo, aplicarFallbackPasta, contemAproximado } from "../js/classificador.js";
import { bancos } from "../config/bancos.js";
import { culturas } from "../config/culturas.js";
import { extrairPessoaConteudo, pessoaDoArquivo, extrairNota } from "../js/extracao.js";
import { marcarDuplicados, acharParecidos } from "../js/duplicados.js";
import { analisarArea, combinarLeituras, consolidar, numeroBr } from "../js/areas.js";
import { montarLinhas } from "../js/util.js";
import { analisarMatricula, areaDoImovel } from "../js/matricula.js";
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
  igual(nomes.join("|"), ["NF/nf (2).pdf", "NF/nf.pdf", "_REVISAR/outro.pdf", "docs pessoais/rg.pdf"].sort().join("|"));
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
const TEXTO_ITR = TEXTO_CND.replace("DA UNIAO", "DA UNIAO DE IMOVEL RURAL CIB: 1.234.567-8 Nome do Imovel: SITIO X Area total (em hectares): 9,3 Contribuinte:");

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
  igual(mapa["pedido.pdf"], "pedido.pdf");
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

/* ---- leitura da CNH (OCR com ruído), nomes, notas e duplicados ---- */
teste("CNH lida por OCR com letras erradas ainda é reconhecida", () => {
  const ocrRuim = "REPUBLICA FEDERATIVA DO BRASIL MINISTERIO DOS TRANSPORTES SECRETARIA NACIONAL DE TRANSITO CARTEIRA NAC1ONAL DE HABILITACA0 NOME FULANO DE TAL DOC. IDENTIDADE ORG EMISSOR CPF DATA NASCIMENTO FILIACAO PERMISSAO ACC CAT. HAB. REGISTRO VALIDADE 1A HABILITACAO";
  igual(classificarConteudo(ocrRuim, "scanner31314", null, tipos, true).tipo, "CNH");
});

teste("CNH com poucas palavras legíveis (só rótulos do cartão)", () => {
  const poucas = "MINISTERIO DOS TRANSPORTES SECRETARIA NACIONAL DE TRANSITO DOC. IDENTIDADE CAT. HAB. 1A HABILITACAO";
  igual(classificarConteudo(poucas, "scanner", null, tipos, true).tipo, "CNH");
});

teste("nome da pessoa no nome do arquivo", () => {
  igual(pessoaDoArquivo("docs pessoais/cnh - pedro exemplo.pdf"), "pedro exemplo");
  igual(pessoaDoArquivo("certidao de casamento - Maria Souza.pdf"), "Maria Souza");
  igual(pessoaDoArquivo("doc maria - esposa pedro.pdf"), "");          // relação: não dá para saber de quem é
  igual(pessoaDoArquivo("comprov de residencia - atual.pdf"), "");      // palavra genérica
  igual(pessoaDoArquivo("scanner31314.pdf"), "");
  igual(pessoaDoArquivo("r$ 13.710,40 - 12-2025.pdf"), "");
});

teste("nome da pessoa no conteúdo (CND, CNH)", () => {
  igual(extrairPessoaConteudo("CERTIDAO NEGATIVA Nome: JOAO DA SILVA CPF: 000.000.000-00 nao constam pendencias em seu nome, relativas a creditos"), "JOAO DA SILVA");
  igual(extrairPessoaConteudo("CARTEIRA NACIONAL DE HABILITACAO NOME E SOBRENOME CARLOS MODELO PEREIRA DOC. IDENTIDADE 123"), "CARLOS MODELO PEREIRA");
  igual(extrairPessoaConteudo("nao constam pendencias em seu nome, relativas a creditos tributarios"), "");
});

teste("nota: cultura, valor e ano lidos do conteúdo", () => {
  const n = extrairNota("DANFE Natureza da operacao VENDA DATA DA EMISSAO 15/03/2026 DESCRICAO DO PRODUTO SOJA EM GRAOS VALOR TOTAL DA NOTA 100.000,00", "nota1.pdf", culturas);
  igual(n.detalhe, "soja - r$ 100.000,00 - 2026");
  igual(n.mes, "03");
});

teste("nota: sem texto, usa valor e mês/ano do nome do arquivo", () => {
  const n = extrairNota("", "nf`s - cliente/r$ 13.710,40 - 12-2025.pdf", culturas);
  igual(n.detalhe, "nf - r$ 13.710,40 - 2025");
  igual(n.mes, "12");
});

teste("nome: minúsculas, sem acento e com a pessoa (docs pessoais)", () => {
  const plano = planejar(
    [{ ...doc("a/x1.pdf", "CNH"), detalhe: "João Ação" }, { ...doc("a/x2.pdf", "CNH"), detalhe: "maria souza" }, doc("a/x3.pdf", "RG")],
    cfg, tipos, "Joao",
  );
  const nomes = plano.map((d) => `${d.destinoPasta}/${d.destinoNome}`).sort();
  igual(nomes.join("|"), ["docs pessoais/cnh - joao acao.pdf", "docs pessoais/cnh - maria souza.pdf", "docs pessoais/rg.pdf"].join("|"));
});

teste("arquivo não identificado também fica em minúsculas e sem acento", () => {
  const plano = planejar([doc("Pasta/Meu Arquivo Ação.pdf", null)], cfg, tipos, "Joao");
  igual(plano[0].destinoNome, "meu arquivo acao.pdf");
});

teste("notas: mês só entra no nome quando há nomes repetidos", () => {
  const nota = (o, mes) => ({ ...doc(o, "NF"), detalhe: "leite - r$ 15.000,00 - 2025", mes });
  const unica = { ...doc("n/u.pdf", "NF"), detalhe: "soja - r$ 100.000,00 - 2026", mes: "03" };
  const plano = planejar([nota("n/a.pdf", "01"), nota("n/b.pdf", "02"), unica], cfg, tipos, "Joao");
  const nomes = plano.map((d) => d.destinoNome).sort();
  igual(nomes.join("|"), ["leite - r$ 15.000,00 - 2025 - 01.pdf", "leite - r$ 15.000,00 - 2025 - 02.pdf", "soja - r$ 100.000,00 - 2026.pdf"].join("|"));
});

function docHash(origem, tipo, hash, extra = {}) {
  return { ...doc(origem, tipo), dados: new ArrayBuffer(4), hash, ...extra };
}

teste("duplicado idêntico: remove a cópia e mantém uma", () => {
  const docs = [docHash("a/cnh1.pdf", "CNH", "h1"), docHash("b/cnh2.pdf", "CNH", "h1"), docHash("c/rg.pdf", "RG", "h2")];
  marcarDuplicados(docs);
  igual(docs.filter((d) => d.removido).length, 1);
  igual(docs[2].removido, false);
});

teste("duplicado idêntico de arquivo em docs finais: docs finais nunca é tocado", () => {
  const docs = [docHash("bacen reconhecido.pdf", "TERMO_BACEN", "h9"), docHash("docs finais/bacen - reconhecido.pdf", null, "h9", { ignorar: true })];
  marcarDuplicados(docs);
  igual(docs[0].removido, true);
  igual(docs[1].removido, false);
  igual(docs[0].duplicadoDe, "docs finais/bacen - reconhecido.pdf");
});

teste("duplicado removido ainda vale para o checklist do banco", () => {
  const docs = [docHash("a/cpf1.pdf", "CPF", "h1"), docHash("b/cpf2.pdf", "CPF", "h1")];
  marcarDuplicados(docs);
  const plano = planejar(docs, cfg, tipos, "Joao");
  igual(plano.filter((d) => d.removido).length, 1);
  igual(validar(plano, { nome: "T", obrigatorios: ["CPF"] }, tipos).status, "APTO");
});

teste("possíveis duplicados: textos quase iguais geram aviso; textos diferentes não", () => {
  const palavras = (n, pref) => Array.from({ length: n }, (_, i) => `${pref}${i}`).join(" ");
  const a = docHash("a.pdf", "CND", "h1", { texto: palavras(40, "palavra") });
  const b = docHash("b.pdf", "CND", "h2", { texto: palavras(40, "palavra") + " extra" });
  const c = docHash("c.pdf", "CND", "h3", { texto: palavras(40, "outro") });
  const pares = acharParecidos([a, b, c], 0.85);
  igual(pares.length, 1);
  igual(pares[0].a + "|" + pares[0].b, "a.pdf|b.pdf");
});

/* ---- cálculo de hectares (textos inventados, no formato dos documentos) ---- */
const ITR_AREA = [
  "CERTIDÃO NEGATIVA DE DÉBITOS RELATIVOS AOS TRIBUTOS FEDERAIS E À DÍVIDA ATIVA DA UNIÃO DE IMÓVEL RURAL",
  "CIB: 1.234.567-8",
  "Nome do Imóvel: SITIO EXEMPLO",
  "Município: CIDADE UF: PR",
  "Área total (em hectares): 9,3",
  "Contribuinte: PESSOA ALFA",
  "CPF: 000.000.000-01",
].join("\n");

function textoCCIR(codigo, cib, area, titulares) {
  return [
    "INSTITUTO NACIONAL DE COLONIZAÇÃO E REFORMA AGRÁRIA - INCRA",
    "CERTIFICADO DE CADASTRO DE IMÓVEL RURAL - CCIR",
    "CÓDIGO DO IMÓVEL RURAL DENOMINAÇÃO DO IMÓVEL RURAL",
    `${codigo} Sitio Exemplo`,
    "ÁREA TOTAL (ha) CLASSIFICAÇÃO FUNDIÁRIA DATA DO PROCESSAMENTO DA ÚLTIMA DECLARAÇÃO ÁREA CERTIFICADA7",
    `${area} Pequena Propriedade 08/11/2002 0,0000`,
    "MÓDULO RURAL (ha) Nº MÓDULOS RURAIS MÓDULO FISCAL (ha) FRAÇÃO MÍNIMA DE PARCELAMENTO (ha)",
    "20,2222 0,45 16,0000 2,00",
    "VINCULAÇÕES",
    "CIB CAR",
    cib,
    "DADOS DO DECLARANTE",
    "NOME CPF/CNPJ",
    "Pessoa Alfa 000.000.000-01",
    "DADOS DOS TITULARES",
    "CPF/CNPJ NOME CONDIÇÃO DETENÇÃO (%)",
    ...titulares,
    "DADOS DE CONTROLE",
  ].join("\n");
}
const CCIR_DOIS = textoCCIR("709.000.000.001-0", "22223333", "20,0000", [
  "000.000.000-01 Pessoa Alfa Proprietario Ou Posseiro Individual 50,00",
  "000.000.000-02 Pessoa Beta Da Silva Proprietario Ou Posseiro Comum 50,00",
]);
const CCIR_ITR = textoCCIR("709.000.000.002-0", "12345678", "9,3000", [
  "000.000.000-01 Pessoa Alfa Proprietario Ou Posseiro Individual 100,00",
]);

const CAR_AREA = [
  "RECIBO DE INSCRIÇÃO DO IMÓVEL RURAL NO CAR",
  "Registro no CAR: PR-4100000-ABCD1234ABCD1234ABCD1234ABCD1234 Data de Cadastro: 01/01/2020",
  "Nome do Imóvel Rural: SITIO EXEMPLO",
  "Área Total (ha) do Imóvel Rural: 26,9406 Módulos Fiscais: 1,68",
  "IDENTIFICAÇÃO DO PROPRIETÁRIO/POSSUIDOR",
  "CPF: 00000000001 Nome: PESSOA ALFA",
  "CPF: 00000000002 Nome:PESSOA BETA",
  "ÁREAS DECLARADAS (em hectares)",
  "Área Total do Imóvel 26,9406 Área Consolidada 23,1520",
  "Área de Preservação Permanente 4,3619 Reserva Legal",
].join("\n");

const area = (texto, modo, nome = "doc.pdf") => analisarArea(texto, nome, modo, tipos);

teste("números no formato brasileiro", () => {
  igual(numeroBr("9,3"), 9.3);
  igual(numeroBr("1.234,5600"), 1234.56);
  igual(numeroBr("23.1520"), 23.152);
  igual(numeroBr("abc"), null);
});

teste("linhas remontadas pela posição na página", () => {
  const item = (str, x, y, width = 10) => ({ str, width, transform: [1, 0, 0, 1, x, y] });
  igual(montarLinhas([item("9,3000", 30, 90), item("ÁREA", 30, 100, 20), item("TOTAL", 55, 100.5, 20)]), "ÁREA TOTAL\n9,3000");
});

teste("ITR: área total, CIB e contribuinte", () => {
  const r = area(ITR_AREA, "total", "itr - mat 1.pdf");
  igual(r.tipo, "ITR");
  igual(r.area, 9.3);
  igual(r.codigos[0], "cib:12345678");
  igual(r.pessoas[0].nome, "PESSOA ALFA");
});

teste("CCIR: pega a área total (não o módulo) e os titulares com percentual", () => {
  const r = area(CCIR_DOIS, "total", "ccir.pdf");
  igual(r.tipo, "CCIR");
  igual(r.area, 20);
  igual(r.pessoas.length, 2);
  igual(r.pessoas[1].nome, "Pessoa Beta Da Silva");
  igual(r.pessoas[1].percentual, 50);
  igual(r.avisos.length, 0);
});

teste("CCIR: percentuais que não somam 100% geram aviso", () => {
  const r = area(textoCCIR("709.000.000.003-0", "33334444", "10,0000", ["000.000.000-01 Pessoa Alfa Proprietario 50,00"]), "total", "ccir.pdf");
  igual(r.avisos.some((a) => a.includes("não 100%")), true);
});

teste("CAR: área consolidada inteira, com os dois proprietários", () => {
  const r = area(CAR_AREA, "consolidada", "car.pdf");
  igual(r.tipo, "CAR");
  igual(r.area, 23.152);
  igual(r.pessoas.map((p) => p.nome).join("|"), "PESSOA ALFA|PESSOA BETA");
  igual(r.codigos[0], "car:pr4100000abcd1234abcd1234abcd1234abcd1234");
  igual(r.avisos.length, 0);
});

teste("CAR: consolidada maior que a total gera aviso", () => {
  const r = area(CAR_AREA.replace("23,1520", "28,1520"), "consolidada", "car.pdf");
  igual(r.avisos.some((a) => a.includes("maior que a total")), true);
});

teste("documento do tipo errado é recusado", () => {
  igual(area(ITR_AREA, "consolidada").erro, "Não é CAR: não somado");
  igual(area(CAR_AREA, "total").erro, "Não é ITR nem CCIR: não somado");
});

teste("texto sem área reconhecível não é somado", () => {
  const r = area("documento qualquer sem nada de terreno", "total");
  igual(r.area, null);
  igual(consolidar([{ arquivo: "x.pdf", hash: "h", resultado: r }]).total, 0);
});

const item = (arquivo, hash, texto, modo = "total", extra = {}) => ({ arquivo, hash, resultado: area(texto, modo, arquivo), ...extra });

teste("soma: mesmo arquivo e mesmo imóvel (CIB) contam uma vez", () => {
  const c = consolidar([
    item("itr.pdf", "h1", ITR_AREA),
    item("itr copia.pdf", "h1", ITR_AREA),
    item("ccir do mesmo.pdf", "h2", CCIR_ITR),
    item("ccir outro.pdf", "h3", CCIR_DOIS),
  ]);
  igual(c.itens.map((i) => (i.somar ? "s" : "n")).join(""), "snns");
  igual(Math.round(c.total * 10000), 293000);
});

teste("soma: hectares de cada titular juntando os CCIRs", () => {
  const c = consolidar([item("a.pdf", "h1", CCIR_ITR), item("b.pdf", "h2", CCIR_DOIS)]);
  igual(c.porPessoa.map((p) => `${p.nome}=${Math.round(p.hectares * 100) / 100}`).join("|"), "Pessoa Alfa=19.3|Pessoa Beta Da Silva=10");
});

teste("soma: área digitada pelo usuário e caixa desmarcada", () => {
  const semArea = area(CAR_AREA.replace("Área Consolidada 23,1520", ""), "consolidada", "car.pdf");
  igual(semArea.area, null);
  const digitada = consolidar([{ arquivo: "car.pdf", hash: "h1", resultado: semArea, areaManual: 12.5 }]);
  igual(digitada.total, 12.5);
  const desmarcada = consolidar([item("car.pdf", "h2", CAR_AREA, "consolidada", { somarManual: false })]);
  igual(desmarcada.total, 0);
});

teste("duas leituras OCR diferentes geram aviso", () => {
  const a = area(CAR_AREA, "consolidada", "car.pdf");
  const b = area(CAR_AREA.replace("23,1520", "23,1820"), "consolidada", "car.pdf");
  igual(combinarLeituras(a, b).avisos.some((x) => x.startsWith("Duas leituras diferentes")), true);
});

/* ---- análise da matrícula (matrícula inventada, no formato datilografado de cartório) ---- */
const MAT_PAG1 = [
  "REGISTRO DE IMÓVEIS REGISTRO GERAL FICHA 01",
  "MATRÍCULA Nº 1.111",
  "IDENTIFICAÇÃO DO IMÓVEL: Um terreno rural com a área de quatro alqueires e 566,00 m2, ou sejam: dez (10) hecta-",
  "res, cinquenta (50) ares e zero (00) centiares. Consta no INCRA área total: 25,4 ha; módulo: 20,0 ha.",
  "PROPRIETÁRIOS: Sr. ALBERTO EXEMPLO SILVA, comerciante, e sua mulher Sra. BEATRIZ EXEMPLO SILVA, do lar.",
  "REGISTRO ANTERIOR: Nº 1-999, deste Ofício.",
  "R1-1.111. Protocolo nº 100.",
  "ADQUIRENTE: Sr. CARLOS MODELO, brasileiro, casado.",
  "TRANSMITENTES: Sr. ALBERTO EXEMPLO SILVA e sua mulher Sra. BEATRIZ EXEMPLO SILVA, já qualificados.",
  "TÍTULO: COMPRA E VENDA.",
  "FORMA: Escritura pública lavrada pelo Tabelião desta Comarca, Sr. NILO CARTORIO TESTE.",
  "VALOR: Cr$ 150.000,00.",
  "SEGUE NO VERSO",
].join("\n");
const MAT_PAG2 = [
  "CONTINUAÇÃO",
  "R.2-1111. Protocolo nº 200. Por escritura de compra e venda, pelo tab.vit.da com.sr.Nilo Cartorio Teste, o sr.Carlos",
  "Modelo, retro qualificado, vendeu a área de 80.000,",
  "00m2, ao sr. DANIEL AMOSTRA, brasileiro, solteiro.",
  "Av.3-1111. Protocolo nº 201. Procede-se esta averbação para constar que a área de 25.000 m2, ficou na Mat. 9999.",
  "R.4-1111. Protocolo nº 300. FINANCIADOR: BANCO TESTE S/A. TÍTULO: cédula rural hipotecária. EM HIPOTECA o imóvel do",
  "R.2-1111, livro 02.",
  "Serviço de Registro de Imóveis - CERTIFICO que esta fotocópia é fiel. Sr. ESCREVENTE QUALQUER",
].join("\n");
const matriculaTeste = () => analisarMatricula([{ numero: 1, texto: MAT_PAG1 }, { numero: 2, texto: MAT_PAG2 }]);

teste("matrícula: área por extenso (hectares, ares e centiares)", () => {
  igual(Math.round(areaDoImovel("onze (11) hectares, vinte e quatro (24) ares e noventa e um (91) centiares").ha * 10000), 112491);
});

teste("matrícula: separa os registros e ignora a citação de um registro anterior", () => {
  const r = matriculaTeste();
  igual(r.matricula, "1111");
  igual(r.atos.map((a) => a.codigo).join(","), "R-1,R-2,AV-3,R-4");
  igual(r.atos.map((a) => a.tipo).join(","), "transferencia,transferencia,area,onus");
});

teste("matrícula: dono atual, hectares e página onde achou", () => {
  const r = matriculaTeste();
  igual(r.areaInicial, 10.5);
  igual(r.areaAtual, 8);
  igual(r.donos.length, 1);
  igual(r.donos[0].nome, "Daniel Amostra");
  igual(r.donos[0].hectares, 8);
  igual(r.donos[0].pagina, 2);
  igual(r.donos[0].ato, "R-2");
});

teste("matrícula: tabelião não vira vendedor e ônus gera aviso", () => {
  const r = matriculaTeste();
  igual(r.atos[1].transmitentes.join("|"), "Carlos Modelo");
  igual(r.atos[1].adquirentes.join("|"), "Daniel Amostra");
  igual(r.avisos.some((a) => a.includes("ônus")), true);
});

teste("matrícula: dois compradores ficam sem área definida (não adivinha)", () => {
  const r = analisarMatricula([{ numero: 1, texto: MAT_PAG1 + "\nR.2-1111. Por compra e venda, o sr. Carlos Modelo vendeu a área de 10,5 ha ao sr. DANIEL AMOSTRA e ao sr. ELIAS AMOSTRA." }]);
  igual(r.donos.length, 2);
  igual(r.donos.every((d) => d.hectares === null), true);
  igual(r.avisos.some((a) => a.includes("mais de um comprador")), true);
});

teste("matrícula: texto sem registros avisa", () => {
  const r = analisarMatricula([{ numero: 1, texto: "texto qualquer" }]);
  igual(r.donos.length, 0);
  igual(r.avisos.some((a) => a.startsWith("Nenhum registro")), true);
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
