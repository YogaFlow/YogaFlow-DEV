import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useParams } from 'react-router-dom';
import { Check } from 'lucide-react';
import { useAuth } from '../context/AuthContext';
import { supabase } from '../lib/supabase';
import { visibleCourses } from '../lib/visibleScope';
import { isCourseManagerRole, isStudioAdmin, isTeacherOnly } from '../lib/userRoles';
import { isCourseCancelled, isCourseUpcoming, toCourseStart } from '../lib/courseDateTime';
import { formatCents, formatDate, formatPrice, formatTime, formatTodayOrTomorrow } from '../lib/format';
import PaymentRefundSheet from '../components/payments/PaymentRefundSheet';
import { fetchRegistrationRefundStates } from '../lib/refunds';
import {
  checkoutPassLine,
  onlinePaidCheckoutLine,
  staffUnregisterRefundLine,
} from '../lib/refundTexts';
import type { CoverageStatus, PaymentMethod, WaivedReason } from '../types';
import UndoBar from '../components/ui/UndoBar';
import ConfirmDialog from '../components/ui/ConfirmDialog';
import SellPassDialog from '../components/passes/SellPassDialog';
import { coverageLabelTone } from '../lib/coverageLabel';
import {
  CASH_HINT,
  WAIVE_NOTE_HINT,
  WAIVE_REASONS,
  amountNoteRequired,
  centsToEuroInput,
  checkoutAttendanceLine,
  checkoutErrorMessage,
  compareCheckoutRows,
  countCheckout,
  coverageLabel,
  eurosToCents,
  latestUnreversedPayment,
  methodWord,
  type ManualCheckoutMethod,
} from '../lib/courseCheckout';
import { staffUnregisteredToastLine } from '../lib/toastTexts';

function shownMemberEmail(user: { email?: string | null; anonymized_at?: string | null } | null | undefined): string {
  if (!user || user.anonymized_at) return '';
  return user.email?.trim() || '';
}
import { paymentPendingLabel } from '../lib/pendingPaymentLabel';
import {
  isDevPendingPaymentMock,
  resolveHoldExpiresAt,
} from '../lib/devPendingPaymentMock';
import PaymentPendingStatus from '../components/ui/PaymentPendingStatus';
import {
  applyPassToRegistration,
  fetchCourseMemberPasses,
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
  email: string;
  phone: string;
  coverage: CoverageStatus;
  waivedReason: WaivedReason | null;
  waivedNote: string | null;
  priceCents: number | null;
  method: PaymentMethod | null;
  passId: string | null;
  passRemaining: number | null;
  paymentPending: boolean;
  holdExpiresAt: string | null;
  isWaitlist: boolean;
  waitlistPosition: number | null;
  /** Stripe-Kartenzahlung (Original), auch wenn teilweise erstattet */
  onlinePaymentId: string | null;
  onlineAmountCents: number | null;
  onlineRefundedCents: number;
  onlineRefundableCents: number;
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
  { method: 'paypal_manual', label: 'PayPal erhalten' },
  { method: 'bank_transfer', label: 'Überweisung erhalten' },
];

const AMOUNT_METHODS: { method: ManualCheckoutMethod; label: string }[] = [
  { method: 'cash', label: 'Bar' },
  { method: 'paypal_manual', label: 'PayPal' },
  { method: 'bank_transfer', label: 'Überweisung' },
];

type PaymentRow = {
  id: string;
  registration_id: string | null;
  method: PaymentMethod;
  amount_cents: number;
  reverses_payment_id: string | null;
  received_at: string;
};

/** Neueste Stripe-Kartenzahlung je Buchung — Gegenzeilen (Teilerstattungen) ändern daran nichts. */
function onlinePaymentByRegistration(payments: PaymentRow[]): Map<string, PaymentRow> {
  const best = new Map<string, PaymentRow>();
  for (const payment of payments) {
    if (payment.method !== 'card' || payment.amount_cents <= 0 || payment.reverses_payment_id) continue;
    if (!payment.registration_id) continue;
    const current = best.get(payment.registration_id);
    if (!current || payment.received_at > current.received_at) {
      best.set(payment.registration_id, payment);
    }
  }
  return best;
}

function personName(person: Pick<Person, 'firstName' | 'lastName'>): string {
  const name = `${person.firstName} ${person.lastName}`.trim();
  return name || 'Teilnehmerin';
}

function statusLabel(
  person: Person,
  seesMethod: boolean,
  courseStartsAt: Date | null,
): { text: string; detail: string; toneClass: string } {
  if (person.paymentPending) {
    return {
      text: paymentPendingLabel(person.holdExpiresAt),
      detail: '',
      toneClass: 'text-accentText',
    };
  }
  const audience = seesMethod ? 'manager' : 'teacher';
  const input = {
    coverage_status: person.coverage,
    coverage_waived_reason: person.waivedReason,
    method: person.method,
    pass_remaining: person.passRemaining,
    is_waitlist: person.isWaitlist,
  };
  const text = coverageLabel(input, { audience, courseStartsAt });
  const tone = coverageLabelTone(input, { courseStartsAt });
  const toneClass =
    tone === 'warn' ? 'text-accentText' : tone === 'muted' ? 'text-textSubtle' : 'text-text';
  if (person.coverage === 'waived' && seesMethod) {
    const detail = [person.waivedNote].filter(Boolean).join('');
    return { text, detail, toneClass };
  }
  if (person.coverage === 'open') {
    const price =
      person.priceCents != null ? formatPrice(person.priceCents / 100) : '';
    return { text, detail: price, toneClass };
  }
  return { text, detail: '', toneClass };
}

const CourseCheckout: React.FC = () => {
  const { courseId } = useParams<{ courseId: string }>();
  const { userProfile } = useAuth();
  const [course, setCourse] = useState<CourseHead | null>(null);
  const [people, setPeople] = useState<Person[]>([]);
  const [refunds, setRefunds] = useState<RefundPerson[]>([]);
  const [paidCancelledCount, setPaidCancelledCount] = useState(0);
  const [refundTarget, setRefundTarget] = useState<RefundPerson | null>(null);
  const [onlineRefunds, setOnlineRefunds] = useState<RefundPerson[]>([]);
  const [refundSheet, setRefundSheet] = useState<{
    paymentId: string;
    firstName: string;
    name: string;
  } | null>(null);
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
  const [unregisterDialog, setUnregisterDialog] = useState<{
    person: Person;
    message: string;
  } | null>(null);
  const [unregisterBusy, setUnregisterBusy] = useState(false);
  const [successText, setSuccessText] = useState('');
  const busyIds = useRef(new Set<string>());

  const seesMethod = isStudioAdmin(userProfile);
  const expireUndo = useCallback(() => setUndo(null), []);

  const load = useCallback(async () => {
    if (!userProfile || !courseId) return;
    setErrorText('');

    const { data: courseRow, error: courseError } = await visibleCourses('id, title, date, time, teacher_id, status, price, pass_eligible')
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
        setOnlineRefunds([]);
        setLoading(false);
        return;
      }

      const paidRows = cancelled.filter((row) => row.coverage_status === 'paid');
      if (paidRows.length === 0) {
        setRefunds([]);
        setOnlineRefunds([]);
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
      const onlinePayment = onlinePaymentByRegistration((payments ?? []) as PaymentRow[]);
      const nextRefunds: RefundPerson[] = [];
      const nextOnline: RefundPerson[] = [];
      for (const row of paidRows) {
        const user = Array.isArray(row.user) ? row.user[0] : row.user;
        const online = onlinePayment.get(row.id);
        if (online) {
          // Online-Zahlungen erstattet cancel_course automatisch (R2) — keine manuelle Rückgabe.
          nextOnline.push({
            registrationId: row.id,
            paymentId: online.id,
            firstName: user?.first_name ?? '',
            lastName: user?.last_name ?? '',
            method: online.method,
            amountCents: online.amount_cents,
          });
          continue;
        }
        const payment = openPayment.get(row.id);
        if (!payment) continue;
        nextRefunds.push({
          registrationId: row.id,
          paymentId: payment.id,
          firstName: user?.first_name ?? '',
          lastName: user?.last_name ?? '',
          method: payment.method,
          amountCents: payment.amount_cents,
        });
      }
      const byName = (a: RefundPerson, b: RefundPerson) =>
        `${a.lastName} ${a.firstName}`.localeCompare(`${b.lastName} ${b.firstName}`, 'de');
      nextRefunds.sort(byName);
      nextOnline.sort(byName);
      setRefunds(nextRefunds);
      setOnlineRefunds(nextOnline);
      setLoading(false);
      return;
    }

    setRefunds([]);
    setOnlineRefunds([]);
    setPaidCancelledCount(0);

    const { data: registrations, error: regError } = await supabase
      .from('registrations')
      .select(
        `
        id,
        user_id,
        status,
        is_waitlist,
        waitlist_position,
        hold_expires_at,
        coverage_status,
        coverage_waived_reason,
        coverage_waived_note,
        price_cents_at_booking,
        pass_id,
        user:users!registrations_user_id_fkey(first_name, last_name, email, phone, anonymized_at)
      `
      )
      .eq('course_id', courseId)
      .in('status', ['registered', 'pending_payment', 'waitlist']);

    if (regError) {
      setErrorText(checkoutErrorMessage(undefined));
      setLoading(false);
      return;
    }

    const rows = registrations ?? [];
    const methodByRegistration = new Map<string, PaymentMethod>();
    const onlineByRegistration = new Map<string, string>();

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
      for (const [registrationId, payment] of onlinePaymentByRegistration(
        (payments ?? []) as PaymentRow[],
      )) {
        onlineByRegistration.set(registrationId, payment.id);
        if (!methodByRegistration.has(registrationId)) {
          methodByRegistration.set(registrationId, payment.method);
        }
      }
    }

    const mockPending = isDevPendingPaymentMock();
    let mockAssigned = false;
    const next: Person[] = rows.map((row) => {
      const user = Array.isArray(row.user) ? row.user[0] : row.user;
      const isWaitlist = Boolean(row.is_waitlist) || row.status === 'waitlist';
      const realPending = row.status === 'pending_payment';
      const forcePending = mockPending && !mockAssigned && !realPending && !isWaitlist;
      if (forcePending) mockAssigned = true;
      return {
        registrationId: row.id,
        userId: row.user_id as string,
        firstName: user?.first_name ?? '',
        lastName: user?.last_name ?? '',
        email: shownMemberEmail(user),
        phone: (user?.phone as string | null)?.trim() || '',
        coverage: (row.coverage_status ?? 'open') as CoverageStatus,
        waivedReason: (row.coverage_waived_reason ?? null) as WaivedReason | null,
        waivedNote: row.coverage_waived_note ?? null,
        priceCents: row.price_cents_at_booking ?? null,
        method: methodByRegistration.get(row.id) ?? null,
        passId: (row.pass_id as string | null) ?? null,
        passRemaining: null,
        paymentPending: realPending || forcePending,
        holdExpiresAt: resolveHoldExpiresAt(
          (row.hold_expires_at as string | null) ?? null,
        ),
        isWaitlist,
        waitlistPosition: (row.waitlist_position as number | null) ?? null,
        onlinePaymentId: onlineByRegistration.get(row.id) ?? null,
        onlineAmountCents: null,
        onlineRefundedCents: 0,
        onlineRefundableCents: 0,
      };
    });

    const refundStates = await fetchRegistrationRefundStates(next.map((person) => person.registrationId));
    for (const person of next) {
      const state = refundStates[person.registrationId];
      if (!state) continue;
      person.onlineAmountCents = state.payment_cents;
      person.onlineRefundedCents = state.refunded_cents;
      person.onlineRefundableCents = state.refundable_cents;
    }

    const [sellable, passesMap] = await Promise.all([
      fetchSellablePassProducts(),
      fetchCourseMemberPasses(courseId),
    ]);
    setHasSellableProducts(sellable.length > 0);
    setPassesByUser(passesMap);

    for (const person of next) {
      if (person.coverage !== 'pass' || !person.passId) continue;
      const passes = passesMap[person.userId] ?? [];
      const match = passes.find((pass) => pass.pass_id === person.passId);
      person.passRemaining = match?.remaining ?? null;
    }

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
      [...people]
        .filter((person) => !person.isWaitlist)
        .sort((a, b) =>
          compareCheckoutRows(
            { coverage: a.coverage, paymentPending: a.paymentPending, lastName: a.lastName, firstName: a.firstName },
            { coverage: b.coverage, paymentPending: b.paymentPending, lastName: b.lastName, firstName: b.firstName }
          )
        ),
    [people]
  );
  const waitlist = useMemo(
    () =>
      [...people]
        .filter((person) => person.isWaitlist)
        .sort((a, b) => {
          const pos = (a.waitlistPosition ?? 999) - (b.waitlistPosition ?? 999);
          if (pos !== 0) return pos;
          return personName(a).localeCompare(personName(b), 'de');
        }),
    [people],
  );
  const counts = countCheckout(sorted);
  const courseStartsAt = course ? toCourseStart(course) : null;
  const courseStarted = course ? !isCourseUpcoming(course) : false;
  const attendanceLine = checkoutAttendanceLine(sorted.length, counts.open, courseStarted);

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
    if (person.coverage !== 'open' || person.paymentPending) return false;
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
      text: `${personName(person)} · ${methodWord(method)} vermerkt`,
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
    if (busyIds.current.has(person.registrationId) || person.coverage !== 'open' || person.paymentPending) return;
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
    if (!person || person.coverage !== 'open' || person.paymentPending) return;
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

  const exportCourseCsv = () => {
    if (!course) return;
    const escapeCell = (value: string) => `"${value.replace(/"/g, '""')}"`;
    const rows = [
      ['Kurs', 'Datum', 'Teilnehmer', 'E-Mail', 'Telefon', 'Bezahlung'],
      ...sorted.map((person) => [
        course.title,
        formatDate(course.date),
        personName(person),
        person.email,
        person.phone,
        coverageLabel(
          {
            coverage_status: person.coverage,
            coverage_waived_reason: person.waivedReason,
            method: person.method,
            pass_remaining: person.passRemaining,
            status: person.paymentPending ? 'pending_payment' : 'registered',
            is_waitlist: person.isWaitlist,
          },
          { audience: 'csv' },
        ),
      ]),
      ...waitlist.map((person) => [
        course.title,
        formatDate(course.date),
        personName(person),
        person.email,
        person.phone,
        '—',
      ]),
    ];
    const csvContent = rows.map((row) => row.map(escapeCell).join(';')).join('\n');
    const blob = new Blob(['\uFEFF' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const link = document.createElement('a');
    const url = URL.createObjectURL(blob);
    link.setAttribute('href', url);
    link.setAttribute('download', `teilnehmer_${course.date}.csv`);
    link.style.visibility = 'hidden';
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
  };

  const requestUnregister = async (person: Person) => {
    if (!course || !isCourseManagerRole(userProfile)) return;
    setMenuFor(null);
    let onlineNote = '';
    if (seesMethod && person.coverage === 'paid') {
      const states = await fetchRegistrationRefundStates([person.registrationId]);
      const line = staffUnregisterRefundLine(states[person.registrationId]?.refundable_cents ?? 0);
      if (line) onlineNote = ` ${line}`;
    }
    const passNote = person.coverage === 'pass' ? ' Die Karteneinheit wird zurückgebucht.' : '';
    setUnregisterDialog({
      person,
      message: `Möchtest du ${personName(person)} wirklich vom Kurs „${course.title}“ abmelden?${passNote}${onlineNote}`,
    });
  };

  const executeUnregister = async () => {
    if (!unregisterDialog || !course || unregisterBusy) return;
    setUnregisterBusy(true);
    const person = unregisterDialog.person;
    const { data, error } = await supabase.rpc('admin_unregister_user_from_course', {
      p_user_id: person.userId,
      p_course_id: course.id,
    });
    setUnregisterBusy(false);
    setUnregisterDialog(null);
    type RpcResult = { success?: boolean; error?: string };
    const result = (typeof data === 'string' ? JSON.parse(data) : data) as RpcResult | null;
    if (error || !result?.success) {
      setErrorText(
        result?.error === 'not_registered'
          ? 'Für diesen Kurs liegt keine aktive Anmeldung vor.'
          : checkoutErrorMessage(result?.error),
      );
      await load();
      return;
    }
    setPeople((current) => current.filter((row) => row.registrationId !== person.registrationId));
    setSuccessText(staffUnregisteredToastLine(person.firstName, person.lastName));
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

  const refundSheetElement = (
    <PaymentRefundSheet
      paymentId={refundSheet?.paymentId ?? null}
      firstName={refundSheet?.firstName ?? ''}
      subtitle={
        refundSheet
          ? `${refundSheet.name} · ${course.title} · ${formatDate(course.date)}`
          : undefined
      }
      onChanged={() => void load()}
      onClose={() => setRefundSheet(null)}
    />
  );

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
        {seesMethod && onlineRefunds.length > 0 ? (
          <section className="overflow-hidden rounded-md border border-border bg-surface">
            <h3 className="border-b border-border px-3.5 py-3 text-[17px] font-medium text-text">
              Online bezahlt
            </h3>
            <p className="px-3.5 pt-3 text-[13px] text-textMuted">
              Diese Zahlungen werden automatisch erstattet.
            </p>
            <ul className="divide-y divide-border">
              {onlineRefunds.map((person) => {
                const name = personName(person);
                return (
                  <li key={person.paymentId} className="flex items-center gap-3 px-3.5 py-3">
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-[17px] font-medium text-text">{name}</p>
                      <p className="text-[13px] text-textMuted tabular-nums">
                        online · {formatCents(person.amountCents)}
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() =>
                        setRefundSheet({ paymentId: person.paymentId, firstName: person.firstName, name })
                      }
                      className="inline-flex min-h-11 shrink-0 items-center whitespace-nowrap rounded-full border border-border px-4 text-[15px] font-medium text-text"
                    >
                      Erstattungen
                    </button>
                  </li>
                );
              })}
            </ul>
          </section>
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

        {refundSheetElement}

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
    <div className="mx-auto max-w-lg space-y-4 overflow-x-hidden pb-24 lg:max-w-[1120px]">
      <header>
        <h2 className="text-[22px] font-medium text-text">{course.title}</h2>
        <div className="mt-1 flex flex-wrap items-start justify-between gap-2">
          <div>
            <p className="text-[15px] tabular-nums text-textMuted">
              {formatTodayOrTomorrow(course.date)} · {formatTime(course.time)}
            </p>
            <p
              className="mt-1 text-[15px] tabular-nums text-text"
              data-testid="checkout-attendance"
            >
              {attendanceLine}
            </p>
          </div>
          {isStudioAdmin(userProfile) ? (
            <button
              type="button"
              onClick={() => exportCourseCsv()}
              className="inline-flex h-11 items-center rounded-full border border-border px-4 text-[15px] font-medium text-brand active:bg-surfaceSunken"
            >
              CSV
            </button>
          ) : null}
        </div>
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
        <>
        <div className="divide-y divide-border overflow-hidden rounded-md border border-border bg-surface lg:hidden">
          {sorted.map((person) => {
            const name = personName(person);
            const status = statusLabel(person, seesMethod, courseStartsAt);
            const open = person.coverage === 'open' && !person.paymentPending;
            const canRevertWaive = seesMethod && person.coverage === 'waived' && !person.paymentPending;
            const canUndoPass = seesMethod && person.coverage === 'pass' && !person.paymentPending;
            const canSellPass = hasSellableProducts && !person.paymentPending;
            const usablePass =
              open && course
                ? findUsablePass(passesByUser[person.userId] ?? [], {
                    date: course.date,
                    price: course.price,
                    pass_eligible: course.pass_eligible,
                  })
                : null;
            const canRefund =
              seesMethod &&
              person.onlinePaymentId != null &&
              !person.paymentPending &&
              person.onlineRefundableCents > 0;
            const showMenu = true;
            const menuOpen = menuFor === person.registrationId;
            const passLabel = passBadgeLabel(passesByUser[person.userId] ?? []);
            const passLine =
              person.coverage === 'pass'
                ? checkoutPassLine(
                    (passesByUser[person.userId] ?? []).find((pass) => pass.pass_id === person.passId)
                      ?.name ?? 'Karte',
                    person.passRemaining ?? 0,
                  )
                : passLabel
                  ? checkoutPassLine(
                      (passesByUser[person.userId] ?? [])[0]?.name ?? 'Karte',
                      (passesByUser[person.userId] ?? [])[0]?.remaining ?? 0,
                    )
                  : null;
            const onlineLine =
              person.onlinePaymentId && person.onlineAmountCents != null && person.onlineAmountCents > 0
                ? onlinePaidCheckoutLine(person.onlineAmountCents, person.onlineRefundedCents)
                : null;
            return (
              <div key={person.registrationId}>
                <div className="flex items-center gap-2 px-3.5 py-2">
                  <div className="min-w-0 flex-1">
                    <p className="truncate text-[17px] font-medium text-text">{name}</p>
                    {person.paymentPending ? (
                      <div className="mt-0.5">
                        <PaymentPendingStatus holdExpiresAt={person.holdExpiresAt} />
                      </div>
                    ) : (
                    <div className="mt-0.5 space-y-0.5">
                      {onlineLine ? (
                        <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text">
                          {person.coverage === 'paid' ? (
                            <Check className="h-4 w-4 shrink-0" aria-hidden />
                          ) : null}
                          <span className="tabular-nums">{onlineLine}</span>
                          {canRefund ? (
                            <button
                              type="button"
                              onClick={() =>
                                setRefundSheet({
                                  paymentId: person.onlinePaymentId as string,
                                  firstName: person.firstName,
                                  name,
                                })
                              }
                              className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-[13px] font-medium text-textMuted active:bg-surfaceSunken"
                            >
                              Erstatten
                            </button>
                          ) : null}
                        </p>
                      ) : person.coverage !== 'pass' ? (
                        <p className="flex flex-wrap items-center gap-x-1 gap-y-0.5 text-[13px] text-text">
                          {person.coverage === 'paid' ? (
                            <Check className="h-4 w-4 shrink-0" aria-hidden />
                          ) : null}
                          <span className={status.toneClass}>{status.text}</span>
                          {status.detail ? (
                            <span className="text-textMuted tabular-nums">· {status.detail}</span>
                          ) : null}
                        </p>
                      ) : null}
                      {passLine ? (
                        <p className="flex items-center gap-1 text-[13px] text-textMuted tabular-nums">
                          {person.coverage === 'pass' ? (
                            <Check className="h-4 w-4 shrink-0 text-text" aria-hidden />
                          ) : null}
                          {passLine}
                        </p>
                      ) : null}
                    </div>
                    )}
                  </div>
                  {showMenu ? (
                    <div className="flex shrink-0 items-center gap-1">
                      <button
                        type="button"
                        aria-expanded={menuOpen}
                        aria-label={`Aktionen für ${name}`}
                        onClick={() =>
                          setMenuFor((current) =>
                            current === person.registrationId ? null : person.registrationId
                          )
                        }
                        className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-border px-3 text-[15px] font-medium text-text"
                      >
                        ⋯
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
                          Bar erhalten
                        </button>
                      ) : null}
                    </div>
                  ) : null}
                </div>
                {menuOpen ? (
                  <div className="border-t border-border bg-surfaceSunken px-3.5 py-1">
                    {(person.email || person.phone) ? (
                      <div className="flex min-h-11 flex-col justify-center py-1 text-[13px] text-textMuted">
                        {person.email ? (
                          <a href={`mailto:${person.email}`} className="text-text">
                            {person.email}
                          </a>
                        ) : null}
                        {person.phone ? (
                          <a href={`tel:${person.phone}`} className="text-text">
                            {person.phone}
                          </a>
                        ) : null}
                      </div>
                    ) : null}
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
                        {person.waivedReason === 'pre_omlify'
                          ? 'Abhaken zurücknehmen'
                          : 'Erlass zurücknehmen'}
                      </button>
                    ) : null}
                    {isCourseManagerRole(userProfile) && !person.paymentPending ? (
                      <button
                        type="button"
                        onClick={() => void requestUnregister(person)}
                        className="flex min-h-11 w-full items-center text-left text-[15px] text-danger"
                      >
                        Abmelden
                      </button>
                    ) : null}
                  </div>
                ) : null}
              </div>
            );
          })}
        </div>

        <div
          className="hidden overflow-hidden rounded-md border border-border bg-surface lg:block"
          data-testid="checkout-desktop-table"
        >
          <table className="w-full table-fixed text-left">
            <thead>
              <tr className="border-b border-border text-[13px] text-textMuted">
                <th className="w-[28%] px-3.5 py-3 font-medium">Name</th>
                <th className="w-[28%] px-3.5 py-3 font-medium">Zahlung</th>
                <th className="w-[22%] px-3.5 py-3 font-medium">Karte</th>
                <th className="w-[22%] px-3.5 py-3 text-right font-medium">Aktion</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-border">
              {sorted.map((person) => {
                const name = personName(person);
                const status = statusLabel(person, seesMethod, courseStartsAt);
                const open = person.coverage === 'open' && !person.paymentPending;
                const canRevertWaive =
                  seesMethod && person.coverage === 'waived' && !person.paymentPending;
                const canUndoPass =
                  seesMethod && person.coverage === 'pass' && !person.paymentPending;
                const canSellPass = hasSellableProducts && !person.paymentPending;
                const usablePass =
                  open && course
                    ? findUsablePass(passesByUser[person.userId] ?? [], {
                        date: course.date,
                        price: course.price,
                        pass_eligible: course.pass_eligible,
                      })
                    : null;
                const canRefund =
                  seesMethod &&
                  person.onlinePaymentId != null &&
                  !person.paymentPending &&
                  person.onlineRefundableCents > 0;
                const showMenu = true;
                const menuOpen = menuFor === person.registrationId;
                const passLabel = passBadgeLabel(passesByUser[person.userId] ?? []);
                const passLine =
                  person.coverage === 'pass'
                    ? checkoutPassLine(
                        (passesByUser[person.userId] ?? []).find(
                          (pass) => pass.pass_id === person.passId,
                        )?.name ?? 'Karte',
                        person.passRemaining ?? 0,
                      )
                    : passLabel
                      ? checkoutPassLine(
                          (passesByUser[person.userId] ?? [])[0]?.name ?? 'Karte',
                          (passesByUser[person.userId] ?? [])[0]?.remaining ?? 0,
                        )
                      : null;
                const onlineLine =
                  person.onlinePaymentId &&
                  person.onlineAmountCents != null &&
                  person.onlineAmountCents > 0
                    ? onlinePaidCheckoutLine(person.onlineAmountCents, person.onlineRefundedCents)
                    : null;
                return (
                  <React.Fragment key={`desk-${person.registrationId}`}>
                    <tr>
                      <td className="px-3.5 py-3 align-middle">
                        <p className="truncate text-[15px] font-medium text-text">{name}</p>
                      </td>
                      <td className="px-3.5 py-3 align-middle">
                        {person.paymentPending ? (
                          <PaymentPendingStatus holdExpiresAt={person.holdExpiresAt} />
                        ) : onlineLine ? (
                          <p className="flex flex-wrap items-center gap-x-2 gap-y-1 text-[13px] text-text">
                            {person.coverage === 'paid' ? (
                              <Check className="h-4 w-4 shrink-0" aria-hidden />
                            ) : null}
                            <span className="tabular-nums">{onlineLine}</span>
                            {canRefund ? (
                              <button
                                type="button"
                                onClick={() =>
                                  setRefundSheet({
                                    paymentId: person.onlinePaymentId as string,
                                    firstName: person.firstName,
                                    name,
                                  })
                                }
                                className="inline-flex min-h-11 items-center rounded-full border border-border px-3 text-[13px] font-medium text-textMuted active:bg-surfaceSunken"
                              >
                                Erstatten
                              </button>
                            ) : null}
                          </p>
                        ) : person.coverage !== 'pass' ? (
                          <p className="flex flex-wrap items-center gap-x-1 text-[13px] text-text">
                            {person.coverage === 'paid' ? (
                              <Check className="h-4 w-4 shrink-0" aria-hidden />
                            ) : null}
                            <span className={status.toneClass}>{status.text}</span>
                            {status.detail ? (
                              <span className="text-textMuted tabular-nums">· {status.detail}</span>
                            ) : null}
                          </p>
                        ) : (
                          <span className="text-[13px] text-textMuted">—</span>
                        )}
                      </td>
                      <td className="px-3.5 py-3 align-middle text-[13px] text-textMuted tabular-nums">
                        {passLine ? (
                          <span className="inline-flex items-center gap-1">
                            {person.coverage === 'pass' ? (
                              <Check className="h-4 w-4 shrink-0 text-text" aria-hidden />
                            ) : null}
                            {passLine}
                          </span>
                        ) : (
                          '—'
                        )}
                      </td>
                      <td className="px-3.5 py-3 align-middle">
                        {showMenu ? (
                          <div className="flex flex-wrap items-center justify-end gap-1">
                            <button
                              type="button"
                              aria-expanded={menuOpen}
                              aria-label={`Aktionen für ${name}`}
                              onClick={() =>
                                setMenuFor((current) =>
                                  current === person.registrationId
                                    ? null
                                    : person.registrationId,
                                )
                              }
                              className="inline-flex h-11 min-w-11 items-center justify-center rounded-full border border-border px-3 text-[15px] font-medium text-text"
                            >
                              ⋯
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
                                Bar erhalten
                              </button>
                            ) : null}
                          </div>
                        ) : null}
                      </td>
                    </tr>
                    {menuOpen ? (
                      <tr>
                        <td colSpan={4} className="bg-surfaceSunken px-3.5 py-1">
                          <div className="flex flex-wrap justify-end gap-x-4">
                            {(person.email || person.phone) ? (
                              <div className="flex min-h-11 flex-col justify-center text-[13px] text-textMuted">
                                {person.email ? (
                                  <a href={`mailto:${person.email}`} className="text-text">
                                    {person.email}
                                  </a>
                                ) : null}
                                {person.phone ? (
                                  <a href={`tel:${person.phone}`} className="text-text">
                                    {person.phone}
                                  </a>
                                ) : null}
                              </div>
                            ) : null}
                            {canSellPass ? (
                              <button
                                type="button"
                                onClick={() => {
                                  setMenuFor(null);
                                  setSellTarget(person);
                                }}
                                className="inline-flex min-h-11 items-center text-[15px] text-text"
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
                                className="inline-flex min-h-11 items-center text-[15px] text-text"
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
                                    className="inline-flex min-h-11 items-center text-[15px] text-text"
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
                                  className="inline-flex min-h-11 items-center text-[15px] text-text"
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
                                  className="inline-flex min-h-11 items-center text-[15px] text-text"
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
                                className="inline-flex min-h-11 items-center text-[15px] text-text"
                              >
                                {person.waivedReason === 'pre_omlify'
                                  ? 'Abhaken zurücknehmen'
                                  : 'Erlass zurücknehmen'}
                              </button>
                            ) : null}
                            {isCourseManagerRole(userProfile) && !person.paymentPending ? (
                              <button
                                type="button"
                                onClick={() => void requestUnregister(person)}
                                className="inline-flex min-h-11 items-center text-[15px] text-danger"
                              >
                                Abmelden
                              </button>
                            ) : null}
                          </div>
                        </td>
                      </tr>
                    ) : null}
                  </React.Fragment>
                );
              })}
            </tbody>
          </table>
        </div>
        </>
      )}

      {waitlist.length > 0 ? (
        <details className="rounded-md border border-border bg-surface">
          <summary className="flex min-h-11 cursor-pointer list-none items-center px-3.5 text-[15px] font-medium text-text">
            Warteliste ({waitlist.length})
          </summary>
          <ul className="divide-y divide-border border-t border-border">
            {waitlist.map((person) => (
              <li key={person.registrationId} className="px-3.5 py-3 text-[15px] text-text">
                {personName(person)}
                {person.waitlistPosition != null ? (
                  <span className="ml-2 text-[13px] text-textMuted">
                    Pos. {person.waitlistPosition}
                  </span>
                ) : null}
              </li>
            ))}
          </ul>
        </details>
      ) : null}

        <p className="text-[13px] leading-5 text-textMuted">{CASH_HINT}</p>

      {successText ? (
        <p role="status" className="text-[15px] text-text">
          {successText}
        </p>
      ) : null}

      <ConfirmDialog
        dialog={
          unregisterDialog
            ? {
                title: 'Teilnehmer abmelden',
                message: unregisterDialog.message,
                confirmLabel: 'Abmelden',
                cancelLabel: 'Abbrechen',
                variant: 'danger',
              }
            : null
        }
        loading={unregisterBusy}
        onConfirm={() => void executeUnregister()}
        onCancel={() => {
          if (!unregisterBusy) setUnregisterDialog(null);
        }}
      />

      {refundSheetElement}

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
                Zahlung vermerken
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
                title:
                  revertTarget.waivedReason === 'pre_omlify'
                    ? 'Abhaken zurücknehmen'
                    : 'Erlass zurücknehmen',
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
