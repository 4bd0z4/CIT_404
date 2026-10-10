import { Slot } from '@radix-ui/react-slot'
import { cva, type VariantProps } from 'class-variance-authority'
import type { ComponentProps } from 'react'
import { cn } from '@/lib/utils'

const buttonVariants = cva(
  'btn-live inline-flex items-center justify-center gap-2 whitespace-nowrap font-mono text-xs font-bold uppercase tracking-[0.12em] transition-all disabled:pointer-events-none disabled:opacity-40 [&_svg]:size-4 [&_svg]:shrink-0 cursor-pointer',
  {
    variants: {
      variant: {
        default:
          'btn-sheen bg-term text-void border border-term hover:bg-term-dim',
        outline:
          'border border-edge bg-transparent text-term hover:border-term hover:bg-term/5',
        ghost: 'border border-transparent text-term/70 hover:text-term hover:bg-term/5',
        danger:
          'border border-alert bg-transparent text-alert hover:bg-alert/10',
        warn: 'border border-warn bg-transparent text-warn hover:bg-warn/10',
        item: 'border border-item bg-transparent text-item hover:bg-item/10',
      },
      size: {
        default: 'h-10 px-4 py-2',
        sm: 'h-8 px-3 text-[11px]',
        lg: 'h-12 px-6 text-sm',
        icon: 'size-9',
      },
    },
    defaultVariants: { variant: 'default', size: 'default' },
  }
)

export function Button({
  className,
  variant,
  size,
  asChild = false,
  ...props
}: ComponentProps<'button'> & VariantProps<typeof buttonVariants> & { asChild?: boolean }) {
  const Comp = asChild ? Slot : 'button'
  return <Comp className={cn(buttonVariants({ variant, size }), className)} {...props} />
}

export { buttonVariants }
