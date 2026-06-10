import type { ActionFeedback } from './types';

export function ActionToast({ feedback }: { feedback: ActionFeedback }) {
  return (
    <div
      key={feedback.id}
      className={`sd-action-toast sd-action-toast-${feedback.tone}`}
      role="status"
      aria-live="polite"
    >
      <svg className="sd-action-toast-icon" viewBox="0 0 24 24" aria-hidden="true">
        <circle className="sd-action-toast-ring" cx="12" cy="12" r="9" />
        <path className="sd-action-toast-check" d="M7.6 12.3l2.9 2.9 5.9-6.4" />
      </svg>
      <span>{feedback.message}</span>
    </div>
  );
}
