import { Copy, Ellipsis, RefreshCw, UserPlus } from 'lucide-react';
import { useId, useState, type FormEvent } from 'react';
import { PageHeader } from '../../components/PageHeader';
import { Button, IconButton } from '../../components/ui/Button';
import { ConfirmDialog } from '../../components/ui/ConfirmDialog';
import { DataTable, Num, type Column } from '../../components/ui/DataTable';
import { Dialog } from '../../components/ui/Dialog';
import { Field } from '../../components/ui/Field';
import { LoadFailed } from '../../components/ui/LoadFailed';
import { Notice } from '../../components/ui/Notice';
import { toast } from '../../components/ui/Toast';
import { DIVISION_KINDS } from '../../domain/divisions';
import { can, ROLES, type Role } from '../../domain/permissions';
import { normalizePhone } from '../../domain/phone';
import { describeError, NotConnectedError, RejectedError, UnknownOutcomeError } from '../../lib/errors';
import { fmtInviteCode, fmtPhone } from '../../lib/format';
import { t } from '../../lib/i18n';
import { members } from '../../lib/repo';
import type { DivisionRef, StaffMember } from '../../lib/repo/members';
import * as scopes from '../../lib/repo/scopes';
import type { ScopeTarget, ScopeTargets } from '../../lib/repo/scopes';
import { divisionLabel, roleDescription, roleLabel } from '../../lib/roles';
import { useDirtyForm } from '../../lib/pwa/dirty';
import { session, useSession } from '../../lib/session';
import { useLoad } from '../../lib/useLoad';

// إدارة الموظفين للمالك بس (members.manage، DECISIONS 2026-10-25): يدعو برقم الهاتف ودور ووحدات، ويسلّم الرمز
// بيده (يبين مرّة وحدة)، ويغيّر الدور والوحدات، ويؤرشف. الدعوة ما تنطي أي وصول قبل ما الموظف يقبلها بالرمز،
// وآخر مالك ما ينزل ولا ينشال (الخادم يرفض بتلميحه). ماكو حذف: المؤرشف يبقى بالسجلّ ويندعى من جديد.
// دوالّ الموظفين بلا client_ref: «نتيجة مجهولة» تعني «تحقّق قبل الإعادة» (describeError 'once')، والقائمة تتحدّث.
// المرحلة 1 (WP2): النطاق بالوحدة أو الموقع أو المخزن (set_member_scopes_v2، المالك بس)؛ أمين المخزن بمخزنه بس مثلاً.

/** بلا صفوف نطاق: هذول يشوفون كل الوحدات، والباقون ولا وحدة (مرآة inScope). والمالك يشوفها كلها بكل حال. */
const ALL_SEEING: ReadonlySet<Role> = new Set<Role>(['owner', 'manager', 'accountant']);

/** رفض يعني «القائمة اللي قدّامك قديمة» (تلميح الخادم يكول «حدّث قائمة الموظفين»)، أو نتيجة ما نعرفها. */
const STALE_CODES: ReadonlySet<string> = new Set(['already_in_org', 'member_not_found', 'invite_already_accepted', 'division_not_found', 'site_not_found', 'warehouse_not_found']);

export function listIsStale(error: unknown): boolean {
  return error instanceof UnknownOutcomeError || (error instanceof RejectedError && STALE_CODES.has(error.code));
}

/** الداخل فقد صلاحية إدارة الموظفين (مالك ثاني نزّله): الشاشة تتبع الخادم بدل ما كل محاولة ترجع «forbidden». */
export function roleIsStale(error: unknown): boolean {
  return error instanceof RejectedError && error.code === 'forbidden';
}

type MemberAction = 'role' | 'scopes' | 'archive' | 'reissue';

// الوحدات تنحفظ ويّا النافذة لمّا تنفتح: تحديث القائمة بالخلفية (بعد رفض «القائمة قديمة») يصفّر بياناتها لحد ما
// ترجع، والنافذة المرسومة بشرطها كانت تنطوي وتضيع كتابتها ورسالة فشلها (المراجعة الثانية).
/** خيارات منتقي النطاق: الوحدات ومواقعها ومخازنها (المؤرشف يبين بس إذا مختار). */
export interface ScopeOptions {
  divisions: readonly DivisionRef[];
  sites: readonly ScopeTarget[];
  warehouses: readonly ScopeTarget[];
}

/** النطاق المختار بالقوائم الثلاث (مثل صفوف member_scopes: هدف واحد بكل صفّ). */
export interface ScopeChoice {
  divisionIds: readonly string[];
  siteIds: readonly string[];
  warehouseIds: readonly string[];
}

type DialogState =
  | null
  | { kind: 'invite'; options: ScopeOptions }
  | { kind: 'code'; name: string; code: string }
  | { kind: 'actions'; member: StaffMember; options: ScopeOptions }
  | { kind: 'role' | 'scopes'; member: StaffMember; options: ScopeOptions }
  | { kind: 'archive' | 'reissue'; member: StaffMember };

function sortedDivisions(divisions: readonly DivisionRef[]): DivisionRef[] {
  return [...divisions].sort((a, b) => DIVISION_KINDS.indexOf(a.kind) - DIVISION_KINDS.indexOf(b.kind));
}

export function divisionsText(
  member: Pick<StaffMember, 'role' | 'divisionIds'> & Partial<Pick<StaffMember, 'siteIds' | 'warehouseIds'>>,
  divisions: readonly DivisionRef[],
  places: Pick<ScopeOptions, 'sites' | 'warehouses'> = { sites: [], warehouses: [] },
): string {
  // المالك يشوف كل الوحدات مهما كان بصفوف نطاقه (in_scope_division بالخادم)، فما ينعرض محصوراً.
  if (member.role === 'owner') return t('staff.divisions.all', 'كل الوحدات');
  const siteIds = member.siteIds ?? [];
  const warehouseIds = member.warehouseIds ?? [];
  if (member.divisionIds.length + siteIds.length + warehouseIds.length === 0) {
    return ALL_SEEING.has(member.role) ? t('staff.divisions.all', 'كل الوحدات') : t('staff.divisions.none', 'لا وحدة');
  }
  return [
    ...sortedDivisions(divisions).filter((division) => member.divisionIds.includes(division.id)).map((division) => divisionLabel(division.kind)),
    ...places.sites.filter((site) => siteIds.includes(site.id)).map((site) => t('staff.scope.site', 'موقع {name}', { name: site.name })),
    ...places.warehouses.filter((store) => warehouseIds.includes(store.id)).map((store) => store.name),
  ].join(t('list.separator', '، '));
}

/** الإجراءات المتاحة على صفّ: رمز جديد للمدعوّ بس، والوحدات لغير المالك، والأرشفة لغير نفسه (يخرج من «حسابي»). */
export function memberActions(member: StaffMember, selfUserId: string | null): MemberAction[] {
  const actions: MemberAction[] = [];
  if (!member.accepted) actions.push('reissue');
  actions.push('role');
  if (member.role !== 'owner') actions.push('scopes');
  if (member.userId !== selfUserId) actions.push('archive');
  return actions;
}

export function StaffTable({
  rows,
  divisions,
  places,
  selfUserId,
  onOpen,
}: {
  rows: readonly StaffMember[];
  divisions: readonly DivisionRef[];
  places?: Pick<ScopeOptions, 'sites' | 'warehouses'>;
  selfUserId: string | null;
  /** يفتح إجراءات الصفّ. بلاه (مو مالك) ماكو عمود إجراءات. */
  onOpen?: (member: StaffMember) => void;
}) {
  const columns: Column<StaffMember>[] = [];
  if (onOpen) {
    // أوّل عمود (يمين الجدول بالعربي): بالموبايل الجدول يتمرّر بالعرض، وآخر عمود يبقى برّا الشاشة بلا علامة.
    columns.push({
      key: 'actions',
      header: t('staff.col.actions', 'إجراءات'),
      cell: (member) => (
        <IconButton label={t('staff.actions.for', 'إجراءات {name}', { name: member.displayName })} onClick={() => onOpen(member)} data-action="member-actions">
          <Ellipsis aria-hidden="true" className="size-5" />
        </IconButton>
      ),
    });
  }
  columns.push(
    {
      key: 'name',
      header: t('staff.col.name', 'الاسم'),
      cell: (member) => (member.userId === selfUserId ? t('staff.you', '{name} (أنت)', { name: member.displayName }) : member.displayName),
    },
    { key: 'phone', header: t('staff.col.phone', 'الهاتف'), cell: (member) => (member.phone ? <Num>{fmtPhone(member.phone)}</Num> : '—') },
    { key: 'role', header: t('staff.col.role', 'الدور'), cell: (member) => roleLabel(member.role) },
    {
      key: 'status',
      header: t('staff.col.status', 'الحالة'),
      cell: (member) => (member.accepted ? t('staff.status.active', 'يعمل') : t('staff.status.pending', 'بانتظار القبول')),
    },
    { key: 'divisions', header: t('staff.col.divisions', 'الوحدات'), wrap: true, cell: (member) => divisionsText(member, divisions, places) },
  );
  return (
    <DataTable
      caption={t('staff.caption', 'موظفو المنشأة')}
      columns={columns}
      rows={rows}
      rowKey={(member) => member.id}
      empty={t('staff.empty', 'لا موظفين غيرك بعد. ادعُ أوّل موظف برقم هاتفه.')}
    />
  );
}

function RoleSelect({ id, value, onChange }: { id: string; value: Role; onChange: (role: Role) => void }) {
  return (
    <select id={id} className="input" value={value} onChange={(event) => onChange(event.target.value as Role)}>
      {ROLES.map((role) => (
        <option key={role} value={role}>
          {roleLabel(role)}
        </option>
      ))}
    </select>
  );
}

const DIVISIONS_HINT = () =>
  t('staff.divisions.hint', 'المالك يرى كل الوحدات دائماً. دون وحدة مختارة يرى المدير والمحاسب كل الوحدات، ولا يرى الباقون أيّ وحدة؛ واختيار وحدات يحصر الدور فيها.');

/** يقلب معرّفاً بقائمة. */
const toggled = (list: readonly string[], id: string, on: boolean) => (on ? [...list, id] : list.filter((x) => x !== id));

export function ScopeChecks({ options, selected, onChange }: { options: ScopeOptions; selected: ScopeChoice; onChange: (choice: ScopeChoice) => void }) {
  const box = (checked: boolean, change: (on: boolean) => void, label: string, depth: 0 | 1 | 2, key: string) => (
    <label key={key} className={`flex min-h-11 items-center gap-3 rounded-2xl border border-line px-3 ${depth === 1 ? 'ms-6' : depth === 2 ? 'ms-12' : ''}`}>
      <input type="checkbox" className="size-5 accent-brand-600" checked={checked} onChange={(event) => change(event.target.checked)} />
      {label}
    </label>
  );
  const visible = (target: ScopeTarget, ids: readonly string[]) => !target.archived || ids.includes(target.id);
  return (
    <fieldset className="flex flex-col gap-2">
      <legend className="mb-1.5 text-sm font-medium text-ink">{t('staff.divisions', 'الوحدات')}</legend>
      {sortedDivisions(options.divisions).flatMap((division) => [
        box(selected.divisionIds.includes(division.id), (on) => onChange({ ...selected, divisionIds: toggled(selected.divisionIds, division.id, on) }), divisionLabel(division.kind), 0, division.id),
        ...options.sites
          .filter((site) => site.divisionId === division.id && visible(site, selected.siteIds))
          .flatMap((site) => [
            box(selected.siteIds.includes(site.id), (on) => onChange({ ...selected, siteIds: toggled(selected.siteIds, site.id, on) }), t('staff.scope.site', 'موقع {name}', { name: site.name }), 1, site.id),
            ...options.warehouses
              .filter((store) => store.siteId === site.id && visible(store, selected.warehouseIds))
              .map((store) => box(selected.warehouseIds.includes(store.id), (on) => onChange({ ...selected, warehouseIds: toggled(selected.warehouseIds, store.id, on) }), store.name, 2, store.id)),
          ]),
      ])}
      <p className="text-sm text-ink-muted">{DIVISIONS_HINT()}</p>
      <p className="text-sm text-ink-muted">{t('staff.scope.places.hint', 'اختيار موقع يشمل مخازنه، واختيار مخزن يحصر الموظف فيه وحده؛ والوحدة تشمل كل مواقعها ومخازنها.')}</p>
    </fieldset>
  );
}

const NO_SCOPE: ScopeChoice = { divisionIds: [], siteIds: [], warehouseIds: [] };
const scopeKey = (choice: ScopeChoice) => [choice.divisionIds, choice.siteIds, choice.warehouseIds].map((list) => [...list].sort().join()).join('|');

/**
 * الدعوة ونطاقها بنداء واحد (add_member_v2) ثم رمزها. فشل الدعوة يرمي (ولا دعوة ولا رمز): بنداءين كان فشل النطاق يخلّي مديراً أو
 * محاسباً بلا صفوف نطاق (كل المنشأة) ورمزه يصدر. فشل الرمز وحده بعد دعوة محفوظة تنبيه، والرمز من «رمز جديد».
 */
export async function inviteMember({ phone, role, name, scope }: { phone: string; role: Role; name: string; scope: ScopeChoice }): Promise<{ memberId: string; code: string | null }> {
  // المالك يشوف كل الوحدات: نطاقه ما يُرسل حتى ما يبين محصوراً.
  const memberId = await scopes.addMemberV2(phone, role, name, role === 'owner' ? NO_SCOPE : scope);
  try {
    return { memberId, code: await members.inviteCode(memberId) };
  } catch {
    toast({
      tone: 'warning',
      title: t('staff.invite.no_code', 'أُرسلت الدعوة ولم يُصدَر رمزها'),
      detail: t('staff.invite.no_code.detail', 'الدعوة محفوظة. أصدر رمزها من «رمز جديد» في صفّ {name} حين يعود الاتصال.', { name }),
    });
    return { memberId, code: null };
  }
}

function InviteDialog({
  options,
  onClose,
  onInvited,
  onFailure,
}: {
  options: ScopeOptions;
  onClose: () => void;
  onInvited: (name: string, code: string | null) => void;
  onFailure: (error: unknown) => void;
}) {
  const id = useId();
  const [phone, setPhone] = useState('');
  const [name, setName] = useState('');
  const [role, setRole] = useState<Role>('hall_worker');
  const [scope, setScope] = useState<ScopeChoice>(NO_SCOPE);
  const [errors, setErrors] = useState<{ phone?: string; name?: string }>({});
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const dirty = phone !== '' || name !== '' || scopeKey(scope) !== scopeKey(NO_SCOPE);

  const submit = async (event: FormEvent) => {
    event.preventDefault();
    const found: { phone?: string; name?: string } = {};
    if (!normalizePhone(phone)) found.phone = t('auth.phone.invalid', 'اكتب رقم موبايل عراقياً صحيحاً، مثل 07701234567.');
    if (!name.trim()) found.name = t('staff.name.required', 'اكتب اسم الموظف كما تعرفه.');
    setErrors(found);
    setFailure(null);
    if (found.phone || found.name) return;
    setBusy(true);
    const who = name.trim();
    let code: string | null;
    try {
      ({ code } = await inviteMember({ phone, role, name: who, scope }));
    } catch (error) {
      setBusy(false);
      onFailure(error);
      if (error instanceof RejectedError && error.code === 'already_in_org') {
        // مدعوّ أصلاً (أو الإعادة بعد نتيجة مجهولة صارت): القائمة تتحدّث ورمزه من «رمز جديد» بصفّه.
        const { title, detail } = describeError(error, 'once');
        toast({ tone: 'warning', title, detail });
        onClose();
        return;
      }
      setFailure(error);
      return;
    }
    setBusy(false);
    onInvited(who, code);
  };

  const formId = `${id}-form`;
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <Dialog
      open
      onClose={onClose}
      title={t('staff.invite.title', 'دعوة موظف')}
      dirty={dirty}
      locked={busy}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} busy={busy} data-action="send-invite">
            {t('staff.invite.submit', 'أرسل الدعوة')}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={(event) => void submit(event)} noValidate>
        <Field id={`${id}-phone`} label={t('staff.phone', 'رقم هاتفه')} hint={t('staff.phone.hint', 'الموظف يسجّل في التطبيق برقمه أوّلاً.')} error={errors.phone}>
          <input
            id={`${id}-phone`}
            type="tel"
            inputMode="tel"
            dir="ltr"
            autoComplete="off"
            className="input tabular-nums"
            value={phone}
            onChange={(event) => setPhone(event.target.value)}
            aria-invalid={errors.phone ? true : undefined}
            data-autofocus
          />
        </Field>
        <Field id={`${id}-name`} label={t('staff.name', 'اسمه')} error={errors.name}>
          <input id={`${id}-name`} className="input" maxLength={80} value={name} onChange={(event) => setName(event.target.value)} aria-invalid={errors.name ? true : undefined} />
        </Field>
        <Field id={`${id}-role`} label={t('staff.role', 'الدور')} hint={roleDescription(role)}>
          <RoleSelect id={`${id}-role`} value={role} onChange={setRole} />
        </Field>
        {role === 'owner' ? (
          <p className="text-sm text-ink-muted">{t('staff.divisions.owner', 'المالك يرى كل الوحدات دائماً.')}</p>
        ) : (
          <ScopeChecks options={options} selected={scope} onChange={setScope} />
        )}
        {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
      </form>
    </Dialog>
  );
}

export function CodeDialog({ name, code, onClose }: { name: string; code: string; onClose: () => void }) {
  // الرمز يبين مرّة وحدة: النافذة «وسخة» لحد ما تنسدّ، فالتحديث التلقائي ينتظر وإغلاق التبويب يسأل أوّلاً.
  useDirtyForm(true);
  const copy = () => {
    const done = () => toast({ tone: 'success', title: t('staff.code.copied', 'نُسخ الرمز') });
    const failed = () => toast({ tone: 'warning', title: t('staff.code.copy_failed', 'تعذّر النسخ'), detail: t('staff.code.copy_failed.detail', 'اكتب الرمز للموظف كما يظهر.') });
    if (typeof navigator === 'undefined' || !navigator.clipboard) {
      failed();
      return;
    }
    navigator.clipboard.writeText(code).then(done, failed);
  };
  return (
    <Dialog
      open
      onClose={onClose}
      dismissible={false}
      title={t('staff.code.title', 'رمز دعوة {name}', { name })}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" icon={<Copy aria-hidden="true" className="size-4" />} onClick={copy} data-action="copy-code">
            {t('staff.code.copy', 'انسخ الرمز')}
          </Button>
          <Button onClick={onClose} data-action="code-done" data-autofocus>
            {t('staff.code.done', 'تمّ، سأسلّمه')}
          </Button>
        </div>
      }
    >
      <div className="flex flex-col gap-3">
        <p dir="ltr" className="text-center text-4xl font-semibold tabular-nums tracking-widest" data-code>
          {fmtInviteCode(code)}
        </p>
        <p className="text-ink-muted">
          {t('staff.code.explain', 'سلّم هذا الرمز للموظف بيدك أو بالواتساب ليقبل الدعوة به. لن يظهر مرّة أخرى، وينتهي بعد 7 أيام، ويتوقّف بعد 5 محاولات خاطئة.')}
        </p>
      </div>
    </Dialog>
  );
}

function ActionsDialog({ member, selfUserId, onClose, onPick }: { member: StaffMember; selfUserId: string | null; onClose: () => void; onPick: (action: MemberAction) => void }) {
  const labels: Record<MemberAction, string> = {
    reissue: t('staff.action.code', 'رمز جديد'),
    role: t('staff.action.role', 'غيّر الدور'),
    scopes: t('staff.action.scopes', 'غيّر الوحدات'),
    archive: t('staff.action.archive', 'أرشفة'),
  };
  const self = member.userId === selfUserId;
  return (
    <Dialog open onClose={onClose} title={self ? t('staff.actions.self', 'إجراءات على حسابك') : t('staff.actions.for', 'إجراءات {name}', { name: member.displayName })}>
      <div className="flex flex-col gap-2">
        {memberActions(member, selfUserId).map((action) => (
          <Button key={action} variant={action === 'archive' ? 'danger' : 'secondary'} onClick={() => onPick(action)} data-action={`member-${action}`}>
            {labels[action]}
          </Button>
        ))}
        {self ? <p className="text-sm text-ink-muted">{t('staff.actions.self.leave', 'للخروج من المنشأة استعمل «اخرج من المنشأة» في صفحة «حسابي».')}</p> : null}
      </div>
    </Dialog>
  );
}

function EditDialog({
  member,
  kind,
  options,
  self,
  onClose,
  onSaved,
  onFailure,
  onGone,
}: {
  member: StaffMember;
  kind: 'role' | 'scopes';
  options: ScopeOptions;
  self: boolean;
  onClose: () => void;
  onSaved: () => void;
  onFailure: (error: unknown) => void;
  /** الموظف ما عاد بالمنشأة (أرشفه مالك ثاني): النافذة تنسدّ وسبب الخادم يبين. */
  onGone: (error: unknown) => void;
}) {
  const id = useId();
  const [role, setRole] = useState<Role>(member.role);
  const [scope, setScope] = useState<ScopeChoice>({ divisionIds: member.divisionIds, siteIds: member.siteIds, warehouseIds: member.warehouseIds });
  const [failure, setFailure] = useState<unknown>(null);
  const [busy, setBusy] = useState(false);
  const dirty = kind === 'role' ? role !== member.role : scopeKey(scope) !== scopeKey(member);

  const save = async (event: FormEvent) => {
    event.preventDefault();
    setBusy(true);
    setFailure(null);
    try {
      if (kind === 'role') await members.setMemberRole(member.id, role);
      else await scopes.setMemberScopesV2(member.id, scope.divisionIds, scope.siteIds, scope.warehouseIds);
      onSaved();
    } catch (error) {
      if (error instanceof RejectedError && error.code === 'member_not_found') {
        onGone(error);
        return;
      }
      onFailure(error);
      setFailure(error);
    } finally {
      setBusy(false);
    }
  };

  const formId = `${id}-form`;
  const failed = failure ? describeError(failure, 'once') : null;
  return (
    <Dialog
      open
      onClose={onClose}
      dirty={dirty}
      locked={busy}
      title={kind === 'role' ? t('staff.role.title', 'دور {name}', { name: member.displayName }) : t('staff.scopes.title', 'وحدات {name}', { name: member.displayName })}
      footer={
        <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
          <Button variant="secondary" onClick={onClose} disabled={busy}>
            {t('confirm.cancel', 'لا، تراجع')}
          </Button>
          <Button type="submit" form={formId} busy={busy} disabled={!dirty} data-action="save-member">
            {t('staff.save', 'احفظ')}
          </Button>
        </div>
      }
    >
      <form id={formId} className="flex flex-col gap-4" onSubmit={(event) => void save(event)} noValidate>
        {kind === 'role' ? (
          <Field id={`${id}-role`} label={t('staff.role', 'الدور')} hint={roleDescription(role)}>
            <RoleSelect id={`${id}-role`} value={role} onChange={setRole} />
          </Field>
        ) : (
          <ScopeChecks options={options} selected={scope} onChange={setScope} />
        )}
        {kind === 'role' && self && role !== 'owner' ? (
          <Notice tone="warning" title={t('staff.role.self.title', 'تغيّر دورك أنت')}>
            {t('staff.role.self', 'تصبح «{role}» فور الحفظ، ولا تدير الموظفين بعدها.', { role: roleLabel(role) })}
          </Notice>
        ) : null}
        {failed ? <Notice tone="danger" title={failed.title}>{failed.detail}</Notice> : null}
      </form>
    </Dialog>
  );
}

/** خيارات المنتقي من قائمة الموظفين (تنحفظ ويّا النافذة لمّا تنفتح، فتحديث القائمة بالخلفية ما يطويها). */
const optionsOf = (data: { divisions: readonly DivisionRef[] } | null, targets: ScopeTargets | null): ScopeOptions => ({ divisions: data?.divisions ?? [], sites: targets?.sites ?? [], warehouses: targets?.warehouses ?? [] });

export default function StaffPage() {
  const state = useSession();
  const workspace = state.status === 'ready' ? state.workspace : null;
  const staff = useLoad(members.loadStaff, workspace ? `${workspace.userId}:${workspace.orgId}` : 'none');
  // مواقع المنشأة ومخازنها لمنتقي النطاق والجدول (ملف كسول بحزمة الشاشة، مو مسار الجلسة).
  const targets = useLoad(scopes.loadScopeTargets, workspace ? `${workspace.userId}:${workspace.orgId}` : 'none');
  const [dialog, setDialog] = useState<DialogState>(null);
  const [busy, setBusy] = useState(false);
  const owner = workspace ? can(workspace.role, 'members.manage') : false;
  const selfUserId = workspace?.userId ?? null;

  const refreshSession = () => {
    session.refresh().catch(() => {
      /* swallow-ok: تأكيد الهويّة يحطّ نتيجته بالحالة؛ من «جاهز» ما يرمي إلا حزمة ما انحمّلت */
    });
  };

  const afterChange = (member: StaffMember | null) => {
    staff.retry();
    // تغيير يمسّ المالك نفسه (دوره): الخادم يأكّد هويّته من جديد.
    if (member && member.userId === selfUserId) refreshSession();
  };

  /** فشل يكول إن صورة الشاشة قديمة: القائمة تتحدّث، ودور الداخل نفسه يتأكّد. */
  const afterFailure = (error: unknown) => {
    if (listIsStale(error)) staff.retry();
    if (roleIsStale(error)) refreshSession();
  };

  const confirmAction = (kind: 'archive' | 'reissue', member: StaffMember) => {
    setBusy(true);
    const run = kind === 'archive' ? members.archiveMember(member.id).then(() => null) : members.inviteCode(member.id);
    run
      .then(
        (code) => {
          afterChange(member);
          if (code) setDialog({ kind: 'code', name: member.displayName, code });
          else {
            setDialog(null);
            toast({ tone: 'success', title: t('staff.archived', 'أُرشف {name}', { name: member.displayName }) });
          }
        },
        (error: unknown) => {
          setDialog(null);
          afterFailure(error);
          // رمز جديد ضاع جوابه: ماكو شي ينفحص (الرمز ما يبين إلا مرّة)، والإصدار من جديد يبطل أي رمز ما وصل.
          const { title, detail } =
            kind === 'reissue' && error instanceof UnknownOutcomeError
              ? { title: t('staff.reissue.lost', 'لم يصل الرمز'), detail: t('staff.reissue.lost.detail', 'أصدر رمزاً جديداً مرّة أخرى؛ أيّ رمز لم يظهر لك يبطل به.') }
              : describeError(error, 'once');
          toast({ tone: 'danger', title, detail });
        },
      )
      .finally(() => setBusy(false));
  };

  const header = (
    <PageHeader
      title={t('staff.title', 'الموظفون')}
      subtitle={t('staff.subtitle', 'الدعوة برقم الهاتف، والموظف يقبلها برمز تسلّمه له بيدك.')}
      actions={
        owner && staff.data && targets.data ? (
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" icon={<RefreshCw aria-hidden="true" className="size-4" />} onClick={staff.retry} data-action="refresh-staff">
              {t('staff.refresh', 'حدّث القائمة')}
            </Button>
            <Button icon={<UserPlus aria-hidden="true" className="size-4" />} onClick={() => setDialog({ kind: 'invite', options: optionsOf(staff.data, targets.data) })} data-action="invite-member">
              {t('staff.invite', 'ادعُ موظفاً')}
            </Button>
          </div>
        ) : null
      }
    />
  );

  if (workspace && !owner) {
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Notice tone="info" title={t('staff.owner_only', 'إدارة الموظفين لمالك المنشأة فقط')} />
      </div>
    );
  }

  if (staff.error instanceof NotConnectedError) {
    // الهيكل بلا قاعدة: ماكو قائمة تنحمّل، و«أعد المحاولة» يرجع نفس الشي.
    const { title, detail } = describeError(staff.error);
    return (
      <div className="flex flex-col gap-4">
        {header}
        <Notice tone="info" title={title}>
          {detail}
        </Notice>
      </div>
    );
  }

  return (
    <div className="flex flex-col gap-4">
      {header}
      {staff.error || targets.error ? (
        <LoadFailed
          what={t('staff.what', 'قائمة الموظفين')}
          error={staff.error ?? targets.error}
          onRetry={() => {
            staff.retry();
            targets.retry();
          }}
        />
      ) : !staff.data || !targets.data ? (
        <p role="status" className="py-6 text-center text-sm text-ink-muted">
          {t('page.loading', 'جارٍ الفتح…')}
        </p>
      ) : (
        <StaffTable
          rows={staff.data.members}
          divisions={staff.data.divisions}
          places={targets.data ?? undefined}
          selfUserId={selfUserId}
          onOpen={owner ? (member) => setDialog({ kind: 'actions', member, options: optionsOf(staff.data, targets.data) }) : undefined}
        />
      )}

      {dialog?.kind === 'actions' ? (
        <ActionsDialog
          member={dialog.member}
          selfUserId={selfUserId}
          onClose={() => setDialog(null)}
          onPick={(kind) =>
            setDialog(kind === 'role' || kind === 'scopes' ? { kind, member: dialog.member, options: dialog.options } : { kind, member: dialog.member })
          }
        />
      ) : null}
      {dialog?.kind === 'invite' ? (
        <InviteDialog
          options={dialog.options}
          onClose={() => setDialog(null)}
          onFailure={afterFailure}
          onInvited={(name, code) => {
            afterChange(null);
            setDialog(code ? { kind: 'code', name, code } : null);
          }}
        />
      ) : null}
      {dialog?.kind === 'code' ? <CodeDialog name={dialog.name} code={dialog.code} onClose={() => setDialog(null)} /> : null}
      {dialog?.kind === 'role' || dialog?.kind === 'scopes' ? (
        <EditDialog
          member={dialog.member}
          kind={dialog.kind}
          options={dialog.options}
          self={dialog.member.userId === selfUserId}
          onClose={() => setDialog(null)}
          onFailure={afterFailure}
          onGone={(error) => {
            setDialog(null);
            staff.retry();
            const { title, detail } = describeError(error, 'once');
            toast({ tone: 'warning', title, detail });
          }}
          onSaved={() => {
            const member = dialog.member;
            setDialog(null);
            afterChange(member);
            toast({ tone: 'success', title: t('staff.saved', 'حُفظ التعديل') });
          }}
        />
      ) : null}
      <ConfirmDialog
        open={dialog?.kind === 'archive'}
        title={dialog?.kind === 'archive' ? t('staff.archive.title', 'أرشفة {name}', { name: dialog.member.displayName }) : ''}
        consequence={
          dialog?.kind === 'archive'
            ? dialog.member.accepted
              ? t('staff.archive.consequence', 'يفقد {name} الوصول إلى المنشأة فوراً، ويبقى اسمه في السجلّ. تستطيع دعوته من جديد لاحقاً.', { name: dialog.member.displayName })
              : t('staff.archive.pending', 'تُلغى دعوة {name} ويبطل رمزها.', { name: dialog.member.displayName })
            : null
        }
        confirmLabel={t('staff.archive.confirm', 'أرشفة')}
        busy={busy}
        action="confirm-archive"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === 'archive') confirmAction('archive', dialog.member);
        }}
      />
      <ConfirmDialog
        open={dialog?.kind === 'reissue'}
        tone="primary"
        title={dialog?.kind === 'reissue' ? t('staff.reissue.title', 'رمز جديد لـ{name}', { name: dialog.member.displayName }) : ''}
        consequence={t('staff.reissue.consequence', 'يبطل الرمز السابق فوراً، وتعود المحاولات إلى 5، والجديد صالح 7 أيام.')}
        confirmLabel={t('staff.reissue.confirm', 'أصدر رمزاً جديداً')}
        busy={busy}
        action="confirm-reissue"
        onCancel={() => setDialog(null)}
        onConfirm={() => {
          if (dialog?.kind === 'reissue') confirmAction('reissue', dialog.member);
        }}
      />
    </div>
  );
}
