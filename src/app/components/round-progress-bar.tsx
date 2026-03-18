'use client';

const phaseLabels: Record<string, string> = {
  independent: '独立思考',
  anonymous_review: '匿名互评',
  rebuttal: '反驳阶段',
  secretary_summary: '书记员总结',
  time_limit_approaching: '即将超时',
};

interface RoundProgressBarProps {
  currentRound: number;
  totalRounds: number;
  phase: string;
  models: string[];
  modelStreams: Record<string, { done: boolean; isSkipped: boolean }>;
}

export function RoundProgressBar({ currentRound, totalRounds, phase, models, modelStreams }: RoundProgressBarProps) {
  const phaseLabel = phaseLabels[phase] ?? phase;
  const completedCount = models.filter((m) => modelStreams[m]?.done || modelStreams[m]?.isSkipped).length;

  return (
    <div style={{
      background: 'hsl(0 0% 7%)',
      border: '1px solid hsl(0 0% 15%)',
      borderRadius: '10px',
      padding: '12px 16px',
      display: 'flex',
      alignItems: 'center',
      gap: '16px',
      flexShrink: 0,
    }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: '8px' }}>
        <span style={{ fontSize: '13px', fontWeight: 600, color: 'hsl(0 0% 90%)' }}>
          第 {currentRound} 轮 / 共 {totalRounds} 轮
        </span>
        {phase && (
          <span style={{ fontSize: '12px', color: 'hsl(0 0% 55%)', background: 'hsl(0 0% 12%)', padding: '2px 8px', borderRadius: '4px' }}>
            {phaseLabel}
          </span>
        )}
      </div>

      <div style={{ marginLeft: 'auto', display: 'flex', gap: '6px', alignItems: 'center' }}>
        {models.map((modelId) => {
          const stream = modelStreams[modelId];
          const isDone = stream?.done || stream?.isSkipped;
          return (
            <div
              key={modelId}
              title={modelId}
              style={{
                width: '8px',
                height: '8px',
                borderRadius: '50%',
                background: isDone ? '#10A37F' : (stream && !stream.done ? '#D97706' : 'hsl(0 0% 25%)'),
                transition: 'background 0.3s',
              }}
            />
          );
        })}
        <span style={{ fontSize: '11px', color: 'hsl(0 0% 50%)', marginLeft: '4px' }}>
          {completedCount}/{models.length}
        </span>
      </div>
    </div>
  );
}
