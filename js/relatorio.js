// Relatórios de saída (CSV para Excel e resumo em texto).

function campo(valor) {
  let s = String(valor ?? "");
  if (/^[=+\-@]/.test(s)) s = "'" + s; // evita que o Excel trate o nome do arquivo como fórmula
  return /[";\r\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
}

export function csvBlob(planejados) {
  const linhas = [["Arquivo original", "Tipo", "Pasta destino", "Novo nome", "Confiança", "Como foi identificado", "Observação"]];
  for (const d of planejados) {
    linhas.push([d.origem, d.tipo || "", d.destinoPasta, d.destinoNome, `${Math.round(d.confianca * 100)}%`, d.metodo, d.observacao]);
  }
  const texto = linhas.map((l) => l.map(campo).join(";")).join("\r\n");
  // BOM no início: o Excel abre com os acentos corretos
  return new Blob(["﻿" + texto], { type: "text/csv;charset=utf-8" });
}

export function resumoBlob(cliente, res) {
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
  return new Blob(["﻿" + L.join("\r\n") + "\r\n"], { type: "text/plain;charset=utf-8" });
}
