// Exigências de cada banco / plataforma.
//
// nome:         nome exibido na tela
// obrigatorios: lista de exigências. Cada item pode ser:
//                 - um tipo:                      "CPF"
//                 - alternativas (um OU outro):   ["RG", "CNH"]
// opcionais:    documentos desejáveis ou condicionais (não bloqueiam; só aparecem no checklist)
// lembretes:    regras que o sistema AINDA NÃO confere sozinho (datas, firma reconhecida etc.).
//               Aparecem na lateral da tela para você não esquecer.
//
// As siglas são as chaves de config/tipos.js.
//
// Fonte: checklists enviados pelo usuário (DLL: "check list dll.pdf"; Tarken: "documentos para análise de crédito.pdf").
// O sistema ainda trata um único conjunto de documentos (comprador). Avalista, cônjuge, PJ, cooperativa,
// bovino de leite e CPR ainda não têm perfil próprio.

export const bancos = {

  dll: {
    nome: "Banco DLL",
    obrigatorios: [
      "TERMO_BACEN",                       // "Termo de autorização" (SCR), com firma reconhecida
      ["RG", "CNH"],                       // identificação
      "COMPROVANTE_RESIDENCIA",
      ["DECLARACAO_IR", "NF"],             // IR; se não declara, notas de produção
      "CAF",
      "CND",
      "ITR",                               // certidão do ITR
      "CAR",
      "CCIR",
      "MATRICULA",
    ],
    opcionais: [
      ["CONTRATO_ARRENDAMENTO", "CONTRATO_COMODATO"],
      "CERTIDAO_CASAMENTO",
      "CERTIDAO_NASCIMENTO",
    ],
    lembretes: [
      "Termo de autorização: assinatura com firma reconhecida em cartório.",
      "CNH: frente e verso. Identidade atualizada, no máximo 10 anos.",
      "Comprovante de residência: no máximo 3 meses (água, luz, gás, internet, celular pós, telefone fixo ou TV).",
      "Matrícula atualizada: no máximo 1 ano.",
      "ITR: certidão de todos os terrenos do cliente.",
      "Documentos do cônjuge, quando houver.",
      "Avalista: os mesmos documentos do comprador, mais certidão de casamento/nascimento (90 dias).",
      "Pedir o e-mail do cliente e do avalista.",
    ],
  },

  tarken: {
    nome: "Tarken (análise de crédito)",
    obrigatorios: [
      ["RG", "CNH"],                       // o checklist lista RG, CPF e CNH; aqui RG OU CNH (confirmar)
      "CPF",
      "COMPROVANTE_RESIDENCIA",
      "DECLARACAO_IR",                     // último IR declarado
      "TERMO_BACEN",
      "CAR",                               // de todas as áreas
    ],
    opcionais: [
      "CERTIDAO_CASAMENTO",                // casamento ou união estável
      ["CONTRATO_ARRENDAMENTO", "CONTRATO_COMODATO"], // só se a área for arrendada/cedida
      "MATRICULA",                         // propostas acima de R$ 500 mil: atualizada em 30 dias
      "CCIR",
    ],
    lembretes: [
      "CAR de todas as áreas.",
      "Contrato de arrendamento se a área for arrendada: registrado em cartório, vencimento depois do vencimento do crédito.",
      "Propostas acima de R$ 500 mil: matrícula atualizada em 30 dias.",
      "RG frente e verso. Documentos do cônjuge (RG, CPF etc.).",
      "IR: último declarado no ano. Termo BACEN assinado.",
      "O CAR e a matrícula precisam condizer com o contrato.",
    ],
  },
};
