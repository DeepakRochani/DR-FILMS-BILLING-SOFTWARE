import React from 'react';
import { getStatusDetails } from '../utils/formatters';

export function StatusBadge({ status, size = 'md', className = '' }) {
  const details = getStatusDetails(status);

  const sizeClasses = {
    sm: 'text-[11px] px-2 py-0.5 gap-1.5',
    md: 'text-xs px-2.5 py-1 gap-1.5',
    lg: 'text-sm px-3 py-1.5 gap-2'
  };

  const dotSizes = {
    sm: 'w-1.5 h-1.5',
    md: 'w-2 h-2',
    lg: 'w-2.5 h-2.5'
  };

  return (
    <span
      className={`inline-flex items-center font-medium rounded-full border ${details.bg} ${details.text} ${details.border} ${sizeClasses[size]} ${className}`}
    >
      <span className={`rounded-full ${details.badge} ${dotSizes[size]} animate-pulse`} />
      {details.label}
    </span>
  );
}
