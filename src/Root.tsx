import { lazy, Suspense } from 'react';
const CoachApp = lazy(() => import('./App'));
const StudentRegistration = lazy(() => import('./registration/StudentRegistration'));
/** Public registration never mounts the coach app or opens its local workspace. */
export default function Root() {
  const student = new URLSearchParams(location.search).get('register') === '1';
  return (
    <Suspense fallback={<p role="status">화면을 여는 중입니다.</p>}>
      {student ? <StudentRegistration /> : <CoachApp />}
    </Suspense>
  );
}
