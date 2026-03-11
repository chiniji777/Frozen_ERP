export function validatePositive(value: unknown, field: string): string | null {
  if (value == null) return null; // optional field
  const num = Number(value);
  if (isNaN(num) || num < 0) return `${field} must be a non-negative number`;
  return null;
}

export function validateRequired(value: unknown, field: string): string | null {
  if (value == null || value === "") return `${field} is required`;
  return null;
}

export function validatePositiveRequired(value: unknown, field: string): string | null {
  if (value == null) return `${field} is required`;
  const num = Number(value);
  if (isNaN(num) || num <= 0) return `${field} must be greater than 0`;
  return null;
}
