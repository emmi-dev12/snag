export function Mark() {
  return (
    <svg className="mark" viewBox="0 0 64 64" aria-hidden="true">
      <rect width="64" height="64" rx="12" fill="var(--sheet)" />
      <rect x="18" y="7" width="22" height="13" rx="3" fill="var(--tab)" />
      <path d="M14 30h36M14 40h27M14 50h18" fill="none" stroke="var(--ink)" strokeWidth="3.4" strokeLinecap="round" />
    </svg>
  )
}
