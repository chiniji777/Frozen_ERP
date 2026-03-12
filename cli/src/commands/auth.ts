import { Command } from "commander";
import { api, output } from "../api.js";
import { saveToken, clearToken } from "../config.js";

export function registerAuth(program: Command) {
  program
    .command("login")
    .description("Login and save JWT token")
    .requiredOption("-u, --username <username>", "Username")
    .requiredOption("-p, --password <password>", "Password")
    .action(async (opts) => {
      const { status, data } = await api("POST", "/auth/login", {
        username: opts.username,
        password: opts.password,
      });
      if (status !== 200 || !(data as any).token) {
        console.error(JSON.stringify({ error: "Login failed", detail: data }));
        process.exit(1);
      }
      saveToken((data as any).token);
      output({ ok: true, message: "Logged in", user: (data as any).user });
    });

  program
    .command("logout")
    .description("Clear saved token")
    .action(() => {
      clearToken();
      output({ ok: true, message: "Logged out" });
    });

  program
    .command("whoami")
    .description("Show current user")
    .action(async () => {
      const { data } = await api("GET", "/auth/me");
      output(data);
    });
}
