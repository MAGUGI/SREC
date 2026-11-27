export function SubmitButton({ isSubmitting, idleLabel, busyLabel, icon }) {
  return (
    <button
      type="submit"
      className="btn btn-primary"
      disabled={isSubmitting}
      aria-busy={isSubmitting}
    >
      {icon} {isSubmitting ? busyLabel : idleLabel}
    </button>
  );
}
