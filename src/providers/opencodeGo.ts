import type { CredentialSource } from "../credentials.ts";
import { firstSuccessful, percent, readJson, requestJson, type UsageWindow } from "../http.ts";
import { paths } from "../paths.ts";

const USAGE_URL = "https://opencode.ai/zen/go/v1/usage";

export function parseOpenCodeGoUsage(data: any): UsageWindow[] {
	const windows: [string, string, string][] = [
		["5h", "Current session", "rolling"],
		["7d", "This week", "weekly"],
		["30d", "This month", "monthly"],
	];
	return windows.flatMap(([label, title, key]) => {
		const limit = data?.usage?.[key];
		return limit
			? [{ label, title, percent: percent(limit.percent), resetDate: limit.resetsAt ?? limit.resets_at ?? null }]
			: [];
	});
}

export async function fetchOpenCodeGoUsage(source?: CredentialSource): Promise<UsageWindow[]> {
	const [serverKey, serverConsole, openCode] = await Promise.all([
		source?.get("opencode-go"),
		source?.get("opencode"),
		readJson(paths.openCodeAuth),
	]);
	// A API key legada do opencode-go expira sozinha; o token do OpenCode Console
	// continua válido e responde o mesmo endpoint, então serve de fallback.
	const tokens: (string | undefined)[] = [
		serverKey?.key,
		serverConsole?.access,
		openCode?.["opencode-go"]?.key,
		openCode?.opencode?.access,
	];
	return firstSuccessful(
		tokens,
		async (token) => parseOpenCodeGoUsage(await requestJson(USAGE_URL, { Authorization: `Bearer ${token}` })),
		"OpenCode Go credentials not found.",
	);
}
