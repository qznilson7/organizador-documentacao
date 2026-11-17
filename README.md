# Organizador de Documentação de Clientes

Site em **HTML, CSS e JavaScript puros** (sem frameworks). Você arrasta o ZIP do cliente, escolhe o banco (**DLL** ou
**Tarken**), e o sistema lê os documentos (PDF com texto, PDF escaneado e fotos), renomeia, organiza nas pastas,
confere se o cliente está apto para o banco e devolve um ZIP com o nome do cliente.

Tudo roda **dentro do navegador**: nenhum documento é enviado para servidor nenhum. As bibliotecas (ZIP, PDF, OCR e
idioma português) estão na pasta `lib/`, então o site não depende de CDN.

> Status: versão inicial, ainda **não testada em navegador**. Veja "Primeiro teste" abaixo.

## O que entra e o que sai

Entrada (como você organiza hoje). O **nome do cliente vem do nome do ZIP**:
```
Nome do Cliente.zip
  2026/                      (a pasta raiz, qualquer nome)
    bacen.pdf, pedido.pdf    (soltos na raiz: vão para docs pessoais / raiz)
    docs pessoais/  docs terreno/  nf`s - fulano/  (qualquer pasta que comece com "NF" ou "Nota")
    docs finais/             (NÃO é analisada; vai para o ZIP final do jeito que está)
```
Saída:
```
Nome do Cliente/
  docs pessoais/   TERMO BACEN.pdf, CNH.pdf, CAF.pdf, CND.pdf, COMPROVANTE DE RESIDENCIA.pdf ...
  docs terreno/    CAR.pdf, CCIR.pdf, ITR.pdf, MATRICULA.pdf, CONTRATO DE COMODATO.pdf ...
  NF/              NF.pdf, NF (2).pdf ...        (só se houver notas)
  PEDIDO.pdf       (o pedido fica solto na pasta do cliente)
  docs finais/     arquivos da pasta ignorada, sem mudanças (só se houver)
  _REVISAR/        arquivos que o sistema não identificou (só se houver)
```
Além do ZIP, você baixa um relatório (CSV, abre no Excel) e um resumo da validação.

## Bancos cadastrados (config/bancos.js)
Montados a partir dos checklists enviados. Cada banco tem os documentos **obrigatórios**, **opcionais** e
**lembretes** (regras que o sistema ainda não confere sozinho, como datas e firma reconhecida).
- **Banco DLL**: Termo BACEN (autorização), RG ou CNH, comprovante de residência, IR (ou NF), CAF, CND, ITR, CAR, CCIR, matrícula.
- **Tarken**: RG ou CNH, CPF, comprovante de residência, IR, Termo BACEN, CAR.

## Como abrir (no computador pessoal)

O navegador não deixa o leitor de PDF e o OCR funcionarem se você der duplo clique no `index.html`.
Abra por um servidor local simples. Na pasta do projeto:

```
python -m http.server 8000
```
e acesse `http://localhost:8000`. (Outra opção: extensão *Live Server* do VS Code.)
Não precisa de internet. Para publicar para outras pessoas, veja o **GITHUB.md**.

## Primeiro teste (nesta ordem)

1. Abra `http://localhost:8000/testes/`: deve mostrar "Todos os 30 testes passaram".
2. Abra `http://localhost:8000/` e confira se a tela aparece sem erros (F12 > Console).
3. Envie um ZIP **fictício** com PDFs de texto. Depois um com foto/PDF escaneado (testa o OCR; a primeira vez demora um pouco).
4. Baixe o ZIP organizado e confira as pastas e os nomes.

## Ajustando sem mexer no código (pasta `config/`)

| Arquivo | Para quê |
|---|---|
| `bancos.js` | Documentos exigidos por banco (`["RG","CNH"]` = um OU outro) e lembretes. |
| `tipos.js` | Como reconhecer cada documento (palavras-chave) e o nome do arquivo final. |
| `configuracoes.js` | Padrão de nome (`{tipo}`, `{cliente}`), nomes das pastas, pasta ignorada, OCR, limites. |

Depois de editar, recarregue a página (Ctrl+F5).

## Código

```
index.html            a tela
css/estilo.css        o design (cores nas variáveis do :root)
js/app.js             liga a tela ao núcleo
js/analisador.js      fluxo: ZIP -> texto/OCR -> tipo
js/zipLeitor.js       leitura do ZIP (JSZip)
js/extrator.js        texto de PDF (pdf.js) e OCR (Tesseract.js)
js/classificador.js   regras por palavras-chave
js/organizador.js     nomes, pastas e ZIP final
js/validador.js       exigências do banco
js/relatorio.js       CSV e resumo
lib/                  bibliotecas de terceiros (veja lib/LICENCAS.md)
testes/               página de testes
referencia-python/    primeira versão em Python (só consulta)
GITHUB.md             como publicar no GitHub Pages
memoria.md            tudo que é preciso lembrar do projeto
```

## Limitações conhecidas

- Formatos lidos: PDF, JPG, PNG, BMP, WEBP. TIFF, Word e Excel vão para `_REVISAR`.
- O OCR do navegador é mais lento e um pouco menos preciso que o Tesseract instalado; as palavras-chave em
  `config/tipos.js` precisam de ajuste com documentos reais.
- Só as 2 primeiras páginas de PDF escaneado passam por OCR (configurável).
- O sistema avalia **um único conjunto de documentos** por ZIP: não separa comprador, cônjuge e avalista, e nomes
  repetidos viram `CNH.pdf`, `CNH (2).pdf`.
- Ainda não confere datas (validade de comprovante, matrícula etc.), nem firma reconhecida.

## Próximos passos sugeridos

- Nomear por pessoa (ex.: `CNH - Joao.pdf`) e perfis separados (comprador, cônjuge, avalista, PJ).
- Validar **datas/validade** dos documentos.
- Conferir **nome e CPF** em todos os documentos.
- Juntar frente e verso (fotos separadas) em um único PDF.
- Processar vários ZIPs de uma vez.
