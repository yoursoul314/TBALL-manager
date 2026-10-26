import { useCallback, useEffect, useState, useRef } from 'react';
import { APP_VERSION } from '../config/version';
export function useAppUpdate(blocked: boolean) {
  const [available, setAvailable] = useState(false),
    [checking, setChecking] = useState(false),
    [message, setMessage] = useState('');
  const checkingRef = useRef(false);
  const check = useCallback(async (manual = true) => {
    if (checkingRef.current) return;
    checkingRef.current = true;
    setChecking(true);
    try {
      const response = await fetch(import.meta.env.BASE_URL + 'version.json', {
        cache: 'no-store',
      });
      if (!response.ok) throw new Error('버전 정보를 읽을 수 없습니다');
      const version = (await response.json()).version;
      if (typeof version !== 'string') throw new Error('버전 정보가 올바르지 않습니다');
      const registration = await navigator.serviceWorker?.getRegistration(import.meta.env.BASE_URL);
      if (registration) await registration.update();
      const newer = version !== APP_VERSION;
      setAvailable(newer || Boolean(registration?.waiting));
      if (manual)
        setMessage(
          newer
            ? '새 버전을 사용할 수 있습니다. 저장 후 적용하세요.'
            : '현재 BETA ' + APP_VERSION + '입니다.',
        );
    } catch (e) {
      if (manual)
        setMessage(
          '업데이트 확인 실패: 인터넷 연결을 확인하세요. ' + (e instanceof Error ? e.message : ''),
        );
    } finally {
      checkingRef.current = false;
      setChecking(false);
    }
  }, []);
  useEffect(() => {
    void check(false);
    const focus = () => void check(false);
    window.addEventListener('focus', focus);
    const timer = setInterval(focus, 300000);
    return () => {
      window.removeEventListener('focus', focus);
      clearInterval(timer);
    };
  }, [check]);
  const apply = async () => {
    if (blocked) {
      setMessage('저장하지 않은 기록을 먼저 저장하거나 되돌리세요.');
      return;
    }
    setChecking(true);
    try {
      const reg = await navigator.serviceWorker?.getRegistration(import.meta.env.BASE_URL);
      if (reg) {
        await reg.update();
        const worker = reg.installing ?? reg.waiting;
        if (worker && worker.state !== 'activated') {
          worker.postMessage({ type: 'SKIP_WAITING' });
          await new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => {
              worker.removeEventListener('statechange', changed);
              reject(new Error('새 버전 준비 중입니다. 잠시 후 다시 적용하세요'));
            }, 20000);
            function changed() {
              if (worker!.state === 'installed') worker!.postMessage({ type: 'SKIP_WAITING' });
              if (worker!.state === 'activated') {
                clearTimeout(timer);
                worker!.removeEventListener('statechange', changed);
                resolve();
              }
            }
            worker.addEventListener('statechange', changed);
            changed();
          });
        }
      }
      location.reload();
    } catch (e) {
      setMessage(e instanceof Error ? e.message : '업데이트 적용 실패');
      setChecking(false);
    }
  };
  return { available, checking, message, check, apply, dismiss: () => setMessage('') };
}
