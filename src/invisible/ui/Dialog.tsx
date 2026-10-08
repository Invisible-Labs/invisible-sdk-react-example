import { useId, type ReactNode, type Ref } from "react";
import { Icon } from "./Icons";

export function Dialog({
  title,
  closeLabel,
  ref,
  children,
  className = "",
}: {
  title: string;
  closeLabel: string;
  ref: Ref<HTMLDialogElement>;
  children: ReactNode;
  className?: string;
}) {
  const titleId = useId();
  return (
    <dialog ref={ref} aria-labelledby={titleId} className={className}>
      <div className="dialog-content">
        <div className="dialog-heading">
          <h2 id={titleId}>{title}</h2>
          <button
            type="button"
            className="icon-button"
            aria-label={closeLabel}
            onClick={(event) => event.currentTarget.closest("dialog")?.close()}
          >
            <Icon name="close" />
          </button>
        </div>
        {children}
      </div>
    </dialog>
  );
}
