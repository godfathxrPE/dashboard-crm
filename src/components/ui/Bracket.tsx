interface BracketProps {
  children: React.ReactNode;
  className?: string;
}

export function Bracket({ children, className = '' }: BracketProps) {
  return (
    <div className={`bracket relative p-5 ${className}`}>
      {children}
    </div>
  );
}
