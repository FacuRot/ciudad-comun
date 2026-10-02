// "1 lote", "3 lotes". Alcanza para inglés y español: singular solo con 1.
export function plural(n: number, one: string, many: string): string {
  return `${n} ${n === 1 ? one : many}`;
}
