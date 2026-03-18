import React, { useState, useEffect } from 'react';

export function CurrentTimeLine() {
  const [now, setNow] = useState(new Date());

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 60_000);
    return () => clearInterval(id);
  }, []);

  const h = now.getHours();
  const m = now.getMinutes();
  const label = `${h}:${m.toString().padStart(2, '0')}`;

  return (
    <div className="flex items-center gap-2 py-1">
      <span className="text-xs font-medium px-1.5 py-0.5 rounded bg-yellow-400 text-gray-900">
        {label}
      </span>
      <div className="flex-1 h-px bg-yellow-400" />
    </div>
  );
}
