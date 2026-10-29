# Documentação

Os documentos vivos (editáveis, com diagramas UML) ficam no Claude:

- **Especificação do produto** — camadas de análise, estoque e previsão 60d, saúde da conta,
  agentes, fases: https://claude.ai/artifact/Y1kLTyS8RubFjNiqKR2g9H
- **Arquitetura técnica** — componentes, UML de domínio e de sequência, ambientes, CI/CD,
  custos, integridade dos dados, passo a passo: https://claude.ai/artifact/PacWqQFpZixA8foJuaCNRo

Decisões técnicas registradas aqui no repositório: `docs/adr/`.

Nota: na arquitetura o conector aparece como `connectors/mercadolivre`; no código ele está em
`packages/connectors/ml` (pacote `@banah/connector-ml`).
