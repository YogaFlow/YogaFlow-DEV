import { Section } from '../ui/Section';

const FOOTER_LINKS = [
  { href: '/legal/agb', label: 'AGB' },
  { href: '/legal/datenschutz', label: 'Datenschutz' },
  { href: '/legal/impressum', label: 'Impressum' },
  { href: 'mailto:support@omlify.de', label: 'support@omlify.de' },
] as const;

export function Footer() {
  return (
    <Section as="footer" background="border-t border-border bg-sand" spacing="footer">
      <p className="max-w-3xl text-[15px] leading-[1.45] text-textMuted">
        Omlify — Kurs- und Buchungsverwaltung für Yoga-Studios und selbstständige Yogalehrer
        in Deutschland.
      </p>
      <nav className="mt-4 flex flex-wrap items-center gap-x-1 text-[15px]" aria-label="Rechtliches">
        {FOOTER_LINKS.map((link, index) => (
          <span key={link.href} className="inline-flex items-center">
            {index > 0 ? <span className="px-2 text-textSubtle">·</span> : null}
            <a
              href={link.href}
              className="inline-flex min-h-11 items-center text-text underline underline-offset-4 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              {link.label}
            </a>
          </span>
        ))}
      </nav>
      <p className="mt-2 text-[13px] text-textMuted tabular-nums">© 2026 Omlify</p>
    </Section>
  );
}
