import { type ClassValue, clsx } from "clsx";
import { twMerge } from "tailwind-merge";

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

export function formatDate(date: Date | string): string {
  if (!date) return '';
  const d = typeof date === 'string' ? new Date(date) : date;
  return d.toLocaleDateString('cs-CZ', {
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
  });
}

export function truncate(str: string, length: number): string {
  if (!str) return '';
  return str.length > length ? `${str.substring(0, length)}...` : str;
}

/**
 * Basic email format check.
 * Any restriction to allowed domains is enforced by the server based on
 * the ALLOWED_EMAIL_DOMAINS variable – the client does not know about it.
 */
export function validateEmail(email: string): boolean {
  const regex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
  return regex.test(email);
}

export function getInitials(name: string): string {
  if (!name) return '';
  
  const parts = name.split(' ');
  if (parts.length === 1) {
    return parts[0].substring(0, 2).toUpperCase();
  }
  
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export function getColorClass(colorTheme: string): {
  base: string;
  light: string;
  dark: string;
  text: string;
  border: string;
} {
  const colors = {
    blue: {
      base: 'bg-blue-500',
      light: 'bg-blue-100',
      dark: 'bg-blue-700',
      text: 'text-blue-500',
      border: 'border-blue-500',
    },
    green: {
      base: 'bg-green-500',
      light: 'bg-green-100',
      dark: 'bg-green-700',
      text: 'text-green-500',
      border: 'border-green-500',
    },
    red: {
      base: 'bg-red-500',
      light: 'bg-red-100',
      dark: 'bg-red-700',
      text: 'text-red-500',
      border: 'border-red-500',
    },
    purple: {
      base: 'bg-purple-500',
      light: 'bg-purple-100',
      dark: 'bg-purple-700',
      text: 'text-purple-500',
      border: 'border-purple-500',
    },
    orange: {
      base: 'bg-orange-500',
      light: 'bg-orange-100',
      dark: 'bg-orange-700',
      text: 'text-orange-500',
      border: 'border-orange-500',
    },
  };

  return colors[colorTheme as keyof typeof colors] || colors.blue;
}

export function maskApiKey(key: string): string {
  if (!key) return '';
  if (key.length < 8) return '********';
  return key.substring(0, 3) + '...' + key.substring(key.length - 4);
}
