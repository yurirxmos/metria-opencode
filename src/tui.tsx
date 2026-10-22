/** @jsxImportSource @opentui/solid */
// Pragma por arquivo: evita depender da descoberta do tsconfig.json em tempo de execução
// (o pacote publicado pode não incluir o tsconfig.json), garantindo que o JSX use o
// runtime do Solid/OpenTUI em vez de cair no runtime padrão do React.
import { Plugin } from "@opencode/plugin/tui";
import { Show, createMemo, createSignal } from "solid-js";

import { serverCredentials } from "./credentials.ts";
import type { UsageWindow } from "./http.ts";
import {
	type Level,
	type ProviderKind,
	EXCEEDED_THRESHOLD,
	fetchUsage,
	formatPercent,
	formatReset,
	friendlyError,
	level,
	providerKind,
	resetLabel,
	summarize,
} from "./usage.ts";

const REFRESH_INTERVAL_MS = 5 * 60_000;
const MIN_REFRESH_GAP_MS = 60_000;
const ALERT_ICON = "▲";

type Entry = {
	windows: UsageWindow[];
	error: string | null;
	fetchedAt: number;
};

type State = Partial<Record<ProviderKind, Entry>>;

export default Plugin.define({
	id: "metria.opencode",
	setup(context) {
		const [state, updateState] = context.storage.memory<State>("usage", { initial: {} });
		const inFlight = new Map<ProviderKind, Promise<void>>();
		const notified = new Set<ProviderKind>();
		const credentials = serverCredentials(context.client);
		const [now, setNow] = createSignal(Date.now());

		const currentKind = () => providerKind(context.ui.model.current()?.providerID);

		function refresh(kind: ProviderKind | undefined, force = false): Promise<void> {
			if (!kind) return Promise.resolve();
			const pending = inFlight.get(kind);
			if (pending) return pending;
			const last = state[kind]?.fetchedAt ?? 0;
			if (!force && Date.now() - last < MIN_REFRESH_GAP_MS) return Promise.resolve();

			const task = fetchUsage(kind, credentials)
				.then(
					(windows) => ({ windows, error: null }),
					(error: unknown) => ({
						windows: state[kind]?.windows ?? [],
						error: friendlyError(kind, error),
					}),
				)
				.then((result) => {
					updateState((draft) => {
						draft[kind] = { ...result, fetchedAt: Date.now() };
					});
					if (result.error && !notified.has(kind)) {
						notified.add(kind);
						context.ui.toast.show({
							title: `Metria · ${kind}`,
							message: result.error,
							variant: "warning",
						});
					}
				})
				.finally(() => inFlight.delete(kind));
			inFlight.set(kind, task);
			return task;
		}

		const color = (value: Level) => {
			const feedback = context.theme.text.feedback;
			switch (value) {
				case "exceeded":
				case "high":
					return feedback.error.base;
				case "medium":
					return feedback.warning.base;
				case "low":
					return feedback.info.base;
				default:
					return feedback.success.base;
			}
		};

		function UsageStatus() {
			const kind = createMemo(() => {
				const value = currentKind();
				void refresh(value);
				return value;
			});
			const entry = () => {
				const value = kind();
				return value ? state[value] : undefined;
			};
			const summary = () => summarize(entry()?.windows ?? []);
			const stale = () => entry()?.error != null;
			const describe = (window: UsageWindow, prefix: string) => {
				const reset = resetLabel(window, now());
				const base = `${prefix}${window.label} ${formatPercent(window.percent)}`;
				return reset ? `${base} · ${reset}` : base;
			};

			return (
				<Show
					when={summary().primary}
					fallback={
						<Show when={entry()?.error}>
							<text fg={context.theme.text.feedback.error.base}>{"usage !"}</text>
						</Show>
					}
				>
					{(primary) => (
						<box flexDirection="row" gap={1}>
							<text fg={stale() ? context.theme.text.faint : color(level(primary().percent))}>
								{describe(primary(), "")}
							</text>
							<Show when={summary().alert}>
								{(alert) => (
									<text fg={color(level(alert().percent))}>
										{describe(alert(), `${ALERT_ICON} `)}
									</text>
								)}
							</Show>
						</box>
					)}
				</Show>
			);
		}

		async function showDetails() {
			const kind = currentKind();
			if (!kind) {
				context.ui.toast.show({
					title: "Metria",
					message: "O provider atual não é suportado (Claude, Codex ou OpenCode Go).",
					variant: "warning",
				});
				return;
			}
			await refresh(kind, true);
			const entry = state[kind];
			const lines = (entry?.windows ?? []).map((window) => {
				const reset = formatReset(window.resetDate);
				return `${window.title}: ${formatPercent(window.percent)}${reset ? ` (reseta em ${reset})` : ""}`;
			});
			if (entry?.error) lines.push("", `Erro: ${entry.error}`);
			await context.ui.dialog.alert({
				title: `Metria · ${kind}`,
				message: lines.length ? lines.join("\n") : "Nenhum dado de uso encontrado.",
			});
		}

		context.keymap.layer(() => ({
			mode: "global",
			commands: [
				{
					id: "metria.usage",
					title: "Mostrar uso da IA atual",
					group: "Metria",
					palette: true,
					slash: { name: "usage", aliases: ["metria"] },
					run: () => {
						void showDetails();
					},
				},
			],
		}));

		const removeSlot = context.ui.slot({ append: "prompt.footer.status", render: () => <UsageStatus /> });
		const stopEvents = context.data.on("session.execution.succeeded", () => {
			void refresh(currentKind());
		});

		// A key replaced from the OpenCode UI should show up without waiting for the next interval.
		const resetUsage = () => {
			updateState((draft) => {
				for (const key of Object.keys(draft) as ProviderKind[]) {
					const entry = draft[key];
					if (entry) entry.fetchedAt = 0;
				}
			});
			notified.clear();
			void refresh(currentKind(), true);
		};
		const stopCredentialUpdate = context.data.on("credential.updated", resetUsage);
		const stopCredentialSwitch = context.data.on("credential.switched", resetUsage);

		let lastResetRefresh = 0;
		let lastPeriodicRefresh = Date.now();
		const tick = () => {
			const time = Date.now();
			setNow(time);
			const kind = currentKind();
			if (!kind) return;
			if (time - lastPeriodicRefresh >= REFRESH_INTERVAL_MS) {
				lastPeriodicRefresh = time;
				void refresh(kind, true);
				return;
			}
			// Once a used-up window resets, the percentage is stale: fetch again.
			const expired = (state[kind]?.windows ?? []).some(
				(window) =>
					window.percent >= EXCEEDED_THRESHOLD &&
					window.resetDate !== null &&
					new Date(window.resetDate).getTime() <= time,
			);
			if (expired && time - lastResetRefresh > MIN_REFRESH_GAP_MS) {
				lastResetRefresh = time;
				void refresh(kind, true);
			}
		};
		const timer = setInterval(tick, 30_000);

		return () => {
			clearInterval(timer);
			stopEvents();
			stopCredentialUpdate();
			stopCredentialSwitch();
			removeSlot();
		};
	},
});
