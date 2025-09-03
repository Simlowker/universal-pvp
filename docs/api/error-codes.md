# SOL Duel Error Codes and Handling Guide

## Overview

SOL Duel uses standardized HTTP status codes combined with detailed error objects to provide clear feedback about API failures. This guide covers all error types, their meanings, and recommended handling strategies.

## Error Response Format

All API errors follow a consistent JSON structure:

```json
{
  "error": "Error Category",
  "message": "Human-readable error description",
  "details": "Additional technical details (optional)",
  "code": "SPECIFIC_ERROR_CODE",
  "timestamp": "2023-12-01T10:00:00.000Z",
  "path": "/api/endpoint",
  "requestId": "req_123456789"
}
```

### Error Response Fields

| Field | Type | Description |
|-------|------|-------------|
| `error` | string | High-level error category |
| `message` | string | User-friendly error message |
| `details` | string | Technical details (optional) |
| `code` | string | Specific error code for programmatic handling |
| `timestamp` | string | ISO 8601 timestamp of error |
| `path` | string | API endpoint where error occurred |
| `requestId` | string | Unique identifier for debugging |

## HTTP Status Codes

### 2xx Success
- **200 OK**: Request successful
- **201 Created**: Resource created successfully
- **204 No Content**: Request successful, no response body

### 4xx Client Errors
- **400 Bad Request**: Invalid request data
- **401 Unauthorized**: Authentication required or invalid
- **403 Forbidden**: Access denied with valid authentication
- **404 Not Found**: Resource does not exist
- **405 Method Not Allowed**: HTTP method not supported
- **409 Conflict**: Resource conflict (e.g., duplicate data)
- **422 Unprocessable Entity**: Validation errors
- **429 Too Many Requests**: Rate limit exceeded

### 5xx Server Errors
- **500 Internal Server Error**: Unexpected server error
- **502 Bad Gateway**: Upstream service error
- **503 Service Unavailable**: Server temporarily unavailable
- **504 Gateway Timeout**: Upstream service timeout

## Authentication Errors (401)

### AUTH_001: Invalid Token
```json
{
  "error": "Authentication Failed",
  "message": "Invalid or expired authentication token",
  "code": "AUTH_001",
  "details": "JWT token has expired or is malformed"
}
```

**Causes:**
- Expired JWT token
- Malformed token
- Token signature validation failed

**Handling:**
```typescript
if (error.code === 'AUTH_001') {
  // Clear stored auth data
  localStorage.removeItem('sol_duel_token');
  // Redirect to login
  window.location.href = '/login';
}
```

### AUTH_002: Missing Token
```json
{
  "error": "Authentication Failed", 
  "message": "Authentication token required",
  "code": "AUTH_002",
  "details": "Authorization header missing or empty"
}
```

### AUTH_003: Invalid Credentials
```json
{
  "error": "Authentication Failed",
  "message": "Invalid email or password", 
  "code": "AUTH_003",
  "details": "Email not found or password incorrect"
}
```

### AUTH_004: Wallet Verification Failed
```json
{
  "error": "Wallet Verification Failed",
  "message": "Invalid wallet signature",
  "code": "AUTH_004", 
  "details": "Signature verification failed for provided message"
}
```

**Handling:**
```typescript
async function handleWalletAuth() {
  try {
    await verifyWallet(signature, message);
  } catch (error) {
    if (error.code === 'AUTH_004') {
      alert('Wallet signature verification failed. Please try again.');
      // Request new signature
      requestWalletSignature();
    }
  }
}
```

## Validation Errors (400/422)

### VAL_001: Required Field Missing
```json
{
  "error": "Validation Error",
  "message": "Required field missing",
  "code": "VAL_001",
  "details": "Field 'username' is required but was not provided",
  "field": "username"
}
```

### VAL_002: Invalid Field Format
```json
{
  "error": "Validation Error", 
  "message": "Invalid field format",
  "code": "VAL_002",
  "details": "Field 'email' must be a valid email address",
  "field": "email",
  "value": "invalid-email"
}
```

### VAL_003: Field Length Error
```json
{
  "error": "Validation Error",
  "message": "Field length constraint violation", 
  "code": "VAL_003",
  "details": "Username must be between 3 and 30 characters",
  "field": "username",
  "min": 3,
  "max": 30,
  "actual": 2
}
```

### VAL_004: Invalid Wallet Address
```json
{
  "error": "Validation Error",
  "message": "Invalid Solana wallet address",
  "code": "VAL_004",
  "details": "Wallet address must be a valid Base58 encoded public key"
}
```

**Validation Error Handling:**
```typescript
function handleValidationError(error: any) {
  const fieldErrors: Record<string, string> = {};
  
  if (error.code?.startsWith('VAL_')) {
    fieldErrors[error.field] = error.message;
  }
  
  // Display field-specific errors in form
  setFormErrors(fieldErrors);
}
```

## Game Logic Errors (400)

### GAME_001: Match Not Found
```json
{
  "error": "Game Error",
  "message": "Match not found",
  "code": "GAME_001", 
  "details": "No match exists with the provided ID",
  "matchId": "game_12345"
}
```

### GAME_002: Match Full
```json
{
  "error": "Game Error",
  "message": "Match is full",
  "code": "GAME_002",
  "details": "Cannot join match - maximum players reached",
  "maxPlayers": 2,
  "currentPlayers": 2
}
```

### GAME_003: Already In Match
```json
{
  "error": "Game Error", 
  "message": "Player already in match",
  "code": "GAME_003",
  "details": "Cannot join multiple matches simultaneously"
}
```

### GAME_004: Insufficient Balance
```json
{
  "error": "Game Error",
  "message": "Insufficient balance for entry fee", 
  "code": "GAME_004",
  "details": "Player balance is below required entry fee",
  "required": 0.1,
  "available": 0.05,
  "currency": "SOL"
}
```

### GAME_005: Invalid Turn
```json
{
  "error": "Game Error",
  "message": "Not player's turn",
  "code": "GAME_005", 
  "details": "Cannot make move when it's not your turn",
  "currentTurn": "player_456",
  "requestingPlayer": "player_123"
}
```

### GAME_006: Invalid Move
```json
{
  "error": "Game Error",
  "message": "Invalid move or action",
  "code": "GAME_006",
  "details": "Move validation failed",
  "moveType": "attack",
  "reason": "Insufficient mana"
}
```

**Game Error Handling:**
```typescript
function handleGameError(error: any) {
  switch (error.code) {
    case 'GAME_001':
      // Match not found - redirect to lobby
      router.push('/lobby');
      break;
      
    case 'GAME_002':
      // Match full - show alternative matches
      showAlternativeMatches();
      break;
      
    case 'GAME_004':
      // Insufficient balance - show deposit options
      showDepositModal(error.required - error.available);
      break;
      
    case 'GAME_005':
      // Not player's turn - update UI state
      setIsMyTurn(false);
      break;
      
    case 'GAME_006':
      // Invalid move - show error and allow retry
      showMoveError(error.details);
      break;
  }
}
```

## Resource Conflicts (409)

### CONF_001: Username Taken
```json
{
  "error": "Conflict",
  "message": "Username already exists",
  "code": "CONF_001",
  "details": "A user with this username already exists",
  "username": "shadowgamer"
}
```

### CONF_002: Email Exists
```json
{
  "error": "Conflict", 
  "message": "Email address already registered",
  "code": "CONF_002",
  "details": "An account with this email already exists"
}
```

### CONF_003: Wallet Already Linked
```json
{
  "error": "Conflict",
  "message": "Wallet already linked to another account", 
  "code": "CONF_003",
  "details": "This wallet address is already associated with a different user"
}
```

## Access Control Errors (403)

### ACCESS_001: Wallet Not Verified
```json
{
  "error": "Access Denied",
  "message": "Wallet verification required",
  "code": "ACCESS_001",
  "details": "Please verify your wallet to access this feature"
}
```

### ACCESS_002: Insufficient Permissions
```json
{
  "error": "Access Denied",
  "message": "Insufficient permissions",
  "code": "ACCESS_002", 
  "details": "User does not have required permissions for this action",
  "required": "admin",
  "current": "player"
}
```

### ACCESS_003: Private Match Access
```json
{
  "error": "Access Denied",
  "message": "Private match access denied",
  "code": "ACCESS_003",
  "details": "You are not invited to this private match"
}
```

## Rate Limiting Errors (429)

### RATE_001: API Rate Limit
```json
{
  "error": "Rate Limit Exceeded", 
  "message": "Too many requests",
  "code": "RATE_001",
  "details": "API rate limit exceeded",
  "limit": 100,
  "remaining": 0,
  "resetTime": "2023-12-01T11:00:00.000Z"
}
```

### RATE_002: Game Action Rate Limit  
```json
{
  "error": "Rate Limit Exceeded",
  "message": "Too many game actions",
  "code": "RATE_002",
  "details": "Game action rate limit exceeded", 
  "limit": 1,
  "resetTime": "2023-12-01T10:01:00.000Z"
}
```

**Rate Limit Handling:**
```typescript
function handleRateLimit(error: any) {
  const resetTime = new Date(error.resetTime);
  const waitTime = resetTime.getTime() - Date.now();
  
  if (waitTime > 0) {
    setTimeout(() => {
      // Retry the request
      retryRequest();
    }, waitTime);
    
    showNotification(`Rate limit exceeded. Retrying in ${Math.ceil(waitTime / 1000)} seconds.`);
  }
}
```

## Server Errors (5xx)

### SRV_001: Database Connection Error
```json
{
  "error": "Internal Server Error",
  "message": "Database connection failed", 
  "code": "SRV_001",
  "details": "Unable to connect to database server"
}
```

### SRV_002: Blockchain Network Error
```json
{
  "error": "Internal Server Error",
  "message": "Solana network error",
  "code": "SRV_002", 
  "details": "Failed to connect to Solana RPC endpoint"
}
```

### SRV_003: WebSocket Connection Error
```json
{
  "error": "Service Unavailable",
  "message": "Real-time service unavailable",
  "code": "SRV_003",
  "details": "WebSocket service is temporarily unavailable"
}
```

## WebSocket Error Events

### WS_001: Connection Failed
```json
{
  "event": "connect_error", 
  "error": {
    "code": "WS_001",
    "message": "WebSocket connection failed",
    "details": "Unable to establish WebSocket connection"
  }
}
```

### WS_002: Authentication Failed
```json
{
  "event": "auth_error",
  "error": {
    "code": "WS_002", 
    "message": "WebSocket authentication failed",
    "details": "Invalid or expired token provided"
  }
}
```

### WS_003: Game State Error
```json
{
  "event": "error",
  "error": {
    "code": "WS_003",
    "message": "Game state synchronization error", 
    "details": "Failed to sync game state with server"
  }
}
```

**WebSocket Error Handling:**
```typescript
websocket.on('connect_error', (error) => {
  if (error.code === 'WS_001') {
    // Implement exponential backoff
    const delay = Math.min(1000 * Math.pow(2, reconnectAttempts), 30000);
    setTimeout(() => {
      websocket.connect(token);
    }, delay);
  }
});

websocket.on('auth_error', (error) => {
  if (error.code === 'WS_002') {
    // Refresh token and reconnect
    refreshToken().then(() => {
      websocket.connect(newToken);
    });
  }
});
```

## Solana Program Errors

### Smart Contract Error Codes (6000-6999)

| Code | Name | Description | Recovery Action |
|------|------|-------------|-----------------|
| 6000 | InvalidMatchConfig | Invalid match configuration | Check match parameters |
| 6001 | MatchFull | Match has reached max players | Find alternative match |
| 6002 | InsufficientBalance | Not enough SOL for entry fee | Add funds to wallet |
| 6003 | NotPlayerTurn | Action attempted when not player's turn | Wait for turn |
| 6004 | PlayerNotAlive | Dead player attempted action | Game over for player |
| 6005 | InvalidTarget | Invalid attack target | Choose valid target |
| 6006 | InsufficientMana | Not enough mana for action | Use different action |
| 6007 | TurnTimeoutExceeded | Turn time limit exceeded | Action rejected |
| 6008 | MatchNotActive | Match not in active state | Wait for match start |
| 6009 | InvalidGameState | Inconsistent game state | Contact support |
| 6010 | Unauthorized | Unauthorized program access | Check permissions |

**Solana Error Handling:**
```typescript
function handleSolanaError(error: any) {
  const anchorError = error.error || error;
  const errorCode = anchorError.errorCode;
  
  switch (errorCode) {
    case 6002: // InsufficientBalance
      showDepositPrompt();
      break;
      
    case 6003: // NotPlayerTurn  
      updateTurnIndicator(false);
      break;
      
    case 6006: // InsufficientMana
      disableManaActions();
      break;
      
    default:
      console.error('Unknown Solana error:', errorCode);
      showGenericError();
  }
}
```

## Error Handling Best Practices

### 1. Comprehensive Error Handler

```typescript
interface APIError {
  error: string;
  message: string;
  code: string;
  details?: string;
  field?: string;
  [key: string]: any;
}

class ErrorHandler {
  static handle(error: APIError | any): void {
    // Log error for debugging
    console.error('API Error:', error);
    
    // Handle by status code first
    if (error.response?.status) {
      this.handleByStatus(error.response.status, error.response.data);
      return;
    }
    
    // Handle by error code
    if (error.code) {
      this.handleByCode(error.code, error);
      return;
    }
    
    // Generic error handling
    this.handleGeneric(error);
  }
  
  private static handleByStatus(status: number, data: APIError): void {
    switch (status) {
      case 401:
        this.handleAuthError(data);
        break;
      case 400:
      case 422:
        this.handleValidationError(data);
        break;
      case 429:
        this.handleRateLimit(data);
        break;
      case 500:
        this.handleServerError(data);
        break;
      default:
        this.handleGeneric(data);
    }
  }
  
  private static handleByCode(code: string, error: APIError): void {
    if (code.startsWith('AUTH_')) {
      this.handleAuthError(error);
    } else if (code.startsWith('VAL_')) {
      this.handleValidationError(error);
    } else if (code.startsWith('GAME_')) {
      this.handleGameError(error);
    } else if (code.startsWith('RATE_')) {
      this.handleRateLimit(error);
    } else {
      this.handleGeneric(error);
    }
  }
  
  private static handleAuthError(error: APIError): void {
    // Clear auth state
    localStorage.removeItem('sol_duel_token');
    localStorage.removeItem('sol_duel_user');
    
    // Show login modal or redirect
    showNotification('Authentication failed. Please log in again.', 'error');
    window.location.href = '/login';
  }
  
  private static handleValidationError(error: APIError): void {
    if (error.field) {
      // Field-specific validation error
      highlightField(error.field, error.message);
    } else {
      // General validation error
      showNotification(error.message, 'warning');
    }
  }
  
  private static handleGameError(error: APIError): void {
    // Game-specific error handling
    showGameNotification(error.message, 'error');
    
    if (error.code === 'GAME_001') {
      // Redirect to lobby if match not found
      window.location.href = '/lobby';
    }
  }
  
  private static handleRateLimit(error: APIError): void {
    const resetTime = error.resetTime ? new Date(error.resetTime) : null;
    const waitTime = resetTime ? resetTime.getTime() - Date.now() : 60000;
    
    showNotification(
      `Rate limit exceeded. Please wait ${Math.ceil(waitTime / 1000)} seconds.`,
      'warning'
    );
  }
  
  private static handleServerError(error: APIError): void {
    showNotification(
      'Server error occurred. Please try again later.',
      'error'
    );
    
    // Report to error tracking service
    this.reportError(error);
  }
  
  private static handleGeneric(error: any): void {
    const message = error.message || 'An unexpected error occurred';
    showNotification(message, 'error');
  }
  
  private static reportError(error: APIError): void {
    // Send to error tracking service (Sentry, LogRocket, etc.)
    // errorTracker.captureException(error);
  }
}

// Usage
try {
  await apiClient.createGame(gameConfig);
} catch (error) {
  ErrorHandler.handle(error);
}
```

### 2. Retry Logic with Exponential Backoff

```typescript
class RetryHandler {
  static async withRetry<T>(
    operation: () => Promise<T>,
    maxRetries: number = 3,
    baseDelay: number = 1000
  ): Promise<T> {
    let lastError: any;
    
    for (let attempt = 0; attempt <= maxRetries; attempt++) {
      try {
        return await operation();
      } catch (error) {
        lastError = error;
        
        // Don't retry on certain errors
        if (this.shouldNotRetry(error)) {
          throw error;
        }
        
        // Don't wait on last attempt
        if (attempt < maxRetries) {
          const delay = baseDelay * Math.pow(2, attempt);
          await this.delay(delay);
        }
      }
    }
    
    throw lastError;
  }
  
  private static shouldNotRetry(error: any): boolean {
    const status = error.response?.status;
    const code = error.response?.data?.code;
    
    // Don't retry client errors (4xx) except rate limits
    if (status >= 400 && status < 500 && status !== 429) {
      return true;
    }
    
    // Don't retry authentication errors
    if (code?.startsWith('AUTH_')) {
      return true;
    }
    
    return false;
  }
  
  private static delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }
}

// Usage
const result = await RetryHandler.withRetry(() => 
  apiClient.getGameDetails(gameId)
);
```

### 3. Circuit Breaker Pattern

```typescript
class CircuitBreaker {
  private failures = 0;
  private lastFailureTime = 0;
  private state: 'closed' | 'open' | 'half-open' = 'closed';
  
  constructor(
    private threshold = 5,
    private timeout = 60000
  ) {}
  
  async execute<T>(operation: () => Promise<T>): Promise<T> {
    if (this.state === 'open') {
      if (Date.now() - this.lastFailureTime >= this.timeout) {
        this.state = 'half-open';
      } else {
        throw new Error('Circuit breaker is open');
      }
    }
    
    try {
      const result = await operation();
      this.onSuccess();
      return result;
    } catch (error) {
      this.onFailure();
      throw error;
    }
  }
  
  private onSuccess(): void {
    this.failures = 0;
    this.state = 'closed';
  }
  
  private onFailure(): void {
    this.failures++;
    this.lastFailureTime = Date.now();
    
    if (this.failures >= this.threshold) {
      this.state = 'open';
    }
  }
}

const circuitBreaker = new CircuitBreaker();

// Usage
const result = await circuitBreaker.execute(() =>
  apiClient.makeMove(gameId, action)
);
```

This comprehensive error handling guide ensures robust error management across all aspects of SOL Duel integration, from API calls to WebSocket connections and blockchain interactions.