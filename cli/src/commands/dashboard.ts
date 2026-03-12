import { Command } from "commander";
import { api, output } from "../api.js";

export function registerDashboard(program: Command) {
  program
    .command("dashboard")
    .description("Show dashboard summary")
    .option("--quiet", "Output minimal")
    .action(async (opts) => {
      const { data } = await api("GET", "/dashboard");
      output(data, { quiet: opts.quiet });
    });
}
