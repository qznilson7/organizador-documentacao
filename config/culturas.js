// Culturas reconhecidas nas notas fiscais (nome usado no arquivo -> palavras que aparecem na nota).
// O nome do arquivo sai assim: "<cultura> - r$ <valor> - <ano>".
// Para incluir uma cultura nova, copie uma linha. Sem acento e em minúsculas.

export const culturas = {
  soja: ["soja"],
  milho: ["milho"],
  trigo: ["trigo"],
  feijao: ["feijao"],
  leite: ["leite", "leite cru", "leite in natura", "leite resfriado"],
  bovino: ["bovino", "bovinos", "gado", "boi gordo", "novilho", "novilha", "vaca"],
  suino: ["suino", "suinos", "porco"],
  frango: ["frango", "aves"],
  cafe: ["cafe"],
  arroz: ["arroz"],
  aveia: ["aveia"],
  cevada: ["cevada"],
  cana: ["cana de acucar", "cana"],
  fumo: ["fumo", "tabaco"],
};
