import React from 'react';
import { cn } from "@/lib/utils";

interface SpinnerProps extends React.HTMLAttributes<HTMLDivElement> {
  size?: 'sm' | 'md' | 'lg';
  color?: 'primary' | 'secondary' | 'muted' | 'white';
}

/**
 * Loading spinner component for asynchronous operations
 */
export const Spinner = React.forwardRef<HTMLDivElement, SpinnerProps>(
  ({ className, size = 'md', color = 'primary', ...props }, ref) => {
    const sizeClasses = {
      sm: 'h-4 w-4 border-2',
      md: 'h-6 w-6 border-2',
      lg: 'h-8 w-8 border-3',
    };
    
    const colorClasses = {
      primary: 'border-primary/30 border-t-primary',
      secondary: 'border-secondary/30 border-t-secondary',
      muted: 'border-muted-foreground/30 border-t-muted-foreground',
      white: 'border-white/30 border-t-white',
    };
    
    return (
      <div
        ref={ref}
        className={cn(
          "animate-spin rounded-full",
          sizeClasses[size],
          colorClasses[color],
          className
        )}
        {...props}
      />
    );
  }
);

Spinner.displayName = "Spinner";