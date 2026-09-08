import { useLocaleStore } from "@/stores/locale.store";

export function formatDate(value: string | Date, locale?: string): string {
  const lng = locale ?? useLocaleStore.getState().locale;
  return new Date(value).toLocaleDateString(lng);
}

export function formatDateTime(value: string | Date, locale?: string): string {
  const lng = locale ?? useLocaleStore.getState().locale;
  return new Date(value).toLocaleString(lng);
}

export function formatNumber(value: number, locale?: string): string {
  const lng = locale ?? useLocaleStore.getState().locale;
  return new Intl.NumberFormat(lng).format(value);
}
