// Isolated so tests can mock it (import.meta is Vite-only).
export const API_URL: string = import.meta.env.VITE_API_URL ?? '/api/v1';
