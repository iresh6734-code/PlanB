export function LoadError({ message, onRetry, busy = false }: { message: string; onRetry: () => void; busy?: boolean }) {
  return <div className="error-box" role="alert"><p>{message}</p><button className="button secondary" disabled={busy} onClick={onRetry}>Reintentar</button></div>;
}
