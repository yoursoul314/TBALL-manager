import { X } from 'lucide-react';
import { useEffect, useRef, useId, type ReactNode } from 'react';
export function Badge({ children, tone = 'green' }: { children: ReactNode; tone?: string }) {
  return <span className={'badge ' + tone}>{children}</span>;
}
export function Panel({
  title,
  eyebrow,
  action,
  children,
  className = '',
}: {
  title?: string;
  eyebrow?: string;
  action?: ReactNode;
  children: ReactNode;
  className?: string;
}) {
  return (
    <section className={'panel ' + className}>
      {(title || action) && (
        <div className="panel-header">
          <div>
            {eyebrow && <small className="eyebrow">{eyebrow}</small>}
            <h2>{title}</h2>
          </div>
          {action}
        </div>
      )}
      {children}
    </section>
  );
}
export function Empty({ children }: { children: ReactNode }) {
  return <div className="empty">{children}</div>;
}
export function Modal({
  title,
  children,
  onClose,
  className = '',
}: {
  title: string;
  className?: string;
  children: ReactNode;
  onClose: () => void;
}) {
  const ref = useRef<HTMLDialogElement>(null);
  const titleId = useId();
  useEffect(() => {
    ref.current?.showModal();
  }, []);
  return (
    <dialog
      ref={ref}
      className={'modal ' + className}
      aria-labelledby={titleId}
      onCancel={(e) => {
        e.preventDefault();
        onClose();
      }}
    >
      <div className="modal-heading">
        <h2 id={titleId}>{title}</h2>
        <button className="icon-btn" aria-label="닫기" onClick={onClose}>
          <X size={20} />
        </button>
      </div>
      {children}
    </dialog>
  );
}
export const fmt = (value: number | null | undefined, digits = 0) =>
  value == null ? '—' : value.toFixed(digits);
export function Progress({ value, label }: { value: number; label: string }) {
  return (
    <div className="progress-row">
      <span>{label}</span>
      <div className="bar">
        <i style={{ width: value + '%' }} />
      </div>
      <b>{Math.round(value)}</b>
    </div>
  );
}
