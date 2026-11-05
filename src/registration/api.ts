import { createClient } from '@supabase/supabase-js';
import { isPublicRegistrationConfig } from './config';
import {
  applicationInput,
  cohortInput,
  type Application,
  type ApplicationInput,
  type Cohort,
  type CohortInput,
  type Invitation,
} from './model';

export interface RegistrationApi {
  signIn(email: string, password: string): Promise<void>;
  signOut(): Promise<void>;
  cohorts(): Promise<Cohort[]>;
  createCohort(input: CohortInput): Promise<{ id: string; token: string }>;
  closeCohort(id: string): Promise<void>;
  rotateLink(id: string): Promise<string>;
  applications(id: string): Promise<Application[]>;
  review(id: string, approve: boolean, existingPlayerId?: string): Promise<Application>;
  invitation(token: string): Promise<Invitation>;
  submit(token: string, clientId: string, input: ApplicationInput): Promise<string>;
}
const publicConfig = {
  url: import.meta.env.VITE_REGISTRATION_SUPABASE_URL as string | undefined,
  key: import.meta.env.VITE_REGISTRATION_SUPABASE_PUBLISHABLE_KEY as string | undefined,
};
export function validRegistrationConfig(config = publicConfig): boolean {
  return isPublicRegistrationConfig(config);
}
let api: RegistrationApi | null = null;
export function registrationApi(): RegistrationApi | null {
  if (new URLSearchParams(location.search).get('preview') === '1') return null;
  if (!validRegistrationConfig()) return null;
  if (api) return api;
  // No auth tokens in localStorage/backups; no sign-up UI. Teachers are provisioned by project admin.
  const client = createClient(publicConfig.url!, publicConfig.key!, {
    auth: { persistSession: false, detectSessionInUrl: false, autoRefreshToken: true },
    global: {
      fetch: (url, options) =>
        fetch(url, { ...options, cache: 'no-store', referrerPolicy: 'no-referrer' }),
    },
  });
  async function rpc<T>(name: string, args: Record<string, unknown> = {}): Promise<T> {
    const { data, error } = await client.rpc(name, args);
    if (error) {
      const known = /TBREG:[^\n]+/.exec(error.message)?.[0]?.replace('TBREG:', '');
      throw Error(known || '서버 요청에 실패했습니다. 연결·교사 권한을 확인한 뒤 다시 시도하세요.');
    }
    return data as T;
  }
  api = {
    async signIn(email, password) {
      const { error } = await client.auth.signInWithPassword({ email: email.trim(), password });
      if (error) throw Error('로그인에 실패했습니다. 등록된 교사 계정과 비밀번호를 확인하세요.');
      try {
        await rpc('tb_registration_teacher');
      } catch (e) {
        await client.auth.signOut({ scope: 'local' });
        throw e;
      }
    },
    async signOut() {
      await client.auth.signOut({ scope: 'local' });
    },
    cohorts: () => rpc<Cohort[]>('tb_registration_cohorts'),
    createCohort: (input) => rpc('tb_registration_create', { input: cohortInput.parse(input) }),
    closeCohort: (id) => rpc('tb_registration_close', { cohort: id }),
    rotateLink: (id) => rpc('tb_registration_rotate', { cohort: id }),
    applications: (id) => rpc<Application[]>('tb_registration_applications', { cohort: id }),
    review: (id, approve, existingPlayerId) =>
      rpc<Application>('tb_registration_review', {
        application: id,
        approve,
        existing_player_id: existingPlayerId || null,
      }),
    invitation: (token) => rpc<Invitation>('tb_registration_invitation', { invite_token: token }),
    submit: (token, clientId, input) =>
      rpc<string>('tb_registration_submit', {
        invite_token: token,
        client_id: clientId,
        input: applicationInput.parse(input),
      }),
  };
  return api;
}
export function invitationLink(token: string): string {
  const url = new URL(location.pathname, location.origin);
  url.searchParams.set('register', '1');
  url.hash = new URLSearchParams({ invite: token }).toString();
  return url.href;
}
