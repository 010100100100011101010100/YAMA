import TaskRows from "@/components/primitives/TaskRows";
import MatrixOrb from "@/components/ui/matrix-orb";
import { Button } from "@/components/atoms/Button";
import ThinkingState from "@/components/primitives/ThinkingState";
import ToolChips from "@/components/primitives/ToolChips";
import type { Copy } from "@/lib/copy";
import type { DemoTask } from "@/lib/demo-state";

export default function TaskStatus({ task, copy, onCancel, onRetry, onShow, comparisonAvailable, backend = false }: {
  task: DemoTask | null; copy: Copy; onCancel: () => void; onRetry: () => void; onShow: () => void; comparisonAvailable: boolean;
  backend?: boolean;
}) {
  if (!task) return null;
  const title = { running: copy.taskRunning, ready: copy.taskReady, failed: copy.taskFailed, canceled: copy.taskCanceled, stale: copy.taskStale }[task.status];
  return <div className="agent-work">
    {task.status === "running" ? <div className="agent-working-row flex flex-wrap items-center justify-between gap-2">
      <MatrixOrb state="thinking" size={48} dots={9} color="#c4c7cb" labels={{ thinking: copy.taskRunning }} className="comparison-orb" /><Button variant="secondary" size="sm" onClick={onCancel}>{copy.cancelTask}</Button>
    </div> : <TaskRows rows={[{ key: task.id, label: title, status: task.status,
    action: task.status === "stale" ? undefined : {
      label: task.status === "ready" ? copy.viewComparison : copy.retry,
      onClick: task.status === "ready" ? onShow : onRetry,
    },
    }]} />}
    <ThinkingState working={task.status === "running"} active={copy.checking} done={title} rows={[
      { primary: copy.confirmationNote },
      { primary: copy.taskDetail, secondary: copy.comparisonLabel },
      { primary: copy.unknownText },
    ]} />
    {task.status === "ready" && comparisonAvailable && <ToolChips initiallyOpen={false} labels={{ header: copy.comparisonLabel }} steps={[
      { icon: "read", label: copy.source, chip: backend ? copy.comparisonLabel : "Example 1 + Example 2", detail: [{ text: copy.taskDetail }] },
      { icon: "run", label: copy.pattern, chip: copy.patternValue, detail: [{ text: copy.supportsText }] },
      { icon: "run", label: copy.linkage, chip: copy.unknown, detail: [{ text: copy.unknownText }] },
    ]} />}
  </div>;
}
