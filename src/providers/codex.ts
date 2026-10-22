import type { CredentialSource } from "../credentials.ts";
import { HttpError, percent, postJson, readJson, requestJson, type UsageWindow } from "../http.ts";
import { paths } from "../paths.ts";

type Credentials = { access: string; refresh?: string; accountId: string };
type Limit = { used_percent?: number; reset_at?: number; limit_window_seconds?: number } | null | undefined;

// Same OAuth app and endpoint Codex CLI uses to refresh its ChatGPT session.
const TOKEN_URL = "https://auth.openai.com/oauth/token";
const CLIENT_ID = "app_EMoamEEZ73f0CkXaXp7hrann";

export function parseCodexAuth(auth: any): Credentials | undefined {
	if (auth?.tokens?.access_token && auth.tokens.account_id) {
		return { access: auth.tokens.access_token, refresh: auth.tokens.refresh_token, accountId: auth.tokens.account_id };
	}
	if (auth?.openai?.access && auth.openai.accountId) {
		return { access: auth.openai.access, refresh: auth.openai.refresh, accountId: auth.openai.accountId };
	}
	return undefined;
}

/** Credentials as stored by the OpenCode server: OAuth token plus account id metadata. */
function parseServerAuth(auth: any): Credentials | undefined {
	if (auth?.type !== "oauth" || !auth.access) return undefined;
	const accountId = auth.metadata?.accountID ?? auth.metadata?.accountId;
	return accountId ? { access: auth.access, refresh: auth.refresh, accountId } : undefined;
}

async function refreshAccessToken(refreshToken: string): Promise<string> {
	const data = (await postJson(TOKEN_URL, {
		client_id: CLIENT_ID,
		grant_type: "refresh_token",
		refresh_token: refreshToken,
	})) as { access_token?: string };
	if (!data.access_token) throw new Error("OpenAI did not return a new access token.");
	return data.access_token;
}

const WINDOW_TITLES: Record<string, string> = {
	"5h": "Current session",
	"7d": "This week",
	"30d": "This month",
};

function windowLabel(limit: NonNullable<Limit>, fallback: string): string {
	const seconds = limit.limit_window_seconds;
	if (!seconds) return fallback;
	const hours = Math.round(seconds / 3600);
	return hours >= 24 ? `${Math.round(hours / 24)}d` : `${hours}h`;
}

export function parseCodexUsage(data: any): UsageWindow[] {
	const rateLimit = data?.rate_limit;
	const windows: [string, Limit][] = [
		["5h", rateLimit?.primary_window],
		["7d", rateLimit?.secondary_window],
	];
	return windows.flatMap(([fallback, limit]) => {
		if (!limit || limit.used_percent === undefined) return [];
		const label = windowLabel(limit, fallback);
		return [
			{
				label,
				title: WINDOW_TITLES[label] ?? `Window (${label})`,
				percent: percent(limit.used_percent),
				resetDate: limit.reset_at ? new Date(limit.reset_at * 1000).toISOString() : null,
			},
		];
	});
}

async function fetchWithCredential(credentials: Credentials): Promise<UsageWindow[]> {
	const request = (access: string) =>
		requestJson("https://chatgpt.com/backend-api/wham/usage", {
			Authorization: `Bearer ${access}`,
			"ChatGPT-Account-Id": credentials.accountId,
		});
	try {
		return parseCodexUsage(await request(credentials.access));
	} catch (error) {
		if (!(error instanceof HttpError) || error.status !== 401 || !credentials.refresh) throw error;
		const refreshed = await refreshAccessToken(credentials.refresh);
		return parseCodexUsage(await request(refreshed));
	}
}

/** Credenciais do Codex na ordem de tentativa: servidor, auth.json do OpenCode e do Codex CLI. */
export async function codexCredentials(source?: CredentialSource): Promise<Credentials[]> {
	const [server, openCode, codex] = await Promise.all([
		source?.get("openai"),
		readJson(paths.openCodeAuth),
		readJson(paths.codexAuth),
	]);
	return [parseServerAuth(server), parseCodexAuth(openCode), parseCodexAuth(codex)].filter(
		(candidate): candidate is Credentials => candidate !== undefined,
	);
}

export async function fetchCodexUsage(source?: CredentialSource): Promise<UsageWindow[]> {
	const candidates = await codexCredentials(source);
	if (candidates.length === 0) throw new Error("Codex credentials not found. Sign in with OpenCode or Codex.");

	let lastError: unknown;
	for (const credentials of candidates) {
		try {
			return await fetchWithCredential(credentials);
		} catch (error) {
			lastError = error;
		}
	}
	throw lastError;
}
