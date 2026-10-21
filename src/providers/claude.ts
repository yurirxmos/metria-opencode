import type { CredentialSource } from "../credentials.ts";
import { firstSuccessful, percent, readJson, requestJson, type UsageWindow } from "../http.ts";
import { paths } from "../paths.ts";

type Limit = { utilization?: number; resets_at?: string } | null | undefined;

export function parseClaudeUsage(data: any): UsageWindow[] {
	const windows: [string, string, Limit][] = [
		["5h", "Current session", data?.five_hour],
		["7d", "All models (week)", data?.seven_day],
		["7d opus", "Opus (week)", data?.seven_day_opus],
		["7d sonnet", "Sonnet (week)", data?.seven_day_sonnet],
	];
	return windows.flatMap(([label, title, limit]) =>
		limit ? [{ label, title, percent: percent(limit.utilization), resetDate: limit.resets_at ?? null }] : [],
	);
}

export async function fetchClaudeUsage(source?: CredentialSource): Promise<UsageWindow[]> {
	const [server, claude, openCode] = await Promise.all([
		source?.get("anthropic"),
		readJson(paths.claudeCredentials),
		readJson(paths.openCodeAuth),
	]);
	const tokens: (string | undefined)[] = [
		server?.access,
		claude?.claudeAiOauth?.accessToken,
		openCode?.anthropic?.access,
	];
	return firstSuccessful(
		tokens,
		async (token) =>
			parseClaudeUsage(
				await requestJson("https://api.anthropic.com/api/oauth/usage", {
					Authorization: `Bearer ${token}`,
					"anthropic-beta": "oauth-2025-04-20",
				}),
			),
		"Claude credentials not found. Run `claude auth login`.",
	);
}
