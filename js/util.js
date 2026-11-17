// Funções pequenas usadas em vários módulos.

/** Minúsculas, sem acentos e com espaços colapsados. */
export function normalizar(texto) {
  return String(texto)
    .normalize("NFKD")
    .replace(/[̀-ͯ]/g, "")
    .toLowerCase()
    .replace(/\s+/g, " ")
    .trim();
}

/** Deixa um nome seguro para arquivo/pasta no Windows. */
export function sanitizar(nome, limite = 120) {
  const limpo = String(nome)
    .replace(/[<>:"/\\|?*\u0000-\u001f]/g, "_")
    .trim()
    .replace(/[. ]+$/, "");
  return limpo.slice(0, limite) || "sem_nome";
}

export function escapeRegex(s) {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** ".pdf" (minúsculo) ou "" quando não há extensão. */
export function extensao(nome) {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(i).toLowerCase() : "";
}

/** Último trecho de um caminho "a/b/c.pdf" -> "c.pdf" */
export function nomeDoCaminho(caminho) {
  return caminho.split("/").pop();
}

/** "c.pdf" -> "c" */
export function semExtensao(nome) {
  const i = nome.lastIndexOf(".");
  return i > 0 ? nome.slice(0, i) : nome;
}

export function formatarBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
