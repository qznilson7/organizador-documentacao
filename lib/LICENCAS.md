# Bibliotecas de terceiros (copiadas para funcionar sem CDN)

| Biblioteca | Versão | Uso | Licença |
|---|---|---|---|
| JSZip | 3.10.1 | ler e gerar ZIP | MIT ou GPL-3.0 (à escolha) |
| pdf.js (Mozilla) | 3.11.174 | ler texto de PDF e desenhar páginas | Apache-2.0 |
| Tesseract.js | 5.1.1 | OCR no navegador | Apache-2.0 |
| Tesseract.js Core | 5.1.1 | motor do OCR (WebAssembly) | Apache-2.0 |
| Dados de idioma português (`por.traineddata.gz`, 4.0.0_best_int) | 1.0.0 do pacote @tesseract.js-data/por | reconhecimento em português | Apache-2.0 |

Origem dos arquivos (para atualizar no futuro):
- JSZip: https://cdnjs.cloudflare.com/ajax/libs/jszip/3.10.1/jszip.min.js
- pdf.js: https://cdnjs.cloudflare.com/ajax/libs/pdf.js/3.11.174/ (pdf.min.js e pdf.worker.min.js)
- Tesseract.js: https://cdn.jsdelivr.net/npm/tesseract.js@5.1.1/dist/ (tesseract.min.js e worker.min.js)
- Core: https://cdn.jsdelivr.net/npm/tesseract.js-core@5.1.1/ (tesseract-core-simd-lstm.wasm.js e tesseract-core-lstm.wasm.js)
- Idioma: https://cdn.jsdelivr.net/npm/@tesseract.js-data/por@1.0.0/4.0.0_best_int/por.traineddata.gz

Os cabeçalhos de licença originais continuam dentro de cada arquivo.
