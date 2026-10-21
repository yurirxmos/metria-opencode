import { homedir } from "node:os";
import { join } from "node:path";

const home = homedir();
const dataHome = process.env.XDG_DATA_HOME || join(home, ".local", "share");

export const paths = {
	claudeCredentials: join(process.env.CLAUDE_CONFIG_DIR || join(home, ".claude"), ".credentials.json"),
	codexAuth: join(process.env.CODEX_HOME || join(home, ".codex"), "auth.json"),
	openCodeAuth: join(dataHome, "opencode", "auth.json"),
};
