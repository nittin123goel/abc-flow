export function Modal({ children, onClose }) {
  return (
    <div
      className="modal-backdrop"
      onClick={(e) => {
        if (e.target === e.currentTarget) onClose?.();
      }}
    >
      <div className="modal p-7">{children}</div>
    </div>
  );
}
