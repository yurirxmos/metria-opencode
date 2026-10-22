import type { OpenCodeClient } from "@opencode/client";

/** Consumo de tokens/custo registrado pelo próprio OpenCode para um provider. */
export interface LocalUsage {
	readonly input: number;
	readonly output: number;
	readonly cost: number;
}

export interface LocalWindow {
	readonly label: string;
	readonly input: number;
	readonly output: number;
	readonly cost: number;
}

const WINDOW_MS: readonly [string, number][] = [
	["5h", 5 * 60 * 60_000],
	["7d", 7 * 24 * 60 * 60_000],
	["30d", 30 * 24 * 60 * 60_000],
];

/** Soma o consumo local por provider (o campo `providerID` dos modelos usados). */
function summarizeStats(statistics: { models: { model: { providerID: string }; tokens: { input: number; output: number }; cost: number }[] }): Record<string, LocalUsage> {
	const byProvider: Record<string, { input: number; output: number; cost: number }> = {};
	for (const entry of statistics.models ?? []) {
		const id = entry.model.providerID;
		const usage = (byProvider[id] ??= { input: 0, output: 0, cost: 0 });
		usage.input += entry.tokens.input;
		usage.output += entry.tokens.output;
		usage.cost += entry.cost;
	}
	return byProvider;
}

/**
 * Busca o consumo local do OpenCode para um provider em três janelas (5h, 7d, 30d).
 * Serve como fallback para providers que não têm endpoint de cota conhecido.
 */
export async function fetchLocalUsage(
	client: OpenCodeClient,
	now = Date.now(),
): Promise<Record<string, LocalWindow[]>> {
	const perWindow = await Promise.all(
		WINDOW_MS.map(async ([label, milliseconds]) => {
			const from = now - milliseconds;
			// O tipo gerado do stats é verboso; a API aceita `{ from, to, tools }`.
			const statistics = await client.session.stats({ from, to: now, tools: "summary" } as never);
			return { label, usage: summarizeStats(statistics) };
		}),
	);

	const result: Record<string, LocalWindow[]> = {};
	for (const { label, usage } of perWindow) {
		for (const [id, value] of Object.entries(usage)) {
			(result[id] ??= []).push({ label, ...value });
		}
	}
	return result;
}
