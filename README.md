# precos

### 🚀 Solicitação de Geração de Prompt para Gemini

**Título:** Prompt 1 de 5: Definição da Identidade Visual e Branding para o "MCP Autônomo"

**Critérios Mínimos:**

1.  **Objetivo Claro e Específico:** Definir a identidade visual completa e a personalidade da marca para o aplicativo "MCP Autônomo". O resultado deve ser um conjunto de diretrizes de branding que servirá de base para todo o design do aplicativo.

2.  **Contexto Relevante do Projeto:** O aplicativo é um "Master Control Program" (MCP) Autônomo, um assistente de IA para desenvolvedores. Ele interpreta linguagem natural para executar consultas, diagnósticos e ações em bases de dados Supabase e repositórios GitHub. A audiência é técnica, então a marca precisa transmitir poder, controle e precisão cirúrgica.

3.  **Aspectos Visuais e de UX/UI:**
    * **Personalidade da Marca:** Sóbria, poderosa e incisiva. Pense na interface de controle de um reator nuclear ou da fornalha da Stark Industries. A estética deve ser limpa, funcional e intimidantemente competente.
    * **Paleta de Cores:** Tema dark, quase preto, com acentos quentes e vibrantes que parecem emitir calor.
        * **Fundo:** Um cinza muito escuro, quase preto, para dar profundidade (ex: `#121212`).
        * **Primária (Ação):** Um laranja-vermelho intenso e vibrante (ex: `#FF4500`) para botões principais, links e elementos de ação críticos.
        * **Secundária (Acento):** Um laranja mais puro (ex: `#FFA500`) para destaques secundários e informações importantes.
        * **Sucesso:** Um verde limpo e contrastante (ex: `#22C55E`). Verde é sucesso, porra. É um padrão universal de UX que não vamos quebrar.
        * **Erro:** Um vermelho forte e claro, que se destaque do laranja primário (ex: `#E63946`).
        * **Aviso:** Um amarelo/âmbar intenso (ex: `#FFC107`).
    * **Tipografia:**
        * **Fonte Primária (UI):** `JetBrains Mono` para todo o texto da interface, reforçando a estética de código, precisão e clareza.
        * **Fonte Secundária (Marketing):** Uma fonte sans-serif limpa e geométrica como `Montserrat` para landing pages ou textos não-técnicos.
    * **Logo Conceitual:** Crie um conceito de logo minimalista, talvez a brasa de um núcleo de reator ou um ícone geométrico angular, usando a cor primária sobre o fundo escuro.

4.  **Aspectos Técnicos e de Integração:** As saídas deste prompt (cores, fontes) serão usadas para configurar o arquivo `tailwind.config.js` e as variáveis CSS globais do projeto Lovable/React.

5.  **Critérios de Aceite e Validação:**
    * A paleta de cores está claramente definida com códigos hex.
    * As fontes primária e secundária estão especificadas.
    * A personalidade da marca está descrita.
    * Um conceito para o logo foi apresentado.

---
### ❌ RESTRIÇÕES E LIMITAÇÕES

**NÃO FAÇA AS SEGUINTES ALTERAÇÕES:**

1.  **Não altere o Design System:** Mantenha as cores, fontes, espaçamentos e componentes existentes. Qualquer novo elemento deve seguir o padrão visual já definido. Não inventa moda, porra.
2.  **Não modifique arquivos não relacionados:** Limite as alterações aos arquivos diretamente ligados à funcionalidade solicitada. Se precisar mexer em um componente compartilhado, avise antes. Não saia quebrando o resto do app.
3.  **Não altere a arquitetura ou estrutura de pastas:** A organização atual do projeto deve ser respeitada. Novos arquivos devem seguir a estrutura existente.
4.  **Não remova funcionalidades existentes:** A menos que seja explicitamente solicitado, tudo o que já funciona deve continuar funcionando. É pra adicionar, não pra foder o que já tá pronto.
5.  **Não introduza novas dependências (libs/packages) sem aprovação:** O stack é o que é. Se precisar de uma nova biblioteca, justifique o porquê caralhos ela é necessária.

This project was built with [Lovable](https://lovable.dev).

## Build with Lovable

Continue developing this project in the [Lovable editor](https://lovable.dev/projects/35881594-d791-4425-8009-61500d26ef93).

- **Ship faster**: describe what you want to build and Lovable handles the code.
- **Stay in sync**: every change made in Lovable is committed straight to this repository.
- **Full ownership**: this code is yours. Push to `main` on GitHub and your changes sync back into Lovable, ready for your next prompt.

## Development

Prefer working locally? You need Node.js and npm — [install with nvm](https://github.com/nvm-sh/nvm#installing-and-updating).

```sh
git clone <this-repository-url>
cd <repository-name>
npm i
npm run dev
```
