import { readFileSync } from 'node:fs';
import { expect, it } from 'vitest';
import { APP_VERSION } from './version';

it('배포 버전과 업데이트 확인 파일이 같아 구버전을 새 버전으로 반복 안내하지 않음', () => {
  for (const file of ['package.json', 'package-lock.json', 'public/version.json']) {
    expect(JSON.parse(readFileSync(file, 'utf8')).version).toBe(APP_VERSION);
  }
});
