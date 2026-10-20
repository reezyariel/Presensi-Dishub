import { clsx, type ClassValue } from 'clsx'
import { twMerge } from 'tailwind-merge'

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

/**
 * Normalizes an employee name consistently:
 * - Trims leading & trailing whitespace
 * - Compresses repeated consecutive whitespace characters to a single space
 * - Converts to lowercase
 */
export function normalizeName(name: string): string {
  return name.trim().replace(/\s+/g, ' ').toLowerCase()
}

