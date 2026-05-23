#!/usr/bin/env node

import { realpathSync } from "node:fs";
import { resolve } from "node:path";
import { fileURLToPath, pathToFileURL } from "node:url";

import { resolveWorkflowConfig } from "../config/config-resolver.js";
import { WORKFLOW_FILENAME } from "../config/defaults.js";
import { loadWorkflowDefinition } from "../config/workflow-loader.js";
import { ERROR_CODES } from "../errors/codes.js";
import {
  type RuntimeServiceHandle,
  startRuntimeService,
} from "../orchestrator/runtime-host.js";

export const CLI_ACKNOWLEDGEMENT_FLAG = "--acknowledge-high-trust-preview";
// 这个应该是定义一个实体类
export interface CliOptions {
  workflowPath: string | null;
  logsRoot: string | null;
  port: number | null;
  acknowledged: boolean;
  help: boolean;
}

export interface CliRuntimeSettings {
  config: ReturnType<typeof resolveWorkflowConfig>;
  logsRoot: string | null;
}

export interface CliHost {
  waitForExit(): Promise<number | undefined>;
  shutdown?(): Promise<void>;
}

export interface StartCliHostInput {
  options: CliOptions;
  runtime: CliRuntimeSettings;
}

export interface CliIo {
  stdout(message: string): void;
  stderr(message: string): void;
}

export interface CliDependencies {
  cwd?: string;
  env?: NodeJS.ProcessEnv;
  io?: CliIo;
  loadWorkflowDefinition?: typeof loadWorkflowDefinition;
  resolveWorkflowConfig?: typeof resolveWorkflowConfig;
  startHost?: (input: StartCliHostInput) => Promise<CliHost>;
}

export class CliUsageError extends Error {
  readonly code = ERROR_CODES.cliStartupFailed;

  constructor(message: string) {
    super(message);
    this.name = "CliUsageError";
  }
}
// 解析参数：将参数解析为CliOptions
export function parseCliArgs(argv: readonly string[]): CliOptions {
  let workflowPath: string | null = null; // 工作流路径
  let logsRoot: string | null = null; // 日志根目录
  let port: number | null = null; // 端口
  let acknowledged = false; // 是否已确认
  let help = false; // 是否帮助

  for (let index = 0; index < argv.length; index += 1) {
    const token = argv[index];
    if (token === undefined) {
      continue;
    }

    // 如果token不以-开头，则认为是工作流路径
    if (!token.startsWith("-")) {
      if (workflowPath !== null) {
        throw new CliUsageError(
          "CLI accepts at most one positional workflow path argument.",
        );
      }

      workflowPath = token;
      continue;
    }

    // 如果token是--help或-h，则设置帮助为true
    if (token === "--help" || token === "-h") {
      help = true;
      continue;
    }

    // 如果token是--acknowledge-high-trust-preview，则设置已确认为true
    if (token === CLI_ACKNOWLEDGEMENT_FLAG) {
      acknowledged = true;
      continue;
    }

    // 如果token是--logs-root，则设置日志根目录
    if (token === "--logs-root") {
      logsRoot = readValueFlag(argv, ++index, "--logs-root");
      continue;
    }

    // 如果token以--logs-root=开头，则设置日志根目录
    if (token.startsWith("--logs-root=")) {
      logsRoot = token.slice("--logs-root=".length);
      ensureFlagValue(logsRoot, "--logs-root");
      continue;
    }

    // 如果token是--port，则设置端口
    if (token === "--port") {
      port = parsePort(readValueFlag(argv, ++index, "--port"));
      continue;
    }

    // 如果token以--port=开头，则设置端口
    if (token.startsWith("--port=")) {
      port = parsePort(token.slice("--port=".length));
      continue;
    }

    throw new CliUsageError(`Unknown CLI argument: ${token}`);
  }

  return {
    workflowPath,
    logsRoot,
    port,
    acknowledged,
    help,
  };
}

// 应用CLI覆盖：应用CLI覆盖
export function applyCliOverrides(
  config: ReturnType<typeof resolveWorkflowConfig>,
  options: CliOptions,
  cwd = process.cwd(),
): CliRuntimeSettings {
  return {
    config: {
      ...config,
      server: {
        ...config.server,
        port: options.port ?? config.server.port,
      },
    },
    logsRoot: options.logsRoot === null ? null : resolve(cwd, options.logsRoot),
  };
}

// 启动主机：启动主机
export async function startCliHost(
  input: StartCliHostInput,
): Promise<RuntimeServiceHandle> {
  // 启动运行时服务：启动运行时服务
  return startRuntimeService({
    // 配置：配置
    config: input.runtime.config,
    logsRoot: input.runtime.logsRoot,
  });
}

// 运行CLI，解析参数，加载工作流，启动主机
export async function runCli(
  argv: readonly string[],
  dependencies: CliDependencies = {},
): Promise<number> {
  // 当前工作目录：如果对应依赖中没有cwd，则使用process.cwd()
  const cwd = dependencies.cwd ?? process.cwd();
  // 环境变量：如果对应依赖中没有env，则使用process.env
  const env = dependencies.env ?? process.env;
  // 输出和错误输出
  const io = dependencies.io ?? {
    stdout: (message: string) => process.stdout.write(message),
    stderr: (message: string) => process.stderr.write(message),
  };
  // 加载工作流：如果对应依赖中没有loadWorkflowDefinition，则使用loadWorkflowDefinition
  const loadWorkflow =
    dependencies.loadWorkflowDefinition ?? loadWorkflowDefinition;
  // 解析配置：如果对应依赖中没有resolveWorkflowConfig，则使用resolveWorkflowConfig
  const resolveConfig =
    dependencies.resolveWorkflowConfig ?? resolveWorkflowConfig;
  // 启动主机：如果对应依赖中没有startHost，则使用startCliHost
  const startHost = dependencies.startHost ?? startCliHost;

  let options: CliOptions;
  // 解析参数：如果对应依赖中没有parseCliArgs，则使用parseCliArgs
  try {
    options = parseCliArgs(argv);
  } catch (error) {
    io.stderr(`${formatCliError(error)}\n${renderUsage()}`);
    return 1;
  }
  // 如果当前是help命令，
  if (options.help) {
    // 输出help 的相关内容
    io.stdout(renderUsage());
    return 0;
  }

  // 如果当前不是高信任模式下，需要停止并且输出错误信息
  if (!options.acknowledged) {
    io.stderr(
      `Refusing to start without ${CLI_ACKNOWLEDGEMENT_FLAG}. Symphony is a high-trust preview intended for trusted environments.\n`,
    );
    return 1;
  }

  try {
    // 如果工作流路径为空，则使用默认的工作流路径
    const workflowPath =
      options.workflowPath === null
        ? resolve(cwd, WORKFLOW_FILENAME)
        : resolve(cwd, options.workflowPath);
    // 加载工作流：如果对应依赖中没有loadWorkflowDefinition，则使用loadWorkflowDefinition
    const workflow = await loadWorkflow(workflowPath);
    // 解析配置：如果对应依赖中没有resolveWorkflowConfig，则使用resolveWorkflowConfig
    const config = resolveConfig(workflow, env);
    // 将配置信息更改成运行时的环境上下文信息
    const runtime = applyCliOverrides(config, options, cwd);
    // 启动主机：如果对应依赖中没有startHost，则使用startCliHost
    const host = await startHost({
      options,
      runtime,
    });
    // 等待主机退出：如果对应依赖中没有waitForExit，则使用waitForExit
    const exitCode = await host.waitForExit();

    // 如果主机退出码不为0，则输出错误信息
    if (typeof exitCode === "number" && exitCode !== 0) {
      io.stderr(`Symphony host exited abnormally with code ${exitCode}.\n`);
      return exitCode;
    }
    // 返回0，表示成功 ，表示正常退出
    return 0;
  } catch (error) {
    // 如果发生错误，则输出错误信息
    io.stderr(`${formatCliError(error)}\n`);
    // 返回1，表示失败
    return 1;
  }
}

// 入口方法，调用runcli方法
export async function main(): Promise<void> {
  // process ，服务启动时，传的所有参数
  const exitCode = await runCli(process.argv.slice(2));
  process.exitCode = exitCode;
}

export function shouldRunAsCli(
  importMetaUrl: string,
  entryPath: string | undefined,
): boolean {
  if (!entryPath) {
    return false;
  }

  try {
    return (
      realpathSync(fileURLToPath(importMetaUrl)) === realpathSync(entryPath)
    );
  } catch {
    return importMetaUrl === pathToFileURL(entryPath).href;
  }
}

function readValueFlag(
  argv: readonly string[],
  index: number,
  flag: string,
): string {
  const value = argv[index];
  ensureFlagValue(value, flag);
  return value;
}

function ensureFlagValue(
  value: string | undefined,
  flag: string,
): asserts value is string {
  if (!value || value.startsWith("-")) {
    throw new CliUsageError(`Missing value for ${flag}.`);
  }
}

function parsePort(rawPort: string): number {
  if (!/^\d+$/.test(rawPort.trim())) {
    throw new CliUsageError(`Invalid value for --port: ${rawPort}`);
  }

  return Number.parseInt(rawPort, 10);
}

function formatCliError(error: unknown): string {
  if (error instanceof Error && error.message) {
    return error.message;
  }

  return "Symphony failed to start.";
}

// help命令时需要输出的数据
function renderUsage(): string {
  return [
    "Usage: symphony [path-to-WORKFLOW.md] [options]",
    "",
    "Options:",
    `  ${CLI_ACKNOWLEDGEMENT_FLAG}  required before startup`,
    "  --logs-root <path>           override the logs root directory",
    "  --port <number>              override the HTTP server port",
    "  --help                       show this help text",
    "",
  ].join("\n");
}

if (shouldRunAsCli(import.meta.url, process.argv[1])) {
  void main();
}
