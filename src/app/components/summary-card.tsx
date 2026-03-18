'use client';

import type { DiscussionSummaryFinal } from '@/lib/types';
import { getModelDisplayName } from '@/lib/constants';

interface SummaryCardProps {
  summary: DiscussionSummaryFinal;
}

const confidenceLabel: Record<string, string> = {
  high: '高',
  medium: '中',
  low: '低',
};

const severityColor: Record<string, string> = {
  high: '#EF4444',
  medium: '#F59E0B',
  low: '#6B7280',
};

export function SummaryCard({ summary }: SummaryCardProps) {
  return (
    <div style={{ background: 'hsl(0 0% 7%)', border: '1px solid hsl(0 0% 15%)', borderRadius: '12px', padding: '20px', display: 'flex', flexDirection: 'column', gap: '16px' }}>
      {summary.is_degraded && (
        <div style={{ background: '#7C2D12', border: '1px solid #9A3412', borderRadius: '8px', padding: '8px 12px', fontSize: '13px', color: '#FED7AA' }}>
          ⚠️ 书记员总结使用降级模式生成，以下为原文摘要
        </div>
      )}

      <div>
        <div style={{ fontSize: '13px', color: 'hsl(0 0% 60%)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>共识</div>
        <div style={{ display: 'flex', flexDirection: 'column', gap: '6px' }}>
          {summary.consensus.map((c, i) => (
            <div key={i} style={{ fontSize: '14px', color: 'hsl(0 0% 90%)', lineHeight: 1.6, paddingLeft: '12px', borderLeft: '2px solid #10A37F' }}>
              {c.content}
            </div>
          ))}
        </div>
      </div>

      {summary.disagreements.length > 0 && (
        <div>
          <div style={{ fontSize: '13px', color: 'hsl(0 0% 60%)', marginBottom: '8px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>分歧</div>
          <div style={{ display: 'flex', flexDirection: 'column', gap: '8px' }}>
            {summary.disagreements.map((d, i) => (
              <div key={i} style={{ background: 'hsl(0 0% 10%)', borderRadius: '8px', padding: '10px 12px' }}>
                <div style={{ display: 'flex', alignItems: 'center', gap: '8px', marginBottom: '6px' }}>
                  <span style={{ width: '6px', height: '6px', borderRadius: '50%', background: severityColor[d.severity] ?? '#6B7280', flexShrink: 0 }} />
                  <span style={{ fontSize: '13px', fontWeight: 600, color: 'hsl(0 0% 90%)' }}>{d.topic}</span>
                </div>
                <div style={{ display: 'flex', flexDirection: 'column', gap: '4px' }}>
                  {d.positions.map((p, j) => (
                    <div key={j} style={{ fontSize: '12px', color: 'hsl(0 0% 70%)', paddingLeft: '14px' }}>
                      <span style={{ fontWeight: 600 }}>{getModelDisplayName(p.model_id)}</span>: {p.summary}
                    </div>
                  ))}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      <div>
        <div style={{ fontSize: '13px', color: 'hsl(0 0% 60%)', marginBottom: '6px', fontWeight: 600, textTransform: 'uppercase', letterSpacing: '0.05em' }}>建议</div>
        <div style={{ fontSize: '14px', color: 'hsl(0 0% 90%)', lineHeight: 1.6 }}>{summary.recommendation}</div>
      </div>

      <div style={{ display: 'flex', alignItems: 'center', gap: '16px', fontSize: '12px', color: 'hsl(0 0% 60%)', paddingTop: '8px', borderTop: '1px solid hsl(0 0% 15%)' }}>
        <span>信心度：<span style={{ color: 'hsl(0 0% 80%)' }}>{confidenceLabel[summary.confidence] ?? summary.confidence}</span></span>
      </div>

      {summary.disclaimer && (
        <div style={{ fontSize: '11px', color: 'hsl(0 0% 45%)', fontStyle: 'italic', lineHeight: 1.5 }}>{summary.disclaimer}</div>
      )}
    </div>
  );
}
