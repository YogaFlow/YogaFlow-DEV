import { useEffect, useRef, useState, type ReactNode } from 'react';

type RevealProps = {
  className?: string;
  children: ReactNode;
};

export function Reveal({ className, children }: RevealProps) {
  const ref = useRef<HTMLDivElement>(null);
  const [visible, setVisible] = useState(false);

  useEffect(() => {
    const el = ref.current;
    if (!el) return;

    const io = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setVisible(true);
          io.disconnect();
        }
      },
      { threshold: 0.12 },
    );
    io.observe(el);
    return () => io.disconnect();
  }, []);

  return (
    <div ref={ref} className={['mkt-rv', visible ? 'in' : '', className].filter(Boolean).join(' ')}>
      {children}
    </div>
  );
}
