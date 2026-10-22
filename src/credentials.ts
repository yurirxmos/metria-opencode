/** Integration IDs that Metria knows how to read usage for. */
export type IntegrationID = "openai" | "anthropic" | "opencode-go" | "opencode";

export interface CredentialSource {
	/** Returns the active credential value for an integration, when available. */
	get(integrationID: IntegrationID): Promise<Record<string, any> | undefined>;
}

type CredentialClient = {
	credential: {
		list(): Promise<ReadonlyArray<{ integrationID: string; active: boolean; value: unknown }>>;
	};
};

/**
 * Reads credentials from the connected OpenCode server. This is the source the
 * app itself uses, so a key replaced from the UI is picked up immediately
 * instead of waiting for `auth.json` to be rewritten.
 */
export function serverCredentials(client: CredentialClient): CredentialSource {
	return {
		async get(integrationID) {
			try {
				const entries = await client.credential.list();
				const matches = entries.filter((entry) => entry.integrationID === integrationID);
				const entry = matches.find((candidate) => candidate.active) ?? matches[0];
				return entry ? (entry.value as Record<string, any>) : undefined;
			} catch {
				return undefined;
			}
		},
	};
}
