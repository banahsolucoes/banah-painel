/**
 * Agentes de IA (Fase 4 em diante). Contrato que todo agente vai seguir:
 *
 * - Nível 1 relata, nível 2 sugere (Israel aprova), nível 3 executa dentro de limites.
 * - Toda ação passa por `registrarAcao` na tabela `acoes`, executada ou não.
 * - Fora de produção, sempre modo seco (`agentesEmModoSeco()` em @banah/shared).
 */
export type NivelAgente = 1 | 2 | 3;

export type DefinicaoAgente = {
  nome: string;
  nivel: NivelAgente;
  descricao: string;
};
