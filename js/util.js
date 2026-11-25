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

/** Tira os acentos (mantém maiúsculas/minúsculas). */
export function semAcentos(texto) {
  return String(texto).normalize("NFKD").replace(/[̀-ͯ]/g, "");
}

/** Impressão digital (SHA-256) do conteúdo; "" se o navegador não oferecer (ex.: abrir por file://). */
export async function sha256Hex(buffer) {
  if (!globalThis.crypto || !globalThis.crypto.subtle) return "";
  const h = await globalThis.crypto.subtle.digest("SHA-256", buffer);
  return [...new Uint8Array(h)].map((b) => b.toString(16).padStart(2, "0")).join("");
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

/**
 * Remonta o texto de uma página de PDF na ordem em que se LÊ (linha por linha, da esquerda para a direita),
 * usando a posição de cada trecho. Importante em tabelas, como a do CCIR.
 * itens: os de pdf.js getTextContent() -> { str, width, transform: [.., .., .., .., x, y] }
 */
export function montarLinhas(itens, tolerancia = 2.5) {
  const trechos = itens
    .filter((i) => i.str && i.str.trim())
    .map((i) => ({ s: i.str, x: i.transform[4], y: i.transform[5], largura: i.width || 0 }))
    .sort((a, b) => b.y - a.y || a.x - b.x);
  const linhas = [];
  for (const t of trechos) {
    const atual = linhas[linhas.length - 1];
    if (atual && Math.abs(atual.y - t.y) <= tolerancia) atual.trechos.push(t);
    else linhas.push({ y: t.y, trechos: [t] });
  }
  return linhas
    .map((linha) => {
      let texto = "";
      let fim = null;
      for (const t of linha.trechos.sort((a, b) => a.x - b.x)) {
        // trechos encostados fazem parte da mesma palavra
        if (fim !== null && t.x - fim > 1 && !texto.endsWith(" ")) texto += " ";
        texto += t.s;
        fim = t.x + t.largura;
      }
      return texto.trim();
    })
    .join("\n");
}

export function formatarBytes(n) {
  if (n < 1024) return `${n} B`;
  if (n < 1024 * 1024) return `${(n / 1024).toFixed(0)} KB`;
  return `${(n / 1024 / 1024).toFixed(1)} MB`;
}
