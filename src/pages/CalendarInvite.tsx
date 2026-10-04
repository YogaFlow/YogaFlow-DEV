/**
 * Öffentliche Kalender-Seite (UX-4 C1): ?t= Token oder ?rid= (eingeloggt).
 */
import React, { useEffect, useMemo, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { Calendar, Clock, MapPin } from 'lucide-react';
import { useTenant } from '../context/TenantContext';
import { applyBrandColor } from '../lib/brandTheme';
import {
  buildGoogleCalendarUrl,
  buildSimpleIcs,
  calendarActionsForDevice,
  detectCalendarDevice,
  downloadIcsBlob,
  type CalendarMeta,
} from '../lib/calendarInvite';
import { formatDate, formatTime } from '../lib/format';
import { supabase } from '../lib/supabase';
import StudioMark from '../components/branding/StudioMark';
import { getStudioLogoUrl } from '../lib/studioBranding';

async function fetchMetaByToken(token: string): Promise<CalendarMeta | null> {
  const base = (import.meta.env.VITE_SUPABASE_URL as string | undefined)?.replace(/\/+$/, '');
  if (!base) return null;
  const res = await fetch(
    `${base}/functions/v1/calendar-ics?t=${encodeURIComponent(token)}&format=json`,
  );
  if (!res.ok) return null;
  return (await res.json()) as CalendarMeta;
}

const CalendarInvite: React.FC = () => {
  const [params] = useSearchParams();
  const token = params.get('t')?.trim() ?? '';
  const rid = params.get('rid')?.trim() ?? '';
  const { tenant } = useTenant();
  const [meta, setMeta] = useState<CalendarMeta | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(true);

  const device = useMemo(
    () => detectCalendarDevice(typeof navigator !== 'undefined' ? navigator.userAgent : ''),
    [],
  );
  const actions = useMemo(() => calendarActionsForDevice(device), [device]);

  useEffect(() => {
    let active = true;
    (async () => {
      setLoading(true);
      setError(false);
      try {
        if (token) {
          const row = await fetchMetaByToken(token);
          if (!active) return;
          if (!row) {
            setError(true);
            return;
          }
          setMeta(row);
          if (row.brandColor) applyBrandColor(row.brandColor);
          return;
        }
        if (rid) {
          const { data: reg, error: regErr } = await supabase
            .from('registrations')
            .select('id, course_id, cancellation_timestamp, status')
            .eq('id', rid)
            .maybeSingle();
          if (regErr || !reg || reg.cancellation_timestamp) {
            if (active) setError(true);
            return;
          }
          const { data: course, error: courseErr } = await supabase
            .from('courses')
            .select('id, title, date, time, end_time, location, room')
            .eq('id', reg.course_id)
            .maybeSingle();
          if (courseErr || !course?.date || !course.time) {
            if (active) setError(true);
            return;
          }
          const place = [course.location, course.room].filter(Boolean).join(' · ') || null;
          const title = course.title?.trim() || 'Kurs';
          const studioName = tenant?.name?.trim() || 'Studio';
          const googleUrl = buildGoogleCalendarUrl({
            title,
            date: course.date,
            startTime: course.time,
            endTime: course.end_time,
            location: place,
            details: `Termin bei ${studioName}`,
          });
          if (!active) return;
          setMeta({
            title,
            date: course.date,
            time: course.time.slice(0, 5),
            dateLabel: formatDate(course.date),
            timeLabel: formatTime(course.time),
            place,
            studioName,
            brandColor: tenant?.brand_color ?? null,
            googleUrl,
            icsUrl: null,
            icsInlineUrl: null,
            registrationId: reg.id,
            endTime: course.end_time,
          });
          return;
        }
        if (active) setError(true);
      } finally {
        if (active) setLoading(false);
      }
    })();
    return () => {
      active = false;
    };
  }, [token, rid, tenant?.name, tenant?.brand_color]);

  const openIcs = (inline: boolean) => {
    if (!meta) return;
    if (meta.icsInlineUrl && inline) {
      window.location.href = meta.icsInlineUrl;
      return;
    }
    if (meta.icsUrl && !inline) {
      window.location.href = meta.icsUrl;
      return;
    }
    if (meta.registrationId) {
      const ics = buildSimpleIcs({
        uid: meta.registrationId,
        title: meta.title,
        date: meta.date,
        startTime: meta.time,
        endTime: meta.endTime,
        location: meta.place,
        description: `Termin bei ${meta.studioName}`,
      });
      if (inline) {
        const blob = new Blob([ics], { type: 'text/calendar;charset=utf-8' });
        window.location.href = URL.createObjectURL(blob);
        return;
      }
      downloadIcsBlob('buchung.ics', ics);
    }
  };

  const onAction = (id: string) => {
    if (!meta) return;
    if (id === 'google' && meta.googleUrl) {
      window.open(meta.googleUrl, '_blank', 'noopener,noreferrer');
      return;
    }
    if (id === 'apple') {
      openIcs(true);
      return;
    }
    if (id === 'ics' || id === 'outlook') {
      openIcs(false);
    }
  };

  return (
    <div className="min-h-screen bg-sand px-4 py-8" data-testid="calendar-invite-page">
      <div className="mx-auto w-full max-w-md">
        <StudioMark
          variant="auth"
          name={meta?.studioName ?? tenant?.name ?? 'Omlify'}
          logoUrl={getStudioLogoUrl(tenant?.logo_path)}
          showLogo={tenant?.logo_on_auth ?? false}
          showName
        />

        {loading ? (
          <p className="mt-10 text-center text-[15px] text-textMuted">Laden …</p>
        ) : error || !meta ? (
          <div className="mt-10 text-center">
            <h1 className="text-[22px] font-medium text-text">Termin nicht gefunden</h1>
            <p className="mt-2 text-[15px] text-textMuted">
              Der Link ist ungültig oder die Buchung wurde storniert.
            </p>
          </div>
        ) : (
          <>
            <h1 className="mt-8 text-[22px] font-medium text-text">In Kalender eintragen</h1>
            <div className="mt-5 divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
              <div className="px-3.5 py-3">
                <p className="text-[17px] font-medium text-text">{meta.title}</p>
              </div>
              <div className="flex items-start gap-3 px-3.5 py-3">
                <Calendar className="mt-0.5 h-5 w-5 shrink-0 text-sage-500" aria-hidden />
                <p className="text-[15px] text-text">{meta.dateLabel}</p>
              </div>
              <div className="flex items-start gap-3 px-3.5 py-3">
                <Clock className="mt-0.5 h-5 w-5 shrink-0 text-sage-500" aria-hidden />
                <p className="text-[15px] tabular-nums text-text">{meta.timeLabel}</p>
              </div>
              {meta.place ? (
                <div className="flex items-start gap-3 px-3.5 py-3">
                  <MapPin className="mt-0.5 h-5 w-5 shrink-0 text-sage-500" aria-hidden />
                  <p className="text-[15px] text-text">{meta.place}</p>
                </div>
              ) : null}
            </div>

            <div className="mt-6 flex flex-col gap-2" data-testid="calendar-actions">
              {actions.map((action) => (
                <button
                  key={action.id}
                  type="button"
                  data-testid={`calendar-action-${action.id}`}
                  data-primary={action.primary ? '1' : '0'}
                  onClick={() => onAction(action.id)}
                  className={
                    action.primary
                      ? 'inline-flex h-11 w-full items-center justify-center rounded-full bg-brand px-5 text-[15px] font-medium text-onBrand active:bg-brandPressed'
                      : 'inline-flex h-11 w-full items-center justify-center rounded-full border border-border bg-surface px-5 text-[15px] font-medium text-text active:bg-surfaceSunken'
                  }
                >
                  {action.label}
                </button>
              ))}
            </div>
          </>
        )}
      </div>
    </div>
  );
};

export default CalendarInvite;
