import type { UsageWindow } from "./http.ts";
import { HttpError } from "./http.ts";
import type { CredentialSource } from "./credentials.ts";
import { fetchClaudeUsage } from "./providers/claude.ts";
import { fetchCodexUsage } from "./providers/codex.ts";
import { fetchOpenCodeGoUsage } from "./providers/opencodeGo.ts";

export type ProviderKind = "Claude" | "Codex" | "OpenCode Go";

export const WARNING_THRESHOLD = 85;

const FETCHERS: Record<ProviderKind, (source?: CredentialSource) => Promise<UsageWindow[]>> = {
	Claude: fetchClaudeUsage,
	Codex: fetchCodexUsage,
	"OpenCode Go": fetchOpenCodeGoUsage,
};

export function providerKind(providerID: string | undefined): ProviderKind | undefined {
	switch (providerID) {
		case "anthropic":
		case "claude":
			return "Claude";
		case "openai":
		case "codex":
			return "Codex";
		case "opencode-go":
			return "OpenCode Go";
		default:
			return undefined;
	}
}

export function fetchUsage(kind: ProviderKind, source?: CredentialSource): Promise<UsageWindow[]> {
	return FETCHERS[kind](source);
}

export type Level = "ok" | "low" | "medium" | "high" | "exceeded";

export function level(percent: number): Level {
	if (percent >= 100) return "exceeded";
	if (percent >= WARNING_THRESHOLD) return "high";
	if (percent >= 65) return "medium";
	if (percent >= 40) return "low";
	return "ok";
}

export interface FooterSummary {
	primary: UsageWindow | undefined;
	/** Highest non-primary window at or above the warning threshold. */
	alert: UsageWindow | undefined;
}

export function summarize(windows: readonly UsageWindow[]): FooterSummary {
	const [primary, ...others] = windows;
	const alert = others
		.filter((window) => window.percent >= WARNING_THRESHOLD)
		.sort((left, right) => right.percent - left.percent)[0];
	return { primary, alert };
}

export function formatPercent(percent: number): string {
	return `${Math.round(percent)}%`;
}

export const EXCEEDED_THRESHOLD = 100;

export function formatReset(resetDate: string | null, now = Date.now()): string {
	if (!resetDate) return "";
	const ms = new Date(resetDate).getTime() - now;
	if (!Number.isFinite(ms) || ms <= 0) return "now";
	const totalMinutes = Math.max(1, Math.round(ms / 60_000));
	if (totalMinutes < 60) return `${totalMinutes}m`;
	const hours = Math.floor(totalMinutes / 60);
	const minutes = totalMinutes % 60;
	if (hours < 24) return minutes ? `${hours}h${String(minutes).padStart(2, "0")}m` : `${hours}h`;
	const days = Math.floor(hours / 24);
	return hours % 24 ? `${days}d${hours % 24}h` : `${days}d`;
}

/** "resets in 1h30m", but only once the window is fully used. */
export function resetLabel(window: UsageWindow, now = Date.now()): string {
	if (window.percent < EXCEEDED_THRESHOLD) return "";
	const formatted = formatReset(window.resetDate, now);
	return formatted ? `resets in ${formatted}` : "";
}

/** Turns provider errors into something actionable inside the TUI. */
export function friendlyError(kind: ProviderKind, error: unknown): string {
	const status = error instanceof HttpError ? error.status : undefined;
	if (status === 401 || status === 403) {
		switch (kind) {
			case "Claude":
				return "Credenciais do Claude expiradas. Rode `claude auth login`.";
			case "Codex":
				return "Credenciais do Codex expiradas. Faça login de novo no Codex.";
			case "OpenCode Go":
				return "API key do OpenCode Go expirada. Gere uma nova key no OpenCode Console e rode `opencode auth login`.";
		}
	}
	return error instanceof Error ? error.message : String(error);
}
