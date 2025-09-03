# Component Optimization Guide
## React.memo, useMemo, and useCallback Best Practices for Gaming Performance

### Overview
This guide provides specific optimization strategies for React components in the Universal PVP gaming application, focusing on achieving consistent 60 FPS performance during real-time gameplay.

## Component Optimization Priority Matrix

### Critical Priority Components (Must Optimize)
1. **BattleArena**: Heavy animations, frequent state updates
2. **PerformanceHUD**: Real-time metrics, high frequency updates  
3. **GameLobby**: Live match data, frequent refreshes
4. **WebSocket message handlers**: Constant data flow

### High Priority Components
1. **CharacterSelection**: Complex character data rendering
2. **NFTInventory**: Large lists, filtering operations
3. **TransactionModal**: Real-time transaction status

### Medium Priority Components  
1. **Header**: Navigation, wallet status
2. **Button**: Reusable UI component
3. **Modal**: Overlay components

## React.memo Implementation Strategies

### 1. BattleArena Component Optimization

#### Current Issues:
- Re-renders on every game state change
- Heavy Framer Motion animations
- Complex character stat calculations

#### Optimized Implementation:

```typescript
// src/components/game/BattleArena.tsx
import React, { memo, useMemo, useCallback } from 'react';
import { motion } from 'framer-motion';

interface BattleArenaProps {
  matchId: string;
  isPlayerTurn: boolean;
  turnTimer: number;
}

const BattleArena = memo<BattleArenaProps>(({ matchId, isPlayerTurn, turnTimer }) => {
  // Use granular selectors to minimize re-renders
  const { currentMatch, player } = useBattleArenaData();
  const gameActions = useGameActions();
  const { playSound } = useGameSounds();

  // Memoize expensive calculations
  const playerHealthPercentage = useMemo(() => {
    if (!currentMatch?.player1) return 0;
    return getHealthPercentage(currentMatch.player1.health, currentMatch.player1.maxHealth);
  }, [currentMatch?.player1.health, currentMatch?.player1.maxHealth]);

  const opponentHealthPercentage = useMemo(() => {
    if (!currentMatch?.player2) return 0;
    return getHealthPercentage(currentMatch.player2.health, currentMatch.player2.maxHealth);
  }, [currentMatch?.player2.health, currentMatch?.player2.maxHealth]);

  // Memoize available abilities
  const availableAbilities = useMemo(() => {
    if (!currentMatch?.player1) return [];
    return abilities.filter(ability => 
      currentMatch.player1.mana >= ability.manaCost
    );
  }, [currentMatch?.player1.mana]);

  // Memoize event handlers to prevent child re-renders
  const handleAction = useCallback((actionId: string) => {
    if (!isPlayerTurn) return;
    
    playSound('click');
    gameActions.executeAction(actionId);
  }, [isPlayerTurn, gameActions.executeAction, playSound]);

  const handleAbilitySelect = useCallback((abilityId: string) => {
    setSelectedAction(abilityId);
  }, []);

  // Memoize animation variants
  const animationVariants = useMemo(() => ({
    battle: {
      initial: { opacity: 0, y: 20 },
      animate: { opacity: 1, y: 0 },
      transition: { duration: 0.3, ease: "easeOut" }
    },
    healthBar: {
      initial: { width: 0 },
      animate: { width: `${playerHealthPercentage}%` },
      transition: { duration: 0.5, ease: "easeInOut" }
    }
  }), [playerHealthPercentage]);

  // Early return for loading states
  if (!currentMatch) {
    return <BattleArenaLoader />;
  }

  return (
    <motion.div
      className="battle-arena"
      variants={animationVariants.battle}
      initial="initial"
      animate="animate"
    >
      {/* Player Character Section */}
      <PlayerCharacterPanel 
        character={currentMatch.player1}
        healthPercentage={playerHealthPercentage}
        isPlayerTurn={isPlayerTurn}
        turnTimer={turnTimer}
      />

      {/* Battle Actions */}
      <BattleActionPanel
        abilities={availableAbilities}
        onAction={handleAction}
        onAbilitySelect={handleAbilitySelect}
        disabled={!isPlayerTurn}
      />

      {/* Opponent Character Section */}  
      <OpponentCharacterPanel
        character={currentMatch.player2}
        healthPercentage={opponentHealthPercentage}
      />
    </motion.div>
  );
}, (prevProps, nextProps) => {
  // Custom comparison function for complex props
  return (
    prevProps.matchId === nextProps.matchId &&
    prevProps.isPlayerTurn === nextProps.isPlayerTurn &&
    prevProps.turnTimer === nextProps.turnTimer
  );
});

BattleArena.displayName = 'BattleArena';

export default BattleArena;
```

### 2. PerformanceHUD Component Optimization

#### Current Issues:
- Updates every frame (60fps)
- Expensive DOM measurements
- No throttling on metrics collection

#### Optimized Implementation:

```typescript
// src/components/ui/PerformanceHUD.tsx
import React, { memo, useMemo, useCallback, useRef } from 'react';
import { useThrottledCallback } from '../hooks/useThrottledCallback';

interface PerformanceMetrics {
  fps: number;
  latency: number;
  memoryUsage: number;
  networkStatus: 'excellent' | 'good' | 'poor';
}

const PerformanceHUD = memo(() => {
  const metricsRef = useRef<PerformanceMetrics>({
    fps: 60,
    latency: 0,
    memoryUsage: 0,
    networkStatus: 'excellent'
  });

  const [isVisible, setIsVisible] = useState(false);
  const { latency, isRealTimeConnected } = useMagicBlockStore(
    useShallow((state) => ({
      latency: state.latency,
      isRealTimeConnected: state.isRealTimeConnected
    }))
  );

  // Throttle metrics updates to 10fps instead of 60fps
  const updateMetrics = useThrottledCallback((newMetrics: PerformanceMetrics) => {
    metricsRef.current = newMetrics;
    // Force re-render only when metrics change significantly
    if (shouldUpdateMetrics(newMetrics)) {
      forceUpdate();
    }
  }, 100); // 10fps

  // Memoize expensive calculations
  const performanceGrade = useMemo(() => {
    const metrics = metricsRef.current;
    const score = calculatePerformanceScore(metrics);
    
    if (score >= 90) return { grade: 'S', color: 'text-green-400' };
    if (score >= 80) return { grade: 'A', color: 'text-yellow-400' };
    if (score >= 70) return { grade: 'B', color: 'text-orange-400' };
    return { grade: 'C', color: 'text-red-400' };
  }, [metricsRef.current.fps, metricsRef.current.latency]);

  const statusColors = useMemo(() => ({
    excellent: 'text-green-400',
    good: 'text-yellow-400', 
    poor: 'text-red-400'
  }), []);

  const toggleVisibility = useCallback(() => {
    setIsVisible(prev => !prev);
  }, []);

  return (
    <>
      <ToggleButton 
        onClick={toggleVisibility}
        isVisible={isVisible}
      />
      
      {isVisible && (
        <PerformancePanel
          metrics={metricsRef.current}
          grade={performanceGrade}
          statusColors={statusColors}
          isConnected={isRealTimeConnected}
        />
      )}
    </>
  );
});

// Separate memoized components for better granular updates
const ToggleButton = memo(({ onClick, isVisible }: {
  onClick: () => void;
  isVisible: boolean;
}) => (
  <motion.button
    onClick={onClick}
    className="performance-toggle"
    whileHover={{ scale: 1.05 }}
    whileTap={{ scale: 0.95 }}
  >
    {isVisible ? <EyeOff /> : <Eye />}
  </motion.button>
));

const PerformancePanel = memo(({ 
  metrics, 
  grade, 
  statusColors, 
  isConnected 
}: {
  metrics: PerformanceMetrics;
  grade: { grade: string; color: string };
  statusColors: Record<string, string>;
  isConnected: boolean;
}) => (
  <motion.div
    className="performance-panel"
    initial={{ opacity: 0, x: 300 }}
    animate={{ opacity: 1, x: 0 }}
    exit={{ opacity: 0, x: 300 }}
  >
    <MetricCard 
      label="FPS" 
      value={metrics.fps} 
      color={getFpsColor(metrics.fps)} 
    />
    <MetricCard 
      label="Latency" 
      value={`${metrics.latency}ms`}
      color={statusColors[metrics.networkStatus]} 
    />
    <MetricCard 
      label="Memory" 
      value={`${metrics.memoryUsage}MB`}
      color="text-blue-400" 
    />
    <MetricCard 
      label="Grade" 
      value={grade.grade}
      color={grade.color} 
    />
  </motion.div>
));

PerformanceHUD.displayName = 'PerformanceHUD';
export default PerformanceHUD;
```

### 3. GameLobby Component Optimization

#### Current Issues:
- Re-renders on every available match update
- Expensive time formatting calculations
- No virtualization for large match lists

#### Optimized Implementation:

```typescript
// src/components/game/GameLobby.tsx
import React, { memo, useMemo, useCallback } from 'react';
import { FixedSizeList as VirtualList } from 'react-window';

const GameLobby = memo(() => {
  // Use granular selectors
  const { availableMatches, gameStats, isLoading } = useGameLobbyData();
  const { balance } = useWalletStore(state => state.balance);
  const gameActions = useGameActions();

  const [selectedBetAmount, setSelectedBetAmount] = useState(0.1);
  const [showCreateMatch, setShowCreateMatch] = useState(false);

  // Memoize filtered and sorted matches
  const sortedMatches = useMemo(() => {
    return availableMatches
      .filter(match => match.status === 'waiting')
      .sort((a, b) => b.createdAt.getTime() - a.createdAt.getTime());
  }, [availableMatches]);

  // Memoize bet amount options
  const betAmountOptions = useMemo(() => [
    0.01, 0.05, 0.1, 0.25, 0.5, 1.0
  ], []);

  // Memoize expensive formatting
  const formattedStats = useMemo(() => ({
    activeMatches: gameStats.activeMatches.toLocaleString(),
    totalPlayers: gameStats.totalPlayersOnline.toLocaleString(),
    totalMatches: gameStats.totalMatches.toLocaleString(),
    totalVolume: `◎${gameStats.totalVolume.toFixed(1)}`
  }), [gameStats]);

  // Memoize event handlers
  const handleJoinMatch = useCallback(async (matchId: string) => {
    try {
      await gameActions.joinMatch(matchId);
    } catch (error) {
      console.error('Failed to join match:', error);
    }
  }, [gameActions.joinMatch]);

  const handleCreateMatch = useCallback(async () => {
    if (balance < selectedBetAmount) return;
    
    try {
      await gameActions.createMatch(selectedBetAmount);
      setShowCreateMatch(false);
    } catch (error) {
      console.error('Failed to create match:', error);
    }
  }, [balance, selectedBetAmount, gameActions.createMatch]);

  const handleBetAmountSelect = useCallback((amount: number) => {
    setSelectedBetAmount(amount);
  }, []);

  // Render item for virtualized list
  const renderMatchItem = useCallback(({ index, style }: {
    index: number;
    style: React.CSSProperties;
  }) => (
    <div style={style}>
      <MatchListItem
        match={sortedMatches[index]}
        onJoin={handleJoinMatch}
        userBalance={balance}
      />
    </div>
  ), [sortedMatches, handleJoinMatch, balance]);

  return (
    <div className="game-lobby">
      {/* Game Statistics */}
      <StatsGrid stats={formattedStats} />
      
      {/* Action Buttons */}
      <ActionButtonRow
        onCreateMatch={() => setShowCreateMatch(true)}
        onRefresh={gameActions.refreshMatches}
        isLoading={isLoading}
      />
      
      {/* Create Match Form */}
      {showCreateMatch && (
        <CreateMatchForm
          selectedAmount={selectedBetAmount}
          betAmountOptions={betAmountOptions}
          userBalance={balance}
          onAmountSelect={handleBetAmountSelect}
          onCreate={handleCreateMatch}
          onCancel={() => setShowCreateMatch(false)}
          isLoading={isLoading}
        />
      )}

      {/* Virtualized Match List */}
      <div className="match-list-container">
        <h2 className="match-list-title">
          Available Matches ({sortedMatches.length})
        </h2>
        
        {sortedMatches.length === 0 ? (
          <EmptyMatchList />
        ) : (
          <VirtualList
            height={400}
            itemCount={sortedMatches.length}
            itemSize={120}
            itemData={sortedMatches}
          >
            {renderMatchItem}
          </VirtualList>
        )}
      </div>
    </div>
  );
});

// Memoized child components
const StatsGrid = memo(({ stats }: { stats: any }) => (
  <div className="stats-grid">
    <StatCard icon={Swords} label="Active Matches" value={stats.activeMatches} />
    <StatCard icon={Users} label="Players Online" value={stats.totalPlayers} />
    <StatCard icon={TrendingUp} label="Total Matches" value={stats.totalMatches} />
    <StatCard icon={Coins} label="Total Volume" value={stats.totalVolume} />
  </div>
));

const StatCard = memo(({ icon: Icon, label, value }: {
  icon: React.ComponentType<any>;
  label: string;
  value: string;
}) => (
  <div className="stat-card">
    <Icon className="stat-icon" />
    <div>
      <p className="stat-value">{value}</p>
      <p className="stat-label">{label}</p>
    </div>
  </div>
));

const MatchListItem = memo(({ 
  match, 
  onJoin, 
  userBalance 
}: {
  match: GameMatch;
  onJoin: (matchId: string) => void;
  userBalance: number;
}) => {
  // Memoize time formatting
  const timeAgo = useMemo(() => 
    formatTimeAgo(match.createdAt), 
    [match.createdAt]
  );

  const handleJoin = useCallback(() => {
    onJoin(match.id);
  }, [match.id, onJoin]);

  const canJoin = useMemo(() => 
    userBalance >= match.betAmount, 
    [userBalance, match.betAmount]
  );

  return (
    <motion.div 
      className="match-item"
      layout
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
    >
      <MatchInfo match={match} timeAgo={timeAgo} />
      <JoinButton 
        onJoin={handleJoin}
        betAmount={match.betAmount}
        canJoin={canJoin}
      />
    </motion.div>
  );
}, (prevProps, nextProps) => {
  return (
    prevProps.match.id === nextProps.match.id &&
    prevProps.match.updatedAt.getTime() === nextProps.match.updatedAt.getTime() &&
    prevProps.userBalance === nextProps.userBalance
  );
});

GameLobby.displayName = 'GameLobby';
export default GameLobby;
```

## useMemo and useCallback Best Practices

### 1. When to Use useMemo

#### ✅ Good Use Cases:
```typescript
// Expensive calculations
const expensiveValue = useMemo(() => {
  return heavyComputation(data);
}, [data]);

// Object/array creation in render
const config = useMemo(() => ({
  option1: value1,
  option2: value2
}), [value1, value2]);

// Filtering/sorting large lists
const filteredItems = useMemo(() => {
  return items.filter(item => item.active);
}, [items]);
```

#### ❌ Avoid useMemo for:
```typescript
// Simple calculations
const simpleValue = useMemo(() => a + b, [a, b]); // Not needed

// Always changing dependencies  
const alwaysNew = useMemo(() => ({ time: Date.now() }), [Date.now()]); // Pointless
```

### 2. When to Use useCallback

#### ✅ Good Use Cases:
```typescript
// Event handlers passed to memoized children
const handleClick = useCallback((id: string) => {
  onClick(id);
}, [onClick]);

// Dependencies for other hooks
const fetchData = useCallback(async () => {
  const data = await api.fetchData(id);
  setData(data);
}, [id]);

useEffect(() => {
  fetchData();
}, [fetchData]);
```

#### ❌ Avoid useCallback for:
```typescript
// No dependencies
const handleClick = useCallback(() => {
  console.log('clicked');
}, []); // Not needed if no children care

// Handlers not passed to children
const localHandler = useCallback(() => {
  // local logic
}, [dep]); // Unnecessary optimization
```

## Performance Monitoring Hooks

### 1. Component Render Tracking

```typescript
// src/hooks/useRenderTracker.ts
export const useRenderTracker = (componentName: string) => {
  const renderCount = useRef(0);
  const lastRender = useRef(Date.now());
  
  useEffect(() => {
    renderCount.current++;
    const now = Date.now();
    const timeSinceLastRender = now - lastRender.current;
    
    console.log(`${componentName} render #${renderCount.current} (${timeSinceLastRender}ms since last)`);
    lastRender.current = now;
  });

  return renderCount.current;
};
```

### 2. Performance Profiling Hook

```typescript
// src/hooks/usePerformanceProfiler.ts
export const usePerformanceProfiler = (name: string) => {
  const startTime = useRef(performance.now());
  
  useEffect(() => {
    const endTime = performance.now();
    const renderTime = endTime - startTime.current;
    
    if (renderTime > 16) { // More than 1 frame
      console.warn(`${name} slow render: ${renderTime.toFixed(2)}ms`);
    }
    
    startTime.current = performance.now();
  });
};
```

## Component Optimization Checklist

### For Each Component:
- [ ] **Identify re-render causes**: Use React DevTools Profiler
- [ ] **Add React.memo**: If component receives props that don't change often
- [ ] **Optimize prop creation**: Move object/function creation outside render
- [ ] **Use granular selectors**: Subscribe only to needed state slices  
- [ ] **Memoize calculations**: Use useMemo for expensive operations
- [ ] **Memoize event handlers**: Use useCallback for handlers passed to children
- [ ] **Split large components**: Break into smaller, focused components
- [ ] **Add performance monitoring**: Track render count and timing
- [ ] **Test with React.StrictMode**: Ensure no side effects in render
- [ ] **Verify with DevTools**: Confirm reduced re-renders

### Performance Targets:
- **<16ms** component render time (60fps)
- **<5 re-renders** per state change
- **<100ms** interaction response time
- **Stable memory** usage over time

This component optimization guide ensures the gaming application maintains smooth 60fps performance while providing responsive user interactions.