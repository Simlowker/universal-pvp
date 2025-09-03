# Gambling UI Component Library - Implementation Guide

## Overview

This comprehensive gambling UI library provides world-class betting interfaces designed specifically for the Universal PvP platform. The components are built with React, TypeScript, and Tailwind CSS, focusing on engagement, trust, and responsible gambling.

## Core Principles

### 1. **Engagement Without Addiction**
- Clear, exciting interfaces that build anticipation
- Smooth animations and visual feedback
- Gamification elements (levels, badges, achievements)
- **NO** dark patterns or addiction-promoting mechanics

### 2. **Trust & Transparency**
- Real-time odds updates with movement indicators
- Clear payout calculations and breakdowns
- Provable fairness indicators
- Comprehensive audit trails

### 3. **Responsible Gambling First**
- Built-in limits and controls
- Reality check reminders
- Self-exclusion options
- Loss tracking and warnings

### 4. **Mobile-First Design**
- Touch-optimized controls
- Responsive layouts for all screen sizes
- Gesture-based interactions
- Offline mode support

### 5. **Accessibility Compliance (WCAG 2.1 AA)**
- Screen reader support
- Keyboard navigation
- High contrast modes
- Reduced motion options

## Component Library

### 1. BetSlip Component (`BetSlip.tsx`)

**Purpose**: Comprehensive betting slip management with multi-bet support.

**Key Features**:
- Single and accumulator bets
- Real-time odds updates
- Stake validation and limits
- Quick stake buttons
- Animated bet confirmation

**Usage**:
```tsx
import { BetSlip } from '@/components/gambling';

<BetSlip
  selections={betSelections}
  onUpdateStake={handleStakeUpdate}
  onPlaceBet={handleBetPlacement}
  maxTotalStake={1000}
  variant="expanded" // or "compact" | "mobile"
/>
```

**Variants**:
- `expanded`: Full feature set with details
- `compact`: Minimal UI for sidebars
- `mobile`: Fixed bottom overlay for mobile

### 2. OddsDisplay Component (`OddsDisplay.tsx`)

**Purpose**: Professional odds display with multiple formats and movement tracking.

**Key Features**:
- Decimal, fractional, and American formats
- Real-time movement indicators
- Probability calculations
- Volume tracking
- Best odds highlighting

**Usage**:
```tsx
import { OddsDisplay } from '@/components/gambling';

<OddsDisplay
  odds={oddsData}
  format="decimal"
  showMovement={true}
  showProbability={true}
  onOddsSelect={handleOddsSelection}
/>
```

**Supported Formats**:
- **Decimal**: 2.50
- **Fractional**: 3/2
- **American**: +150

### 3. TournamentBracket Component (`TournamentBracket.tsx`)

**Purpose**: Interactive tournament visualization with betting integration.

**Key Features**:
- Single/double elimination support
- Real-time score updates
- Integrated betting options
- Zoom and pan controls
- Match statistics

**Usage**:
```tsx
import { TournamentBracket } from '@/components/gambling';

<TournamentBracket
  matches={tournamentMatches}
  tournamentType="single_elimination"
  showBetting={true}
  onBetClick={handleTournamentBet}
/>
```

### 4. ResponsibleGambling Component (`ResponsibleGambling.tsx`)

**Purpose**: Comprehensive responsible gambling tools and controls.

**Key Features**:
- Deposit and loss limits
- Session time controls
- Reality check reminders
- Self-exclusion options
- Gambling statistics tracking
- Help resources

**Usage**:
```tsx
import { ResponsibleGambling } from '@/components/gambling';

<ResponsibleGambling
  limits={userLimits}
  stats={gamblingStats}
  onUpdateLimits={handleLimitsUpdate}
  onSelfExclude={handleSelfExclusion}
/>
```

### 5. PayoutDisplay Component (`PayoutDisplay.tsx`)

**Purpose**: Engaging payout visualization with celebrations and detailed breakdowns.

**Key Features**:
- Animated win celebrations
- Coin rain effects
- Detailed payout breakdowns
- Tax information display
- Payout history
- Withdrawal options

**Usage**:
```tsx
import { PayoutDisplay } from '@/components/gambling';

<PayoutDisplay
  payout={winningPayout}
  showAnimation={true}
  showHistory={true}
  onWithdraw={handleWithdrawal}
/>
```

### 6. Leaderboard Component (`Leaderboard.tsx`)

**Purpose**: Social proof and competition through rankings and achievements.

**Key Features**:
- Multiple ranking categories
- Podium visualization for top 3
- Achievement badges
- Recent big wins showcase
- Time-based rankings
- User profile views

**Usage**:
```tsx
import { Leaderboard } from '@/components/gambling';

<Leaderboard
  players={leaderboardData}
  timeframe="weekly"
  category="winnings"
  showRecentWins={true}
  onPlayerSelect={handlePlayerView}
/>
```

### 7. LiveBetting Component (`LiveBetting.tsx`)

**Purpose**: Real-time in-game betting with live odds and statistics.

**Key Features**:
- 100ms odds updates
- Live match visualization
- Quick bet placement
- Cash-out options
- Audio notifications
- Odds trend charts

**Usage**:
```tsx
import { LiveBetting } from '@/components/gambling';

<LiveBetting
  match={liveMatchData}
  quickBets={activeBets}
  onPlaceBet={handleLiveBet}
  onCashOut={handleCashOut}
/>
```

## Theming System

### Dark/Light Mode Support

All components automatically adapt to system preferences and manual theme switches:

```css
/* Light Theme */
:root {
  --gambling-primary: #2563eb;
  --gambling-success: #059669;
  --gambling-danger: #dc2626;
}

/* Dark Theme */
@media (prefers-color-scheme: dark) {
  :root {
    --gambling-primary: #3b82f6;
    --gambling-success: #10b981;
    --gambling-danger: #ef4444;
  }
}
```

### Component-Specific Themes

Each component has dedicated CSS classes for consistent theming:

```css
.bet-slip { /* BetSlip styling */ }
.odds-button { /* OddsDisplay styling */ }
.tournament-bracket { /* Tournament styling */ }
/* ... etc */
```

## Accessibility Features

### WCAG 2.1 AA Compliance

**Keyboard Navigation**:
- All interactive elements are keyboard accessible
- Proper tab order and focus management
- Custom focus indicators

**Screen Reader Support**:
- Semantic HTML structure
- ARIA labels and descriptions
- Live region updates for dynamic content

**Visual Accessibility**:
- High contrast mode support
- Reduced motion options
- Scalable text and UI elements

**Example Implementation**:
```tsx
<button
  aria-label="Place bet on Player 1 at odds 2.50"
  aria-describedby="bet-details"
  className="odds-button"
  onKeyDown={handleKeyDown}
>
  2.50
</button>
```

## Integration Examples

### Complete Betting Interface

```tsx
import {
  BetSlip,
  OddsDisplay,
  LiveBetting,
  ResponsibleGambling
} from '@/components/gambling';

function BettingInterface() {
  return (
    <div className="betting-layout">
      <div className="main-content">
        <LiveBetting match={currentMatch} />
        <OddsDisplay odds={availableOdds} />
      </div>
      
      <aside className="sidebar">
        <BetSlip 
          selections={userSelections}
          variant="compact"
        />
        <ResponsibleGambling 
          limits={userLimits}
          stats={userStats}
        />
      </aside>
    </div>
  );
}
```

### Tournament Page

```tsx
import {
  TournamentBracket,
  Leaderboard,
  PayoutDisplay
} from '@/components/gambling';

function TournamentPage() {
  return (
    <div className="tournament-layout">
      <TournamentBracket
        matches={tournamentMatches}
        showBetting={true}
      />
      
      <div className="tournament-sidebar">
        <Leaderboard
          players={tournamentPlayers}
          timeframe="tournament"
        />
        <PayoutDisplay
          payout={lastPayout}
          showHistory={false}
        />
      </div>
    </div>
  );
}
```

## Performance Optimizations

### Real-time Updates
- WebSocket connections for live data
- Optimistic updates for immediate feedback
- Efficient re-rendering with React.memo
- Virtual scrolling for large lists

### Mobile Performance
- Touch gesture optimization
- Battery-efficient animations
- Progressive image loading
- Service worker caching

### Accessibility Performance
- Throttled screen reader announcements
- Reduced motion for performance
- Efficient focus management

## Security Considerations

### Input Validation
- Client-side stake validation
- Server-side verification
- XSS protection in user content
- CSRF token implementation

### Responsible Gambling
- Hard limits enforcement
- Session timeout handling
- Audit trail logging
- Self-exclusion respect

## Testing Strategy

### Component Testing
```typescript
import { render, screen, fireEvent } from '@testing-library/react';
import { BetSlip } from '@/components/gambling';

test('BetSlip calculates payout correctly', () => {
  const selections = [{
    id: '1',
    odds: 2.5,
    stake: 10
  }];
  
  render(<BetSlip selections={selections} />);
  
  expect(screen.getByText('25.000 SOL')).toBeInTheDocument();
});
```

### Accessibility Testing
```typescript
import { axe, toHaveNoViolations } from 'jest-axe';
expect.extend(toHaveNoViolations);

test('OddsDisplay is accessible', async () => {
  const { container } = render(<OddsDisplay odds={testOdds} />);
  const results = await axe(container);
  expect(results).toHaveNoViolations();
});
```

## Best Practices

### State Management
- Use React Context for global betting state
- Implement optimistic updates
- Cache frequently accessed data
- Handle connection failures gracefully

### Error Handling
- User-friendly error messages
- Automatic retry mechanisms
- Fallback UI components
- Comprehensive logging

### Performance Monitoring
- Track component render times
- Monitor bundle size
- Measure user interactions
- Set up error boundaries

## Deployment Checklist

- [ ] All components pass accessibility audits
- [ ] Responsive design tested on all devices
- [ ] Dark/light themes working correctly
- [ ] Real-time updates functioning
- [ ] Responsible gambling tools active
- [ ] Error boundaries implemented
- [ ] Performance benchmarks met
- [ ] Security review completed

## Support & Maintenance

### Documentation Updates
Keep this guide updated with new features and changes.

### Component Versioning
Follow semantic versioning for component updates.

### User Feedback Integration
Regularly collect and implement user experience improvements.

### Regulatory Compliance
Ensure all components meet gambling regulation requirements.

---

This gambling UI library provides a complete, professional, and responsible betting interface for the Universal PvP platform. All components are designed to maximize user engagement while promoting responsible gambling practices and maintaining the highest standards of accessibility and performance.