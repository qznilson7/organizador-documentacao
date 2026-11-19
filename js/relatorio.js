// Relatórios de saída (CSV para Excel e resumo em texto).

function campo(valor) {
  let s = String(valor ?? "");
  if (/^[=+\-@]/.test(s)) s = "'" + s; // evita que o Excel trate o nome do arquivo como fórmula
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvBlob(planejados) {
  const linhas = [["Arquivo original", "Tipo", "Pessoa / detalhe", "Pasta destino", "Novo nome", "Confiança", "Como foi identificado", "Observação", "Duplicado idêntico de"]];
  for (const d of planejados) {
    linhas.push([
      d.origem, d.tipo || "", d.detalhe || "", d.destinoPasta, d.destinoNome,
      `${Math.round(d.confianca * 100)}%`, d.metodo, d.observacao || "",
      d.removido ? d.duplicadoDe : "",
    ]);
  }
  const texto = linhas.map((l) => l.map(campo).join(";")).join("\r\n");
  // BOM no início: o Excel abre com os acentos corretos
  return new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" });
}

/** extras: { removidos: [{origem, duplicadoDe}], parecidos: [{a, b, similaridade}] } */
export function resumoBlob(cliente, res, extras = {}) {
  const linha = (i, vazio) => `  ${i.atendido ? "[OK]" : vazio} ${i.descricao}` + (i.encontrados.length ? `  -> ${i.encontrados.join(", ")}` : "");
  const L = [`Cliente: ${cliente}`, `Banco: ${res.banco}`, `Resultado: ${res.status}`, "", "OBRIGATÓRIOS"];
  for (const i of res.obrigatorios) L.push(linha(i, "[FALTA]"));
  if (res.opcionais.length) {
    L.push("", "OPCIONAIS");
    for (const i of res.opcionais) L.push(linha(i, "[--]"));
  }
  if (res.avisos.length) {
    L.push("", "AVISOS");
    for (const a of res.avisos) L.push(`  - ${a}`);
  }
  if ((extras.removidos || []).length) {
    L.push("", "DUPLICADOS IDÊNTICOS REMOVIDOS DO ZIP");
    for (const r of extras.removidos) L.push(`  - ${r.origem}  (igual a ${r.duplicadoDe})`);
  }
  if ((extras.parecidos || []).length) {
    L.push("", "POSSÍVEIS DUPLICADOS (diferem em algo; nada foi removido, confira)");
    for (const p of extras.parecidos) L.push(`  - ${p.a}  <->  ${p.b}  (${Math.round(p.similaridade * 100)}% parecidos)`);
  }
  return new Blob(["﻿" + L.join("\r\n") + "\r\n"], { type: "text/plain;charset=utf-8" });
}
