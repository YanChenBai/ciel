import type { VariantProps } from 'class-variance-authority';
import { cva } from 'class-variance-authority';

export { default as Button } from './Button.vue';

export const buttonVariants = cva(
  "cl:inline-flex cl:items-center cl:justify-center cl:gap-2 cl:whitespace-nowrap cl:rounded-md cl:text-sm cl:font-medium cl:transition-all cl:disabled:pointer-events-none cl:disabled:opacity-50 cl:[&_svg]:pointer-events-none cl:[&_svg:not([class*='size-'])]:size-4 cl:shrink-0 cl:[&_svg]:shrink-0 cl:outline-none cl:focus-visible:border-ring cl:focus-visible:ring-ring/50 cl:focus-visible:ring-3 cl:aria-invalid:ring-destructive/20 cl:dark:aria-invalid:ring-destructive/40 cl:aria-invalid:border-destructive",
  {
    variants: {
      variant: {
        default: 'cl:bg-primary cl:text-primary-foreground cl:hover:bg-primary/90',
        destructive:
          'cl:bg-destructive cl:text-white cl:hover:bg-destructive/90 cl:focus-visible:ring-destructive/20 cl:dark:focus-visible:ring-destructive/40 cl:dark:bg-destructive/60',
        outline:
          'cl:border cl:bg-background cl:shadow-xs cl:hover:bg-accent cl:hover:text-accent-foreground cl:dark:bg-input/30 cl:dark:border-input cl:dark:hover:bg-input/50',
        secondary: 'cl:bg-secondary cl:text-secondary-foreground cl:hover:bg-secondary/80',
        ghost: 'cl:hover:bg-accent cl:hover:text-accent-foreground cl:dark:hover:bg-accent/50',
        link: 'cl:text-primary cl:underline-offset-4 cl:hover:underline',
      },
      size: {
        default: 'cl:h-9 cl:px-4 cl:py-2 cl:has-[>svg]:px-3',
        xs: "cl:h-6 cl:gap-1 cl:rounded-md cl:px-2 cl:text-xs cl:has-[>svg]:px-1.5 cl:[&_svg:not([class*='size-'])]:size-3",
        sm: 'cl:h-8 cl:rounded-md cl:gap-1.5 cl:px-3 cl:has-[>svg]:px-2.5',
        lg: 'cl:h-10 cl:rounded-md cl:px-6 cl:has-[>svg]:px-4',
        icon: 'cl:size-9',
        'icon-xs': "cl:size-6 cl:rounded-md cl:[&_svg:not([class*='size-'])]:size-3",
        'icon-sm': 'cl:size-8',
        'icon-lg': 'cl:size-10',
      },
    },
    defaultVariants: {
      variant: 'default',
      size: 'default',
    },
  },
);
export type ButtonVariants = VariantProps<typeof buttonVariants>;
