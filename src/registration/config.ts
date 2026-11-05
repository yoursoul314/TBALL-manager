export function isPublicRegistrationConfig(config: { url?: string; key?: string }): boolean {
  try {
    const url = new URL(config.url ?? '');
    return (
      url.protocol === 'https:' &&
      /^[a-z0-9-]+\.supabase\.co$/.test(url.hostname) &&
      !url.username &&
      !url.password &&
      (!url.pathname || url.pathname === '/') &&
      !url.search &&
      !url.hash &&
      !!config.key?.startsWith('sb_publishable_')
    );
  } catch {
    return false;
  }
}
/** Fail before bundling, so an accidental service-role secret can never enter public JS. */
export function assertPublicRegistrationConfig(config: { url?: string; key?: string }): void {
  if (!config.url && !config.key) return;
  if (!isPublicRegistrationConfig(config))
    throw Error(
      '학생 등록 설정 오류: Supabase HTTPS 프로젝트 URL과 sb_publishable_ 공개 키만 설정하세요. 비밀 키를 사용하면 안 됩니다.',
    );
}
