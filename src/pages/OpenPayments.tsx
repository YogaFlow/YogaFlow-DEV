import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { ChevronDown, ChevronRight } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { isStudioAdmin } from '../lib/userRoles';
import { berlinIsoDate, berlinIsoFromInstant } from '../lib/courseDateTime';
import { formatCents, formatDate, formatNumericDate } from '../lib/format';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import FeedbackDialog, { type FeedbackDialogState } from '../components/ui/FeedbackDialog';
import PreOmlifyWaiveSection from '../components/payments/PreOmlifyWaiveSection';

type OpenRow = {
  registration_id: string;
  course_id: string;
  course_title: string;
  course_starts_at: string;
  user_id: string;
  display_name: string | null;
  price_cents_at_booking: number | null;
};

type PersonGroup = {
  userId: string;
  name: string;
  sortKey: string;
  totalCents: number;
  courses: Array<{
    registrationId: string;
    courseId: string;
    title: string;
    date: string;
    priceCents: number;
  }>;
};

type BatchRow = {
  id: string;
  before_date: string;
  created_at: string;
  waived_count: number;
  still_waived_count: number;
};

const OpenPayments: React.FC<{ embedded?: boolean }> = ({ embedded: _embedded = false }) => {
  const { userProfile } = useAuth();
  const allowed = isStudioAdmin(userProfile);

  const [loading, setLoading] = useState(true);
  const [rows, setRows] = useState<OpenRow[]>([]);
  const [upcomingRows, setUpcomingRows] = useState<OpenRow[]>([]);
  const [batches, setBatches] = useState<BatchRow[]>([]);
  const [expanded, setExpanded] = useState<Record<string, boolean>>({});
  const [upcomingOpen, setUpcomingOpen] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [success, setSuccess] = useState<{ batchId: string; count: number } | null>(null);
  const [revertBatch, setRevertBatch] = useState<BatchRow | null>(null);
  const [busy, setBusy] = useState(false);
  const [feedback, setFeedback] = useState<FeedbackDialogState | null>(null);

  const load = useCallback(async () => {
    if (!allowed) {
      setLoading(false);
      return;
    }
    const [openRes, upcomingRes, batchRes] = await Promise.all([
      supabase.rpc('get_open_coverage'),
      supabase.rpc('get_upcoming_open_coverage'),
      supabase.rpc('get_pre_omlify_batches'),
    ]);
    if (openRes.error) {
      console.error(openRes.error);
      setRows([]);
    } else {
      setRows((openRes.data as OpenRow[]) ?? []);
    }
    if (upcomingRes.error) {
      console.error(upcomingRes.error);
      setUpcomingRows([]);
    } else {
      setUpcomingRows((upcomingRes.data as OpenRow[]) ?? []);
    }
    if (batchRes.error) {
      console.error(batchRes.error);
      setBatches([]);
    } else {
      setBatches((batchRes.data as BatchRow[]) ?? []);
    }
    setLoading(false);
  }, [allowed]);

  useEffect(() => {
    setLoading(true);
    void load();
  }, [load]);

  const people = useMemo((): PersonGroup[] => {
    const map = new Map<string, PersonGroup>();
    for (const row of rows) {
      const name = (row.display_name ?? '').trim() || 'Ohne Namen';
      const existing = map.get(row.user_id);
      const course = {
        registrationId: row.registration_id,
        courseId: row.course_id,
        title: row.course_title,
        date: berlinIsoFromInstant(row.course_starts_at),
        priceCents: row.price_cents_at_booking ?? 0,
      };
      if (existing) {
        existing.courses.push(course);
        existing.totalCents += course.priceCents;
      } else {
        map.set(row.user_id, {
          userId: row.user_id,
          name,
          sortKey: name.toLocaleLowerCase('de'),
          totalCents: course.priceCents,
          courses: [course],
        });
      }
    }
    const list = [...map.values()];
    list.sort((a, b) => a.sortKey.localeCompare(b.sortKey, 'de'));
    for (const person of list) {
      person.courses.sort((a, b) => a.date.localeCompare(b.date) || a.title.localeCompare(b.title, 'de'));
    }
    return list;
  }, [rows]);

  type UpcomingCourseGroup = {
    courseId: string;
    title: string;
    date: string;
    startsAt: string;
    bookings: Array<{ registrationId: string; name: string }>;
  };

  /** F4: Sammel-Abhaken nur wenn offene Anmeldungen vor gestern existieren. */
  const hasOlderOpen = useMemo(() => {
    const yesterday = berlinIsoDate(-1);
    return rows.some((row) => berlinIsoFromInstant(row.course_starts_at) < yesterday);
  }, [rows]);

  const upcomingByCourse = useMemo((): UpcomingCourseGroup[] => {
    const map = new Map<string, UpcomingCourseGroup>();
    for (const row of upcomingRows) {
      const existing = map.get(row.course_id);
      const name = (row.display_name ?? '').trim() || 'Ohne Namen';
      if (existing) {
        existing.bookings.push({ registrationId: row.registration_id, name });
      } else {
        map.set(row.course_id, {
          courseId: row.course_id,
          title: row.course_title,
          date: berlinIsoFromInstant(row.course_starts_at),
          startsAt: row.course_starts_at,
          bookings: [{ registrationId: row.registration_id, name }],
        });
      }
    }
    return [...map.values()].sort(
      (a, b) => a.startsAt.localeCompare(b.startsAt) || a.title.localeCompare(b.title, 'de'),
    );
  }, [upcomingRows]);

  const confirmRevert = async () => {
    if (!revertBatch || busy) return;
    setBusy(true);
    const { data, error } = await supabase.rpc('revert_pre_omlify_batch', {
      p_batch_id: revertBatch.id,
    });
    setBusy(false);
    setRevertBatch(null);
    if (error) {
      setFeedback({
        title: 'Rückgängig fehlgeschlagen',
        message: 'Das hat nicht geklappt. Bitte versuche es noch einmal.',
        type: 'error',
      });
      return;
    }
    const body = data as { success?: boolean; reverted?: number; error?: string } | null;
    if (!body?.success) {
      setFeedback({
        title: 'Rückgängig fehlgeschlagen',
        message: 'Das hat nicht geklappt. Bitte versuche es noch einmal.',
        type: 'error',
      });
      return;
    }
    const reverted = body.reverted ?? 0;
    setSuccess(null);
    setFeedback({
      title: 'Wieder offen',
      message: `${reverted} Anmeldungen sind wieder offen.`,
      type: 'success',
    });
    void load();
  };

  if (!allowed) {
    return (
      <div className="p-8">
        <div className="rounded-sm border border-danger bg-dangerSoft px-4 py-3 text-danger">
          Zugriff verweigert. Diese Seite ist nur für die Studioleitung.
        </div>
      </div>
    );
  }

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-brand" />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <FeedbackDialog dialog={feedback} onClose={() => setFeedback(null)} />

      {success ? (
        <div className="flex flex-wrap items-center justify-between gap-3 rounded-md border border-border bg-successSoft px-4 py-3">
          <p className="text-[15px] leading-6 text-text">
            Erledigt. {success.count} alte Anmeldungen sind abgehakt.
          </p>
          <button
            type="button"
            onClick={() => {
              const batch = batches.find((item) => item.id === success.batchId);
              setRevertBatch(
                batch && batch.still_waived_count > 0
                  ? batch
                  : {
                      id: success.batchId,
                      before_date: '',
                      created_at: '',
                      waived_count: success.count,
                      still_waived_count: success.count,
                    },
              );
            }}
            className="inline-flex min-h-11 items-center rounded-full border border-borderStrong bg-surface px-4 text-[15px] font-medium text-brand active:bg-surfaceSunken"
          >
            Rückgängig
          </button>
        </div>
      ) : null}

      <section className="overflow-hidden rounded-md border border-border bg-surface">
        <div className="border-b border-border px-3.5 py-3">
          <h2 className="text-[17px] font-medium text-text">Überfällig</h2>
          <p className="mt-0.5 text-[13px] text-textMuted">
            Kurs hat begonnen · noch offen
          </p>
        </div>
        {people.length === 0 ? (
          <p className="px-3.5 py-8 text-center text-[15px] leading-6 text-textMuted">
            Nichts überfällig.
          </p>
        ) : (
          <ul className="divide-y divide-border">
            {people.map((person) => {
              const open = !!expanded[person.userId];
              const courseLabel =
                person.courses.length === 1
                  ? '1 Kurs'
                  : `${person.courses.length} Kurse`;
              return (
                <li key={person.userId}>
                  <button
                    type="button"
                    onClick={() =>
                      setExpanded((prev) => ({
                        ...prev,
                        [person.userId]: !prev[person.userId],
                      }))
                    }
                    className="flex min-h-11 w-full items-center gap-3 px-3.5 py-3 text-left active:bg-surfaceSunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
                  >
                    {open ? (
                      <ChevronDown className="h-[18px] w-[18px] shrink-0 text-textSubtle" aria-hidden />
                    ) : (
                      <ChevronRight className="h-[18px] w-[18px] shrink-0 text-textSubtle" aria-hidden />
                    )}
                    <span className="min-w-0 flex-1 text-[15px] font-medium text-text">
                      {person.name}{' '}
                      <span className="font-normal text-textMuted tabular-nums">
                        · {courseLabel} · {formatCents(person.totalCents)}
                      </span>
                    </span>
                  </button>
                  {open ? (
                    <ul className="divide-y divide-border border-t border-border bg-sage-50">
                      {person.courses.map((course) => (
                        <li key={course.registrationId}>
                          <Link
                            to={`/course/${course.courseId}/participants`}
                            className="flex min-h-11 items-center justify-between gap-3 px-3.5 py-2.5 pl-12 text-[15px] text-text no-underline active:bg-surfaceSunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
                          >
                            <span className="min-w-0">
                              <span className="font-medium">{course.title}</span>
                              <span className="mt-0.5 block text-[13px] text-textMuted tabular-nums">
                                {formatDate(course.date)}
                              </span>
                            </span>
                            <span className="shrink-0 tabular-nums text-textMuted">
                              {formatCents(course.priceCents)}
                            </span>
                          </Link>
                        </li>
                      ))}
                    </ul>
                  ) : null}
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {hasOlderOpen ? (
        <PreOmlifyWaiveSection
          onChanged={() => void load()}
          onWaived={(batchId, count) => {
            setSuccess({ batchId, count });
            void load();
          }}
        />
      ) : null}

      {upcomingByCourse.length > 0 ? (
        <section className="overflow-hidden rounded-md border border-border bg-surface">
          <button
            type="button"
            onClick={() => setUpcomingOpen((value) => !value)}
            className="flex min-h-11 w-full items-center gap-2 border-b border-border px-3.5 py-3 text-left active:bg-surfaceSunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
            data-testid="upcoming-open-toggle"
          >
            {upcomingOpen ? (
              <ChevronDown className="h-[18px] w-[18px] shrink-0 text-textSubtle" aria-hidden />
            ) : (
              <ChevronRight className="h-[18px] w-[18px] shrink-0 text-textSubtle" aria-hidden />
            )}
            <span className="min-w-0">
              <span className="block text-[17px] font-medium text-text">
                Kommt noch · zahlt vor Ort
              </span>
              <span className="mt-0.5 block text-[13px] text-textMuted tabular-nums">
                {upcomingRows.length === 1
                  ? '1 Buchung'
                  : `${upcomingRows.length} Buchungen`}
                {' in '}
                {upcomingByCourse.length === 1
                  ? '1 Kurs'
                  : `${upcomingByCourse.length} Kursen`}
              </span>
            </span>
          </button>
          {upcomingOpen ? (
            <ul className="divide-y divide-border">
              {upcomingByCourse.map((group) => (
                <li key={group.courseId}>
                  <Link
                    to={`/course/${group.courseId}/participants`}
                    className="flex min-h-11 items-center justify-between gap-3 px-3.5 py-3 text-[15px] text-text no-underline active:bg-surfaceSunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
                  >
                    <span className="min-w-0">
                      <span className="font-medium">{group.title}</span>
                      <span className="mt-0.5 block text-[13px] text-textMuted tabular-nums">
                        {formatDate(group.date)} ·{' '}
                        {group.bookings.length === 1
                          ? '1 zahlt vor Ort'
                          : `${group.bookings.length} zahlen vor Ort`}
                      </span>
                    </span>
                    <ChevronRight className="h-[18px] w-[18px] shrink-0 text-textSubtle" aria-hidden />
                  </Link>
                </li>
              ))}
            </ul>
          ) : null}
        </section>
      ) : null}

      {batches.length > 0 ? (
        <section className="overflow-hidden rounded-md border border-border bg-surface">
          <button
            type="button"
            onClick={() => setHistoryOpen((value) => !value)}
            className="flex min-h-11 w-full items-center gap-2 border-b border-border px-3.5 py-3 text-left text-[15px] font-medium text-text active:bg-surfaceSunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand focus-visible:ring-inset"
          >
            {historyOpen ? (
              <ChevronDown className="h-[18px] w-[18px] text-textSubtle" aria-hidden />
            ) : (
              <ChevronRight className="h-[18px] w-[18px] text-textSubtle" aria-hidden />
            )}
            Bisher abgehakt ({batches.length})
          </button>
          {historyOpen ? (
            <ul className="divide-y divide-border">
              {batches.map((batch) => {
                const created = berlinIsoFromInstant(batch.created_at);
                const before = asCivilOrEmpty(batch.before_date);
                const canRevert = batch.still_waived_count > 0;
                return (
                  <li
                    key={batch.id}
                    className="flex flex-wrap items-center justify-between gap-2 px-3.5 py-3 text-[15px] leading-6 text-text"
                  >
                    <span className="tabular-nums text-textMuted">
                      <span className="text-text">{formatNumericDate(created)}</span>
                      {' · '}
                      {batch.waived_count} abgehakt (alles vor dem {formatNumericDate(before)})
                      {!canRevert ? ' · rückgängig gemacht' : ''}
                    </span>
                    {canRevert ? (
                      <button
                        type="button"
                        onClick={() => setRevertBatch(batch)}
                        className="inline-flex min-h-11 items-center rounded-full px-3 text-[15px] font-medium text-brand active:bg-surfaceSunken focus:outline-none focus-visible:ring-2 focus-visible:ring-brand"
                      >
                        Rückgängig
                      </button>
                    ) : null}
                  </li>
                );
              })}
            </ul>
          ) : null}
        </section>
      ) : null}

      <ConfirmDialog
        dialog={
          revertBatch
            ? {
                title: 'Abhaken zurücknehmen',
                message: `${revertBatch.still_waived_count} abgehakte Anmeldungen wieder auf offen setzen? Einzeln geänderte bleiben, wie sie sind.`,
                confirmLabel: 'Zurücknehmen',
                cancelLabel: 'Abbrechen',
                variant: 'primary',
              }
            : null
        }
        loading={busy}
        onConfirm={() => void confirmRevert()}
        onCancel={() => {
          if (!busy) setRevertBatch(null);
        }}
      />
    </div>
  );
};

function asCivilOrEmpty(value: string | null | undefined): string {
  if (!value) return '';
  const match = String(value).trim().match(/^(\d{4}-\d{2}-\d{2})/);
  return match ? match[1] : '';
}

export default OpenPayments;
