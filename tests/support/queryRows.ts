// Prisma-query subset used by the in-memory route fixtures.
export function queryRows(rows: any[], args: any = {}): any[] {
  const matches = (row: any, where: any): boolean => Object.entries(where ?? {}).every(([key, condition]: [string, any]) => {
    if (key === "OR") return condition.some((item: any) => matches(row, item));
    if (key === "AND") return (Array.isArray(condition) ? condition : [condition]).every((item: any) => matches(row, item));
    const value = row?.[key];
    if (condition === null || typeof condition !== "object" || condition instanceof Date) return value === condition;
    if ("some" in condition) return value?.some((item: any) => matches(item, condition.some));
    if ("in" in condition && !condition.in.includes(value)) return false;
    if ("notIn" in condition && condition.notIn.includes(value)) return false;
    if ("not" in condition && value === condition.not) return false;
    if ("gt" in condition && !(value > condition.gt)) return false;
    if ("gte" in condition && !(value >= condition.gte)) return false;
    if ("contains" in condition && !value?.toLowerCase().includes(condition.contains.toLowerCase())) return false;
    const operators = ["in", "notIn", "not", "gt", "gte", "contains"];
    return Object.keys(condition).some((item) => operators.includes(item)) || matches(value, condition);
  });
  let result = rows.filter((row) => matches(row, args.where));
  const compare = (a: any, b: any, order: any): number => {
    for (const [key, direction] of Object.entries(order)) {
      const difference = typeof direction === "object" ? compare(a?.[key], b?.[key], direction) : a?.[key] < b?.[key] ? -1 : a?.[key] > b?.[key] ? 1 : 0;
      if (difference) return direction === "desc" ? -difference : difference;
    }
    return 0;
  };
  if (args.orderBy) result.sort((a, b) => {
    for (const order of Array.isArray(args.orderBy) ? args.orderBy : [args.orderBy]) {
      const difference = compare(a, b, order);
      if (difference) return difference;
    }
    return 0;
  });
  if (args.cursor) {
    const index = result.findIndex((row) => row.id === args.cursor.id);
    result = index < 0 ? [] : result.slice(index + (args.skip ?? 0));
  }
  return result.slice(0, args.take ?? result.length);
}
