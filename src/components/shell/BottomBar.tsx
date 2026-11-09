import { ClipboardList, Factory, House, Menu } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { can } from '../../domain/permissions';
import { t } from '../../lib/i18n';
import { visibleNav, type NavItem } from '../../lib/nav';
import { useSession, type SessionState } from '../../lib/session';
import { sound } from '../../lib/sound';

// شريط سفلي بالهاتف (كلمة المالك 2026-11-02، «الاستخدام اليومي»): التنقّل اليومي بلمسة، بدل كل شي خلف زرّ القائمة. أربعة أو
// خمسة بنود: الرئيسية، ثم الموجود من نطاق المستخدم (الجولة ← المخزن ← الحسابات، بحدّ أقصى ثلاثة)، وآخر بند «القائمة» يفتح
// الدرج نفسه (Sidebar/MobileDrawer) بكل الأقسام. حزمة كسولة تنحمّل بعد الإقلاع (برّا حزمة الإقلاع، هامشها بايتات): القشرة
// تنادي البنود كسولةً مثل رافع الجولات (StatusChips/RoundQueue). وبالحاسبة (md:) الشريط الجانبي كما هو وهذا مخبّى.

/**
 * بنود الشريط السفلي من نفس مصدر الشريط الجانبي (visibleNav: نطاق المستخدم وما أكّده الخادم)، بأسماء قصيرة تنقرا بلمسة.
 * «القائمة» يضيفه الشريط نفسه (زرّ مو رابط). بلا منشأة مؤكّدة يبين الهيكل كلّه مثل الشريط.
 */
export function bottomItems(session: SessionState): NavItem[] {
  const items = visibleNav(session);
  const pick = (to: string) => items.find((item) => item.to === to);
  const workspace = session.status === 'ready' ? session.workspace : null;
  // الرئيسية ويّا ثلاثة بالأكثر (الجولة والمخزن والحسابات)، وبعدهم «القائمة» بالشريط نفسه.
  const shown: NavItem[] = [pick('/') ?? { to: '/', label: t('nav.home', 'الرئيسية'), icon: House }];
  // الجولة اليومية: لمن يحفظ يوم الفوج وبنطاقه حقل، وتفتح جولة نوع حقله (اللحم أوّلاً).
  const saves = !workspace || can(workspace.role, 'flock_day.save');
  const farm = saves ? (pick('/broiler') ? '/broiler/round' : pick('/layers') ? '/layers/round' : null) : null;
  if (farm) shown.push({ to: farm, label: t('nav.round', 'الجولة'), icon: ClipboardList });
  // شغل اليوم لمن لا جولة له: مشغّل المعمل يفتح معمله بلمسة (0015)، ومن له جولة يبقى شريطه كما هو (الحدّ أربعة).
  const mill = !farm && (!workspace || can(workspace.role, 'production.draft')) ? pick('/mill') : undefined;
  if (mill) shown.push({ ...mill, label: t('nav.mill_short', 'المعمل'), icon: Factory });
  // «المخزن»: تبويب واحد وداخله كل مخازن النطاق (كلمة المالك 2026-11-04)، فما بقي بند لمخزن وحدة ينتقى بديلاً عنه —
  // بنده بالشريط الجانبي اسمه «المخزن» وأيقونته Warehouse، فينضاف كما هو بلا اسم قصير له.
  const stores = pick('/inventory');
  if (stores) shown.push(stores);
  const accounts = pick('/accounts');
  if (accounts) shown.push(accounts);
  return shown;
}

export default function BottomBar({ onMenu }: { onMenu: () => void }) {
  const session = useSession();
  const items = bottomItems(session);
  return (
    <nav
      aria-label={t('shell.bottom', 'التنقّل السريع')}
      className="fixed inset-x-0 bottom-0 z-bar flex items-stretch border-t border-line bg-surface/95 pb-[env(safe-area-inset-bottom)] backdrop-blur md:hidden print:hidden"
    >
      {items.map(({ to, label, icon: Icon }) => (
        <NavLink
          key={to}
          to={to}
          end={to === '/'}
          onClick={() => sound.click()}
          className={({ isActive }) =>
            `flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-2xs font-medium transition-colors ${
              isActive ? 'text-brand-700 dark:text-brand-200' : 'text-ink-muted'
            }`
          }
        >
          <Icon aria-hidden="true" className="size-6 shrink-0" />
          <span className="max-w-full truncate">{label}</span>
        </NavLink>
      ))}
      <button
        type="button"
        data-action="tab-menu"
        onClick={() => {
          sound.click();
          onMenu();
        }}
        className="flex min-w-0 flex-1 flex-col items-center justify-center gap-0.5 py-2 text-2xs font-medium text-ink-muted transition-colors active:bg-surface-2"
      >
        <Menu aria-hidden="true" className="size-6 shrink-0" />
        <span className="max-w-full truncate">{t('shell.menu', 'القائمة')}</span>
      </button>
    </nav>
  );
}
