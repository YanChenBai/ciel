import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export { default as Badge } from './Badge.vue';

export const badgeVariants = cva(
  'cl:inline-flex cl:items-center cl:justify-center cl:rounded-full cl:border cl:px-2 cl:py-0.5 cl:text-xs cl:font-medium cl:w-fit cl:whitespace-nowrap cl:shrink-0 cl:[&>svg]:size-3 cl:gap-1 cl:[&>svg]:pointer-events-none cl:focus-visible:border-ring cl:focus-visible:ring-ring/50 cl:focus-visible:ring-3 cl:aria-invalid:ring-destructive/20 cl:dark:aria-invalid:ring-destructive/40 cl:aria-invalid:border-destructive cl:transition-[color,box-shadow] cl:overflow-hidden',
  {
    variants: {
      variant: {
        default:
          'cl:border-transparent cl:bg-primary cl:text-primary-foreground cl:[a&]:hover:bg-primary/90',
        secondary:
          'cl:border-transparent cl:bg-secondary cl:text-secondary-foreground cl:[a&]:hover:bg-secondary/90',
        destructive:
          'cl:border-transparent cl:bg-destructive cl:text-white cl:[a&]:hover:bg-destructive/90 cl:focus-visible:ring-destructive/20 cl:dark:focus-visible:ring-destructive/40 cl:dark:bg-destructive/60',
        outline: 'cl:text-foreground cl:[a&]:hover:bg-accent cl:[a&]:hover:text-accent-foreground',
      },
    },
    defaultVariants: {
      variant: 'default',
    },
  },
);
export type BadgeVariants = VariantProps<typeof badgeVariants>;
