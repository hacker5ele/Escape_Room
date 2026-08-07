export function Toast({ message, toastKey }: { message: string | null; toastKey: number }) {
  if (!message) return <div className="toast hidden" />
  return (
    <div className="toast" key={toastKey}>
      {message}
    </div>
  )
}
