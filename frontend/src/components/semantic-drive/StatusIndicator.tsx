export function StatusIndicator({ status }: { status?: string }) {
  if (!status || status === 'ready') return null;
  if (status === 'failed') {
    return (
      <span
        className="sd-status-indicator sd-status-indicator-failed"
        title="Processing failed"
        aria-label="Processing failed"
      >
        !
      </span>
    );
  }
  return (
    <span
      className="sd-status-indicator sd-status-indicator-active"
      title={status}
      aria-label={`Processing status: ${status}`}
    >
      <span className="sd-spinner" />
    </span>
  );
}

export function InlineSpinner() {
  return <span className="sd-inline-spinner" aria-hidden="true" />;
}
