import type { CredentialSource } from "../credentials.ts";
import { percent, readJson, requestJson, type UsageWindow } from "../http.ts";
import { paths } from "../paths.ts";

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
	const fromServer = await source?.get("opencode-go");
	const key: string | undefined = fromServer?.key ?? (await readJson(paths.openCodeAuth))?.["opencode-go"]?.key;
	if (!key) throw new Error("OpenCode Go credentials not found.");
	return parseOpenCodeGoUsage(
		await requestJson("https://opencode.ai/zen/go/v1/usage", { Authorization: `Bearer ${key}` }),
	);
}
