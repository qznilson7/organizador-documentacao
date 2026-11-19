// Configurações gerais. Pode editar à vontade.

export const configuracoes = {
  // Padrão do nome dos arquivos renomeados.
  // Variáveis: {tipo} (ex.: RG, CAR) e {cliente}.  Ex.: "{tipo}"  ou  "{tipo} - {cliente}"
  padraoNome: "{tipo}",

  // Padronização dos nomes dos ARQUIVOS (não vale para docs finais, que ficam como estão).
  nomes: { minusculas: true, semAcento: true },

  // Duplicados: arquivos IDÊNTICOS (byte a byte) são removidos do ZIP final.
  // Arquivos só PARECIDOS (texto com esta similaridade ou mais) apenas geram aviso.
  duplicados: { similaridadeMinima: 0.85 },

  // Nomes das pastas dentro do ZIP final.
  // raiz: "" = o arquivo fica solto na pasta do cliente (ex.: PEDIDO.pdf)
  pastas: {
    pessoais: "docs pessoais",
    terreno: "docs terreno",
    nf: "NF",
    raiz: "",
    revisar: "_REVISAR", // arquivos que o sistema não conseguiu identificar
    finais: "docs finais",
  },

  // Pasta que o sistema NÃO analisa (documentos assinados depois da análise de crédito).
  // incluirNoZip: true = os arquivos vão para o ZIP final do jeito que estão (sem renomear nem validar).
  pastaIgnorada: { nome: "docs finais", incluirNoZip: true },

  // Se o conteúdo não for reconhecido, usa a pasta de origem (pasta de origem -> tipo)
  fallbackPorPasta: { nf: "NF" },

  ocr: {
    idioma: "por",   // português
    paginasPdf: 2,   // quantas páginas de PDF escaneado ler com OCR
    dpi: 250,        // resolução ao desenhar páginas de PDF escaneado para o OCR
  },

  limites: {
    maxArquivos: 500,
    maxMbTotal: 1024,
    confiancaMinimaOk: 0.5, // abaixo disso o documento é marcado para conferência
  },
};
