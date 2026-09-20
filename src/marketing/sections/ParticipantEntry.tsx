import { FormEvent, useState } from 'react';
import {
  APP_BASE_DOMAIN,
  isValidStudioSlug,
  parseStudioSlugInput,
  studioAuthUrl,
} from '../config';
import { Section } from '../ui/Section';

export function ParticipantEntry() {
  const [value, setValue] = useState('');
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    const slug = parseStudioSlugInput(value);
    if (!isValidStudioSlug(slug)) {
      setError(
        'Bitte gib eine gültige Studio-Webadresse ein (3–30 Zeichen, nur Kleinbuchstaben und Zahlen).',
      );
      return;
    }
    setError(null);
    window.location.href = studioAuthUrl(slug);
  };

  return (
    <Section background="bg-sand">
      <div className="max-w-xl">
        <h2 className="font-display text-[1.75rem] font-semibold leading-tight text-text sm:text-[2rem]">
          Du willst einen Kurs buchen?
        </h2>
        <p className="mt-6 text-[17px] leading-[1.45] text-text">
          Dann bist du hier fast richtig. Gib den Namen deines Studios ein, wir bringen dich
          hin.
        </p>
        <form onSubmit={handleSubmit} className="mt-8">
          <label htmlFor="studio-webadresse" className="block text-[15px] font-medium text-text">
            Studio-Webadresse
          </label>
          <div className="mt-2 flex flex-col gap-3 sm:flex-row sm:items-stretch">
            <div className="flex min-h-11 min-w-0 flex-1 items-center rounded-md border border-border bg-surface focus-within:outline focus-within:outline-2 focus-within:outline-offset-2 focus-within:outline-brand">
              <input
                id="studio-webadresse"
                type="text"
                value={value}
                onChange={(event) => {
                  setValue(event.target.value);
                  if (error) setError(null);
                }}
                autoComplete="off"
                spellCheck={false}
                placeholder="dein-studio"
                aria-invalid={error ? true : undefined}
                aria-describedby={error ? 'studio-webadresse-error' : undefined}
                className="min-h-11 min-w-0 flex-1 bg-transparent px-3 text-[15px] text-text placeholder:text-textSubtle focus:outline-none"
              />
              <span className="shrink-0 border-l border-border px-3 text-[13px] text-textMuted">
                .{APP_BASE_DOMAIN}
              </span>
            </div>
            <button
              type="submit"
              className="inline-flex min-h-11 min-w-11 items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand"
            >
              Weiter
            </button>
          </div>
          {error ? (
            <p id="studio-webadresse-error" className="mt-3 text-[15px] leading-snug text-danger" role="alert">
              {error}
            </p>
          ) : null}
        </form>
      </div>
    </Section>
  );
}
