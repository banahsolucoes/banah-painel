/** Espera antes de cada nova tentativa, em minutos. Na 5ª falha a tarefa vai para "falhou". */
export const ESPERAS_MIN = [1, 5, 30, 120] as const;
export const MAX_TENTATIVAS = ESPERAS_MIN.length + 1;

/** Tarefa "executando" há mais que isto é considerada abandonada (execução morta). */
export const RESERVA_EXPIRA_MIN = 15;

export function proximaEspera(tentativas: number): number | null {
  if (tentativas >= MAX_TENTATIVAS) return null;
  return ESPERAS_MIN.at(Math.max(0, tentativas - 1)) ?? null;
}
