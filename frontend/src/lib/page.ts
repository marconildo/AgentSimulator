// 041-settings-page · The top-level page union. There's no real router (the
// codebase intentionally uses a simple `useState<Page>` in `App.tsx`, mirroring
// the original Sim ↔ Learn toggle from 005). The `settings` value lands the
// user on the dedicated `<SettingsPage />`; only one of these is ever mounted.
export type Page = "sim" | "learn" | "settings";
