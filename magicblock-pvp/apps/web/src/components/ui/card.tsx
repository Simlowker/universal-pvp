import * as React from "react"
import { cn } from "@/lib/utils"

const Card = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn(
      "rounded-xl border bg-card text-card-foreground shadow",
      className
    )}
    {...props}
  />
))
Card.displayName = "Card"

const CardHeader = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex flex-col space-y-1.5 p-6", className)}
    {...props}
  />
))
CardHeader.displayName = "CardHeader"

const CardTitle = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLHeadingElement>
>(({ className, ...props }, ref) => (
  <h3
    ref={ref}
    className={cn("font-semibold leading-none tracking-tight", className)}
    {...props}
  />
))
CardTitle.displayName = "CardTitle"

const CardDescription = React.forwardRef<
  HTMLParagraphElement,
  React.HTMLAttributes<HTMLParagraphElement>
>(({ className, ...props }, ref) => (
  <p
    ref={ref}
    className={cn("text-sm text-muted-foreground", className)}
    {...props}
  />
))
CardDescription.displayName = "CardDescription"

const CardContent = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div ref={ref} className={cn("p-6 pt-0", className)} {...props} />
))
CardContent.displayName = "CardContent"

const CardFooter = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement>
>(({ className, ...props }, ref) => (
  <div
    ref={ref}
    className={cn("flex items-center p-6 pt-0", className)}
    {...props}
  />
))
CardFooter.displayName = "CardFooter"

// Gaming-themed card variants
const GameCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    glowColor?: 'green' | 'blue' | 'purple' | 'pink' | 'orange'
  }
>(({ className, glowColor = 'blue', ...props }, ref) => {
  const glowClasses = {
    green: 'hover:shadow-neon-green/20 border-neon-green/20',
    blue: 'hover:shadow-neon-blue/20 border-neon-blue/20',
    purple: 'hover:shadow-neon-purple/20 border-neon-purple/20',
    pink: 'hover:shadow-neon-pink/20 border-neon-pink/20',
    orange: 'hover:shadow-neon-orange/20 border-neon-orange/20',
  }
  
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border-2 bg-card/95 backdrop-blur text-card-foreground shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl",
        glowClasses[glowColor],
        className
      )}
      {...props}
    />
  )
})
GameCard.displayName = "GameCard"

const NeonCard = React.forwardRef<
  HTMLDivElement,
  React.HTMLAttributes<HTMLDivElement> & {
    variant?: 'default' | 'winning' | 'losing'
  }
>(({ className, variant = 'default', ...props }, ref) => {
  const variantClasses = {
    default: 'border-neon-blue/30 hover:shadow-neon-blue/25',
    winning: 'border-game-win/30 hover:shadow-game-win/25',
    losing: 'border-game-loss/30 hover:shadow-game-loss/25',
  }
  
  return (
    <div
      ref={ref}
      className={cn(
        "rounded-xl border-2 bg-gradient-to-br from-card/90 to-card/70 backdrop-blur text-card-foreground shadow-lg transition-all duration-300 hover:scale-105 hover:shadow-xl",
        variantClasses[variant],
        className
      )}
      {...props}
    />
  )
})
NeonCard.displayName = "NeonCard"

export { 
  Card, 
  CardHeader, 
  CardFooter, 
  CardTitle, 
  CardDescription, 
  CardContent,
  GameCard,
  NeonCard
}