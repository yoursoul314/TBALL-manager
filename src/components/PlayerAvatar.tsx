import { useEffect, useState } from 'react';
import type { Player } from '../domain/model';
import { photoRepository } from '../data/photos';
export function PlayerAvatar({
  player,
  className = 'avatar',
}: {
  player?: Pick<Player, 'id' | 'name' | 'number'>;
  className?: string;
}) {
  const [url, setUrl] = useState<string | null>(null);
  useEffect(() => {
    let alive = true,
      current: string | null = null,
      request = 0;
    const refresh = async () => {
      const n = ++request;
      try {
        const p = player ? await photoRepository.get(player.id) : null;
        if (!alive || n !== request) return;
        if (current) URL.revokeObjectURL(current);
        current = p ? URL.createObjectURL(p.blob) : null;
        setUrl(current);
      } catch {
        if (alive) setUrl(null);
      }
    };
    void refresh();
    window.addEventListener('tb-photo-change', refresh);
    return () => {
      alive = false;
      request++;
      window.removeEventListener('tb-photo-change', refresh);
      if (current) URL.revokeObjectURL(current);
    };
  }, [player?.id]);
  return (
    <span className={className + ' player-photo'}>
      {url ? (
        <img src={url} alt={(player?.name ?? '선수') + ' 사진'} />
      ) : (
        String(player?.number ?? '—').padStart(2, '0')
      )}
    </span>
  );
}
