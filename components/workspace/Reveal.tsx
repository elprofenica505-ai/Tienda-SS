'use client';

import { useEffect, useRef, useState } from 'react';

type RevealProps = { children: React.ReactNode; className?: string; delay?: number };

export function Reveal({ children, className = '', delay = 0 }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const node = ref.current;
    if (!node) return;
    if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
      setVisible(true);
      return;
    }
    const observer = new IntersectionObserver(([entry]) => {
      if (entry.isIntersecting) {
        setVisible(true);
        observer.disconnect();
      }
    }, { threshold: 0.12, rootMargin: '0px 0px -40px' });
    observer.observe(node);
    return () => observer.disconnect();
  }, []);

  return <div ref={ref} className={`reveal-wrap ${visible ? 'is-visible' : ''} ${className}`} style={{ '--reveal-delay': `${delay}ms` } as React.CSSProperties}>{children}</div>;
}
