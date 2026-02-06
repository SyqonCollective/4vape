import { useEffect } from "react";

export default function InlineError({ message, onClose, autoMs = 4500 }) {
  useEffect(() => {
    if (!message) return undefined;
    const timer = setTimeout(() => onClose?.(), autoMs);
    return () => clearTimeout(timer);
  }, [message, autoMs, onClose]);

  if (!message) return null;

  return (
    <div className="error">
      <span>{message}</span>
      <button className="error-close" onClick={onClose} aria-label="Chiudi">
        ×
      </button>
    </div>
  );
}
