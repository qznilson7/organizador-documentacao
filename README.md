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
  docs pessoais/   termo bacen.pdf, cnh - nome da pessoa.pdf, cnd - nome da pessoa.pdf, caf.pdf ...
  docs terreno/    car.pdf, ccir.pdf, itr.pdf, matricula.pdf, contrato de comodato.pdf ...
  NF/              leite - r$ 15.000,00 - 2025.pdf, soja - r$ 100.000,00 - 2026.pdf ...   (só se houver notas)
  pedido.pdf       (o pedido fica solto na pasta do cliente)
  docs finais/     arquivos da pasta ignorada, sem mudanças (só se houver)
  _REVISAR/        arquivos que o sistema não identificou (só se houver)
```
Regras dos nomes:
- Tudo em **minúsculas e sem acento** (menos os arquivos de `docs finais`, que ficam como estão).
- O sistema primeiro descobre **qual é o documento** (pelo conteúdo, não pelo nome do arquivo) e depois **de quem é**.
  Documento de pessoa vira `tipo - nome da pessoa` (o nome vem do conteúdo; se não achar, do nome original do arquivo;
  você pode corrigir na coluna **Pessoa / detalhe**).
- Notas fiscais: `cultura - r$ valor - ano`. O **mês** só entra (`... - 2026 - 03`) quando duas notas ficariam com o mesmo nome.
  As culturas reconhecidas estão em `config/culturas.js`. Valor lido por OCR fica marcado para conferência.
- **Duplicados:** arquivos **idênticos byte a byte** são removidos do ZIP final (a tela e o relatório listam quais).
  Arquivos só **parecidos** (texto quase igual, mas com alguma diferença) **não são removidos**: aparece um aviso para você conferir.
- Coluna **Texto lido** (botão "ver"): mostra o que o sistema leu em cada arquivo. Serve para entender por que algo não foi identificado.

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

1. Abra `http://localhost:8000/testes/`: deve mostrar "Todos os 44 testes passaram".
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
js/extracao.js        nome da pessoa e dados da nota (cultura, valor, ano)
js/duplicados.js      duplicados idênticos (removidos) e parecidos (aviso)
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
- O sistema avalia **um único conjunto de documentos** por ZIP: não separa comprador, cônjuge e avalista na validação
  (os nomes dos arquivos já levam o nome da pessoa, mas o checklist do banco ainda não é por pessoa).
- O nome da pessoa é "melhor esforço": em CNH/RG lidos por OCR pode falhar; corrija na coluna **Pessoa / detalhe**.
- Duas fotos (frente e verso) do mesmo documento são tratadas como arquivos separados.
- Ainda não confere datas (validade de comprovante, matrícula etc.), nem firma reconhecida.

## Próximos passos sugeridos

- Nomear por pessoa (ex.: `CNH - Joao.pdf`) e perfis separados (comprador, cônjuge, avalista, PJ).
- Validar **datas/validade** dos documentos.
- Conferir **nome e CPF** em todos os documentos.
- Juntar frente e verso (fotos separadas) em um único PDF.
- Processar vários ZIPs de uma vez.
