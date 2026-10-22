import type { CredentialSource } from "./credentials.ts";
import { claudeTokens } from "./providers/claude.ts";
import { codexCredentials } from "./providers/codex.ts";
import { openCodeGoTokens } from "./providers/opencodeGo.ts";
import type { ProviderKind } from "./usage.ts";

/** Providers medidos pelo Metria, na ordem em que aparecem na janela de uso. */
export const PROVIDER_KINDS: readonly ProviderKind[] = ["Claude", "Codex", "OpenCode Go"];

/** Integrações que já têm medição no plugin (ou são o mesmo login de uma delas). */
const MEASURED_INTEGRATIONS = new Set(["anthropic", "openai", "codex", "opencode-go", "opencode"]);

const INTEGRATION_LABELS: Record<string, string> = {
	"github-copilot": "GitHub Copilot",
	google: "Google",
	xai: "xAI",
	zai: "Z.AI",
};

const DETECTORS: Record<ProviderKind, (source?: CredentialSource) => Promise<boolean>> = {
	Claude: async (source) => (await claudeTokens(source)).length > 0,
	Codex: async (source) => (await codexCredentials(source)).length > 0,
	"OpenCode Go": async (source) => (await openCodeGoTokens(source)).length > 0,
};

/** Providers com credencial disponível, sem chamar a API de uso. */
export async function detectProviders(source?: CredentialSource): Promise<ProviderKind[]> {
	const detected = await Promise.all(
		PROVIDER_KINDS.map(async (kind) => ((await DETECTORS[kind](source)) ? kind : undefined)),
	);
	return detected.filter((kind): kind is ProviderKind => kind !== undefined);
}

/** Integrações conectadas que não têm medição de uso no plugin. */
export function unmeasuredIntegrations(credentials: readonly { integrationID: string; active: boolean }[]): string[] {
	const ids = credentials
		.filter((entry) => entry.active && !MEASURED_INTEGRATIONS.has(entry.integrationID))
		.map((entry) => INTEGRATION_LABELS[entry.integrationID] ?? entry.integrationID);
	return [...new Set(ids)].sort();
}
