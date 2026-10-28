import { fireEvent, screen, within } from '@testing-library/react';
import { createDemoWorkspace } from '../data/seed';
export function createAssessmentTestWorkspace() {
  const d = createDemoWorkspace();
  d.assessmentManagement.assessors = ['QA', '가상 코치'].map((name, i) => ({
    id: 'qa-' + i,
    name,
    createdAt: '2026-10-28T00:00:00Z',
    archivedAt: null,
  }));
  return d;
}
export function chooseTestAssessor(label: string, name: string) {
  const group = screen.getByRole('group', { name: label });
  fireEvent.click(within(group).getByRole('button', { name: new RegExp('^(✓ )?' + name + '$') }));
}
