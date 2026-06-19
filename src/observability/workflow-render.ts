import type { RuntimeSnapshot } from "../logging/runtime-snapshot.js";
import type {
  WorkflowDetail,
  WorkflowSummary,
  WorkflowRuntimeSummary,
} from "../artifact-store/types.js";
import { V1_BUSINESS_PHASES, PHASE_LABELS } from "../artifact-store/types.js";
import {
  formatGateLabel,
  formatRuntimeStatus,
} from "../artifact-store/phase-artifacts.js";
import {
  escapeHtml,
  formatInteger,
  formatRuntimeSeconds,
} from "./dashboard-format.js";

export interface WorkflowRenderOptions {
  liveUpdatesEnabled: boolean;
}

const WORKFLOW_STYLES = String.raw`
  body { font-family: Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", sans-serif; background:#f9fafb; color:#111827; margin:0; }
  .page { max-width:80rem; margin:0 auto; padding:1.5rem 1rem 3rem; }
  .card { background:#fff; border:1px solid #f3f4f6; border-radius:0.75rem; box-shadow:0 1px 2px rgba(0,0,0,.04); }
  .metric-grid { display:grid; gap:1rem; grid-template-columns:repeat(auto-fit,minmax(180px,1fr)); margin-bottom:2rem; }
  .metric { padding:1.25rem; }
  .metric h3 { font-size:.875rem; font-weight:600; margin:0 0 .25rem; }
  .metric p.value { font-size:1.5rem; font-weight:700; margin:0; }
  .metric p.hint { font-size:.6875rem; color:#9ca3af; margin:.25rem 0 0; }
  .badge-live { display:inline-flex; align-items:center; gap:.35rem; padding:.35rem .75rem; border-radius:999px; border:1px solid #f3f4f6; background:#fff; font-size:.75rem; }
  .dot-green { width:.5rem; height:.5rem; border-radius:999px; background:#22c55e; }
  .timeline-line { height:2px; background:#e5e7eb; position:absolute; top:12px; left:0; right:0; z-index:0; }
  .pulse-ring { position:absolute; width:24px; height:24px; background:rgba(37,99,235,.2); border-radius:50%; animation:pulse 2s infinite; }
  @keyframes pulse { 0%{transform:scale(1);opacity:1} 70%{transform:scale(2);opacity:0} 100%{transform:scale(2.5);opacity:0} }
  .phase-node { display:flex; flex-direction:column; align-items:center; min-width:0; flex:1; }
  .phase-dot { width:24px; height:24px; border-radius:999px; display:flex; align-items:center; justify-content:center; font-size:10px; color:#fff; margin-bottom:.35rem; z-index:1; }
  .phase-dot.done { background:#22c55e; }
  .phase-dot.active { background:#2563eb; position:relative; }
  .phase-dot.pending { background:#fff; border:2px solid #e5e7eb; }
  .phase-label { font-size:10px; color:#6b7280; text-align:center; }
  .phase-label.active { color:#2563eb; font-weight:700; }
  .wf-card { padding:1.5rem; margin-bottom:1rem; }
  .wf-title { font-size:.875rem; font-weight:700; color:#111827; text-decoration:none; }
  .wf-title:hover { color:#2563eb; }
  .priority { font-size:10px; font-weight:700; padding:.125rem .5rem; border-radius:999px; border:1px solid; }
  .priority-P0 { background:#fef2f2; color:#dc2626; border-color:#fecaca; }
  .priority-P1 { background:#fff7ed; color:#ea580c; border-color:#fed7aa; }
  .priority-P2 { background:#eff6ff; color:#2563eb; border-color:#bfdbfe; }
  .layout { display:grid; gap:2rem; grid-template-columns:1fr; }
  @media (min-width:1024px) { .layout { grid-template-columns:3fr 1fr; } }
  .aside-card { padding:1.5rem; margin-bottom:1rem; }
  .btn-link { color:#2563eb; font-size:.75rem; font-weight:600; text-decoration:none; }
  .btn-link:hover { text-decoration:underline; }
  .history-item { display:block; padding:.75rem 0; border-bottom:1px solid #f3f4f6; text-decoration:none; color:inherit; }
  .history-item:hover .history-title { color:#2563eb; }
  .history-title { font-size:.6875rem; font-weight:700; }
  .stage-vertical { position:relative; padding-left:2.5rem; margin-bottom:1.5rem; }
  .stage-dot-col { position:absolute; left:0; top:0; }
  .stage-card { padding:1.25rem; }
  .status-badge { font-size:10px; font-weight:700; padding:.125rem .5rem; border-radius:999px; }
  .status-completed { background:#ecfdf5; color:#059669; border:1px solid #a7f3d0; }
  .status-in_progress { background:#eff6ff; color:#2563eb; border:1px solid #bfdbfe; }
  .status-pending { background:#f3f4f6; color:#9ca3af; border:1px solid #e5e7eb; }
  .artifact-row { display:flex; justify-content:space-between; gap:.75rem; padding:.5rem .75rem; background:#f9fafb; border-radius:.5rem; margin-top:.35rem; font-size:.75rem; }
  .modal { display:none; position:fixed; inset:0; background:rgba(0,0,0,.4); align-items:center; justify-content:center; padding:1rem; z-index:50; }
  .modal.open { display:flex; }
  .modal-body { background:#fff; border-radius:1rem; max-width:40rem; width:100%; max-height:80vh; overflow:auto; padding:1.5rem; }
  .modal-body pre { white-space:pre-wrap; font-size:.8125rem; }
  .modal-body .md-preview { font-size:.875rem; line-height:1.6; }
  .modal-body .md-preview h1,.md-preview h2,.md-preview h3 { margin:1rem 0 .5rem; }
  .modal-body .md-preview code { background:#f3f4f6; padding:.125rem .25rem; border-radius:.25rem; }
  .modal-body .md-preview pre { background:#f9fafb; padding:.75rem; border-radius:.5rem; overflow:auto; }
  .progress-bar { height:6px; background:#e5e7eb; border-radius:3px; overflow:hidden; }
  .progress-fill { height:100%; background:#2563eb; }
`;

export function renderWorkflowDashboardHtml(input: {
  snapshot: RuntimeSnapshot;
  workflows: WorkflowSummary[];
  recentArchived: WorkflowSummary[];
  options: WorkflowRenderOptions;
}): string {
  const { snapshot, workflows, recentArchived, options } = input;
  const cards = workflows.map((wf) => renderWorkflowCard(wf)).join("\n");
  const history = recentArchived
    .slice(0, 5)
    .map(
      (wf) => `
      <a class="history-item" href="/issues/${encodeURIComponent(wf.issue_identifier)}">
        <div class="history-title">${escapeHtml(wf.issue_identifier)}: ${escapeHtml(wf.title ?? "Untitled")}</div>
        <div style="font-size:10px;color:#9ca3af;margin-top:.25rem">开始 ${escapeHtml(formatTimestamp(wf.started_at))}</div>
      </a>`,
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Symphony 工作流看板</title>
  <style>${WORKFLOW_STYLES}</style>
</head>
<body>
  <div class="page">
    <header style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:2rem;">
      <div>
        <p style="font-size:10px;text-transform:uppercase;letter-spacing:.08em;color:#9ca3af;font-weight:600;margin:0;">Symphony 可观测性</p>
        <h1 style="font-size:1.875rem;font-weight:700;margin:.25rem 0;">工作流看板</h1>
        <p style="font-size:.875rem;color:#6b7280;max-width:40rem;margin:0;">当前运行状态、工作流进度、Token 用量与编排健康度。</p>
      </div>
      <span class="badge-live"><span class="dot-green"></span>${options.liveUpdatesEnabled ? "已连接" : "离线"}</span>
    </header>

    <section class="metric-grid">
      ${metricCard("运行中", String(snapshot.counts.running), "活跃 issue 会话")}
      ${metricCard("重试中", String(snapshot.counts.retrying), "等待重试窗口")}
      ${metricCard("Token 总量", formatInteger(snapshot.codex_totals.total_tokens), `输入 ${formatInteger(snapshot.codex_totals.input_tokens)} / 输出 ${formatInteger(snapshot.codex_totals.output_tokens)}`)}
      ${metricCard("运行时长", formatRuntimeSeconds(snapshot.codex_totals.seconds_running), `生成于 ${escapeHtml(snapshot.generated_at)}`)}
    </section>

    <div class="layout">
      <section>
        <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
          <h2 style="font-size:1.125rem;font-weight:700;margin:0;">活跃工作流</h2>
          <a class="btn-link" href="/history">查看历史 →</a>
        </div>
        <div id="workflow-cards">${cards || '<p style="color:#9ca3af;font-size:.875rem;">暂无活跃工作流。</p>'}</div>
      </section>
      <aside>
        <div class="card aside-card">
          <h3 style="font-size:.875rem;font-weight:700;margin:0 0 1rem;">速率限制</h3>
          <pre style="font-size:.75rem;background:#f9fafb;padding:1rem;border-radius:.5rem;overflow:auto;margin:0;">${escapeHtml(JSON.stringify(snapshot.rate_limits, null, 2))}</pre>
        </div>
        <div class="card aside-card">
          <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:1rem;">
            <h3 style="font-size:.875rem;font-weight:700;margin:0;">最近历史</h3>
            <a class="btn-link" href="/history">查看全部 →</a>
          </div>
          ${history || '<p style="font-size:.75rem;color:#9ca3af;">暂无已归档工作流。</p>'}
        </div>
      </aside>
    </div>
  </div>
  <script>
    ${options.liveUpdatesEnabled ? workflowDashboardClientScript() : ""}
  </script>
</body>
</html>`;
}

export function renderWorkflowDetailHtml(
  detail: WorkflowDetail,
  options: WorkflowRenderOptions = { liveUpdatesEnabled: false },
): string {
  const manifest = detail.manifest;
  const completed = manifest.phases.filter(
    (p) => p.status === "completed",
  ).length;
  const total = V1_BUSINESS_PHASES.length;
  const pct = Math.round((completed / total) * 100);
  const stages = manifest.phases
    .map((phase) =>
      renderStageCard(detail.issue_identifier, phase, manifest.runtime),
    )
    .join("\n");

  const terminalBadge =
    detail.terminal_phase === "done"
      ? '<span class="status-badge status-completed">已完成</span>'
      : detail.terminal_phase === "failed"
        ? '<span class="status-badge" style="background:#fef2f2;color:#dc2626;border:1px solid #fecaca;">已失败</span>'
        : "";

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>${escapeHtml(detail.issue_identifier)} - Workflow</title>
  <style>${WORKFLOW_STYLES}</style>
</head>
<body>
  <div class="page" style="max-width:64rem;">
    <a href="/" class="btn-link">← 返回看板</a>
    <div class="card wf-card" style="margin-top:1rem;">
      <div style="display:flex;flex-wrap:wrap;gap:.75rem;align-items:center;margin-bottom:.75rem;">
        <h1 style="font-size:1.5rem;font-weight:700;margin:0;">${escapeHtml(detail.issue_identifier)}: ${escapeHtml(detail.title ?? "未命名")}</h1>
        ${detail.priority ? `<span class="priority priority-${escapeHtml(detail.priority)}">${escapeHtml(detail.priority)}</span>` : ""}
        ${terminalBadge}
      </div>
      <div style="font-size:.75rem;color:#6b7280;display:flex;flex-wrap:wrap;gap:1rem;">
        <span><strong>ChangeRef:</strong> ${escapeHtml(manifest.change_ref)}</span>
        <span><strong>当前阶段:</strong> ${escapeHtml(PHASE_LABELS[manifest.current_phase as keyof typeof PHASE_LABELS] ?? manifest.current_phase)}</span>
        <span><strong>轮次：</strong> ${manifest.runtime.turn_count ?? "—"}</span>
        <span><strong>开始：</strong> ${escapeHtml(formatTimestamp(detail.created_at ?? manifest.updated_at))}</span>
        <span><strong>状态：</strong> ${escapeHtml(formatRuntimeStatus(manifest.runtime.status))}</span>
      </div>
      <div style="margin-top:1rem;">
        <div style="display:flex;justify-content:space-between;font-size:.6875rem;color:#6b7280;margin-bottom:.35rem;">
          <span>总体进度</span><span>${completed} / ${total}（${pct}%）</span>
        </div>
        <div class="progress-bar"><div class="progress-fill" style="width:${pct}%"></div></div>
      </div>
      ${manifest.runtime.status === "running" && manifest.runtime.last_message ? `<p style="margin-top:1rem;font-size:.8125rem;color:#2563eb;"><strong>实时：</strong> ${escapeHtml(manifest.runtime.last_message)}</p>` : ""}
    </div>
    <div id="workflow-stages">${stages || '<p style="color:#9ca3af;">尚未导出阶段数据。</p>'}</div>
  </div>
  <div id="preview-modal" class="modal"><div class="modal-body"><button onclick="document.getElementById('preview-modal').classList.remove('open')" style="float:right;border:none;background:none;cursor:pointer;font-size:1.25rem;">✕</button><div id="preview-content" class="md-preview"></div><pre id="preview-pre" style="display:none;"></pre></div></div>
  <script src="https://cdn.jsdelivr.net/npm/marked/marked.min.js"></script>
  <script>
    ${workflowPreviewScript()}
    ${options.liveUpdatesEnabled ? workflowDetailClientScript(detail.issue_identifier) : ""}
  </script>
</body>
</html>`;
}

export function renderWorkflowHistoryHtml(
  workflows: WorkflowSummary[],
): string {
  const items = workflows
    .map(
      (wf) => `
    <a class="card wf-card" style="display:block;text-decoration:none;color:inherit;" href="/issues/${encodeURIComponent(wf.issue_identifier)}">
      <div style="display:flex;justify-content:space-between;align-items:flex-start;">
        <div>
          <div style="display:flex;gap:.5rem;align-items:center;">
            <strong style="font-size:.875rem;">${escapeHtml(wf.issue_identifier)}</strong>
            ${wf.priority ? `<span class="priority priority-${escapeHtml(wf.priority)}">${escapeHtml(wf.priority)}</span>` : ""}
          </div>
          <p style="font-size:.75rem;color:#374151;margin:.35rem 0 0;">${escapeHtml(wf.title ?? "未命名")}</p>
        </div>
        <span style="font-size:10px;color:#9ca3af;">开始 ${escapeHtml(formatTimestamp(wf.started_at))}</span>
      </div>
      <div style="margin-top:.75rem;font-size:10px;color:#6b7280;">${wf.phase_progress.completed}/${wf.phase_progress.total} 阶段 · ${wf.artifact_count} 个产物</div>
    </a>`,
    )
    .join("");

  return `<!doctype html>
<html lang="zh-CN">
<head>
  <meta charset="utf-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>Symphony Workflow History</title>
  <style>${WORKFLOW_STYLES}</style>
</head>
<body>
  <div class="page" style="max-width:64rem;">
    <a href="/" class="btn-link">← 返回看板</a>
    <h1 style="font-size:1.875rem;font-weight:700;margin:1rem 0 .5rem;">历史记录</h1>
    <p style="font-size:.875rem;color:#6b7280;margin:0 0 1.5rem;">已归档工作流及阶段产物。</p>
    ${items || '<p style="color:#9ca3af;">暂无已归档工作流。</p>'}
  </div>
</body>
</html>`;
}

function metricCard(title: string, value: string, hint: string): string {
  return `<article class="card metric"><h3>${escapeHtml(title)}</h3><p class="value">${escapeHtml(value)}</p><p class="hint">${escapeHtml(hint)}</p></article>`;
}

function renderWorkflowCard(wf: WorkflowSummary): string {
  const timeline = renderHorizontalTimeline(wf);
  const priority = wf.priority
    ? `<span class="priority priority-${escapeHtml(wf.priority)}">${escapeHtml(wf.priority)}</span>`
    : "";

  return `<article class="card wf-card" data-issue-id="${escapeHtml(wf.issue_identifier)}">
    <div style="display:flex;justify-content:space-between;align-items:flex-start;margin-bottom:1rem;">
      <div>
        <div style="display:flex;gap:.5rem;align-items:center;margin-bottom:.25rem;">
          <a class="wf-title" href="/issues/${encodeURIComponent(wf.issue_identifier)}">${escapeHtml(wf.issue_identifier)}: ${escapeHtml(wf.title ?? "未命名")}</a>
          ${priority}
        </div>
        <p style="font-size:.75rem;color:#9ca3af;margin:0;" data-wf-meta>开始 ${escapeHtml(formatTimestamp(wf.started_at))} · ${escapeHtml(formatRuntimeStatus(wf.runtime.status))}</p>
      </div>
      <a class="btn-link" href="/issues/${encodeURIComponent(wf.issue_identifier)}">详情</a>
    </div>
    <div style="position:relative;padding:.5rem 0 1rem;">${timeline}</div>
  </article>`;
}

function renderHorizontalTimeline(wf: WorkflowSummary): string {
  const current = wf.current_phase;
  const nodes = V1_BUSINESS_PHASES.map((phaseId) => {
    const phaseEntry = wf.phase_progress;
    const index = V1_BUSINESS_PHASES.indexOf(phaseId);
    const currentIndex = V1_BUSINESS_PHASES.findIndex((p) => p === current);
    let cls = "pending";
    if (current === "done" || index < phaseEntry.completed) {
      cls = "done";
    } else if (phaseId === current || index === currentIndex) {
      cls = "active";
    } else if (index < currentIndex) {
      cls = "done";
    }
    const label = PHASE_LABELS[phaseId];
    const dot =
      cls === "active"
        ? `<div class="phase-node"><div style="position:relative;width:24px;height:24px;margin-bottom:.35rem;"><div class="pulse-ring"></div><div class="phase-dot active">▶</div></div><span class="phase-label active">${escapeHtml(label)}</span></div>`
        : `<div class="phase-node"><div class="phase-dot ${cls}">${cls === "done" ? "✓" : ""}</div><span class="phase-label">${escapeHtml(label)}</span></div>`;
    return dot;
  }).join("");

  return `<div class="timeline-line"></div><div style="position:relative;z-index:1;display:flex;justify-content:space-between;gap:.25rem;">${nodes}</div>`;
}

function renderStageCard(
  issueIdentifier: string,
  phase: WorkflowDetail["manifest"]["phases"][number],
  runtime: WorkflowRuntimeSummary,
): string {
  const statusClass =
    phase.status === "completed"
      ? "status-completed"
      : phase.status === "in_progress"
        ? "status-in_progress"
        : "status-pending";
  const statusLabel =
    phase.status === "completed"
      ? "已完成"
      : phase.status === "in_progress"
        ? "进行中"
        : "待处理";
  const artifacts = phase.artifacts
    .map(
      (artifact) => `
      <div class="artifact-row">
        <span>${escapeHtml(artifact.display_name ?? artifact.name)} <span style="color:#9ca3af;">(${escapeHtml(artifact.type)})</span></span>
        <span>
          <button type="button" class="btn-link" style="border:none;background:none;cursor:pointer;" onclick="previewArtifact('${escapeHtml(issueIdentifier)}', '${escapeHtml(artifact.path)}')">预览</button>
          <a class="btn-link" href="/api/v1/workflows/${encodeURIComponent(issueIdentifier)}/artifacts/${artifact.path.split("/").map(encodeURIComponent).join("/")}">下载</a>
        </span>
      </div>`,
    )
    .join("");

  const executeSummary =
    phase.id === "execute" && phase.status !== "pending"
      ? `<p style="font-size:.75rem;color:#6b7280;margin:0;">运行摘要：轮次 ${runtime.turn_count ?? "—"} · ${escapeHtml(formatRuntimeStatus(runtime.status))}${runtime.last_message ? ` · ${escapeHtml(runtime.last_message)}` : ""}</p>`
      : "";

  const bodyContent =
    phase.id === "execute"
      ? executeSummary ||
        '<p style="font-size:.75rem;color:#9ca3af;font-style:italic;margin:0;">执行阶段不展示文件列表</p>'
      : artifacts ||
        '<p style="font-size:.75rem;color:#9ca3af;font-style:italic;margin:0;">暂无产物</p>';

  return `<div class="stage-vertical" data-phase-id="${escapeHtml(phase.id)}">
    <div class="stage-dot-col">${phase.status === "in_progress" ? '<div class="phase-dot active">▶</div>' : `<div class="phase-dot ${phase.status === "completed" ? "done" : "pending"}">${phase.status === "completed" ? "✓" : ""}</div>`}</div>
    <div class="card stage-card">
      <div style="display:flex;justify-content:space-between;align-items:center;margin-bottom:.5rem;">
        <strong>${escapeHtml(phase.label)}</strong>
        <span class="status-badge ${statusClass}">${statusLabel}</span>
      </div>
      ${phase.gate ? `<p style="font-size:10px;color:#6b7280;margin:0 0 .5rem;">${escapeHtml(formatGateLabel(phase.gate.id, phase.gate.result))}</p>` : ""}
      ${bodyContent}
    </div>
  </div>`;
}

function formatTimestamp(value: string | null): string {
  if (value === null || value.length === 0) {
    return "—";
  }
  try {
    return new Date(value).toLocaleString("zh-CN", { hour12: false });
  } catch {
    return value;
  }
}

function workflowPreviewScript(): string {
  return `
    async function previewArtifact(issueId, path) {
      const res = await fetch('/api/v1/workflows/' + encodeURIComponent(issueId) + '/artifacts/' + path.split('/').map(encodeURIComponent).join('/'));
      const text = await res.text();
      const mdEl = document.getElementById('preview-content');
      const preEl = document.getElementById('preview-pre');
      const isMarkdown = path.endsWith('.md') || path.startsWith('synthetic://');
      if (isMarkdown && typeof marked !== 'undefined') {
        mdEl.innerHTML = marked.parse(text);
        mdEl.style.display = 'block';
        preEl.style.display = 'none';
      } else {
        preEl.textContent = text;
        preEl.style.display = 'block';
        mdEl.style.display = 'none';
      }
      document.getElementById('preview-modal').classList.add('open');
    }
  `;
}

function workflowDetailClientScript(issueIdentifier: string): string {
  const encoded = escapeHtml(issueIdentifier);
  return `
    if (typeof EventSource !== 'undefined') {
      const source = new EventSource('/api/v1/events');
      source.addEventListener('snapshot', async function () {
        try {
          const res = await fetch('/api/v1/workflows/' + encodeURIComponent('${encoded}'));
          if (!res.ok) return;
          const detail = await res.json();
          const runtime = detail.manifest.runtime;
          const live = document.querySelector('[data-live-message]');
          if (live && runtime.last_message) {
            live.textContent = runtime.last_message;
          }
          const progressFill = document.querySelector('.progress-fill');
          const completed = detail.manifest.phases.filter(function(p) { return p.status === 'completed'; }).length;
          const total = ${V1_BUSINESS_PHASES.length};
          const pct = Math.round((completed / total) * 100);
          if (progressFill) progressFill.style.width = pct + '%';
        } catch (e) { /* ignore */ }
      });
    }
  `;
}

function workflowDashboardClientScript(): string {
  return `
    if (typeof EventSource !== 'undefined') {
      const source = new EventSource('/api/v1/events');
      source.addEventListener('snapshot', async function () {
        try {
          const res = await fetch('/api/v1/workflows?status=active');
          if (!res.ok) return;
          const data = await res.json();
          const container = document.getElementById('workflow-cards');
          if (!container || !Array.isArray(data.workflows)) return;
          for (const wf of data.workflows) {
            const card = container.querySelector('[data-issue-id="' + wf.issue_identifier + '"]');
            if (!card) continue;
            const meta = card.querySelector('[data-wf-meta]');
            if (meta) {
              meta.textContent = '开始 ' + (wf.started_at || '—') + ' · ' + wf.runtime.status;
            }
          }
        } catch (e) { /* ignore */ }
      });
    }
  `;
}
