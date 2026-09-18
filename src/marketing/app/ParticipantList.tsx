import { ArrowLeft } from 'lucide-react';
import { DEMO_PARTICIPANTS, DEMO_WAITING, initials, occupancy, withMore } from '../demo/data';
import type { DemoCourse } from '../demo/types';

export type ParticipantRow = {
  name: string;
  note: string;
  you?: boolean;
  promoted?: boolean;
  leaving?: boolean;
};

type ParticipantListProps = {
  course: DemoCourse;
  booked?: Record<number, boolean>;
  registered?: readonly ParticipantRow[];
  waiting?: readonly ParticipantRow[];
  taken?: number;
  onBack?: () => void;
  showExport?: boolean;
  compact?: boolean;
  maxRows?: number;
  registeredMore?: number;
};

function Avatar({ row }: { row: ParticipantRow }) {
  return (
    <div
      className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-full text-[13px] font-medium ${
        row.you || row.promoted
          ? 'bg-success text-onBrand'
          : 'bg-surfaceSunken text-textMuted'
      }`}
    >
      {row.you ? 'Du' : initials(row.name)}
    </div>
  );
}

function Row({ row }: { row: ParticipantRow }) {
  return (
    <div
      className={`flex items-center gap-2.5 px-3.5 py-3 ${
        row.you || row.promoted ? 'bg-successSoft' : ''
      }${row.leaving ? ' mkt-row-leaving' : ''}`}
    >
      <Avatar row={row} />
      <div className="min-w-0">
        <div className="text-[15px] leading-snug text-text">{row.you ? 'Du' : row.name}</div>
        <div className="mt-px text-[13px] text-textSubtle">{row.note}</div>
      </div>
    </div>
  );
}

function MoreLine({ rest }: { rest: number }) {
  if (rest <= 0) return null;
  return <div className="mkt-more">und {rest} weitere</div>;
}

export function ParticipantList({
  course,
  booked = {},
  registered,
  waiting,
  taken,
  onBack,
  showExport = true,
  compact = false,
  maxRows = 6,
  registeredMore,
}: ParticipantListProps) {
  const showYou = Boolean(booked[course.id]);
  const names = DEMO_PARTICIPANTS[course.id]?.slice(0, course.registered) ?? [];
  const waitNames = DEMO_WAITING[course.id] ?? [];
  const { taken: counted } = occupancy(course, booked);

  const registeredRows: readonly ParticipantRow[] =
    registered ??
    [
      ...(showYou
        ? [{ name: 'Du', note: 'Angemeldet · gerade eben', you: true } satisfies ParticipantRow]
        : []),
      ...names.map((name) => ({ name, note: 'Angemeldet' })),
    ];

  const waitingRows: readonly ParticipantRow[] =
    waiting ??
    waitNames.map((name, index) => ({
      name,
      note: `Position ${index + 1}`,
    }));

  const occupied = taken ?? counted;
  const registeredVisible =
    registeredMore != null
      ? { shown: registeredRows, rest: registeredMore }
      : withMore(registeredRows, maxRows);
  const waitingVisible = withMore(waitingRows, maxRows);

  return (
    <div className={compact ? '' : 'mkt-detail mx-auto'}>
      {onBack ? (
        <button
          type="button"
          data-demo-back
          onClick={onBack}
          className="inline-flex min-h-11 items-center gap-2 pr-2 text-[15px] font-medium text-textMuted"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
          Zurück
        </button>
      ) : null}

      <h2
        className={`font-medium leading-snug text-text ${
          compact ? 'text-[19px]' : 'text-[22px]'
        }${onBack ? ' mt-2.5' : ''}`}
      >
        {course.title}
      </h2>
      <p className={`text-[13px] text-textMuted tabular-nums ${compact ? 'mt-1' : 'mt-1.5'}`}>
        {course.dayLabel} · {course.time} bis {course.end}
      </p>

      <h3 className={`mb-2 text-[15px] font-medium text-textMuted ${compact ? 'mt-3.5' : 'mt-5'}`}>
        Angemeldet · {occupied} von {course.max}
      </h3>
      <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
        {registeredVisible.shown.map((row) => (
          <Row key={`${row.name}-${row.note}`} row={row} />
        ))}
        <MoreLine rest={registeredVisible.rest} />
      </div>

      {waitingRows.length > 0 ? (
        <>
          <h3 className="mb-2 mt-5 text-[15px] font-medium text-textMuted">Warteliste</h3>
          <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
            {waitingVisible.shown.map((row) => (
              <Row key={`${row.name}-${row.note}`} row={row} />
            ))}
            <MoreLine rest={waitingVisible.rest} />
          </div>
        </>
      ) : null}

      {showExport ? (
        <div className="mt-4">
          <button
            type="button"
            className="inline-flex min-h-11 items-center rounded-full border border-borderStrong bg-surface px-4 text-[14px] font-medium text-brand"
          >
            CSV Export
          </button>
        </div>
      ) : null}
    </div>
  );
}
