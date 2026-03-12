import { Command } from "commander";
import { api, output } from "../api.js";

interface ResourceConfig {
  name: string;
  apiPath: string;
  description: string;
}

export function registerCrud(program: Command, config: ResourceConfig) {
  const cmd = program.command(config.name).description(config.description);

  cmd
    .command("list")
    .description(`List all ${config.name}`)
    .option("--limit <n>", "Limit results", parseInt)
    .option("--search <keyword>", "Search keyword")
    .option("--quiet", "Output IDs only")
    .action(async (opts) => {
      const params = new URLSearchParams();
      if (opts.limit) params.set("limit", String(opts.limit));
      if (opts.search) params.set("search", opts.search);
      const qs = params.toString() ? `?${params.toString()}` : "";
      const { data } = await api("GET", `${config.apiPath}${qs}`);
      output(data, { quiet: opts.quiet });
    });

  cmd
    .command("get <id>")
    .description(`Get ${config.name} by ID`)
    .option("--quiet", "Output ID only")
    .action(async (id, opts) => {
      const { data } = await api("GET", `${config.apiPath}/${id}`);
      output(data, { quiet: opts.quiet });
    });

  cmd
    .command("create")
    .description(`Create new ${config.name}`)
    .requiredOption("--json <body>", "JSON body")
    .action(async (opts) => {
      let body: unknown;
      try {
        body = JSON.parse(opts.json);
      } catch {
        console.error(JSON.stringify({ error: "Invalid JSON body" }));
        process.exit(1);
      }
      const { data } = await api("POST", config.apiPath, body);
      output(data);
    });

  cmd
    .command("update <id>")
    .description(`Update ${config.name}`)
    .requiredOption("--json <body>", "JSON body")
    .action(async (id, opts) => {
      let body: unknown;
      try {
        body = JSON.parse(opts.json);
      } catch {
        console.error(JSON.stringify({ error: "Invalid JSON body" }));
        process.exit(1);
      }
      const { data } = await api("PUT", `${config.apiPath}/${id}`, body);
      output(data);
    });

  cmd
    .command("delete <id>")
    .description(`Delete ${config.name}`)
    .action(async (id) => {
      const { data } = await api("DELETE", `${config.apiPath}/${id}`);
      output(data);
    });
}
