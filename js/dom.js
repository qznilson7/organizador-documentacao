// Pequenas funções de tela usadas na página de hectares.

export const $ = (id) => document.getElementById(id);

export function criar(tag, classe, texto) {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  if (texto !== undefined) e.textContent = texto;
  return e;
}

export function baixar(blob, nome) {
  const a = document.createElement("a");
  a.href = URL.createObjectURL(blob);
  a.download = nome;
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(a.href), 10000);
}

/** Área de envio: clique, teclado e arrastar-e-soltar. aoReceber(listaDeArquivos). */
export function ligarEnvio(zona, entrada, aoReceber) {
  entrada.addEventListener("click", (e) => e.stopPropagation());
  zona.addEventListener("click", () => entrada.click());
  zona.addEventListener("keydown", (e) => {
    if (e.key === "Enter" || e.key === " ") { e.preventDefault(); entrada.click(); }
  });
  entrada.addEventListener("change", () => {
    const arquivos = [...entrada.files];
    entrada.value = "";
    aoReceber(arquivos);
  });
  zona.addEventListener("dragover", (e) => { e.preventDefault(); zona.classList.add("sobre"); });
  zona.addEventListener("dragleave", () => zona.classList.remove("sobre"));
  zona.addEventListener("drop", (e) => {
    e.preventDefault();
    zona.classList.remove("sobre");
    aoReceber([...e.dataTransfer.files]);
  });
}
