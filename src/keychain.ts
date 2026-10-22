import { execFile } from "node:child_process";
import { promisify } from "node:util";

const executeFile = promisify(execFile);

/**
 * Lê um segredo JSON do Keychain do macOS. O Claude Code guarda o OAuth aqui em
 * vez de `~/.claude/.credentials.json`, então sem isso o token válido não é visto.
 */
export async function readKeychainJson(service: string): Promise<any> {
	if (process.platform !== "darwin") return undefined;
	try {
		const { stdout } = await executeFile("security", ["find-generic-password", "-s", service, "-w"], {
			encoding: "utf8",
		});
		return JSON.parse(stdout);
	} catch {
		return undefined;
	}
}
