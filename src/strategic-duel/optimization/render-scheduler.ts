/**
 * Advanced Render Scheduler for Strategic Duel
 * Achieves consistent 60fps with frame budget management and priority-based rendering
 */

export interface RenderTask {
  id: string;
  priority: 'critical' | 'high' | 'normal' | 'low' | 'background';
  execute: () => Promise<void> | void;
  estimatedTime: number;
  deadline?: number;
  dependencies?: string[];
  retries: number;
  maxRetries: number;
  onComplete?: (task: RenderTask) => void;
  onError?: (task: RenderTask, error: Error) => void;
}

export interface FrameBudget {
  totalBudget: number;
  usedBudget: number;
  remainingBudget: number;
  overrunCount: number;
  averageFrameTime: number;
  targetFrameRate: number;
}

export interface RenderMetrics {
  fps: number;
  averageFrameTime: number;
  frameTimeVariance: number;
  droppedFrames: number;
  totalFrames: number;
  tasksExecuted: number;
  tasksSkipped: number;
  budgetOverruns: number;
  gpuUtilization: number;
  memoryUsage: number;
}

export interface RenderSchedulerOptions {
  targetFPS: number;
  frameBudgetMs: number;
  adaptiveBudget: boolean;
  priorityThresholds: {
    critical: number;
    high: number;
    normal: number;
    low: number;
  };
  maxTasksPerFrame: number;
  enableProfiling: boolean;
  vsyncEnabled: boolean;
}

/**
 * Frame timing and budget management
 */
class FrameBudgetManager {
  private targetFrameTime: number;
  private currentBudget: FrameBudget;
  private frameHistory: number[] = [];
  private maxHistorySize: number = 120; // 2 seconds at 60fps
  private adaptiveBudgetEnabled: boolean;

  constructor(targetFPS: number, adaptiveBudget: boolean = true) {
    this.targetFrameTime = 1000 / targetFPS;
    this.adaptiveBudgetEnabled = adaptiveBudget;
    
    this.currentBudget = {
      totalBudget: this.targetFrameTime * 0.8, // Reserve 20% for browser overhead
      usedBudget: 0,
      remainingBudget: this.targetFrameTime * 0.8,
      overrunCount: 0,
      averageFrameTime: this.targetFrameTime,
      targetFrameRate: targetFPS
    };
  }

  /**
   * Start new frame budget calculation
   */
  startFrame(): FrameBudget {
    const adaptedBudget = this.adaptiveBudgetEnabled ? 
      this.calculateAdaptiveBudget() : 
      this.targetFrameTime * 0.8;

    this.currentBudget = {
      totalBudget: adaptedBudget,
      usedBudget: 0,
      remainingBudget: adaptedBudget,
      overrunCount: this.currentBudget.overrunCount,
      averageFrameTime: this.currentBudget.averageFrameTime,
      targetFrameRate: this.currentBudget.targetFrameRate
    };

    return { ...this.currentBudget };
  }

  /**
   * Update budget with task execution time
   */
  updateBudget(executionTime: number): void {
    this.currentBudget.usedBudget += executionTime;
    this.currentBudget.remainingBudget = Math.max(0, 
      this.currentBudget.totalBudget - this.currentBudget.usedBudget
    );
  }

  /**
   * Complete frame and update metrics
   */
  completeFrame(totalFrameTime: number): void {
    this.frameHistory.push(totalFrameTime);
    
    // Maintain history size
    if (this.frameHistory.length > this.maxHistorySize) {
      this.frameHistory = this.frameHistory.slice(-this.maxHistorySize);
    }

    // Update average frame time
    this.currentBudget.averageFrameTime = this.frameHistory.reduce((sum, time) => sum + time, 0) / 
      this.frameHistory.length;

    // Track budget overruns
    if (totalFrameTime > this.targetFrameTime) {
      this.currentBudget.overrunCount++;
    }
  }

  /**
   * Calculate adaptive budget based on recent performance
   */
  private calculateAdaptiveBudget(): number {
    if (this.frameHistory.length < 10) {
      return this.targetFrameTime * 0.8;
    }

    const recentFrames = this.frameHistory.slice(-10);
    const averageTime = recentFrames.reduce((sum, time) => sum + time, 0) / recentFrames.length;
    const variance = this.calculateVariance(recentFrames);

    // Adjust budget based on stability
    let budgetMultiplier = 0.8;
    
    if (variance < 2 && averageTime < this.targetFrameTime * 0.9) {
      // Very stable, can increase budget
      budgetMultiplier = 0.85;
    } else if (variance > 5 || averageTime > this.targetFrameTime * 1.1) {
      // Unstable or slow, decrease budget
      budgetMultiplier = 0.7;
    }

    return this.targetFrameTime * budgetMultiplier;
  }

  /**
   * Calculate variance of frame times
   */
  private calculateVariance(values: number[]): number {
    const mean = values.reduce((sum, val) => sum + val, 0) / values.length;
    const squaredDiffs = values.map(val => Math.pow(val - mean, 2));
    return squaredDiffs.reduce((sum, diff) => sum + diff, 0) / values.length;
  }

  /**
   * Check if budget allows for task execution
   */
  canExecuteTask(estimatedTime: number): boolean {
    return this.currentBudget.remainingBudget >= estimatedTime;
  }

  /**
   * Get current budget status
   */
  getCurrentBudget(): FrameBudget {
    return { ...this.currentBudget };
  }
}

/**
 * Task priority queue with dependency management
 */
class TaskQueue {
  private queues: Map<string, RenderTask[]> = new Map([
    ['critical', []],
    ['high', []],
    ['normal', []],
    ['low', []],
    ['background', []]
  ]);
  
  private dependencyGraph: Map<string, Set<string>> = new Map();
  private completedTasks: Set<string> = new Set();

  /**
   * Add task to appropriate priority queue
   */
  addTask(task: RenderTask): void {
    const queue = this.queues.get(task.priority);
    if (!queue) {
      throw new Error(`Invalid priority: ${task.priority}`);
    }

    // Insert task based on deadline (if specified)
    if (task.deadline) {
      const insertIndex = queue.findIndex(t => !t.deadline || t.deadline > task.deadline!);
      if (insertIndex === -1) {
        queue.push(task);
      } else {
        queue.splice(insertIndex, 0, task);
      }
    } else {
      queue.push(task);
    }

    // Update dependency graph
    if (task.dependencies) {
      this.dependencyGraph.set(task.id, new Set(task.dependencies));
    }
  }

  /**
   * Get next executable task considering dependencies and priority
   */
  getNextTask(budget: FrameBudget): RenderTask | null {
    for (const priority of ['critical', 'high', 'normal', 'low', 'background']) {
      const queue = this.queues.get(priority);
      if (!queue || queue.length === 0) continue;

      for (let i = 0; i < queue.length; i++) {
        const task = queue[i];
        
        // Check if task can fit in remaining budget
        if (task.estimatedTime > budget.remainingBudget && priority !== 'critical') {
          continue;
        }

        // Check if dependencies are satisfied
        if (this.areDependenciesSatisfied(task)) {
          // Remove from queue and return
          queue.splice(i, 1);
          return task;
        }
      }
    }

    return null;
  }

  /**
   * Check if task dependencies are satisfied
   */
  private areDependenciesSatisfied(task: RenderTask): boolean {
    if (!task.dependencies || task.dependencies.length === 0) {
      return true;
    }

    const dependencies = this.dependencyGraph.get(task.id);
    if (!dependencies) return true;

    for (const dep of dependencies) {
      if (!this.completedTasks.has(dep)) {
        return false;
      }
    }

    return true;
  }

  /**
   * Mark task as completed
   */
  markCompleted(taskId: string): void {
    this.completedTasks.add(taskId);
  }

  /**
   * Remove task from queue
   */
  removeTask(taskId: string): boolean {
    for (const queue of this.queues.values()) {
      const index = queue.findIndex(t => t.id === taskId);
      if (index !== -1) {
        queue.splice(index, 1);
        return true;
      }
    }
    return false;
  }

  /**
   * Get queue statistics
   */
  getStats(): any {
    const stats: any = {};
    for (const [priority, queue] of this.queues) {
      stats[priority] = {
        count: queue.length,
        totalEstimatedTime: queue.reduce((sum, task) => sum + task.estimatedTime, 0)
      };
    }
    return stats;
  }

  /**
   * Clear all queues
   */
  clear(): void {
    for (const queue of this.queues.values()) {
      queue.length = 0;
    }
    this.dependencyGraph.clear();
    this.completedTasks.clear();
  }

  /**
   * Get total task count across all queues
   */
  getTotalTaskCount(): number {
    return Array.from(this.queues.values()).reduce((total, queue) => total + queue.length, 0);
  }
}

/**
 * Performance profiler for render tasks
 */
class RenderProfiler {
  private taskProfiles: Map<string, number[]> = new Map();
  private frameProfiles: number[] = [];
  private gpuMemoryUsage: number[] = [];
  private enabled: boolean = false;

  constructor(enabled: boolean = false) {
    this.enabled = enabled;
  }

  /**
   * Start profiling a task
   */
  startTask(taskId: string): number {
    if (!this.enabled) return 0;
    return performance.now();
  }

  /**
   * End profiling a task
   */
  endTask(taskId: string, startTime: number): number {
    if (!this.enabled) return 0;
    
    const executionTime = performance.now() - startTime;
    
    if (!this.taskProfiles.has(taskId)) {
      this.taskProfiles.set(taskId, []);
    }
    
    const profile = this.taskProfiles.get(taskId)!;
    profile.push(executionTime);
    
    // Keep only recent measurements
    if (profile.length > 100) {
      profile.splice(0, profile.length - 100);
    }

    return executionTime;
  }

  /**
   * Profile frame execution
   */
  profileFrame(frameTime: number): void {
    if (!this.enabled) return;
    
    this.frameProfiles.push(frameTime);
    
    // Keep only recent frames
    if (this.frameProfiles.length > 300) {
      this.frameProfiles.splice(0, this.frameProfiles.length - 300);
    }
  }

  /**
   * Update GPU memory usage
   */
  updateGPUMemory(memoryMB: number): void {
    if (!this.enabled) return;
    
    this.gpuMemoryUsage.push(memoryMB);
    
    if (this.gpuMemoryUsage.length > 60) {
      this.gpuMemoryUsage.splice(0, this.gpuMemoryUsage.length - 60);
    }
  }

  /**
   * Get task performance statistics
   */
  getTaskStats(taskId: string): any {
    const profile = this.taskProfiles.get(taskId);
    if (!profile || profile.length === 0) {
      return null;
    }

    const sorted = [...profile].sort((a, b) => a - b);
    return {
      count: profile.length,
      average: profile.reduce((sum, time) => sum + time, 0) / profile.length,
      median: sorted[Math.floor(sorted.length / 2)],
      p95: sorted[Math.floor(sorted.length * 0.95)],
      p99: sorted[Math.floor(sorted.length * 0.99)],
      min: Math.min(...profile),
      max: Math.max(...profile)
    };
  }

  /**
   * Get overall performance report
   */
  getPerformanceReport(): any {
    if (!this.enabled) return null;

    const taskStats: any = {};
    for (const [taskId, profile] of this.taskProfiles) {
      if (profile.length > 0) {
        taskStats[taskId] = this.getTaskStats(taskId);
      }
    }

    return {
      tasks: taskStats,
      frames: {
        count: this.frameProfiles.length,
        averageFrameTime: this.frameProfiles.length > 0 ? 
          this.frameProfiles.reduce((sum, time) => sum + time, 0) / this.frameProfiles.length : 0,
        fps: this.frameProfiles.length > 0 ? 
          1000 / (this.frameProfiles.reduce((sum, time) => sum + time, 0) / this.frameProfiles.length) : 0
      },
      memory: {
        current: this.gpuMemoryUsage.length > 0 ? this.gpuMemoryUsage[this.gpuMemoryUsage.length - 1] : 0,
        average: this.gpuMemoryUsage.length > 0 ? 
          this.gpuMemoryUsage.reduce((sum, mem) => sum + mem, 0) / this.gpuMemoryUsage.length : 0,
        peak: this.gpuMemoryUsage.length > 0 ? Math.max(...this.gpuMemoryUsage) : 0
      }
    };
  }

  /**
   * Clear all profiling data
   */
  clear(): void {
    this.taskProfiles.clear();
    this.frameProfiles.length = 0;
    this.gpuMemoryUsage.length = 0;
  }

  /**
   * Enable or disable profiling
   */
  setEnabled(enabled: boolean): void {
    this.enabled = enabled;
    if (!enabled) {
      this.clear();
    }
  }
}

/**
 * Main Render Scheduler class
 */
export class RenderScheduler {
  private budgetManager: FrameBudgetManager;
  private taskQueue: TaskQueue;
  private profiler: RenderProfiler;
  private options: RenderSchedulerOptions;
  private metrics: RenderMetrics;
  private isRunning: boolean = false;
  private rafId: number | null = null;
  private frameStartTime: number = 0;
  private lastFrameTime: number = 0;

  constructor(options: Partial<RenderSchedulerOptions> = {}) {
    this.options = {
      targetFPS: 60,
      frameBudgetMs: 16.67, // 60fps = 16.67ms per frame
      adaptiveBudget: true,
      priorityThresholds: {
        critical: 1000, // Always execute
        high: 8,        // 8ms threshold
        normal: 4,      // 4ms threshold
        low: 2          // 2ms threshold
      },
      maxTasksPerFrame: 20,
      enableProfiling: false,
      vsyncEnabled: true,
      ...options
    };

    this.budgetManager = new FrameBudgetManager(this.options.targetFPS, this.options.adaptiveBudget);
    this.taskQueue = new TaskQueue();
    this.profiler = new RenderProfiler(this.options.enableProfiling);
    this.metrics = this.initializeMetrics();

    // Bind methods
    this.renderLoop = this.renderLoop.bind(this);
  }

  /**
   * Initialize performance metrics
   */
  private initializeMetrics(): RenderMetrics {
    return {
      fps: 0,
      averageFrameTime: 0,
      frameTimeVariance: 0,
      droppedFrames: 0,
      totalFrames: 0,
      tasksExecuted: 0,
      tasksSkipped: 0,
      budgetOverruns: 0,
      gpuUtilization: 0,
      memoryUsage: 0
    };
  }

  /**
   * Start the render scheduler
   */
  start(): void {
    if (this.isRunning) return;
    
    this.isRunning = true;
    this.lastFrameTime = performance.now();
    
    if (this.options.vsyncEnabled && 'requestAnimationFrame' in window) {
      this.rafId = requestAnimationFrame(this.renderLoop);
    } else {
      // Fallback to setTimeout for non-browser environments
      setTimeout(this.renderLoop, this.options.frameBudgetMs);
    }
  }

  /**
   * Stop the render scheduler
   */
  stop(): void {
    this.isRunning = false;
    
    if (this.rafId !== null) {
      cancelAnimationFrame(this.rafId);
      this.rafId = null;
    }
  }

  /**
   * Add render task to queue
   */
  scheduleTask(task: RenderTask): void {
    // Validate task
    if (!task.id || !task.execute) {
      throw new Error('Task must have id and execute function');
    }

    // Set defaults
    task.retries = task.retries || 0;
    task.maxRetries = task.maxRetries || 3;
    task.estimatedTime = task.estimatedTime || 1;

    this.taskQueue.addTask(task);
  }

  /**
   * Schedule multiple tasks
   */
  scheduleTasks(tasks: RenderTask[]): void {
    tasks.forEach(task => this.scheduleTask(task));
  }

  /**
   * Remove task from queue
   */
  cancelTask(taskId: string): boolean {
    return this.taskQueue.removeTask(taskId);
  }

  /**
   * Main render loop
   */
  private async renderLoop(): Promise<void> {
    if (!this.isRunning) return;

    const frameStartTime = performance.now();
    this.frameStartTime = frameStartTime;
    
    // Calculate frame delta
    const deltaTime = frameStartTime - this.lastFrameTime;
    this.lastFrameTime = frameStartTime;

    // Start frame budget
    const budget = this.budgetManager.startFrame();
    
    // Execute tasks within budget
    let tasksExecuted = 0;
    let tasksSkipped = 0;

    while (tasksExecuted < this.options.maxTasksPerFrame && budget.remainingBudget > 0) {
      const task = this.taskQueue.getNextTask(budget);
      if (!task) break;

      // Check if task fits in remaining budget (unless critical)
      if (task.priority !== 'critical' && 
          task.estimatedTime > budget.remainingBudget) {
        tasksSkipped++;
        continue;
      }

      // Execute task
      const executed = await this.executeTask(task, budget);
      if (executed) {
        tasksExecuted++;
      }
    }

    // Complete frame
    const totalFrameTime = performance.now() - frameStartTime;
    this.budgetManager.completeFrame(totalFrameTime);
    
    // Update metrics
    this.updateMetrics(totalFrameTime, deltaTime, tasksExecuted, tasksSkipped);
    
    // Profile frame
    this.profiler.profileFrame(totalFrameTime);

    // Schedule next frame
    if (this.isRunning) {
      if (this.options.vsyncEnabled && 'requestAnimationFrame' in window) {
        this.rafId = requestAnimationFrame(this.renderLoop);
      } else {
        const nextFrameDelay = Math.max(0, this.options.frameBudgetMs - totalFrameTime);
        setTimeout(this.renderLoop, nextFrameDelay);
      }
    }
  }

  /**
   * Execute individual render task
   */
  private async executeTask(task: RenderTask, budget: FrameBudget): Promise<boolean> {
    const taskStartTime = this.profiler.startTask(task.id);

    try {
      // Execute task
      await task.execute();
      
      // Mark as completed
      this.taskQueue.markCompleted(task.id);
      
      // Update budget with actual execution time
      const executionTime = this.profiler.endTask(task.id, taskStartTime);
      this.budgetManager.updateBudget(executionTime);
      
      // Call completion callback
      if (task.onComplete) {
        task.onComplete(task);
      }

      return true;

    } catch (error) {
      const executionTime = this.profiler.endTask(task.id, taskStartTime);
      this.budgetManager.updateBudget(executionTime);
      
      // Handle task error
      if (task.retries < task.maxRetries) {
        // Retry task
        task.retries++;
        this.taskQueue.addTask(task);
      } else if (task.onError) {
        // Call error callback
        task.onError(task, error as Error);
      }

      return false;
    }
  }

  /**
   * Update performance metrics
   */
  private updateMetrics(frameTime: number, deltaTime: number, tasksExecuted: number, tasksSkipped: number): void {
    this.metrics.totalFrames++;
    this.metrics.tasksExecuted += tasksExecuted;
    this.metrics.tasksSkipped += tasksSkipped;

    // Update FPS (exponential moving average)
    const instantFPS = 1000 / deltaTime;
    this.metrics.fps = this.metrics.fps === 0 ? instantFPS : 
      0.1 * instantFPS + 0.9 * this.metrics.fps;

    // Update average frame time
    this.metrics.averageFrameTime = this.metrics.averageFrameTime === 0 ? frameTime :
      0.1 * frameTime + 0.9 * this.metrics.averageFrameTime;

    // Track dropped frames
    if (deltaTime > this.options.frameBudgetMs * 1.5) {
      this.metrics.droppedFrames++;
    }

    // Track budget overruns
    if (frameTime > this.options.frameBudgetMs) {
      this.metrics.budgetOverruns++;
    }

    // Update GPU utilization estimate
    this.metrics.gpuUtilization = Math.min(100, (frameTime / this.options.frameBudgetMs) * 100);
  }

  /**
   * Get current performance metrics
   */
  getMetrics(): RenderMetrics {
    return { ...this.metrics };
  }

  /**
   * Get current frame budget
   */
  getCurrentBudget(): FrameBudget {
    return this.budgetManager.getCurrentBudget();
  }

  /**
   * Get task queue statistics
   */
  getQueueStats(): any {
    return this.taskQueue.getStats();
  }

  /**
   * Get performance profiling report
   */
  getProfilingReport(): any {
    return this.profiler.getPerformanceReport();
  }

  /**
   * Optimize scheduler settings based on current performance
   */
  optimizeSettings(): void {
    const metrics = this.getMetrics();
    
    // Adjust max tasks per frame based on performance
    if (metrics.averageFrameTime < this.options.frameBudgetMs * 0.8) {
      // Running well, can increase task limit
      this.options.maxTasksPerFrame = Math.min(50, this.options.maxTasksPerFrame + 2);
    } else if (metrics.averageFrameTime > this.options.frameBudgetMs * 1.1) {
      // Running slow, decrease task limit
      this.options.maxTasksPerFrame = Math.max(5, this.options.maxTasksPerFrame - 2);
    }

    // Adjust priority thresholds based on budget usage
    const budget = this.getCurrentBudget();
    const budgetUsageRatio = budget.usedBudget / budget.totalBudget;
    
    if (budgetUsageRatio > 0.9) {
      // High budget usage, make thresholds more strict
      for (const priority in this.options.priorityThresholds) {
        if (priority !== 'critical') {
          this.options.priorityThresholds[priority as keyof typeof this.options.priorityThresholds] *= 0.9;
        }
      }
    } else if (budgetUsageRatio < 0.6) {
      // Low budget usage, relax thresholds
      for (const priority in this.options.priorityThresholds) {
        if (priority !== 'critical') {
          this.options.priorityThresholds[priority as keyof typeof this.options.priorityThresholds] *= 1.1;
        }
      }
    }
  }

  /**
   * Clear all tasks and reset scheduler
   */
  reset(): void {
    this.taskQueue.clear();
    this.metrics = this.initializeMetrics();
    this.profiler.clear();
  }

  /**
   * Enable or disable profiling
   */
  setProfilingEnabled(enabled: boolean): void {
    this.profiler.setEnabled(enabled);
    this.options.enableProfiling = enabled;
  }

  /**
   * Get time remaining in current frame
   */
  getRemainingFrameTime(): number {
    if (!this.isRunning) return this.options.frameBudgetMs;
    
    const elapsed = performance.now() - this.frameStartTime;
    return Math.max(0, this.options.frameBudgetMs - elapsed);
  }

  /**
   * Check if scheduler can accept more tasks this frame
   */
  canScheduleMoreTasks(): boolean {
    const budget = this.getCurrentBudget();
    const queueStats = this.getQueueStats();
    const totalPendingTasks = Object.values(queueStats).reduce((sum, stat: any) => sum + stat.count, 0);
    
    return budget.remainingBudget > 1 && totalPendingTasks < this.options.maxTasksPerFrame;
  }
}

// Export singleton instance for global use
export const renderScheduler = new RenderScheduler();