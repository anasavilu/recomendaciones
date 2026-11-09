/** "de Ana y Maribel", escrito a mano. */
export function RecommendedBy({ names, className = "" }: { names: string[]; className?: string }) {
  if (!names.length) return null;
  const list =
    names.length === 1 ? names[0] : `${names.slice(0, -1).join(", ")} y ${names[names.length - 1]}`;
  return <span className={`hand ${className}`}>de {list}</span>;
}
