// Tipos de documentos e como reconhecê-los.
//
// pasta:        pessoais | terreno | nf   (em qual pasta o documento vai)
// nomeArquivo:  nome usado ao renomear (ex.: "RG" -> RG.pdf)
// apelidos:     palavras no NOME ORIGINAL do arquivo que ajudam (ex.: "rg", "cnh")
// palavras:     termos buscados no TEXTO do documento (sem diferenciar acentos/maiúsculas)
//                 forte = 3 pontos | medio = 2 pontos | fraco = 1 ponto
//                 Para expressão regular, use uma regex JS: /padrao/
// exclui:       termos que, se aparecerem, descontam 3 pontos (evita confusão entre tipos)
//
// O documento é aceito com 3+ pontos e pelo menos 1 ponto de vantagem sobre o 2º colocado.
// Para ensinar um novo documento ao sistema, copie um bloco e ajuste.

export const tipos = {

  // ---------------- DOCS PESSOAIS ----------------
  RG: {
    nomeArquivo: "RG",
    descricao: "RG - Registro Geral / Identidade",
    pasta: "pessoais",
    apelidos: ["rg", "identidade"],
    palavras: {
      forte: ["registro geral", "carteira de identidade", "carteira de identidade nacional", "instituto de identificacao", "secretaria de seguranca publica"],
      medio: ["data de expedicao", "orgao expedidor", "naturalidade"],
      fraco: ["filiacao", "doc origem"],
    },
    exclui: ["carteira nacional de habilitacao"],
  },

  CNH: {
    nomeArquivo: "CNH",
    descricao: "CNH - Carteira Nacional de Habilitação",
    pasta: "pessoais",
    apelidos: ["cnh", "habilitacao"],
    palavras: {
      forte: ["carteira nacional de habilitacao", "permissao para dirigir"],
      medio: ["registro nacional", "cat hab", "primeira habilitacao", "detran"],
      fraco: ["observacoes", "validade"],
    },
  },

  CPF: {
    nomeArquivo: "CPF",
    descricao: "CPF - Cadastro de Pessoas Físicas",
    pasta: "pessoais",
    apelidos: ["cpf"],
    palavras: {
      forte: ["comprovante de inscricao no cpf", "cadastro de pessoas fisicas"],
      medio: ["situacao cadastral", "ministerio da fazenda"],
      fraco: ["receita federal"],
    },
    exclui: ["carteira nacional de habilitacao", "registro geral"],
  },

  CERTIDAO_CASAMENTO: {
    nomeArquivo: "CERTIDAO DE CASAMENTO",
    descricao: "Certidão de casamento",
    pasta: "pessoais",
    apelidos: ["casamento", "certidao"],
    palavras: {
      forte: ["certidao de casamento"],
      medio: ["regime de bens", "contraentes", "conjuge"],
      fraco: ["oficial de registro civil", "cartorio"],
    },
  },

  CERTIDAO_NASCIMENTO: {
    nomeArquivo: "CERTIDAO DE NASCIMENTO",
    descricao: "Certidão de nascimento",
    pasta: "pessoais",
    apelidos: ["nascimento"],
    palavras: {
      forte: ["certidao de nascimento"],
      medio: ["data de nascimento", "local de nascimento"],
      fraco: ["oficial de registro civil", "cartorio"],
    },
  },

  COMPROVANTE_RESIDENCIA: {
    nomeArquivo: "COMPROVANTE DE RESIDENCIA",
    descricao: "Comprovante de residência",
    pasta: "pessoais",
    apelidos: ["residencia", "endereco", "comprovante"],
    palavras: {
      forte: ["comprovante de residencia", "comprovante de endereco", "unidade consumidora", "conta de energia", "fatura de energia", "energia eletrica", "conta de agua"],
      medio: ["leitura anterior", "leitura atual", "kwh", "consumo", "vencimento"],
      fraco: ["fatura", "codigo do cliente"],
    },
  },

  DECLARACAO_IR: {
    nomeArquivo: "IR",
    descricao: "Declaração de Imposto de Renda",
    pasta: "pessoais",
    apelidos: ["ir", "irpf", "imposto"],
    palavras: {
      forte: ["declaracao de ajuste anual", "imposto sobre a renda pessoa fisica", "imposto de renda pessoa fisica", "declaracao de imposto de renda", "recibo de entrega da declaracao"],
      medio: ["irpf", "bens e direitos", "rendimentos tributaveis"],
      fraco: ["receita federal"],
    },
  },

  // ---------------- DOCS TERRENO ----------------
  CAR: {
    nomeArquivo: "CAR",
    descricao: "CAR - Cadastro Ambiental Rural",
    pasta: "terreno",
    apelidos: ["car"],
    palavras: {
      forte: ["cadastro ambiental rural", "recibo de inscricao do imovel rural", "sicar", /[a-z]{2}-\d{7}-(?:[0-9a-f]{4}\.?){8}/],
      medio: ["modulos fiscais", "reserva legal", "area de preservacao permanente", "regularizacao ambiental"],
      fraco: ["imovel rural"],
    },
  },

  CCIR: {
    nomeArquivo: "CCIR",
    descricao: "CCIR - Certificado de Cadastro de Imóvel Rural",
    pasta: "terreno",
    apelidos: ["ccir", "incra"],
    palavras: {
      forte: ["certificado de cadastro de imovel rural", "ccir"],
      medio: ["incra", "fracao minima de parcelamento", "modulo rural", "codigo do imovel rural"],
      fraco: ["sistema nacional de cadastro rural"],
    },
  },

  ITR: {
    nomeArquivo: "ITR",
    descricao: "ITR - Certidão / Imposto Territorial Rural",
    pasta: "terreno",
    apelidos: ["itr", "nirf"],
    palavras: {
      // A certidão negativa do ITR tem o mesmo título da CND, mas termina com "de imóvel rural" e traz o CIB.
      forte: ["imposto sobre a propriedade territorial rural", "cafir", "da uniao de imovel rural", "certidao negativa de debitos de imovel rural"],
      medio: ["itr", "nirf", "cib", "nome do imovel", "contribuinte"],
      fraco: ["darf", "cadastro de imoveis rurais", "area total"],
    },
  },

  MATRICULA: {
    nomeArquivo: "MATRICULA",
    descricao: "Matrícula do imóvel",
    pasta: "terreno",
    apelidos: ["matricula"],
    palavras: {
      forte: ["certidao de matricula", "certidao de inteiro teor", "oficial de registro de imoveis", "matricula do imovel"],
      medio: ["registro de imoveis", "inteiro teor"],
      fraco: ["cartorio", "onus", "proprietario"],
    },
  },

  CONTRATO_ARRENDAMENTO: {
    nomeArquivo: "CONTRATO DE ARRENDAMENTO",
    descricao: "Contrato de arrendamento / parceria",
    pasta: "terreno",
    apelidos: ["arrendamento", "parceria", "contrato"],
    palavras: {
      forte: ["contrato de arrendamento", "contrato de parceria agricola", "contrato de parceria"],
      medio: ["arrendador", "arrendatario", "parceiro outorgante", "parceiro outorgado"],
      fraco: ["clausula", "foro"],
    },
  },

  GEORREFERENCIAMENTO: {
    nomeArquivo: "GEORREFERENCIAMENTO",
    descricao: "Georreferenciamento / Memorial descritivo",
    pasta: "terreno",
    apelidos: ["georreferenciamento", "sigef", "memorial"],
    palavras: {
      forte: ["georreferenciamento", "memorial descritivo", "sigef"],
      medio: ["certificacao", "vertices", "coordenadas"],
      fraco: ["incra"],
    },
  },

  // ---------------- PEDIDO / TERMOS / CERTIDÕES (checklists DLL e Tarken) ----------------
  TERMO_BACEN: {
    nomeArquivo: "TERMO BACEN",
    descricao: "Termo BACEN / Autorização SCR",
    pasta: "pessoais",
    apelidos: ["bacen", "scr"],
    palavras: {
      forte: ["termo de autorizacao scr", "sistema de informacoes de creditos", "termo bacen"],
      medio: ["scr", "bacen", "banco central", "autoriza o banco"],
      fraco: ["sigilo bancario", "registrato"],
    },
  },

  CAF: {
    nomeArquivo: "CAF",
    descricao: "CAF - Cadastro Nacional da Agricultura Familiar",
    pasta: "pessoais",
    apelidos: ["caf", "dap"],
    palavras: {
      forte: ["cadastro nacional da agricultura familiar", "extrato completo da unidade familiar de producao agraria", "declaracao de aptidao ao pronaf"],
      medio: ["ufpa", "pronaf", "unidade familiar"],
      fraco: ["agricultura familiar"],
    },
  },

  CND: {
    nomeArquivo: "CND",
    descricao: "CND - Certidão negativa de débitos",
    pasta: "pessoais",
    apelidos: ["cnd"],
    palavras: {
      forte: ["certidao negativa de debitos relativos aos tributos federais", "certidao positiva com efeitos de negativa"],
      medio: ["procuradoria-geral da fazenda nacional", "divida ativa da uniao"],
      fraco: ["sujeito passivo", "receita federal"],
    },
    exclui: ["imovel rural"], // a certidão do ITR (imóvel rural) tem o mesmo título
  },

  PEDIDO: {
    nomeArquivo: "PEDIDO",
    descricao: "Pedido / proposta de compra",
    pasta: "raiz",
    apelidos: ["pedido", "proposta"],
    palavras: {
      forte: ["pedido-carta-proposta", "orcamento / pedido / proposta", "departamento comercial"],
      medio: ["total do pedido", "validade da proposta", "consultor de vendas", "condicoes de pagamento"],
      fraco: ["recurso proprio", "financiado"],
    },
  },

  CONTRATO_COMODATO: {
    nomeArquivo: "CONTRATO DE COMODATO",
    descricao: "Contrato de comodato",
    pasta: "terreno",
    apelidos: ["comodato"],
    palavras: {
      forte: ["contrato de comodato", "instrumento particular de comodato"],
      medio: ["comodante", "comodatario", "comodato"],
      fraco: ["emprestimo gratuito", "clausula"],
    },
  },

  CERTIDAO_PENHOR: {
    nomeArquivo: "CERTIDAO DE PENHOR",
    descricao: "Certidão de penhor",
    pasta: "terreno",
    apelidos: ["penhor"],
    palavras: {
      forte: ["certidao de penhor"],
      medio: ["penhor", "cedula rural pignoraticia"],
      fraco: ["cartorio"],
    },
  },

  CERTIDAO_ALIENACAO: {
    nomeArquivo: "CERTIDAO DE ALIENACAO",
    descricao: "Certidão de alienação fiduciária",
    pasta: "terreno",
    apelidos: ["alienacao"],
    palavras: {
      forte: ["certidao de alienacao fiduciaria", "alienacao fiduciaria"],
      medio: ["alienacao", "credor fiduciario"],
      fraco: ["cartorio"],
    },
  },

  CROQUI: {
    nomeArquivo: "CROQUI",
    descricao: "Croqui da área em garantia",
    pasta: "terreno",
    apelidos: ["croqui"],
    palavras: {
      forte: ["croqui"],
      medio: ["coordenada geografica", "roteiro de acesso"],
      fraco: ["coordenadas"],
    },
  },

  ESCRITURA: {
    nomeArquivo: "ESCRITURA",
    descricao: "Escritura pública",
    pasta: "terreno",
    apelidos: ["escritura"],
    palavras: {
      forte: ["escritura publica", "escritura de compra e venda"],
      medio: ["tabeliao", "tabelionato de notas"],
      fraco: ["lavrada"],
    },
  },

  PROCURACAO: {
    nomeArquivo: "PROCURACAO",
    descricao: "Procuração",
    pasta: "pessoais",
    apelidos: ["procuracao"],
    palavras: {
      forte: ["procuracao", "instrumento publico de procuracao"],
      medio: ["outorgante", "outorgado", "poderes"],
      fraco: ["cartorio de notas"],
    },
  },

  // ---------------- PESSOA JURÍDICA / COOPERATIVA ----------------
  CONTRATO_SOCIAL: {
    nomeArquivo: "CONTRATO SOCIAL",
    descricao: "Contrato social / Estatuto social",
    pasta: "pessoais",
    apelidos: ["estatuto", "social"],
    palavras: {
      forte: ["contrato social", "estatuto social", "alteracao contratual"],
      medio: ["capital social", "junta comercial"],
      fraco: ["socios", "quotas"],
    },
  },

  BALANCO_PATRIMONIAL: {
    nomeArquivo: "BALANCO PATRIMONIAL",
    descricao: "Balanço patrimonial",
    pasta: "pessoais",
    apelidos: ["balanco"],
    palavras: {
      forte: ["balanco patrimonial"],
      medio: ["ativo circulante", "passivo circulante", "patrimonio liquido"],
      fraco: ["total do ativo"],
    },
  },

  DRE: {
    nomeArquivo: "DRE",
    descricao: "DRE - Demonstração do resultado do exercício",
    pasta: "pessoais",
    apelidos: ["dre"],
    palavras: {
      forte: ["demonstracao do resultado do exercicio", "demonstrativo de resultado do exercicio", "dre"],
      medio: ["receita bruta", "lucro liquido", "resultado operacional"],
      fraco: ["deducoes"],
    },
  },

  ATA_ASSEMBLEIA: {
    nomeArquivo: "ATA DE ASSEMBLEIA",
    descricao: "Ata de assembleia",
    pasta: "pessoais",
    apelidos: ["ata"],
    palavras: {
      forte: ["ata de assembleia", "ata da assembleia geral"],
      medio: ["assembleia geral", "deliberou"],
      fraco: ["presidente", "cooperativa"],
    },
  },

  SINTEGRA: {
    nomeArquivo: "SINTEGRA",
    descricao: "SINTEGRA / Certidão genérica",
    pasta: "pessoais",
    apelidos: ["sintegra"],
    palavras: {
      forte: ["sintegra", "certidao generica"],
      medio: ["inscricao estadual", "cadastro de contribuintes"],
      fraco: ["icms"],
    },
  },

  // ---------------- NOTAS FISCAIS ----------------
  NF: {
    nomeArquivo: "NF",
    descricao: "Nota fiscal de venda",
    pasta: "nf",
    apelidos: ["nf", "nfe", "danfe", "nota"],
    palavras: {
      forte: ["danfe", "documento auxiliar da nota fiscal", "nota fiscal de produtor", "nota fiscal eletronica", "nf-e", "natureza da operacao", /(?<!\d)(?:\d{4} ?){11}(?!\d)/],
      medio: ["chave de acesso", "valor total da nota", "destinatario", "emitente"],
      fraco: ["nota fiscal", "cfop"],
    },
    exclui: ["unidade consumidora"],
  },
};
