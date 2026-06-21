import { createWriteStream } from "node:fs";
import { access, mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { Writable } from "node:stream";

import { mapAgentRunnerEventToHarnessAgentEvent } from "../agent/backends/codex/codex-event-adapter.js";
import type {
  AgentHarness,
  AgentHarnessLike,
} from "../agent/harness/agent-harness.js";
import { createAgentHarness } from "../agent/harness/harness-factory.js";
import type {
  HarnessAgentEvent,
  HarnessRunResult,
} from "../agent/harness/types.js";
import type { AgentRunnerEvent } from "../agent/runner.js";
import type { ExportIfExportableResult } from "../artifact-store/exportable-content.js";
import { ArtifactStore, WorkflowExporter } from "../artifact-store/index.js";
import type {
  WorkflowDetail,
  WorkflowSummary,
} from "../artifact-store/types.js";
import { validateDispatchConfig } from "../config/config-resolver.js";
import type { ResolvedWorkflowConfig } from "../config/types.js";
import { WorkflowWatcher } from "../config/workflow-watch.js";
import type { Issue, RetryEntry, RunningEntry } from "../domain/model.js";
import { ERROR_CODES } from "../errors/codes.js";
import {
  type RuntimeSnapshot,
  buildRuntimeSnapshot,
} from "../logging/runtime-snapshot.js";
import {
  StructuredLogger,
  createJsonLineSink,
} from "../logging/structured-logger.js";
import {
  type DashboardServerHost,
  type DashboardServerInstance,
  type IssueDetailResponse,
  type RefreshResponse,
  startDashboardServer,
} from "../observability/dashboard-server.js";
import {
  type WorkflowListStatus,
  WorkflowService,
} from "../observability/workflow-service.js";
import {
  PmsTrackerClient,
  validatePmsTrackerAuthIfConfigured,
} from "../tracker/pms/pms-client.js";
import { PmsWritebackService } from "../tracker/pms/pms-writeback.js";
import { createIssueTracker } from "../tracker/tracker-factory.js";
import type { IssueTracker } from "../tracker/tracker.js";
import { resolveChangeRef } from "../workflow/change-ref-path.js";
import { deriveEffectivePhase } from "../workflow/derive-effective-phase.js";
import { WorkspaceHookRunner } from "../workspace/hooks.js";
import { WorkspaceManager } from "../workspace/workspace-manager.js";
import type {
  OrchestratorCoreOptions,
  StopRequest,
  TimerScheduler,
} from "./core.js";
import { OrchestratorCore } from "./core.js";

export interface AgentRunnerLike extends AgentHarnessLike {}

export interface RuntimeHostOptions {
  config: ResolvedWorkflowConfig;
  tracker: IssueTracker;
  agentHarness?: AgentHarnessLike;
  agentRunner?: AgentHarnessLike;
  createAgentHarness?: (input: {
    onEvent: (event: HarnessAgentEvent) => void;
  }) => AgentHarnessLike;
  createAgentRunner?: (input: {
    onEvent: (event: AgentRunnerEvent) => void;
  }) => AgentHarnessLike;
  logger?: StructuredLogger;
  workspaceManager?: WorkspaceManager;
  now?: () => Date;
}

export interface RuntimeServiceOptions {
  config: ResolvedWorkflowConfig;
  logsRoot?: string | null;
  tracker?: IssueTracker;
  runtimeHost?: OrchestratorRuntimeHost;
  workspaceManager?: WorkspaceManager;
  workflowWatcher?: WorkflowWatcher | null;
  now?: () => Date;
  logger?: StructuredLogger;
  stdout?: Writable;
}

export interface RuntimeServiceHandle {
  readonly runtimeHost: OrchestratorRuntimeHost;
  readonly logger: StructuredLogger;
  readonly dashboard: DashboardServerInstance | null;
  waitForExit(): Promise<number>;
  shutdown(): Promise<void>;
}

interface WorkerExecution {
  issueId: string;
  issueIdentifier: string;
  controller: AbortController;
  completion: Promise<void>;
  stopRequest: StopRequest | null;
  lastResult: HarnessRunResult | null;
}

export class RuntimeHostStartupError extends Error {
  readonly code: string;

  constructor(message: string, code: string, options?: { cause?: unknown }) {
    super(message, options);
    this.name = "RuntimeHostStartupError";
    this.code = code;
  }
}

// 这个应该是管理器，是循环调用看板查看任务。
export class OrchestratorRuntimeHost implements DashboardServerHost {
  private config: ResolvedWorkflowConfig;

  private tracker: IssueTracker;

  private workspaceManager: WorkspaceManager;

  private agentHarness: AgentHarnessLike;

  private readonly now: () => Date;

  private readonly logger: StructuredLogger | null;

  private readonly workers = new Map<string, WorkerExecution>();

  private readonly orchestrator: OrchestratorCore;

  private readonly managesAgentHarness: boolean;

  private readonly harnessEventSink: (event: HarnessAgentEvent) => void;

  private eventQueue: Promise<unknown> = Promise.resolve();

  private refreshQueued = false;

  private readonly snapshotListeners = new Set<() => void>();

  private readonly workflowService: WorkflowService | null;

  private readonly workflowExporter: WorkflowExporter | null;

  private pmsWriteback: PmsWritebackService | null = null;

  // 构造函数：构造函数
  constructor(options: RuntimeHostOptions) {
    // 配置：配置
    this.config = options.config;
    // 任务类：任务类
    this.tracker = options.tracker;
    this.pmsWriteback = this.createPmsWritebackService(options.tracker);
    // 现在：现在
    this.now = options.now ?? (() => new Date());
    // 日志记录器：日志记录器
    this.logger = options.logger ?? null;
    // 工作空间管理器：工作空间管理器
    this.workspaceManager =
      options.workspaceManager ??
      createWorkspaceManagerFromConfig(options.config, this.logger);
    const artifactStore = new ArtifactStore(options.config.artifactStore);
    if (artifactStore.isEnabled()) {
      this.workflowService = new WorkflowService(artifactStore);
      this.workflowExporter = new WorkflowExporter(artifactStore);
    } else {
      this.workflowService = null;
      this.workflowExporter = null;
    }
    // 事件处理：事件处理
    this.harnessEventSink = (event) => {
      void this.enqueue(async () => {
        this.orchestrator.onHarnessRuntimeEvent({
          issueId: event.issueId,
          event,
        });
        await logHarnessEvent(this.logger, event);
        if (event.kind === "turn_completed") {
          await this.exportRunningIssueFromEvent(event);
        }
      });
    };
    this.managesAgentHarness =
      options.agentHarness === undefined &&
      options.agentRunner === undefined &&
      options.createAgentHarness === undefined &&
      options.createAgentRunner === undefined;
    this.agentHarness =
      options.agentHarness ??
      options.agentRunner ??
      options.createAgentHarness?.({
        onEvent: this.harnessEventSink,
      }) ??
      options.createAgentRunner?.({
        onEvent: (event) => {
          this.harnessEventSink(mapAgentRunnerEventToHarnessAgentEvent(event));
        },
      }) ??
      this.createManagedAgentHarness({
        config: options.config,
        tracker: options.tracker,
        workspaceManager: this.workspaceManager,
      });

    // 创建定时器调度器：创建定时器调度器
    const timerScheduler = createQueuedTimerScheduler({
      run: (callback) => {
        void this.enqueue(async () => {
          callback();
        });
      },
    });

    // 调度器选项：调度器选项
    const orchestratorOptions: OrchestratorCoreOptions = {
      config: options.config,
      tracker: options.tracker,
      now: this.now,
      timerScheduler,
      spawnWorker: async ({ issue, attempt }) =>
        this.spawnWorkerExecution(issue, attempt),
      stopRunningIssue: async (input) => {
        await this.stopWorkerExecution(input.issueId, {
          issueId: input.issueId,
          issueIdentifier: input.runningEntry.identifier,
          cleanupWorkspace: input.cleanupWorkspace,
          reason: input.reason,
        });
      },
    };

    this.orchestrator = new OrchestratorCore(orchestratorOptions);
  }

  getState() {
    return this.orchestrator.getState();
  }

  updateConfig(input: {
    config: ResolvedWorkflowConfig;
    tracker?: IssueTracker;
    workspaceManager?: WorkspaceManager;
  }): void {
    this.config = input.config;

    if (input.tracker !== undefined) {
      this.tracker = input.tracker;
      this.pmsWriteback = this.createPmsWritebackService(input.tracker);
      this.orchestrator.updateTracker(input.tracker);
    }

    if (input.workspaceManager !== undefined) {
      this.workspaceManager = input.workspaceManager;
    }

    this.orchestrator.updateConfig(input.config);

    if (this.managesAgentHarness) {
      this.agentHarness = this.createManagedAgentHarness({
        config: this.config,
        tracker: this.tracker,
        workspaceManager: this.workspaceManager,
      });
      return;
    }

    if (supportsConfigUpdate(this.agentHarness)) {
      this.agentHarness.updateConfig({
        config: this.config,
        ...(input.tracker === undefined ? {} : { tracker: this.tracker }),
        ...(input.workspaceManager === undefined
          ? {}
          : { workspaceManager: this.workspaceManager }),
      });
    }

    this.notifySnapshotListeners();
  }

  async pollOnce() {
    return this.enqueue(async () => {
      if (this.pmsWriteback !== null) {
        await this.pmsWriteback.retryPending(this.logger);
      }
      return this.orchestrator.pollTick();
    });
  }

  async runRetryTimer(issueId: string) {
    return this.enqueue(async () => this.orchestrator.onRetryTimer(issueId));
  }

  async flushEvents(): Promise<void> {
    await this.eventQueue;
  }

  async waitForIdle(): Promise<void> {
    await this.eventQueue;
    await Promise.allSettled(
      [...this.workers.values()].map((worker) => worker.completion),
    );
    await this.eventQueue;
  }

  async getRuntimeSnapshot(): Promise<RuntimeSnapshot> {
    return buildRuntimeSnapshot(this.orchestrator.getState(), {
      now: this.now(),
    });
  }

  async getIssueDetails(
    issueIdentifier: string,
  ): Promise<IssueDetailResponse | null> {
    const running = Object.values(this.orchestrator.getState().running).find(
      (entry) => entry.identifier === issueIdentifier,
    );
    if (running !== undefined) {
      return toRunningIssueDetail(running, this.workspaceManager);
    }

    const retry = Object.values(
      this.orchestrator.getState().retryAttempts,
    ).find((entry) => entry.identifier === issueIdentifier);
    if (retry !== undefined) {
      return toRetryIssueDetail(issueIdentifier, retry);
    }

    return null;
  }

  async requestRefresh(): Promise<RefreshResponse> {
    const requestedAt = this.now().toISOString();
    const coalesced = this.refreshQueued;
    this.refreshQueued = true;

    if (!coalesced) {
      void this.enqueue(async () => {
        this.refreshQueued = false;
        await this.orchestrator.pollTick();
      });
    }

    return {
      queued: true,
      coalesced,
      requested_at: requestedAt,
      operations: ["poll", "reconcile"],
    };
  }

  isWorkflowDashboardEnabled(): boolean {
    return this.workflowService?.isEnabled() ?? false;
  }

  async listWorkflows(status: WorkflowListStatus): Promise<WorkflowSummary[]> {
    if (this.workflowService === null) {
      return [];
    }

    return this.workflowService.listWorkflows(
      status,
      this.orchestrator.getState(),
    );
  }

  async getWorkflowDetail(
    issueIdentifier: string,
  ): Promise<WorkflowDetail | null> {
    if (this.workflowService === null) {
      return null;
    }

    return this.workflowService.getWorkflowDetail(
      issueIdentifier,
      this.orchestrator.getState(),
    );
  }

  async readWorkflowArtifact(
    issueIdentifier: string,
    relativePath: string,
  ): Promise<{ content: string; contentType: string } | null> {
    if (this.workflowService === null) {
      return null;
    }

    return this.workflowService.store.readArtifactFile({
      issueIdentifier,
      relativePath,
    });
  }

  private async exportRunningIssueFromEvent(
    event: HarnessAgentEvent,
  ): Promise<void> {
    if (this.workflowExporter === null) {
      return;
    }

    const running = this.orchestrator.getState().running[event.issueId];
    if (running === undefined) {
      return;
    }

    await this.workflowExporter.exportIssue({
      issue: running.issue,
      workspacePath: event.workspacePath,
      running,
      workflow: this.config.workflow,
      now: this.now(),
    });
  }

  async exportTerminalIssue(issue: Issue): Promise<ExportIfExportableResult> {
    if (this.workflowExporter === null) {
      return { exported: false, reason: "disabled" };
    }

    const workspacePath = this.workspaceManager.resolveForIssue(
      issue.id,
    ).workspacePath;
    const running = this.orchestrator.getState().running[issue.id] ?? null;

    return this.workflowExporter.exportIssueIfExportable({
      issue,
      workspacePath,
      running,
      workflow: this.config.workflow,
      now: this.now(),
      setArchivedReason: "pms_terminal_cleanup",
    });
  }

  private async exportIssueBeforeCleanup(issueId: string): Promise<void> {
    if (this.workflowExporter === null) {
      return;
    }

    const running = this.orchestrator.getState().running[issueId];
    const workspacePath =
      this.workspaceManager.resolveForIssue(issueId).workspacePath;

    if (running !== undefined) {
      await this.workflowExporter.exportIssueIfExportable({
        issue: running.issue,
        workspacePath,
        running,
        workflow: this.config.workflow,
        now: this.now(),
        setArchivedReason: "pms_terminal_cleanup",
      });
      return;
    }

    const retry = this.orchestrator.getState().retryAttempts[issueId];
    if (retry?.identifier === null || retry?.identifier === undefined) {
      return;
    }

    await this.workflowExporter.exportIssueIfExportable({
      issue: {
        id: issueId,
        identifier: retry.identifier,
        title: retry.identifier,
        priority: null,
      },
      workspacePath,
      running: null,
      workflow: this.config.workflow,
      now: this.now(),
      setArchivedReason: "pms_terminal_cleanup",
    });
  }

  subscribeToSnapshots(listener: () => void): () => void {
    this.snapshotListeners.add(listener);
    return () => {
      this.snapshotListeners.delete(listener);
    };
  }

  private createPmsWritebackService(
    tracker: IssueTracker,
  ): PmsWritebackService | null {
    if (!(tracker instanceof PmsTrackerClient)) {
      return null;
    }

    return new PmsWritebackService(tracker);
  }

  private async spawnWorkerExecution(
    issue: Issue,
    attempt: number | null,
  ): Promise<{
    workerHandle: WorkerExecution;
    monitorHandle: Promise<void>;
  }> {
    await this.logger?.info("worker_spawned", "Worker spawned for issue.", {
      outcome: "started",
      issue_id: issue.id,
      issue_identifier: issue.identifier,
      attempt,
      state: issue.state,
    });

    const controller = new AbortController();
    const execution: WorkerExecution = {
      issueId: issue.id,
      issueIdentifier: issue.identifier,
      controller,
      stopRequest: null,
      lastResult: null,
      completion: Promise.resolve(),
    };

    const completion = this.agentHarness
      .run({
        issue,
        attempt,
        signal: controller.signal,
      })
      .then(async (result) => {
        execution.lastResult = result;
        await this.enqueue(async () => {
          await this.finalizeWorkerExecution(execution, {
            outcome: "normal",
            endedAt: this.now(),
          });
        });
      })
      .catch(async (error) => {
        await this.enqueue(async () => {
          await this.finalizeWorkerExecution(execution, {
            outcome: "abnormal",
            reason:
              execution.stopRequest === null
                ? toErrorMessage(error)
                : `stopped after ${execution.stopRequest.reason}`,
          });
        });
      });

    execution.completion = completion;
    this.workers.set(issue.id, execution);

    return {
      workerHandle: execution,
      monitorHandle: completion,
    };
  }

  private async stopWorkerExecution(
    issueId: string,
    input: StopRequest,
  ): Promise<void> {
    const execution = this.workers.get(issueId);
    if (execution === undefined) {
      return;
    }

    execution.stopRequest = input;
    execution.controller.abort(`Stopped due to ${input.reason}.`);
  }

  private async finalizeWorkerExecution(
    execution: WorkerExecution,
    input: {
      outcome: "normal" | "abnormal";
      reason?: string;
      endedAt?: Date;
    },
  ): Promise<void> {
    this.workers.delete(execution.issueId);

    const runningEntry =
      this.orchestrator.getState().running[execution.issueId];
    let workflowComplete = false;
    let workspacePath: string | undefined;
    if (input.outcome === "normal" && runningEntry !== undefined) {
      workspacePath = this.workspaceManager.resolveForIssue(
        execution.issueId,
      ).workspacePath;
      const workflow = this.config.workflow;
      if (workflow !== null && workflow.phases.length > 0) {
        const derived = await deriveEffectivePhase({
          workspacePath,
          changeRef: resolveChangeRef(runningEntry.identifier),
          phases: workflow.phases,
        });
        workflowComplete = derived.allComplete;
      }
    }

    if (
      input.outcome === "normal" &&
      this.pmsWriteback !== null &&
      runningEntry !== undefined &&
      workspacePath !== undefined
    ) {
      await this.pmsWriteback.processCompletionSignal({
        issueKey: runningEntry.identifier,
        issueState: runningEntry.issue.state,
        workspacePath,
        logger: this.logger,
        workflow: this.config.workflow,
      });
    }

    await this.logger?.log(
      input.outcome === "normal" ? "info" : "error",
      input.outcome === "normal"
        ? "worker_exit_normal"
        : "worker_exit_abnormal",
      input.outcome === "normal"
        ? "Worker completed normally."
        : "Worker completed abnormally.",
      {
        outcome: input.outcome === "normal" ? "completed" : "failed",
        ...(input.reason === undefined ? {} : { reason: input.reason }),
        issue_id: execution.issueId,
        issue_identifier: execution.issueIdentifier,
        session_id: execution.lastResult?.liveSession.sessionId ?? null,
      },
    );

    if (execution.stopRequest?.cleanupWorkspace === true) {
      await this.exportIssueBeforeCleanup(execution.issueId);
      await this.workspaceManager.removeForIssue(execution.issueId);
    }

    this.orchestrator.onWorkerExit({
      issueId: execution.issueId,
      outcome: input.outcome,
      ...(input.reason === undefined ? {} : { reason: input.reason }),
      endedAt: input.endedAt ?? this.now(),
      workflowComplete,
    });
  }

  private enqueue<T>(task: () => Promise<T> | T): Promise<T> {
    const next = this.eventQueue.then(task, task);
    this.eventQueue = next.then(
      () => undefined,
      () => undefined,
    );
    return next.finally(() => {
      this.notifySnapshotListeners();
    });
  }

  private notifySnapshotListeners(): void {
    for (const listener of this.snapshotListeners) {
      try {
        listener();
      } catch {
        // Observability listeners must not affect runtime correctness.
      }
    }
  }

  private createManagedAgentHarness(input: {
    config: ResolvedWorkflowConfig;
    tracker: IssueTracker;
    workspaceManager: WorkspaceManager;
  }): AgentHarness {
    return createAgentHarness({
      config: input.config,
      tracker: input.tracker,
      workspaceManager: input.workspaceManager,
      logger: this.logger,
      onEvent: this.harnessEventSink,
    });
  }
}

// 启动运行时服务：启动运行时服务
export async function startRuntimeService(
  options: RuntimeServiceOptions,
): Promise<RuntimeServiceHandle> {
  // 验证配置：验证配置
  const validation = validateDispatchConfig(options.config);
  // 如果配置验证不通过，则抛出错误
  if (!validation.ok) {
    throw new RuntimeHostStartupError(
      validation.error.message,
      validation.error.code,
    );
  }

  // 创建日志记录器：创建日志记录器
  const logger =
    options.logger ??
    (await createRuntimeLogger({
      logsRoot: options.logsRoot ?? null,
      ...(options.stdout === undefined ? {} : { stdout: options.stdout }),
    }));
  // 当前配置：当前配置
  let currentConfig = options.config;
  // 创建linear任务类
  let tracker = options.tracker ?? createIssueTracker(currentConfig);
  if (options.tracker === undefined) {
    await validatePmsTrackerAuthIfConfigured(currentConfig, tracker);
  }
  // 创建工作空间管理器：创建工作空间管理器
  let workspaceManager =
    options.workspaceManager ??
    createWorkspaceManagerFromConfig(currentConfig, logger);
  // 这个应该是管理器，是循环调用看板查看任务。
  const runtimeHost =
    options.runtimeHost ??
    new OrchestratorRuntimeHost({
      config: currentConfig,
      tracker,
      logger,
      workspaceManager,
      ...(options.now === undefined ? {} : { now: options.now }),
    });
  const usesManagedTracker = options.tracker === undefined;
  const usesManagedWorkspaceManager = options.workspaceManager === undefined;

  // 清理已解决的问题、任务
  await cleanupTerminalIssueWorkspaces({
    tracker,
    terminalStates: currentConfig.tracker.terminalStates,
    workspaceManager,
    logger,
    ...(runtimeHost.isWorkflowDashboardEnabled()
      ? {
          exportBeforeRemove: async (issue) => {
            return runtimeHost.exportTerminalIssue(issue);
          },
        }
      : {}),
  });

  // 启动仪表盘：启动仪表盘
  const dashboard =
    // 如果端口为空，则返回null
    currentConfig.server.port === null
      ? null
      : await startDashboardServer({
          host: runtimeHost,
          port: currentConfig.server.port,
          refreshMs: currentConfig.observability.refreshMs,
          renderIntervalMs: currentConfig.observability.renderIntervalMs,
          liveUpdatesEnabled: currentConfig.observability.dashboardEnabled,
        });

  // 创建停止控制器：创建停止控制器
  const stopController = new AbortController();
  // 创建退出承诺：创建退出承诺
  const exitPromise = createExitPromise();
  // 轮询定时器：轮询定时器
  let pollTimer: NodeJS.Timeout | null = null;
  // 正在关闭：正在关闭
  let shuttingDown = false;

  // 调度下一个轮询：调度下一个轮询，和下述配合使用，没有使用intervalMs定时器，是为了防止一些问题，好像是会存在延迟/不调用的情况
  const scheduleNextPoll = () => {
    // 如果停止控制器已中止，则返回
    if (stopController.signal.aborted) {
      return;
    }

    // 设置轮询定时器：设置轮询定时器
    pollTimer = setTimeout(() => {
      // 运行轮询周期：运行轮询周期
      void runPollCycle();
    }, currentConfig.polling.intervalMs);
  };

  // 运行轮询周期：运行轮询周期
  const runPollCycle = async () => {
    try {
      const result = await runtimeHost.pollOnce();
      // 记录轮询结果：记录轮询结果
      await logPollCycleResult(logger, result);
      // 调度下一个轮询：调度下一个轮询
      scheduleNextPoll();
    } catch (error) {
      // 记录轮询失败：记录轮询失败
      await logger.error("runtime_poll_failed", toErrorMessage(error), {
        error_code: ERROR_CODES.cliStartupFailed,
      });
      // 解决退出：解决退出
      resolveExit(exitPromise, 1);
      // 关闭：关闭
      void shutdown();
    }
  };

  const onSignal = (signal: NodeJS.Signals) => {
    void logger.info("runtime_shutdown_signal", `received ${signal}`, {
      reason: signal,
    });
    resolveExit(exitPromise, 0);
    void shutdown();
  };

  const removeSignalHandlers = installSignalHandlers(onSignal);
  // 创建工作流监视器：创建工作流监视器，应该是配置文件有更新，就热加载。
  const workflowWatcher =
    // 如果工作流监视器为空，则创建工作流监视器
    options.workflowWatcher === undefined
      ? // 创建工作流监视器：创建工作流监视器
        await createRuntimeWorkflowWatcher({
          config: currentConfig,
          logger,
          onReload: async (nextConfig) => {
            // 上一个配置：上一个配置
            const previousConfig = currentConfig;
            currentConfig = nextConfig;

            // 如果使用管理跟踪器，则创建线性跟踪器
            if (usesManagedTracker) {
              tracker = createIssueTracker(nextConfig);
              await validatePmsTrackerAuthIfConfigured(nextConfig, tracker);
            }

            // 如果使用管理工作空间管理器，则创建工作空间管理器
            if (usesManagedWorkspaceManager) {
              workspaceManager = createWorkspaceManagerFromConfig(
                nextConfig,
                logger,
              );
            }

            // 更新运行时主机配置：更新运行时主机配置
            runtimeHost.updateConfig({
              config: nextConfig,
              ...(usesManagedTracker ? { tracker } : {}),
              ...(usesManagedWorkspaceManager ? { workspaceManager } : {}),
            });

            // 如果轮询定时器不为空，则清除轮询定时器
            if (pollTimer !== null) {
              clearTimeout(pollTimer);
              pollTimer = null;
              // 调度下一个轮询：调度下一个轮询
              scheduleNextPoll();
            }

            // 如果仪表盘不为空，则更新仪表盘端口
            if (
              dashboard !== null &&
              previousConfig.server.port !== nextConfig.server.port
            ) {
              await logger.warn(
                "workflow_reload_port_ignored",
                "Ignoring server.port change until runtime restart.",
                {
                  outcome: "degraded",
                  reason: "server_port_reload_requires_restart",
                  port: dashboard.port,
                },
              );
            }

            // 如果仪表盘不为空，则更新仪表盘可见性
            if (
              dashboard !== null &&
              previousConfig.observability.dashboardEnabled !==
                nextConfig.observability.dashboardEnabled
            ) {
              await logger.warn(
                "workflow_reload_observability_ignored",
                "Ignoring observability.dashboard_enabled change until runtime restart.",
                {
                  outcome: "degraded",
                  reason: "observability_reload_requires_restart",
                  port: dashboard.port,
                },
              );
            }
          },
        })
      : options.workflowWatcher;
  workflowWatcher?.start();

  // 关闭：关闭
  const shutdown = async () => {
    // 如果正在关闭，则返回
    if (shuttingDown) {
      await exitPromise.closed;
      return;
    }
    shuttingDown = true;
    // 解决退出：解决退出
    resolveExit(exitPromise, 0);
    stopController.abort();

    if (pollTimer !== null) {
      clearTimeout(pollTimer);
      pollTimer = null;
    }

    removeSignalHandlers();

    await Promise.allSettled([
      runtimeHost.waitForIdle(),
      dashboard?.close() ?? Promise.resolve(),
      workflowWatcher?.close() ?? Promise.resolve(),
    ]);

    resolveClosed(exitPromise);
  };

  await logger.info("runtime_starting", "Symphony runtime started.", {
    poll_interval_ms: currentConfig.polling.intervalMs,
    max_concurrent_agents: currentConfig.agent.maxConcurrentAgents,
    ...(dashboard === null ? {} : { port: dashboard.port }),
  });

  void runPollCycle();

  return {
    runtimeHost,
    logger,
    dashboard,
    async waitForExit() {
      return exitPromise.exitCode;
    },
    shutdown,
  };
}

async function logPollCycleResult(
  logger: StructuredLogger,
  result: Awaited<ReturnType<OrchestratorRuntimeHost["pollOnce"]>>,
): Promise<void> {
  if (!result.validation.ok) {
    await logger.error(
      "dispatch_validation_failed",
      result.validation.error.message,
      {
        error_code: result.validation.error.code,
      },
    );
  }

  if (result.reconciliationFetchFailed) {
    await logger.warn(
      "reconciliation_state_refresh_failed",
      "Issue state reconciliation failed; keeping current workers running.",
      {
        outcome: "degraded",
        reason: "tracker_state_refresh_failed",
      },
    );
  }

  if (result.trackerFetchFailed) {
    await logger.warn(
      "candidate_issue_fetch_failed",
      "Tracker candidate fetch failed; dispatch skipped for this tick.",
      {
        outcome: "degraded",
        reason: "tracker_candidate_fetch_failed",
      },
    );
  }
}

async function createRuntimeWorkflowWatcher(input: {
  config: ResolvedWorkflowConfig;
  logger: StructuredLogger;
  onReload: (config: ResolvedWorkflowConfig) => Promise<void>;
}): Promise<WorkflowWatcher | null> {
  try {
    await access(input.config.workflowPath);
  } catch {
    return null;
  }

  return await WorkflowWatcher.create({
    workflowPath: input.config.workflowPath,
    onReload: async ({ snapshot }) => {
      if (!snapshot.dispatchValidation.ok) {
        await input.logger.error(
          "workflow_reload_rejected",
          snapshot.dispatchValidation.error.message,
          {
            error_code: ERROR_CODES.workflowReloadRejected,
            reason: snapshot.dispatchValidation.error.code,
          },
        );
        return;
      }

      await input.onReload(snapshot.config);
      await input.logger.info(
        "workflow_reloaded",
        "Applied updated workflow configuration.",
        {
          poll_interval_ms: snapshot.config.polling.intervalMs,
          max_concurrent_agents: snapshot.config.agent.maxConcurrentAgents,
        },
      );
    },
    onError: async ({ error }) => {
      await input.logger.error(
        "workflow_reload_failed",
        toErrorMessage(error),
        {
          error_code:
            extractErrorCode(error) ?? ERROR_CODES.workflowReloadRejected,
        },
      );
    },
  });
}

async function cleanupTerminalIssueWorkspaces(input: {
  tracker: IssueTracker;
  terminalStates: string[];
  workspaceManager: WorkspaceManager;
  logger: StructuredLogger;
  exportBeforeRemove?: (
    issue: Issue,
  ) => Promise<ExportIfExportableResult | undefined>;
}): Promise<void> {
  try {
    const issues = await input.tracker.fetchIssuesByStates(
      input.terminalStates,
    );
    await Promise.all(
      issues.map(async (issue) => {
        if (input.exportBeforeRemove !== undefined) {
          const result = await input.exportBeforeRemove(issue);
          if (
            result !== undefined &&
            !result.exported &&
            result.reason !== undefined &&
            result.reason !== "disabled"
          ) {
            await input.logger.info(
              "startup_terminal_skip_export",
              `Skipping artifact export for ${issue.identifier}.`,
              {
                issue_id: issue.id,
                issue_identifier: issue.identifier,
                reason: result.reason,
              },
            );
          }
        }
        await input.workspaceManager.removeForIssue(issue.id);
      }),
    );
  } catch (error) {
    await input.logger.warn(
      "startup_terminal_cleanup_failed",
      toErrorMessage(error),
      {
        outcome: "degraded",
        reason: "startup_terminal_cleanup_failed",
      },
    );
  }
}

// 创建工作区间管理
function createWorkspaceManagerFromConfig(
  config: ResolvedWorkflowConfig,
  logger?: StructuredLogger | null,
): WorkspaceManager {
  return new WorkspaceManager({
    root: config.workspace.root,
    hooks: new WorkspaceHookRunner({
      config: config.hooks,
      ...(logger === undefined || logger === null
        ? {}
        : {
            log: createWorkspaceHookLogger(logger),
          }),
    }),
  });
}

async function createRuntimeLogger(input: {
  logsRoot: string | null;
  stdout?: Writable;
}): Promise<StructuredLogger> {
  const sinks = [createJsonLineSink(input.stdout ?? process.stdout)];

  if (input.logsRoot !== null) {
    await mkdir(input.logsRoot, { recursive: true });
    sinks.push(
      createJsonLineSink(
        createWriteStream(join(input.logsRoot, "symphony.jsonl"), {
          flags: "a",
          encoding: "utf8",
        }),
      ),
    );
  }

  return new StructuredLogger(sinks);
}

function createQueuedTimerScheduler(input: {
  run: (callback: () => void) => void;
}): TimerScheduler {
  return {
    set(callback, delayMs) {
      return setTimeout(() => {
        input.run(callback);
      }, delayMs);
    },
    clear(handle) {
      if (handle !== null) {
        clearTimeout(handle);
      }
    },
  };
}

function createWorkspaceHookLogger(logger: StructuredLogger): (entry: {
  level: "info" | "warn" | "error";
  event:
    | "workspace_hook_started"
    | "workspace_hook_completed"
    | "workspace_hook_failed"
    | "workspace_hook_timed_out";
  hook: string;
  workspacePath: string;
  durationMs?: number;
  exitCode?: number | null;
  errorCode?: string;
  stdout?: string;
  stderr?: string;
}) => void {
  return (entry) => {
    void logger.log(
      entry.level,
      entry.event,
      `Workspace hook ${entry.hook} ${toHookMessageSuffix(entry.event)}.`,
      {
        ...(entry.event === "workspace_hook_completed"
          ? { outcome: "completed" }
          : entry.event === "workspace_hook_started"
            ? { outcome: "started" }
            : { outcome: "failed" }),
        hook: entry.hook,
        workspace_path: entry.workspacePath,
        ...(entry.durationMs === undefined
          ? {}
          : { duration_ms: entry.durationMs }),
        ...(entry.exitCode === undefined ? {} : { exit_code: entry.exitCode }),
        ...(entry.errorCode === undefined
          ? {}
          : { error_code: entry.errorCode }),
      },
    );
  };
}

async function logHarnessEvent(
  logger: StructuredLogger | null,
  event: HarnessAgentEvent,
): Promise<void> {
  if (logger === null) {
    return;
  }

  const level =
    event.kind === "turn_failed" ||
    event.kind === "turn_ended_with_error" ||
    event.kind === "startup_failed" ||
    event.kind === "turn_input_required" ||
    event.kind === "malformed" ||
    event.kind === "runtime_error"
      ? "error"
      : event.kind === "unsupported_tool_call"
        ? "warn"
        : "info";

  const outcome =
    event.kind === "session_started"
      ? "started"
      : event.kind === "turn_completed"
        ? "completed"
        : event.kind === "approval_auto_approved"
          ? "approved"
          : event.kind === "turn_failed" ||
              event.kind === "turn_cancelled" ||
              event.kind === "turn_ended_with_error" ||
              event.kind === "startup_failed" ||
              event.kind === "turn_input_required" ||
              event.kind === "malformed" ||
              event.kind === "runtime_error"
            ? "failed"
            : undefined;

  const rawExitCode = readCursorCliExitCode(event);

  await logger.log(level, event.kind, event.message ?? event.kind, {
    ...(outcome === undefined ? {} : { outcome }),
    harness: event.harness,
    ...(event.nativeKind === undefined
      ? {}
      : { native_kind: event.nativeKind }),
    ...(event.errorCode === undefined ? {} : { error_code: event.errorCode }),
    ...(rawExitCode === undefined ? {} : { exit_code: rawExitCode }),
    issue_id: event.issueId,
    issue_identifier: event.issueIdentifier,
    session_id: event.sessionId ?? null,
    thread_id: event.threadId ?? null,
    turn_id: event.turnId ?? null,
    attempt: event.attempt,
    workspace_path: event.workspacePath,
    ...(event.usage === undefined
      ? {}
      : {
          input_tokens: event.usage.inputTokens,
          output_tokens: event.usage.outputTokens,
          total_tokens: event.usage.totalTokens,
        }),
  });
}

function readCursorCliExitCode(event: HarnessAgentEvent): number | undefined {
  if (event.harness !== "cursor" || event.raw === undefined) {
    return undefined;
  }

  if (
    typeof event.raw === "object" &&
    event.raw !== null &&
    "exitCode" in event.raw &&
    typeof event.raw.exitCode === "number"
  ) {
    return event.raw.exitCode;
  }

  return undefined;
}

function toHookMessageSuffix(
  event:
    | "workspace_hook_started"
    | "workspace_hook_completed"
    | "workspace_hook_failed"
    | "workspace_hook_timed_out",
): string {
  switch (event) {
    case "workspace_hook_started":
      return "started";
    case "workspace_hook_completed":
      return "completed";
    case "workspace_hook_failed":
      return "failed";
    case "workspace_hook_timed_out":
      return "timed out";
  }
}

function toRunningIssueDetail(
  running: RunningEntry,
  workspaceManager: WorkspaceManager,
): IssueDetailResponse {
  return {
    issue_identifier: running.identifier,
    issue_id: running.issue.id,
    status: "running",
    workspace: {
      path: workspaceManager.resolveForIssue(running.issue.id).workspacePath,
    },
    attempts: {
      restart_count: running.retryAttempt ?? 0,
      current_retry_attempt: running.retryAttempt,
    },
    running: {
      session_id: running.sessionId,
      turn_count: running.turnCount,
      state: running.issue.state,
      started_at: running.startedAt,
      last_event: running.lastCodexEvent,
      last_message: running.lastCodexMessage,
      last_event_at: running.lastCodexTimestamp,
      tokens: {
        input_tokens: running.codexInputTokens,
        output_tokens: running.codexOutputTokens,
        total_tokens: running.codexTotalTokens,
      },
    },
    retry: null,
    logs: {
      codex_session_logs: [],
    },
    recent_events: [],
    last_error: null,
    tracked: {},
  };
}

function toRetryIssueDetail(
  issueIdentifier: string,
  retry: RetryEntry,
): IssueDetailResponse {
  return {
    issue_identifier: issueIdentifier,
    issue_id: retry.issueId,
    status: "retry_queued",
    workspace: null,
    attempts: {
      restart_count: retry.attempt,
      current_retry_attempt: retry.attempt,
    },
    running: null,
    retry: {
      attempt: retry.attempt,
      due_at: new Date(retry.dueAtMs).toISOString(),
      error: retry.error,
    },
    logs: {
      codex_session_logs: [],
    },
    recent_events: [],
    last_error: retry.error,
    tracked: {},
  };
}

function installSignalHandlers(
  onSignal: (signal: NodeJS.Signals) => void,
): () => void {
  const signals: NodeJS.Signals[] = ["SIGINT", "SIGTERM"];
  for (const signal of signals) {
    process.on(signal, onSignal);
  }

  return () => {
    for (const signal of signals) {
      process.off(signal, onSignal);
    }
  };
}

function createExitPromise(): {
  exitCode: Promise<number>;
  closed: Promise<void>;
  resolveExit: (code: number) => void;
  resolveClosed: () => void;
} {
  let resolveExitCode: ((code: number) => void) | null = null;
  let resolveClosedPromise: (() => void) | null = null;

  return {
    exitCode: new Promise<number>((resolve) => {
      resolveExitCode = resolve;
    }),
    closed: new Promise<void>((resolve) => {
      resolveClosedPromise = resolve;
    }),
    resolveExit(code) {
      resolveExitCode?.(code);
      resolveExitCode = null;
    },
    resolveClosed() {
      resolveClosedPromise?.();
      resolveClosedPromise = null;
    },
  };
}

function resolveExit(
  exitPromise: ReturnType<typeof createExitPromise>,
  code: number,
): void {
  exitPromise.resolveExit(code);
}

function resolveClosed(
  exitPromise: ReturnType<typeof createExitPromise>,
): void {
  exitPromise.resolveClosed();
}

function toErrorMessage(error: unknown): string {
  if (error instanceof Error && error.message.trim().length > 0) {
    return error.message;
  }

  return "worker failed";
}

function extractErrorCode(error: unknown): string | null {
  if (
    typeof error === "object" &&
    error !== null &&
    "code" in error &&
    typeof error.code === "string"
  ) {
    return error.code;
  }

  return null;
}

function supportsConfigUpdate(
  value: AgentHarnessLike,
): value is AgentHarnessLike & {
  updateConfig(input: {
    config: ResolvedWorkflowConfig;
    tracker?: IssueTracker;
    workspaceManager?: WorkspaceManager;
  }): void;
} {
  return "updateConfig" in value && typeof value.updateConfig === "function";
}
