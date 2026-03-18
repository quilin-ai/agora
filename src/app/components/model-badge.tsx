'use client';

import { getModelColor, getModelDisplayName } from '@/lib/constants';

interface ModelBadgeProps {
  modelId: string;
  size?: 'sm' | 'md';
}

export function ModelBadge({ modelId, size = 'md' }: ModelBadgeProps) {
  const color = getModelColor(modelId);
  const name = getModelDisplayName(modelId);
  const dotSize = size === 'sm' ? '6px' : '8px';
  const fontSize = size === 'sm' ? '11px' : '12px';

  return (
    <span style={{ display: 'inline-flex', alignItems: 'center', gap: '4px', fontSize }}>
      <span style={{ width: dotSize, height: dotSize, borderRadius: '50%', background: color, flexShrink: 0 }} />
      {name}
    </span>
  );
}
