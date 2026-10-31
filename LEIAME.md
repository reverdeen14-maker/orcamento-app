# Orçamento Família – app para iPhone

App web instalável (abre pelo Safari e vira ícone na tela de início) ligado às planilhas do OneDrive.

- **O que você lança no app vai direto para a planilha.**
  - Pagar ou receber um compromisso, lançamento no Fluxo, compra no Cartão: novas linhas nas tabelas da planilha.
  - Valores do mês e gastos avulsos: novas linhas na aba Cadastro.
  - Ativar ou desativar uma conta fixa, mudar o limite de um envelope e trocar o mês de referência: alteram células que já existem na planilha.
- **O que você lança na planilha aparece no app.** O app lê a planilha toda vez que abre, quando você toca em ↻ e quando volta para ele depois de 2 minutos.
- As contas continuam sendo feitas pelas fórmulas da planilha. O app só lê os resultados (Painel, Compromissos, Orçamento) e grava nas tabelas.

Enquanto o app não estiver ligado à sua conta Microsoft, ele abre em **modo demonstração** com uma cópia da planilha de 31/10/2026 (`demo-data.json`). Nada é gravado nesse modo.

---

## 1. Registrar o app na Microsoft (uma vez, ~10 min)

É o que permite ao app pedir sua permissão para ler e gravar no seu OneDrive.

1. Entre em <https://entra.microsoft.com> com a mesma conta Microsoft do OneDrive.
   Se pedir para criar um diretório ou uma conta Azure gratuita, siga o que a tela pedir. É de graça, mas a Microsoft pode pedir um cartão só para confirmar a identidade.
2. Vá em **Aplicativos → Registros de aplicativo → Novo registro**.
   - **Nome:** Orçamento Família
   - **Tipos de conta:** *Somente contas pessoais da Microsoft*, ou *qualquer diretório + contas pessoais*.
   - **URI de redirecionamento:** plataforma **Aplicativo de página única (SPA)**, endereço `https://SEU-USUARIO.github.io/orcamento-app/`. Use o endereço do passo 2, com a barra no final.
3. Clique em **Registrar** e copie o **ID do aplicativo (cliente)**.
4. Abra `config.js` e cole esse ID entre as aspas de `clientId: ''`.

Permissões pedidas no primeiro login: *Files.ReadWrite* (ler e gravar seus arquivos) e *User.Read* (seu nome).

## 2. Publicar no GitHub Pages (uma vez)

1. Crie uma conta em <https://github.com>.
2. Crie um repositório chamado **orcamento-app**. Pode ser público: as planilhas não ficam nele.
3. Em **Add file → Upload files**, envie todos os arquivos desta pasta, **menos `demo-data.json`**. Esse arquivo tem os dados reais da família e não deve ser publicado.
4. Vá em **Settings → Pages → Build and deployment**, escolha **Deploy from a branch**, depois **main** / **(root)**, e clique em **Save**.
5. Em 1 a 2 minutos o app fica em `https://SEU-USUARIO.github.io/orcamento-app/`.

Sem o `demo-data.json` publicado, o modo demonstração não abre online. Isso é esperado: online o app usa sempre a planilha de verdade.

Sempre que eu mudar algum arquivo do app, envie de novo só os arquivos que mudaram.

## 3. Instalar no iPhone

1. Abra o endereço do app no **Safari**.
2. Toque em **Compartilhar** (quadrado com seta) → **Adicionar à Tela de Início**.
3. Abra pelo ícone e toque em **Entrar com a conta Microsoft**.

Para a Bianca usar no celular dela, ela deve entrar com **a mesma conta Microsoft** onde estão as planilhas.

### Cuidados

- **Excel aberto no computador:** deixe o **Salvamento Automático** ligado. Assim o que o app grava aparece no Excel sem conflito. Com o arquivo aberto sem salvamento automático, o Excel pode pedir para escolher entre versões.
- **Primeiro uso:** faça um lançamento de teste pequeno e confira na planilha se a linha entrou com as colunas calculadas preenchidas (Mês, Saldo, Categoria final etc.).
- **Trocar o mês** no app muda o mês de referência do Painel (célula N2) na planilha também.
- **Ano:** em **Mais → Planilha e conta** você escolhe 2026 ou 2027. Os nomes dos arquivos ficam em `config.js`.

## 4. Open Finance (segunda etapa)

O app já tem a tela **Mais → Conexões bancárias**. Ela busca transações num servidor de conexão e mostra uma lista para revisar. Você escolhe a categoria de cada transação e confirma. Depois disso:

- **compras no cartão** vão para a tabela **Cartão**;
- **Pix, débitos e entradas** vão para o **Fluxo**.

Falta o servidor, porque as chaves de um agregador autorizado não podem ficar dentro do app. O caminho recomendado:

1. Criar conta na **Pluggy** (<https://pluggy.ai>), agregador brasileiro de Open Finance. Tem ambiente de teste gratuito; o uso com bancos reais é pago.
2. Montar um pequeno servidor, por exemplo um Cloudflare Worker grátis, que guarda a chave da Pluggy e responde:

```
GET  /transactions?since=AAAA-MM-DD
200  { "transactions": [
        { "id": "abc123", "date": "2026-10-30", "description": "NOSSO ATACAREJO",
          "amount": 172.52, "source": { "type": "credit_card", "name": "Bradesco" } },
        { "id": "def456", "date": "2026-10-31", "description": "PIX ENVIADO",
          "amount": -50.00, "source": { "type": "bank", "name": "Bradesco" } } ] }
```

- `credit_card`: `amount` é o valor da compra. O nome do cartão deve ser igual ao da tabela de cartões.
- `bank`: valor negativo é Saída e valor positivo é Entrada.
- O servidor precisa aceitar chamadas do endereço do app (CORS) e ter uma senha própria antes de usar dados reais.

3. Colar o endereço do servidor em **Conexões bancárias**.

O app guarda no aparelho quais transações já importou, para não repetir.

---

## Arquivos

| Arquivo | Para que serve |
|---|---|
| `index.html`, `styles.css` | Página e visual |
| `app.js` | Telas e ações |
| `data.js` | Leitura e gravação da planilha pela Microsoft Graph |
| `config.js` | ID do app na Microsoft e nomes das planilhas |
| `manifest.webmanifest`, `sw.js`, `` | Instalação no iPhone e abertura sem internet |
| `demo-data.json` | Cópia local para o modo demonstração (não publicar) |
