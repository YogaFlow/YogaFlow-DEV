import { useCallback, useEffect, useLayoutEffect, useMemo, useRef, useState } from 'react';
import { Link, Navigate } from 'react-router-dom';
import { ArrowLeft, Check, ChevronDown, Copy, Search } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { useTenant } from '../context/TenantContext';
import { formatDate } from '../lib/format';
import { visibleMembers } from '../lib/visibleScope';
import {
  BODY_MAX_LEN,
  canOfferParticipantSend,
  isParticipantSendCollapsed,
  participantDraft,
  toggleExpandedUpdateId,
  visibleUpdates,
  type StudioUpdateContext,
  type StudioUpdateSend,
} from '../lib/studioUpdates';
import {
  fetchReleasedUpdateIds,
  fetchStudioUpdateSends,
} from '../lib/studioUpdateReleases';
import {
  loadStudioUpdateContext,
  notifyUpdatesRead,
} from '../lib/useUnreadUpdates';
import { sendStudioUpdate } from '../lib/sendStudioUpdate';
import type { StudioUpdate } from '../content/updates';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import FeedbackDialog, { FeedbackDialogState } from '../components/ui/FeedbackDialog';
import type { User } from '../types';

/** Empfänger-Liste: Max-Höhe, sichtbare Scrollbar, Verlauf solange mehr folgt. */
function RecipientPickerList({
  members,
  selected,
  onToggle,
  search,
  onSearchChange,
}: {
  members: User[];
  selected: Set<string>;
  onToggle: (id: string) => void;
  search: string;
  onSearchChange: (value: string) => void;
}) {
  const listRef = useRef<HTMLUListElement>(null);
  const [canScrollMore, setCanScrollMore] = useState(false);

  const updateFade = useCallback(() => {
    const el = listRef.current;
    if (!el) {
      setCanScrollMore(false);
      return;
    }
    setCanScrollMore(el.scrollHeight - el.scrollTop - el.clientHeight > 2);
  }, []);

  useLayoutEffect(() => {
    updateFade();
  }, [members, updateFade]);

  return (
    <div className="space-y-2 rounded-sm border border-border bg-surfaceSunken/40 p-3">
      <div className="relative">
        <Search
          size={16}
          className="absolute left-3 top-1/2 -translate-y-1/2 text-textSubtle"
          aria-hidden
        />
        <input
          type="search"
          value={search}
          onChange={(e) => onSearchChange(e.target.value)}
          placeholder="Suchen …"
          className="w-full rounded-sm border border-border bg-surface py-2.5 pl-9 pr-3 text-base"
        />
      </div>
      <p className="text-xs font-medium text-textMuted tabular-nums" aria-live="polite">
        {selected.size} ausgewählt
      </p>
      <div className="relative">
        <ul
          ref={listRef}
          onScroll={updateFade}
          className="max-h-48 space-y-1 overflow-y-scroll overscroll-contain [scrollbar-gutter:stable] [scrollbar-width:thin] [&::-webkit-scrollbar]:w-1.5 [&::-webkit-scrollbar-thumb]:rounded-full [&::-webkit-scrollbar-thumb]:bg-borderStrong [&::-webkit-scrollbar-track]:bg-transparent"
          data-testid="recipient-picker-list"
        >
          {members.map((m) => (
            <li key={m.id}>
              <label className="flex min-h-[44px] items-center gap-2 px-1 text-sm">
                <input
                  type="checkbox"
                  checked={selected.has(m.id)}
                  onChange={() => onToggle(m.id)}
                />
                <span>
                  {m.first_name} {m.last_name}
                </span>
              </label>
            </li>
          ))}
          {members.length === 0 ? (
            <li className="px-1 py-2 text-sm text-textMuted">Keine Treffer.</li>
          ) : null}
        </ul>
        {canScrollMore ? (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-8 bg-gradient-to-t from-[color-mix(in_srgb,var(--color-surface-sunken)_85%,transparent)] to-transparent"
            data-testid="recipient-picker-fade"
          />
        ) : null}
      </div>
    </div>
  );
}

type RecipientMode = 'all' | 'pick';

function formatSentAt(iso: string): string {
  try {
    return new Intl.DateTimeFormat('de-DE', {
      timeZone: 'Europe/Berlin',
      day: 'numeric',
      month: 'long',
      year: 'numeric',
      hour: '2-digit',
      minute: '2-digit',
    }).format(new Date(iso));
  } catch {
    return iso;
  }
}

function sentLine(send: StudioUpdateSend): string {
  const n = send.recipientCount;
  const who = n === 1 ? 'Teilnehmende' : 'Teilnehmende';
  return `✓ Gesendet am ${formatSentAt(send.lastSentAt)} an ${n} ${who}`;
}

export default function Updates() {
  const { userProfile, isAdmin } = useAuth();
  const { tenant } = useTenant();

  const [ctx, setCtx] = useState<StudioUpdateContext | null>(null);
  const [releasedIds, setReleasedIds] = useState<Set<string> | null>(null);
  const [sends, setSends] = useState<Record<string, StudioUpdateSend>>({});
  const [loading, setLoading] = useState(true);
  const [members, setMembers] = useState<User[]>([]);
  const [drafts, setDrafts] = useState<Record<string, { title: string; body: string }>>({});
  const [recipientMode, setRecipientMode] = useState<Record<string, RecipientMode>>({});
  const [selectedIds, setSelectedIds] = useState<Record<string, Set<string>>>({});
  const [pickerOpen, setPickerOpen] = useState<string | null>(null);
  const [search, setSearch] = useState('');
  const [copiedId, setCopiedId] = useState<string | null>(null);
  const [sendingId, setSendingId] = useState<string | null>(null);
  const [confirmUpdate, setConfirmUpdate] = useState<StudioUpdate | null>(null);
  const [feedback, setFeedback] = useState<FeedbackDialogState | null>(null);
  /** Session: manuell aufgeklappte Karten (nach Versand standardmäßig zu). */
  const [expandedIds, setExpandedIds] = useState<Set<string>>(() => new Set());

  const reload = useCallback(async () => {
    if (!tenant?.name || !userProfile?.id || !userProfile.tenant_id) return;
    setLoading(true);
    try {
      const [next, released, sendMap] = await Promise.all([
        loadStudioUpdateContext(tenant.name),
        fetchReleasedUpdateIds(),
        fetchStudioUpdateSends(),
      ]);
      setCtx(next);
      setReleasedIds(released);
      setSends(sendMap ?? {});

      if (released == null) {
        return;
      }

      const visible = visibleUpdates(next, released);
      notifyUpdatesRead(
        userProfile.tenant_id,
        userProfile.id,
        visible.map((u) => u.id),
      );

      const draftMap: Record<string, { title: string; body: string }> = {};
      for (const u of visible) {
        const d = participantDraft(u, next);
        if (d) draftMap[u.id] = d;
      }
      setDrafts(draftMap);
    } finally {
      setLoading(false);
    }
  }, [tenant?.name, userProfile?.id, userProfile?.tenant_id]);

  useEffect(() => {
    if (!isAdmin) return;
    void reload();
  }, [isAdmin, reload]);

  useEffect(() => {
    if (!isAdmin) return;
    void (async () => {
      const { data, error } = await visibleMembers(
        'id, first_name, last_name, email, role, anonymized_at, archived_at',
      )
        .eq('role', 'user')
        .is('anonymized_at', null)
        .order('last_name', { ascending: true });
      if (!error && data) setMembers(data as User[]);
    })();
  }, [isAdmin]);

  const list = useMemo(
    () => (ctx ? visibleUpdates(ctx, releasedIds) : []),
    [ctx, releasedIds],
  );

  const filteredMembers = useMemo(() => {
    const q = search.trim().toLowerCase();
    if (!q) return members;
    return members.filter((m) => {
      const name = `${m.first_name ?? ''} ${m.last_name ?? ''} ${m.email ?? ''}`.toLowerCase();
      return name.includes(q);
    });
  }, [members, search]);

  if (!isAdmin) {
    return <Navigate to="/dashboard" replace />;
  }

  const allCount = members.length;

  const getMode = (id: string): RecipientMode => recipientMode[id] ?? 'all';

  const getSelected = (id: string): Set<string> => selectedIds[id] ?? new Set();

  const recipientCount = (updateId: string): number => {
    if (getMode(updateId) === 'all') return allCount;
    return getSelected(updateId).size;
  };

  const resetDraft = (update: StudioUpdate) => {
    if (!ctx) return;
    const d = participantDraft(update, ctx);
    if (!d) return;
    setDrafts((prev) => ({ ...prev, [update.id]: d }));
  };

  const copyDraft = async (updateId: string) => {
    const d = drafts[updateId];
    if (!d) return;
    const text = d.title ? `${d.title}\n\n${d.body}` : d.body;
    try {
      await navigator.clipboard.writeText(text);
      setCopiedId(updateId);
      window.setTimeout(() => setCopiedId((cur) => (cur === updateId ? null : cur)), 2000);
    } catch {
      setFeedback({
        title: 'Kopieren fehlgeschlagen',
        message: 'Der Text konnte nicht in die Zwischenablage gelegt werden.',
        type: 'error',
      });
    }
  };

  const toggleMember = (updateId: string, memberId: string) => {
    setSelectedIds((prev) => {
      const next = new Set(prev[updateId] ?? []);
      if (next.has(memberId)) next.delete(memberId);
      else next.add(memberId);
      return { ...prev, [updateId]: next };
    });
  };

  const openConfirm = (update: StudioUpdate) => {
    const d = drafts[update.id];
    if (!d || !d.body.trim()) return;
    if (recipientCount(update.id) < 1) return;
    setConfirmUpdate(update);
  };

  const doSend = async () => {
    const update = confirmUpdate;
    if (!update || !userProfile?.id || !userProfile.tenant_id) return;
    const d = drafts[update.id];
    if (!d) return;

    const ids =
      getMode(update.id) === 'all' ? null : [...getSelected(update.id)];

    setSendingId(update.id);
    setConfirmUpdate(null);
    const result = await sendStudioUpdate({
      recipientIds: ids,
      title: d.title.trim(),
      body: d.body.trim(),
      updateId: update.id,
    });
    setSendingId(null);

    if (!result.ok) {
      setFeedback({
        title: 'Senden fehlgeschlagen',
        message:
          result.error === 'FORBIDDEN'
            ? 'Du hast keine Berechtigung für diesen Versand.'
            : result.error === 'EMPTY_MESSAGE'
              ? 'Die Nachricht darf nicht leer sein.'
              : result.error === 'UPDATE_NOT_RELEASED'
                ? 'Diese Neuigkeit ist noch nicht freigegeben.'
                : `Fehler: ${result.error}`,
        type: 'error',
      });
      return;
    }

    setSends((prev) => ({
      ...prev,
      [update.id]: {
        updateId: update.id,
        lastSentAt: new Date().toISOString(),
        recipientCount: result.sent,
      },
    }));
    setExpandedIds((prev) => {
      const next = new Set(prev);
      next.delete(update.id);
      return next;
    });
    setFeedback({
      title: 'Gesendet',
      message: `Nachricht an ${result.sent} Teilnehmende gesendet.`,
      type: 'success',
    });
    void fetchStudioUpdateSends().then((map) => {
      if (map) setSends(map);
    });
  };

  const confirmExtra =
    confirmUpdate && sends[confirmUpdate.id]
      ? `Bereits am ${formatSentAt(sends[confirmUpdate.id].lastSentAt)} an ${sends[confirmUpdate.id].recipientCount} gesendet.`
      : null;

  return (
    <div className="mx-auto max-w-2xl space-y-6">
      <div>
        <Link
          to="/settings"
          className="mb-3 inline-flex min-h-11 items-center gap-2 text-[15px] font-medium text-text"
          data-testid="updates-back-settings"
        >
          <ArrowLeft className="h-5 w-5" aria-hidden />
          Einstellungen
        </Link>
        <h2 className="text-xl font-semibold text-text">Neu für dich</h2>
        <p className="mt-1 text-sm text-textMuted">
          Neuigkeiten von Omlify — und vorformulierte Nachrichten an deine Teilnehmenden.
        </p>
      </div>

      {loading || !ctx ? (
        <p className="text-sm text-textMuted">Laden …</p>
      ) : list.length === 0 ? (
        <p className="text-sm text-textMuted">Noch keine Neuigkeiten</p>
      ) : (
        <ul className="space-y-6">
          {list.map((update) => {
            const draft = drafts[update.id];
            const offerSend = canOfferParticipantSend(update, ctx);
            const send = sends[update.id];
            const canToggle = Boolean(update.participantMessage && send);
            const collapsed = isParticipantSendCollapsed({
              hasParticipantMessage: Boolean(update.participantMessage),
              hasSend: Boolean(send),
              manuallyExpanded: expandedIds.has(update.id),
            });
            const toggleCard = () => {
              setExpandedIds((prev) => toggleExpandedUpdateId(prev, update.id));
            };
            const mode = getMode(update.id);
            const selected = getSelected(update.id);
            const n = recipientCount(update.id);
            const bodyLen = draft?.body.length ?? 0;
            const canSend =
              offerSend &&
              !!draft?.body.trim() &&
              n > 0 &&
              bodyLen <= BODY_MAX_LEN &&
              sendingId !== update.id;

            return (
              <li
                key={update.id}
                className="space-y-3 rounded-sm border border-border bg-surface p-4 sm:p-5"
              >
                <div
                  className={`flex flex-wrap items-center gap-x-3 gap-y-1 ${
                    canToggle ? 'cursor-pointer select-none' : ''
                  }`}
                  onClick={canToggle ? toggleCard : undefined}
                  onKeyDown={
                    canToggle
                      ? (e) => {
                          if (e.key === 'Enter' || e.key === ' ') {
                            e.preventDefault();
                            toggleCard();
                          }
                        }
                      : undefined
                  }
                  role={canToggle ? 'button' : undefined}
                  tabIndex={canToggle ? 0 : undefined}
                  aria-expanded={canToggle ? !collapsed : undefined}
                >
                  <time className="text-xs text-textSubtle tabular-nums">
                    {formatDate(update.date)}
                  </time>
                  <h3 className="min-w-0 flex-1 text-base font-semibold text-text">
                    {update.title}
                  </h3>
                  {canToggle ? (
                    <ChevronDown
                      size={20}
                      aria-hidden
                      className={`shrink-0 text-textMuted transition-transform ${
                        collapsed ? '' : 'rotate-180'
                      }`}
                    />
                  ) : null}
                </div>

                {collapsed && send ? (
                  <div className="space-y-2">
                    <p className="text-sm text-text">{sentLine(send)}</p>
                    <button
                      type="button"
                      onClick={toggleCard}
                      className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-brand"
                      aria-expanded={false}
                    >
                      <ChevronDown size={18} aria-hidden />
                      Aufklappen
                    </button>
                  </div>
                ) : (
                  <>
                    <p className="whitespace-pre-wrap text-sm leading-relaxed text-text">
                      {update.body}
                    </p>
                    {update.cta ? (
                      <Link
                        to={update.cta.path}
                        className="inline-flex min-h-[44px] items-center rounded-sm bg-brand px-4 text-sm font-medium text-onBrand active:bg-brandPressed"
                      >
                        {update.cta.label}
                      </Link>
                    ) : null}

                    {update.participantMessage ? (
                      <div className="mt-4 space-y-3 border-t border-border pt-4">
                        {send ? (
                          <p className="text-sm text-text">{sentLine(send)}</p>
                        ) : null}
                        {canToggle ? (
                          <button
                            type="button"
                            onClick={toggleCard}
                            className="inline-flex min-h-[44px] items-center gap-1.5 text-sm font-medium text-brand"
                            aria-expanded={true}
                          >
                            <ChevronDown
                              size={18}
                              aria-hidden
                              className="rotate-180"
                            />
                            Zuklappen
                          </button>
                        ) : null}
                        <h4 className="text-sm font-semibold text-text">
                          Nachricht an deine Teilnehmenden
                        </h4>

                        {!offerSend ? (
                          <p className="text-sm text-textMuted">
                            Lege zuerst eine Kurskarte an, dann kannst du diese Nachricht senden.
                          </p>
                        ) : (
                          <>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-textMuted">
                                Titel
                              </label>
                              <input
                                type="text"
                                value={draft?.title ?? ''}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [update.id]: {
                                      title: e.target.value,
                                      body: prev[update.id]?.body ?? '',
                                    },
                                  }))
                                }
                                className="w-full rounded-sm border border-border px-3 py-2.5 text-base"
                                maxLength={120}
                              />
                            </div>
                            <div>
                              <label className="mb-1 block text-xs font-medium text-textMuted">
                                Text
                              </label>
                              <textarea
                                value={draft?.body ?? ''}
                                onChange={(e) =>
                                  setDrafts((prev) => ({
                                    ...prev,
                                    [update.id]: {
                                      title: prev[update.id]?.title ?? '',
                                      body: e.target.value,
                                    },
                                  }))
                                }
                                rows={5}
                                className="w-full resize-y rounded-sm border border-border px-3 py-2.5 text-base"
                                maxLength={BODY_MAX_LEN}
                              />
                              <div className="mt-1 flex flex-wrap items-center justify-between gap-2 text-xs text-textSubtle">
                                <span className="tabular-nums">
                                  {bodyLen} / {BODY_MAX_LEN}
                                </span>
                                <div className="flex items-center gap-3">
                                  <button
                                    type="button"
                                    onClick={() => resetDraft(update)}
                                    className="min-h-[44px] text-brand hover:underline"
                                  >
                                    Zurücksetzen auf Vorschlag
                                  </button>
                                  <button
                                    type="button"
                                    onClick={() => void copyDraft(update.id)}
                                    className="inline-flex min-h-[44px] items-center gap-1.5 text-brand hover:underline"
                                    aria-label="Nachricht kopieren"
                                  >
                                    {copiedId === update.id ? (
                                      <>
                                        <Check size={16} aria-hidden />
                                        Kopiert ✓
                                      </>
                                    ) : (
                                      <>
                                        <Copy size={16} aria-hidden />
                                        Kopieren
                                      </>
                                    )}
                                  </button>
                                </div>
                              </div>
                            </div>

                            <fieldset className="space-y-2">
                              <legend className="text-xs font-medium text-textMuted">
                                Empfänger
                              </legend>
                              <label className="flex min-h-[44px] items-center gap-2 text-sm">
                                <input
                                  type="radio"
                                  name={`recip-${update.id}`}
                                  checked={mode === 'all'}
                                  onChange={() => {
                                    setRecipientMode((p) => ({
                                      ...p,
                                      [update.id]: 'all',
                                    }));
                                    setPickerOpen(null);
                                  }}
                                />
                                Alle Teilnehmenden ({allCount})
                              </label>
                              <label className="flex min-h-[44px] items-center gap-2 text-sm">
                                <input
                                  type="radio"
                                  name={`recip-${update.id}`}
                                  checked={mode === 'pick'}
                                  onChange={() => {
                                    setRecipientMode((p) => ({
                                      ...p,
                                      [update.id]: 'pick',
                                    }));
                                    setPickerOpen(update.id);
                                  }}
                                />
                                Auswählen …
                              </label>
                            </fieldset>

                            {mode === 'pick' && pickerOpen === update.id ? (
                              <RecipientPickerList
                                members={filteredMembers}
                                selected={selected}
                                onToggle={(id) => toggleMember(update.id, id)}
                                search={search}
                                onSearchChange={setSearch}
                              />
                            ) : null}

                            <button
                              type="button"
                              disabled={!canSend}
                              onClick={() => openConfirm(update)}
                              className="inline-flex min-h-[44px] items-center rounded-sm bg-brand px-4 text-sm font-medium text-onBrand active:bg-brandPressed disabled:pointer-events-none disabled:opacity-40"
                            >
                              {sendingId === update.id ? 'Senden …' : 'Vorschau & senden'}
                            </button>
                          </>
                        )}
                      </div>
                    ) : null}
                  </>
                )}
              </li>
            );
          })}
        </ul>
      )}

      <ConfirmDialog
        dialog={
          confirmUpdate
            ? {
                title: `An ${recipientCount(confirmUpdate.id)} Teilnehmende senden?`,
                message: [
                  confirmExtra,
                  drafts[confirmUpdate.id]
                    ? `Titel: ${drafts[confirmUpdate.id].title} — ${drafts[confirmUpdate.id].body.slice(0, 160)}${drafts[confirmUpdate.id].body.length > 160 ? '…' : ''}`
                    : '',
                ]
                  .filter(Boolean)
                  .join(' '),
                confirmLabel: 'Senden',
                cancelLabel: 'Abbrechen',
                variant: 'primary',
              }
            : null
        }
        loading={sendingId != null}
        onConfirm={() => void doSend()}
        onCancel={() => setConfirmUpdate(null)}
      />

      <FeedbackDialog dialog={feedback} onClose={() => setFeedback(null)} />
    </div>
  );
}
