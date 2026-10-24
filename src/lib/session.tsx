import { createContext, useContext, type ReactNode } from 'react';
import type { DivisionKind } from '../domain/divisions';
import type { Role, ScopeRow } from '../domain/permissions';

// المنشأة الحالية يؤكّدها الخادم (my_workspace())، والمفتاح المحلّي لتسمية خبيئات الجهاز بس:
// بـdoctorVet الواجهة والخادم اختلفوا على «بأي عيادة أنا»، فنزلت بيانات عيادة بعيادة غيرها.
// الدخول والمنشأة يجون ويّا القاعدة (Supabase Auth)، وهي مؤجّلة بكلمة المالك (docs/DECISIONS.md).

export interface Workspace {
  userId: string;
  orgId: string;
  orgName: string;
  displayName: string;
  role: Role;
  scopes: readonly ScopeRow[];
  /** وحدات نطاق المستخدم كما يحسبها الخادم من member_scopes: المالك، والمدير والمحاسب بلا صفوف نطاق = الست كلها. ماكو تفعيل لكل منشأة. */
  divisions: readonly DivisionKind[];
  subscription: 'active' | 'expired' | 'unknown';
  /** وقت آخر تأكيد ناجح من الخادم. */
  confirmedAt: number;
}

export type SessionState =
  | { status: 'not_configured' }
  | { status: 'ready'; workspace: Workspace; offline: boolean };

const NOT_CONFIGURED: SessionState = { status: 'not_configured' };

const SessionContext = createContext<SessionState>(NOT_CONFIGURED);

export function SessionProvider({ children }: { children: ReactNode }) {
  return <SessionContext.Provider value={NOT_CONFIGURED}>{children}</SessionContext.Provider>;
}

export function useSession(): SessionState {
  return useContext(SessionContext);
}
