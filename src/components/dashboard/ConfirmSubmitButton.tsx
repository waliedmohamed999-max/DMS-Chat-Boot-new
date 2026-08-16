"use client";

export function ConfirmSubmitButton({
  action,
  confirmMessage,
  className,
  children,
}: {
  action: () => Promise<void>;
  confirmMessage: string;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <form
      action={() => {
        if (window.confirm(confirmMessage)) action();
      }}
    >
      <button className={className}>{children}</button>
    </form>
  );
}
