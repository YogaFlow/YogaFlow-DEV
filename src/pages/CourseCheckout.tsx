import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { isStudioAdmin, isTeacherOnly } from '../lib/userRoles';
import { isCourseCancelled } from '../lib/courseDateTime';
import { formatDate, formatPrice, formatTime } from '../lib/format';
import type { CoverageStatus, PaymentMethod, WaivedReason } from '../types';
import UndoBar from '../components/ui/UndoBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SellPassDialog from '../components/passes/SellPassDialog';
import {
  CASH_HINT,
  WAIVE_NOTE_HINT,
  WAIVE_REASONS,
  amountNoteRequired,
  centsToEuroInput,
  checkoutErrorMessage,
  compareCheckoutRows,
  countCheckout,
  coverageShortLabel,
  eurosToCents,
  latestUnreversedPayment,
  methodWord,
  paidStatusLabel,
  waiveReasonLabel,
  type ManualCheckoutMethod,
} from '../lib/courseCheckout';
import {
  applyPassToRegistration,
  fetchMemberPassesForMany,
  fetchSellablePassProducts,
  findUsablePass,
  passBadgeLabel,
  revokePass,
  sellUndoText,
  undoPassRedemption,
  type MemberPassSummary,
} from '../lib/passes';

type Person = {
  registrationId: string;
  userId: string;
  firstName: string;
  lastName: string;
  coverage: CoverageStatus;
  waivedReason: WaivedReason | null;
  waivedNote: string | null;
  priceCents: number | null;
  method: PaymentMethod | null;
};

type CourseHead = {
  id: string;
  title: string;
  date: string;
  time: string;
  teacher_id: string;
  status: string | null;
  price: number | null;
  pass_eligible: boolean | null;
};

type RefundPerson = {
  registrationId: string;
  paymentId: string;
  firstName: string;
  lastName: string;
  method: PaymentMethod | null;
  amountCents: number;
};

type UndoState = {
  kind: 'payment' | 'pass' | 'pass_redeem';
  registrationId: string;
  paymentId: string;
  passId?: string;
  userId?: string;
  text: string;
  remainingAfter?: number;
};

type AmountDialog = {
  registrationId: string;
  name: string;
  euros: string;
  note: string;
  priceLabel: string;
  priceCents: number | null;
  method: ManualCheckoutMethod;
};

type WaiveDialog = {
  registrationId: string;
  name: string;
  reason: WaivedReason | '';
  note: string;
};

type RpcBody = {
  success?: boolean;
  error?: string;
  payment_id?: string;
};

const MENU_METHODS: { method: ManualCheckoutMethod; label: string }[] = [
  { method: 'paypal_manual', label: 'PayPal' },
  { method: 'bank_transfer', label: 'Überweisung' },
];

const AMOUNT_METHODS: { method: ManualCheckoutMethod; label: string }[] = [
  { method: 'cash', label: 'Bar' },
  { method: 'paypal_manual', label: 'PayPal' },
  { method: 'bank_transfer', label: 'Überweisung' },
];

function personName(person: Pick<Person, 'firstName' | 'lastName'>): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name || 'Teilnehmerin';
}

function statusLabel(person: Person, seesMethod: boolean): { text: string; detail: string } {
  if (person.coverage === 'pass') {
    return { text: coverageShortLabel('pass'), detail: '' };
  }
  if (person.coverage === 'paid') {
    return { text: paidStatusLabel(seesMethod, person.method), detail: '' };
  }
  if (person.coverage === 'waived') {
    const reason = waiveReasonLabel(person.waivedReason);
    const detail = seesMethod
      ? [reason, person.waivedNote].filter(Boolean).join(': ')
      : '';
    return { text: 'erlassen', detail };
  }
  if (person.coverage === 'not_required') {
    return { text: 'kostenlos', detail: '' };
  }
  const price =
    person.priceCents != null ? formatPrice(person.priceCents / 100) : '';
  return { text: 'offen', detail: price };
}

const CourseCheckout: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const { userProfile } = useAuth();
  const [course, setCourse] = useState<CourseHead | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [refunds, setRefunds] = useState<RefundPerson[]>([]);
  const [paidCancelledCount, setPaidCancelledCount] = useState(0);
  const [refundTarget, setRefundTarget] = useState<RefundPerson | null>(null);
  const [loading, setLoading] = useState(true);
  const [forbidden, setForbidden] = useState(false);
  const [missing, setMissing] = useState(false);
  const [errorText, setErrorText] = useState('');
  const [menuFor, setMenuFor] = useState<string | null>(null);
  const [undo, setUndo] = useState<UndoState | null>(null);
  const [undoBusy, setUndoBusy] = useState(false);
  const [amountDialog, setAmountDialog] = useState<AmountDialog | null>(null);
  const [waiveDialog, setWaiveDialog] = useState<WaiveDialog | null>(null);
  const [revertTarget, setRevertTarget] = useState<Person | null>(null);
  const [dialogError, setDialogError] = useState('');
  const [dialogBusy, setDialogBusy] = useState(false);
  const [passesByUser, setPassesByUser] = useState<Record<string, MemberPassSummary[]>>({});
  const [hasSellableProducts, setHasSellableProducts] = useState(false);
  const [sellTarget, setSellTarget] = useState<Person | null>(null);
  const [undoPassConfirm, setUndoPassConfirm] = useState<Person | null>(null);
  const busyIds = useRef(new Set<string>());

  const seesMethod = isStudioAdmin(userProfile);
  const expireUndo = useCallback(() => setUndo(null), []);

  const load = useCallback(async () => {
    if (!userProfile || !courseId) return;
    setErrorText('');

    const { data: courseRow, error: courseError } = await supabase
      .from('courses')
      .select('id, title, date, time, teacher_id, status, price, pass_eligible')
      .eq('id', courseId)
      .maybeSingle();

    if (courseError) {
      setErrorText(checkoutErrorMessage(undefined));
      setLoading(false);
      return;
    }
    if (!courseRow) {
      setMissing(true);
      setLoading(false);
      return;
    }

    const allowed =
      isStudioAdmin(userProfile) ||
      (isTeacherOnly(userProfile) && courseRow.teacher_id === userProfile.id);
    if (!allowed) {
      setForbidden(true);
      setLoading(false);
      return;
    }

    setCourse(courseRow);

    if (isCourseCancelled(courseRow.status)) {
      const { data: cancelledRows, error: cancelledError } = await supabase
        .from('registrations')
        .select(
          `
          id,
          coverage_status,
          user:users!registrations_user_id_fkey(first_name, last_name)
        `,
        )
        .eq('course_id', courseId)
        .eq('cancel_reason', 'course_cancelled');
      if (cancelledError) {
        setErrorText(checkoutErrorMessage(undefined));
        setLoading(false);
        return;
      }
      const cancelled = cancelledRows ?? [];
      setPaidCancelledCount(cancelled.filter((row) => row.coverage_status === 'paid').length);
      setPeople([]);

      if (!isStudioAdmin(userProfile)) {
        setRefunds([]);
        setLoading(false);
        return;
      }

      const paidRows = cancelled.filter((row) => row.coverage_status === 'paid');
      if (paidRows.length === 0) {
        setRefunds([]);
        setLoading(false);
        return;
      }
      const { data: payments, error: payError } = await supabase
        .from('payments')
        .select('id, registration_id, method, amount_cents, reverses_payment_id, received_at')
        .in(
          'registration_id',
          paidRows.map((row) => row.id),
        );
      if (payError) {
        setErrorText(checkoutErrorMessage(undefined));
        setLoading(false);
        return;
      }
      const openPayment = latestUnreversedPayment(payments ?? []);
      const nextRefunds: RefundPerson[] = [];
      for (const row of paidRows) {
        const payment = openPayment.get(row.id);
        if (!payment) continue;
        const user = Array.isArray(row.user) ? row.user[0] : row.user;
        nextRefunds.push({
          registrationId: row.id,
          paymentId: payment.id,
          firstName: user?.first_name ?? '',
          lastName: user?.last_name ?? '',
          method: payment.method,
          amountCents: payment.amount_cents,
        });
      }
      nextRefunds.sort((a, b) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'de'),
      );
      setRefunds(nextRefunds);
      setLoading(false);
      return;
    }

    setRefunds([]);
    setPaidCancelledCount(0);

    const { data: registrations, error: regError } = await supabase
      .from('registrations')
      .select(
        `
        id,
        user_id,
        coverage_status,
        coverage_waived_reason,
        coverage_waived_note,
        price_cents_at_booking,
        user:users!registrations_user_id_fkey(first_name, last_name)
      `
      )
      .eq('course_id', courseId)
      .eq('status', 'registered');

    if (regError) {
      setErrorText(checkoutErrorMessage(undefined));
      setLoading(false);
      return;
    }

    const rows = registrations ?? [];
    const methodByRegistration = new Map<string, PaymentMethod>();

    if (isStudioAdmin(userProfile) && rows.length > 0) {
      const { data: payments, error: payError } = await supabase
        .from('payments')
        .select('id, registration_id, method, amount_cents, reverses_payment_id, received_at')
        .in(
          'registration_id',
          rows.map((row) => row.id)
        );

      if (payError) {
        setErrorText(checkoutErrorMessage(undefined));
        setLoading(false);
        return;
      }

      for (const [registrationId, payment] of latestUnreversedPayment(payments ?? [])) {
        methodByRegistration.set(registrationId, payment.method);
      }
    }

    const next: Person[] = rows.map((row) => {
      const user = Array.isArray(row.user) ? row.user[0] : row.user;
      return {
        registrationId: row.id,
        userId: row.user_id as string,
        firstName: user?.first_name ?? '',
        lastName: user?.last_name ?? '',
        coverage: (row.coverage_status ?? 'open') as CoverageStatus,
        waivedReason: (row.coverage_waived_reason ?? null) as WaivedReason | null,
        waivedNote: row.coverage_waived_note ?? null,
        priceCents: row.price_cents_at_booking ?? null,
        method: methodByRegistration.get(row.id) ?? null,
      };
    });

    const [sellable, passesMap] = await Promise.all([
      fetchSellablePassProducts(),
      fetchMemberPassesForMany(next.map((p) => p.userId)),
    ]);
    setHasSellableProducts(sellable.length > 0);
    setPassesByUser(passesMap);

    setPeople(next);
    setLoading(false);
  }, [courseId, userProfile]);

  useEffect(() => {
    setLoading(true);
    setForbidden(false);
    setMissing(false);
    void load();
  }, [load]);

  const sorted = useMemo(
    () =>
      [...people].sort((a, b) =>
        compareCheckoutRows(
          { coverage: a.coverage, lastName: a.lastName, firstName: a.firstName },
          { coverage: b.coverage, lastName: b.lastName, firstName: b.firstName }
        )
      ),
    [people]
  );
  const counts = countCheckout(people);

  const patchPerson = (registrationId: string, patch: Partial<Person>) => {
    setPeople((current) =>
      current.map((person) =>
        person.registrationId === registrationId ? { ...person, ...patch } : person
      )
    );
  };

  const failRpc = async (code: string | undefined) => {
    setErrorText(checkoutErrorMessage(code));
    if (
      code === 'NOT_OPEN' ||
      code === 'CANCELLED' ||
      code === 'NOT_REGISTERED' ||
      code === 'ALREADY_REVERSED' ||
      code === 'NOT_WAIVED'
    ) {
      await load();
    }
  };

  const record = async (
    person: Person,
    method: ManualCheckoutMethod,
    amountCents: number | null,
    note: string | null,
    surface: 'page' | 'dialog' = 'page'
  ): Promise<boolean> => {
    if (person.coverage !== 'open') return false;
    if (busyIds.current.has(person.registrationId)) return false;
    busyIds.current.add(person.registrationId);
    setMenuFor(null);
    setErrorText('');
    setDialogError('');

    const previous = person;
    patchPerson(person.registrationId, { coverage: 'paid', method: seesMethod ? method : null });

    const { data, error } = await supabase.rpc('record_manual_payment', {
      p_registration_id: person.registrationId,
      p_method: method,
      p_amount_cents: amountCents,
      p_note: note,
    });
    busyIds.current.delete(person.registrationId);

    const body = (typeof data === 'string' ? JSON.parse(data) : data) as RpcBody | null;
    if (error || !body?.success || !body.payment_id) {
      if (body?.error !== 'NOT_OPEN') {
        patchPerson(person.registrationId, previous);
      }
      const message = checkoutErrorMessage(body?.error);
      if (surface === 'dialog') setDialogError(message);
      else setErrorText(message);
      if (
        body?.error === 'NOT_OPEN' ||
        body?.error === 'CANCELLED' ||
        body?.error === 'NOT_REGISTERED'
      ) {
        await load();
      }
      return false;
    }

    setUndo({
      kind: 'payment',
      registrationId: person.registrationId,
      paymentId: body.payment_id,
      text: `${personName(person)}: ${methodWord(method)} vermerkt`,
    });
    return true;
  };

  const undoPayment = async () => {
    if (!undo || undoBusy) return;
    setUndoBusy(true);
    const current = undo;
    setUndo(null);

    if (current.kind === 'pass_redeem') {
      const previous = people.find((person) => person.registrationId === current.registrationId);
      patchPerson(current.registrationId, { coverage: 'open', method: null });
      const result = await undoPassRedemption(current.registrationId, {
        personName: previous ? personName(previous) : undefined,
      });
      setUndoBusy(false);
      if (!result.ok) {
        if (previous) patchPerson(current.registrationId, previous);
        setErrorText(result.message);
        if (result.code === 'NOT_OPEN' || result.code === 'FORBIDDEN') {
          await load();
        }
        return;
      }
      await load();
      return;
    }

    if (current.kind === 'pass' && current.passId && current.userId) {
      const previousPasses = passesByUser[current.userId] ?? [];
      setPassesByUser((map) => ({
        ...map,
        [current.userId!]: previousPasses.filter((p) => p.pass_id !== current.passId),
      }));
      const result = await revokePass(current.passId);
      setUndoBusy(false);
      if (!result.ok) {
        setPassesByUser((map) => ({ ...map, [current.userId!]: previousPasses }));
        setErrorText(result.message);
        if (result.code === 'ALREADY_USED' || result.code === 'NOT_ACTIVE') {
          await load();
        }
      }
      return;
    }

    const previous = people.find((person) => person.registrationId === current.registrationId);
    patchPerson(current.registrationId, { coverage: 'open', method: null });

    const { data, error } = await supabase.rpc('reverse_manual_payment', {
      p_payment_id: current.paymentId,
      p_note: null,
    });
    setUndoBusy(false);

    const body = data as RpcBody | null;
    if (error || !body?.success) {
      if (previous) patchPerson(current.registrationId, previous);
      await failRpc(body?.error);
    }
  };

  const applyPass = async (person: Person) => {
    if (busyIds.current.has(person.registrationId) || person.coverage !== 'open') return;
    busyIds.current.add(person.registrationId);
    setErrorText('');
    setMenuFor(null);
    const previous = person;
    patchPerson(person.registrationId, { coverage: 'pass', method: null });

    const result = await applyPassToRegistration(person.registrationId, {
      personName: personName(person),
    });
    busyIds.current.delete(person.registrationId);

    if (!result.ok) {
      patchPerson(person.registrationId, previous);
      setErrorText(result.message);
      if (
        result.code === 'NOT_OPEN' ||
        result.code === 'NO_VALID_PASS' ||
        result.code === 'PASS_EMPTY' ||
        result.code === 'PASS_EXPIRED'
      ) {
        await load();
      }
      return;
    }

    setPassesByUser((map) => {
      const list = map[person.userId] ?? [];
      return {
        ...map,
        [person.userId]: list.map((pass) =>
          pass.pass_id === result.pass_id
            ? { ...pass, remaining: result.remaining }
            : pass,
        ),
      };
    });
    setUndo({
      kind: 'pass_redeem',
      registrationId: person.registrationId,
      paymentId: result.movement_id,
      userId: person.userId,
      remainingAfter: result.remaining,
      text: `Karte eingelöst · noch ${result.remaining}`,
    });
  };

  const confirmUndoPassCoverage = async () => {
    if (!undoPassConfirm || dialogBusy) return;
    const person = undoPassConfirm;
    setDialogBusy(true);
    setErrorText('');
    const previous = person;
    patchPerson(person.registrationId, { coverage: 'open', method: null });
    const result = await undoPassRedemption(person.registrationId, {
      personName: personName(person),
    });
    setDialogBusy(false);
    setUndoPassConfirm(null);
    if (!result.ok) {
      patchPerson(person.registrationId, previous);
      setErrorText(result.message);
      await load();
      return;
    }
    await load();
  };

  const submitAmount = async () => {
    if (!amountDialog || dialogBusy) return;
    const person = people.find((row) => row.registrationId === amountDialog.registrationId);
    if (!person) return;
    const cents = eurosToCents(amountDialog.euros);
    const note = amountDialog.note.trim();
    if (cents == null) {
      setDialogError(checkoutErrorMessage('INVALID_AMOUNT'));
      return;
    }
    if (amountNoteRequired(cents, person.priceCents) && note.length < 3) {
      setDialogError(checkoutErrorMessage('NOTE_REQUIRED'));
      return;
    }
    setDialogBusy(true);
    const ok = await record(person, amountDialog.method, cents, note || null, 'dialog');
    setDialogBusy(false);
    if (ok) setAmountDialog(null);
  };

  const submitWaive = async () => {
    if (!waiveDialog || dialogBusy) return;
    const person = people.find((row) => row.registrationId === waiveDialog.registrationId);
    if (!person || person.coverage !== 'open') return;
    if (!waiveDialog.reason) {
      setDialogError(checkoutErrorMessage('INVALID_REASON'));
      return;
    }
    const note = waiveDialog.note.trim();
    if (waiveDialog.reason === 'other' && note.length < 3) {
      setDialogError(checkoutErrorMessage('NOTE_REQUIRED'));
      return;
    }
    if (busyIds.current.has(person.registrationId)) return;
    busyIds.current.add(person.registrationId);
    setDialogBusy(true);
    setDialogError('');
    const previous = person;
    patchPerson(person.registrationId, {
      coverage: 'waived',
      waivedReason: waiveDialog.reason,
      waivedNote: note || null,
      method: null,
    });

    const { data, error } = await supabase.rpc('set_coverage_waived', {
      p_registration_id: person.registrationId,
      p_reason: waiveDialog.reason,
      p_note: note || null,
    });
    busyIds.current.delete(person.registrationId);
    setDialogBusy(false);

    const body = data as RpcBody | null;
    if (error || !body?.success) {
      patchPerson(person.registrationId, previous);
      setDialogError(checkoutErrorMessage(body?.error));
      if (body?.error === 'NOT_OPEN') {
        setWaiveDialog(null);
        await load();
      }
      return;
    }
    setWaiveDialog(null);
  };

  const confirmRevert = async () => {
    if (!revertTarget || dialogBusy) return;
    const person = revertTarget;
    if (person.coverage !== 'waived') return;
    if (busyIds.current.has(person.registrationId)) return;
    busyIds.current.add(person.registrationId);
    setDialogBusy(true);
    setErrorText('');
    const previous = person;
    patchPerson(person.registrationId, {
      coverage: 'open',
      waivedReason: null,
      waivedNote: null,
      method: null,
    });

    const { data, error } = await supabase.rpc('revert_coverage_waived', {
      p_registration_id: person.registrationId,
    });
    busyIds.current.delete(person.registrationId);
    setDialogBusy(false);

    const body = data as RpcBody | null;
    if (error || !body?.success) {
      patchPerson(person.registrationId, previous);
      setRevertTarget(null);
      await failRpc(body?.error);
      return;
    }
    setRevertTarget(null);
  };

  const confirmRefund = async () => {
    if (!refundTarget || dialogBusy) return;
    setDialogBusy(true);
    const { data, error } = await supabase.rpc('reverse_manual_payment', {
      p_payment_id: refundTarget.paymentId,
      p_note: 'Kurs abgesagt',
    });
    setDialogBusy(false);
    const body = (typeof data === 'string' ? JSON.parse(data) : data) as RpcBody | null;
    if (error || !body?.success) {
      setErrorText(checkoutErrorMessage(body?.error));
      setRefundTarget(null);
      return;
    }
    setRefundTarget(null);
    await load();
  };

  if (loading) {
    return (
      <div className="flex h-64 items-center justify-center">
        <div className="h-12 w-12 animate-spin rounded-full border-b-2 border-brand" />
      </div>
    );
  }

  if (!userProfile || forbidden) {
    return (
      <div className="py-12 text-center">
        <h2 className="mb-2 text-xl font-medium text-text">Keine Berechtigung</h2>
        <p className="text-textMuted">Du hast keine Berechtigung, diese Seite zu sehen.</p>
      </div>
    );
  }

  if (missing || !course) {
    return (
      <div className="py-12 text-center">
        <h2 className="mb-2 text-xl font-medium text-text">Kurs nicht gefunden</h2>
        <p className="text-textMuted">Dieser Kurs ist hier nicht zu sehen.</p>
      </div>
    );
  }

  if (isCourseCancelled(course.status)) {
    const paidSentence =
      paidCancelledCount === 1
        ? '1 Person hatte bereits bezahlt.'
        : `${paidCancelledCount} Personen hatten bereits bezahlt.`;
    return (
      <div className="mx-auto max-w-lg space-y-4 pb-24">
        <header>
          <h2 className="text-[22px] font-medium text-text">{course.title}</h2>
          <p className="mt-1 text-[15px] tabular-nums text-textMuted">
            {formatDate(course.date)} · {formatTime(course.time)} · Abgesagt
          </p>
        </header>
        {errorText ? (
          <p role="alert" className="text-[15px] text-text">
            {errorText}
          </p>
        ) : null}
        {seesMethod ? (
          refunds.length === 0 ? (
            <p className="rounded-md border border-border bg-surface px-3.5 py-8 text-center text-textMuted">
              Keine offenen Rückgaben.
            </p>
          ) : (
            <section className="overflow-hidden rounded-md border border-border bg-surface">
              <h3 className="border-b border-border px-3.5 py-3 text-[17px] font-medium text-text">
                Rückgaben
              </h3>
              <ul className="divide-y divide-border">
                {refunds.map((person) => {
                  const name = personName(person);
                  return (
                    <li key={person.paymentId} className="flex items-center gap-3 px-3.5 py-3">
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-[17px] font-medium text-text">{name}</p>
                        <p className="text-[13px] text-textMuted tabular-nums">
                          {methodWord(person.method)} · {formatPrice(person.amountCents / 100)}
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={() => setRefundTarget(person)}
                        className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-border px-4 text-[15px] font-medium text-text"
                      >
                        Rückgabe vermerkt
                      </button>
                    </li>
                  );
                })}
              </ul>
            </section>
          )
        ) : (
          <p className="text-[15px] text-text">
            {paidSentence} Um die Rückgabe kümmert sich die Studioleitung.
          </p>
        )}
        <p className="text-[13px] leading-5 text-textMuted">{CASH_HINT}</p>

        <ConfirmDialog
          dialog={
            refundTarget
              ? {
                  title: 'Rückgabe vermerken',
                  message: `Du vermerkst, dass ${personName(refundTarget)} ${formatPrice(refundTarget.amountCents / 100)} ${methodWord(refundTarget.method)} zurückbekommen hat.`,
                  confirmLabel: 'Rückgabe vermerkt',
                  cancelLabel: 'Abbrechen',
                  variant: 'primary',
                }
              : null
          }
          loading={dialogBusy}
          onConfirm={() => void confirmRefund()}
          onCancel={() => {
            if (!dialogBusy) setRefundTarget(null);
          }}
        />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-lg space-y-4 overflow-x-hidden pb-24">
      <header>
        <h2 className="text-[22px] font-medium text-text">{course.title}</h2>
        <p className="mt-1 text-[15px] tabular-nums text-textMuted">
          {formatDate(course.date)} · {formatTime(course.time)}
        </p>
        <p className="mt-1 text-[15px] tabular-nums text-text">
          {counts.open} offen · {counts.done} erledigt
        </p>
      </header>

      {errorText ? (
        <p role="alert" className="text-[15px] text-text">
          {errorText}
        </p>
      ) : null}

      {sorted.length === 0 ? (
        <p className="rounded-md border border-border bg-surface px-3.5 py-8 text-center text-textMuted">
          Niemand ist angemeldet.
        </p>
      ) : (
        <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface">
          {sorted.map((person) => {
            const name = personName(person);
            const status = statusLabel(person, seesMethod);
            const open = person.coverage === 'open';
            const canRevertWaive = seesMethod && person.coverage === 'waived';
            const canUndoPass = seesMethod && person.coverage === 'pass';
            const canSellPass = hasSellableProducts;
            const usablePass =
              open && course
                ? findUsablePass(passesByUser[person.userId] ?? [], {
                    date: course.date,
                    price: course.price,
                    pass_eligible: course.pass_eligible,
                  })
                : null;
            const showMenu = open || canRevertWaive || canSellPass || canUndoPass;
            const menuOpen = menuFor === person.registrationId;
            const passLabel = passBadgeLabel(passesByUser[person.userId] ?? []);
            return (
              <div key={person.registrationId}>
                <div className="flex items-center gap-2 px-3.5 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-medium text-text">{name}</p>
                    <p className="mt-0.5 flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[13px] text-text">
                      {person.coverage === 'paid' || person.coverage === 'pass' ? (
                        <Check className="h-4 w-4 shrink-0" aria-hidden />
                      ) : null}
                      <span>{status.text}</span>
                      {status.detail ? (
                        <span className="text-textMuted tabular-nums">· {status.detail}</span>
                      ) : null}
                      {passLabel && person.coverage !== 'pass' ? (
                        <span className="text-textMuted tabular-nums">· {passLabel}</span>
                      ) : null}
                    </p>
                  </div>
                  {showMenu ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-expanded={menuOpen}
                        aria-label={`Mehr für ${name}`}
                        onClick={() =>
                          setMenuFor((current) =>
                            current === person.registrationId ? null : person.registrationId
                          )
                        }
                        className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-border px-3 text-[15px] font-medium text-text"
                      >
                        Mehr
                      </button>
                      {open && usablePass ? (
                        <button
                          type="button"
                          onClick={() => void applyPass(person)}
                          className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-borderStrong bg-surface px-4 text-[15px] font-medium text-brand active:bg-surfaceSunken"
                        >
                          Karte
                        </button>
                      ) : null}
                      {open ? (
                        <button
                          type="button"
                          onClick={() => void record(person, 'cash', null, null)}
                          className="inline-flex h-11 min-w-11 items-center justify-center rounded-full bg-brand px-4 text-[15px] font-medium text-onBrand active:bg-brandPressed"
                        >
                          Bar
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {menuOpen ? (
                  <div className="border-t border-border bg-surfaceSunken px-3.5 py-1">
                    {canSellPass ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuFor(null);
                          setSellTarget(person);
                        }}
                        className="flex min-h-11 w-full items-center text-left text-[15px] text-text"
                      >
                        Karte verkaufen
                      </button>
                    ) : null}
                    {canUndoPass ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuFor(null);
                          setUndoPassConfirm(person);
                        }}
                        className="flex min-h-11 w-full items-center text-left text-[15px] text-text"
                      >
                        Karte zurücknehmen
                      </button>
                    ) : null}
                    {open
                      ? MENU_METHODS.map((item) => (
                          <button
                            key={item.method}
                            type="button"
                            onClick={() => void record(person, item.method, null, null)}
                            className="flex min-h-11 w-full items-center text-left text-[15px] text-text"
                          >
                            {item.label}
                          </button>
                        ))
                      : null}
                    {open && seesMethod ? (
                      <>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuFor(null);
                            setDialogError('');
                            setAmountDialog({
                              registrationId: person.registrationId,
                              name,
                              euros: centsToEuroInput(person.priceCents),
                              note: '',
                              priceLabel:
                                person.priceCents != null
                                  ? formatPrice(person.priceCents / 100)
                                  : '',
                              priceCents: person.priceCents,
                              method: 'cash',
                            });
                          }}
                          className="flex min-h-11 w-full items-center text-left text-[15px] text-text"
                        >
                          Anderer Betrag…
                        </button>
                        <button
                          type="button"
                          onClick={() => {
                            setMenuFor(null);
                            setDialogError('');
                            setWaiveDialog({
                              registrationId: person.registrationId,
                              name,
                              reason: '',
                              note: '',
                            });
                          }}
                          className="flex min-h-11 w-full items-center text-left text-[15px] text-text"
                        >
                          Erlassen…
                        </button>
                      </>
                    ) : null}
                    {canRevertWaive ? (
                      <button
                        type="button"
                        onClick={() => {
                          setMenuFor(null);
                          setRevertTarget(person);
                        }}
                        className="flex min-h-11 w-full items-center text-left text-[15px] text-text"
                      >
                        Erlass zurücknehmen
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

        <p className="text-[13px] leading-5 text-textMuted">{CASH_HINT}</p>

      {undo ? (
        <UndoBar
          key={`${undo.kind}-${undo.paymentId}`}
          text={undo.text}
          actionLabel="Rückgängig"
          onAction={() => void undoPayment()}
          onExpire={expireUndo}
          busy={undoBusy}
        />
      ) : null}

      <SellPassDialog
        open={sellTarget != null}
        memberId={sellTarget?.userId ?? ''}
        personName={sellTarget ? personName(sellTarget) : ''}
        onClose={() => setSellTarget(null)}
        onSold={(result) => {
          const target = sellTarget;
          setSellTarget(null);
          if (!target) return;
          const nextPass: MemberPassSummary = {
            pass_id: result.passId,
            name: result.productName,
            remaining: result.units,
            units_total: result.units,
            valid_until: result.validUntil,
          };
          setPassesByUser((prev) => ({
            ...prev,
            [target.userId]: [...(prev[target.userId] ?? []), nextPass],
          }));
          setUndo({
            kind: 'pass',
            registrationId: target.registrationId,
            paymentId: result.paymentId,
            passId: result.passId,
            userId: target.userId,
            text: sellUndoText(
              result.productName,
              personName(target),
              result.method,
              result.validUntil,
            ),
          });
        }}
      />

      {amountDialog ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-text/45 p-4 sm:items-center">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-lg">
            <h3 className="text-[19px] font-medium text-text">Anderer Betrag</h3>
            <p className="mt-1 text-[13px] text-textMuted">{amountDialog.name}</p>
            {amountDialog.priceLabel ? (
              <p className="mt-2 text-[13px] text-textMuted">
                Kurspreis {amountDialog.priceLabel} ist vorausgefüllt.
              </p>
            ) : null}
            <fieldset className="mt-3">
              <legend className="text-[13px] text-text">Zahlart</legend>
              {AMOUNT_METHODS.map((item) => (
                <label key={item.method} className="flex min-h-11 items-center gap-2 text-[15px] text-text">
                  <input
                    type="radio"
                    name="checkout-amount-method"
                    checked={amountDialog.method === item.method}
                    onChange={() => setAmountDialog({ ...amountDialog, method: item.method })}
                  />
                  {item.label}
                </label>
              ))}
            </fieldset>
            <label className="mt-4 block text-[13px] text-text" htmlFor="checkout-amount">
              Betrag in Euro
            </label>
            <input
              id="checkout-amount"
              inputMode="decimal"
              value={amountDialog.euros}
              onChange={(event) =>
                setAmountDialog({ ...amountDialog, euros: event.target.value })
              }
              className="mt-1 h-11 w-full rounded-sm border border-border px-3 text-[17px] tabular-nums text-text"
            />
            <label className="mt-3 block text-[13px] text-text" htmlFor="checkout-amount-note">
              Notiz
              {amountNoteRequired(eurosToCents(amountDialog.euros), amountDialog.priceCents)
                ? ''
                : ' (optional)'}
            </label>
            <textarea
              id="checkout-amount-note"
              value={amountDialog.note}
              onChange={(event) =>
                setAmountDialog({ ...amountDialog, note: event.target.value })
              }
              rows={2}
              className="mt-1 w-full rounded-sm border border-border px-3 py-2 text-[15px] text-text"
            />
            <p className="mt-2 text-[13px] text-textMuted">
              Pflicht, wenn der Betrag vom Kurspreis abweicht.
            </p>
            {dialogError ? (
              <p role="alert" className="mt-2 text-[13px] text-text">
                {dialogError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setAmountDialog(null)}
                disabled={dialogBusy}
                className="inline-flex h-11 items-center rounded-full px-4 text-[15px] font-medium text-text"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void submitAmount()}
                disabled={dialogBusy}
                className="inline-flex h-11 items-center rounded-full bg-brand px-4 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
              >
                Vermerken
              </button>
            </div>
          </div>
        </div>
      ) : null}

      {waiveDialog ? (
        <div className="fixed inset-0 z-50 flex items-end justify-center bg-text/45 p-4 sm:items-center">
          <div className="max-h-[calc(100dvh-2rem)] w-full max-w-md overflow-y-auto rounded-lg border border-border bg-surface p-5 shadow-lg">
            <h3 className="text-[19px] font-medium text-text">Erlassen</h3>
            <p className="mt-1 text-[13px] text-textMuted">{waiveDialog.name}</p>
            <fieldset className="mt-3">
              <legend className="text-[13px] text-text">Grund</legend>
              {WAIVE_REASONS.map((reason) => (
                <label key={reason.value} className="flex min-h-11 items-center gap-2 text-[15px] text-text">
                  <input
                    type="radio"
                    name="waive-reason"
                    checked={waiveDialog.reason === reason.value}
                    onChange={() => setWaiveDialog({ ...waiveDialog, reason: reason.value })}
                  />
                  {reason.label}
                </label>
              ))}
            </fieldset>
            <label className="mt-2 block text-[13px] text-text" htmlFor="checkout-waive-note">
              Notiz{waiveDialog.reason === 'other' ? '' : ' (optional)'}
            </label>
            <textarea
              id="checkout-waive-note"
              value={waiveDialog.note}
              onChange={(event) => setWaiveDialog({ ...waiveDialog, note: event.target.value })}
              rows={2}
              className="mt-1 w-full rounded-sm border border-border px-3 py-2 text-[15px] text-text"
            />
            <p className="mt-2 text-[13px] text-textMuted">{WAIVE_NOTE_HINT}</p>
            {dialogError ? (
              <p role="alert" className="mt-2 text-[13px] text-text">
                {dialogError}
              </p>
            ) : null}
            <div className="mt-4 flex justify-end gap-2">
              <button
                type="button"
                onClick={() => setWaiveDialog(null)}
                disabled={dialogBusy}
                className="inline-flex h-11 items-center rounded-full px-4 text-[15px] font-medium text-text"
              >
                Abbrechen
              </button>
              <button
                type="button"
                onClick={() => void submitWaive()}
                disabled={dialogBusy}
                className="inline-flex h-11 items-center rounded-full bg-brand px-4 text-[15px] font-medium text-onBrand active:bg-brandPressed disabled:opacity-50"
              >
                Erlassen
              </button>
            </div>
          </div>
        </div>
      ) : null}

      <ConfirmDialog
        dialog={
          revertTarget
            ? {
                title: 'Erlass zurücknehmen',
                message: `${personName(revertTarget)} ist danach wieder offen.`,
                confirmLabel: 'Zurücknehmen',
                cancelLabel: 'Abbrechen',
                variant: 'primary',
              }
            : null
        }
        loading={dialogBusy}
        onConfirm={() => void confirmRevert()}
        onCancel={() => {
          if (!dialogBusy) setRevertTarget(null);
        }}
      />

      <ConfirmDialog
        dialog={
          undoPassConfirm
            ? {
                title: 'Karte zurücknehmen',
                message: `${personName(undoPassConfirm)} ist danach wieder offen. Die Einheit geht zurück auf die Karte.`,
                confirmLabel: 'Zurücknehmen',
                cancelLabel: 'Abbrechen',
                variant: 'primary',
              }
            : null
        }
        loading={dialogBusy}
        onConfirm={() => void confirmUndoPassCoverage()}
        onCancel={() => {
          if (!dialogBusy) setUndoPassConfirm(null);
        }}
      />
    </div>
  );
};

export default CourseCheckout;
