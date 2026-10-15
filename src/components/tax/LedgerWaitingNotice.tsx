import { Link } from 'react-router-dom';

export const LEDGER_WAITING_TEXT =
  'Omlify verbucht deine Einnahmen, sobald du deinen Steuerstatus angibst. Bis dahin werden Zahlungen gesammelt, es geht nichts verloren.';

const SHORT_TEXT =
  'Omlify verbucht deine Einnahmen, sobald du deinen Steuerstatus angibst.';

type Props = {
  variant: 'settings-owner' | 'settings-admin' | 'dashboard';
  onSpecify?: () => void;
};

export default function LedgerWaitingNotice({ variant, onSpecify }: Props) {
  const text = variant === 'dashboard' ? SHORT_TEXT : LEDGER_WAITING_TEXT;

  return (
    <div className="rounded-md border border-accent bg-accentSoft px-3.5 py-3 text-text">
      <p className="text-[15px] leading-snug">{text}</p>
      {variant === 'settings-owner' ? (
        <button
          type="button"
          onClick={onSpecify}
          className="mt-3 inline-flex min-h-11 items-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed"
        >
          Steuerstatus angeben
        </button>
      ) : null}
      {variant === 'settings-admin' ? (
        <p className="mt-2 text-[15px] leading-snug">Nur die Inhaberin kann das angeben.</p>
      ) : null}
      {variant === 'dashboard' ? (
        <Link
          to="/settings#steuern"
          className="mt-1 inline-flex min-h-11 items-center text-[15px] font-medium text-brand no-underline"
        >
          Einstellungen → Steuern
        </Link>
      ) : null}
    </div>
  );
}
