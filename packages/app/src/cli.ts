#!/usr/bin/env node
import process from "node:process";
import { Command } from "commander";
import { runExportBundleCommand } from "./cli/commands/export-bundle-command.js";
import { runUiCommand } from "./cli/commands/ui-command.js";
import { runVerifyCommand } from "./cli/commands/verify-command.js";
import { parseAgent, parseInteger, parseOutputFormat } from "./cli/parse.js";
import type { AgentTarget, OutputFormat } from "./cli/types.js";

const main = async (): Promise<void> => {
  const program = new Command();

  program.name("specflow").description("SpecFlow CLI").version("0.1.0");

  program
    .command("ui")
    .description("Start the local SpecFlow server and board UI")
    .option("--host <host>", "Host binding", "127.0.0.1")
    .option("--port <port>", "Port binding", parseInteger, 3141)
    .option("--no-open", "Do not open browser", false)
    .action((options) => {
      void runUiCommand(options as { host: string; port: number; noOpen: boolean });
    });

  program
    .command("export-bundle")
    .description("Export a ticket bundle for an agent")
    .requiredOption("--ticket <ticket>", "Ticket ID")
    .option("--agent <agent>", "Target agent", parseAgent, "codex-cli")
    .option("--format <format>", "Output format (text|json)", parseOutputFormat, "text")
    .option("--server-url <serverUrl>", "Explicit server URL override")
    .option("--timeout-ms <timeoutMs>", "Delegated request timeout in milliseconds", parseInteger, 10_000)
    .option("--operation-id <operationId>", "Idempotency key override")
    .action(async (options) => {
      await runExportBundleCommand(options as {
        ticket: string;
        agent: AgentTarget;
        format: OutputFormat;
        serverUrl?: string;
        timeoutMs: number;
        operationId?: string;
      });
    });

  program
    .command("verify")
    .description("Capture and verify ticket results")
    .requiredOption("--ticket <ticket>", "Ticket ID")
    .option("--summary <summary>", "Agent summary text")
    .option("--widen <path...>", "Additional widened scope paths")
    .option("--format <format>", "Output format (text|json)", parseOutputFormat, "text")
    .option("--server-url <serverUrl>", "Explicit server URL override")
    .option("--timeout-ms <timeoutMs>", "Delegated request timeout in milliseconds", parseInteger, 10_000)
    .option("--operation-id <operationId>", "Idempotency key override")
    .action(async (options) => {
      await runVerifyCommand(options as {
        ticket: string;
        summary?: string;
        widen?: string[];
        format: OutputFormat;
        serverUrl?: string;
        timeoutMs: number;
        operationId?: string;
      });
    });

  try {
    await program.parseAsync(process.argv);
  } catch (error) {
    process.stderr.write(`${(error as Error).message}\n`);
    process.exit(1);
  }
};

void main();
