import type { Workspace } from '../domain/model';

// A device UI preference, outside assessment originals and JSON backups.
export const LAST_ASSESSOR_KEY = 'tb-manager.last-assessor.v1';
const storage = () =>
  new URLSearchParams(location.search).get('preview') === '1' ? sessionStorage : localStorage;

export function lastAssessorName(data: Pick<Workspace, 'assessmentManagement'>): string {
  try {
    const id = storage().getItem(LAST_ASSESSOR_KEY);
    return (
      data.assessmentManagement.assessors.find((a) => a.id === id && !a.archivedAt)?.name ?? ''
    );
  } catch {
    return '';
  }
}

export function rememberAssessor(id: string): boolean {
  try {
    storage().setItem(LAST_ASSESSOR_KEY, id);
    return true;
  } catch {
    // A full/unavailable preference store must never block the actual assessment.
    return false;
  }
}
