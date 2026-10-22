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

/** Tokens do OpenCode Go: o OAuth do Console vem primeiro, a API key é o último recurso. */
export async function openCodeGoTokens(source?: CredentialSource): Promise<string[]> {
	const [serverKey, serverConsole, openCode] = await Promise.all([
		source?.get("opencode-go"),
		source?.get("opencode"),
		readJson(paths.openCodeAuth),
	]);
	// O provider é autenticado pelo OAuth do OpenCode Console, não pela API key
	// legada de opencode-go (que expira sozinha).
	const tokens: (string | undefined)[] = [
		serverConsole?.access,
		serverKey?.key,
		openCode?.opencode?.access,
		openCode?.["opencode-go"]?.key,
	];
	return tokens.filter((token): token is string => typeof token === "string" && token.length > 0);
}

export async function fetchOpenCodeGoUsage(source?: CredentialSource): Promise<UsageWindow[]> {
	const tokens = await openCodeGoTokens(source);
	return firstSuccessful(
		tokens,
		async (token) => parseOpenCodeGoUsage(await requestJson(USAGE_URL, { Authorization: `Bearer ${token}` })),
		"OpenCode Go credentials not found.",
	);
}
